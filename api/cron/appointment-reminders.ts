/**
 * Cron diário (Vercel): envia lembrete D-1 aos clientes finais.
 *
 * Env no Vercel (não use VITE_* aqui — são só do browser):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - CRON_SECRET (recomendado) — Vercel Cron envia Authorization: Bearer <CRON_SECRET>
 * - WHATSAPP_EDGE_URL + WHATSAPP_EDGE_TOKEN (mesmo backend usado pelo app para API WhatsApp)
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getTemplateNameFromEnv(): string {
  return (process.env.WHATSAPP_DAYBEFORE_TEMPLATE_NAME || process.env.VITE_WHATSAPP_DAYBEFORE_TEMPLATE_NAME || "").trim();
}

function getTemplateLangFromEnv(): string {
  return (process.env.WHATSAPP_TEMPLATE_LANG || process.env.VITE_WHATSAPP_TEMPLATE_LANG || "pt_BR").trim();
}

function todayIsoSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addOneCalendarDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function formatLongDatePt(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTimeHm(t: string): string {
  return String(t || "").slice(0, 5);
}

function buildReminderMessage(params: {
  clientName: string;
  businessName: string;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
}): string {
  const { clientName, businessName, serviceName, professionalName, appointmentDate, appointmentTime } = params;
  const first = clientName.split(/\s+/)[0] || clientName;
  const lines = [
    `Olá, ${first}! 👋`,
    "",
    `Lembrete: *amanhã* você tem horário em *${businessName}*.`,
    "",
    `📅 ${formatLongDatePt(appointmentDate)}`,
    `🕐 ${formatTimeHm(appointmentTime)}`,
    `✂️ ${serviceName}`,
  ];
  if (professionalName && professionalName !== "Sem preferencia") {
    lines.push(`👤 ${professionalName}`);
  }
  lines.push("", "Te esperamos! Se não puder comparecer, avise com antecedência.");
  return lines.join("\n");
}

function isSupabaseEdgeFunctionUrl(url: string): boolean {
  return url.includes("supabase.co/functions/");
}

async function postWhatsAppEdge(phone: string, text: string): Promise<boolean> {
  return postWhatsAppEdgePayload({ phone, text });
}

async function postWhatsAppEdgePayload(payload: unknown): Promise<boolean> {
  const edgeUrl = (process.env.WHATSAPP_EDGE_URL || "").trim();
  if (!edgeUrl) return false;
  const proxySecret = (process.env.WHATSAPP_EDGE_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseEdgeFunctionUrl(edgeUrl)) {
    const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    if (!sbKey) return false;
    headers.Authorization = `Bearer ${sbKey}`;
    if (proxySecret) headers["x-agendixx-proxy-secret"] = proxySecret;
  } else if (proxySecret) {
    headers.Authorization = `Bearer ${proxySecret}`;
  }
  const res = await fetch(edgeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }

  if (!(process.env.WHATSAPP_EDGE_URL || "").trim()) {
    res.status(200).json({
      ok: true,
      skipped: true,
      reason: "WHATSAPP_EDGE_URL not set — configure o backend WhatsApp para enviar lembretes automáticos.",
    });
    return;
  }

  const targetAppointmentDate = addOneCalendarDay(todayIsoSaoPaulo());
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: rows, error: qErr } = await supabase
    .from("appointments")
    .select("id, client_name, client_phone, appointment_date, appointment_time, business_id, service_id, professional_id, status")
    .eq("appointment_date", targetAppointmentDate)
    .eq("status", "confirmado")
    .is("reminder_sent_at", null);

  if (qErr) {
    res.status(500).json({ error: qErr.message });
    return;
  }

  const list = rows ?? [];
  let sent = 0;
  let failed = 0;

  for (const a of list) {
    try {
      const [{ data: biz }, { data: svc }, profResult] = await Promise.all([
        supabase.from("businesses").select("name, plan_tier").eq("id", a.business_id).maybeSingle(),
        supabase.from("services").select("name").eq("id", a.service_id).maybeSingle(),
        a.professional_id
          ? supabase.from("professionals").select("name").eq("id", a.professional_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if ((biz as { plan_tier?: string | null } | null)?.plan_tier !== "pro") {
        continue;
      }

      const businessName = (biz as { name?: string } | null)?.name || "Seu salão";
      const serviceName = (svc as { name?: string } | null)?.name || "Serviço";
      const professionalName = (profResult.data as { name?: string } | null)?.name || "";

      const templateName = getTemplateNameFromEnv();
      const ok = templateName
        ? await postWhatsAppEdgePayload({
            phone: a.client_phone,
            template: {
              name: templateName,
              languageCode: getTemplateLangFromEnv(),
              bodyParams: [
                a.client_name.split(/\s+/)[0] || a.client_name,
                businessName,
                serviceName,
                formatTimeHm(a.appointment_time),
                professionalName || "Sem preferência",
              ],
            },
          })
        : await postWhatsAppEdge(
            a.client_phone,
            buildReminderMessage({
              clientName: a.client_name,
              businessName,
              serviceName,
              professionalName,
              appointmentDate: a.appointment_date,
              appointmentTime: a.appointment_time,
            })
          );
      if (ok) {
        await supabase.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
        sent += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  res.status(200).json({
    ok: true,
    targetAppointmentDate,
    candidates: list.length,
    sent,
    failed,
  });
}
