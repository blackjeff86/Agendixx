/**
 * Cron diario (Vercel): avisa o lojista quando o 1o mes promocional termina em 2 dias.
 *
 * Env no Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - CRON_SECRET
 * - WHATSAPP_EDGE_URL
 * - WHATSAPP_EDGE_TOKEN
 * - WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME ou VITE_WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME
 * - WHATSAPP_TEMPLATE_LANG ou VITE_WHATSAPP_TEMPLATE_LANG
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function getTemplateNameFromEnv(): string {
  return (
    process.env.WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME || process.env.VITE_WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME || ""
  ).trim();
}

function getTemplateLangFromEnv(): string {
  return (process.env.WHATSAPP_TEMPLATE_LANG || process.env.VITE_WHATSAPP_TEMPLATE_LANG || "pt_BR").trim();
}

function isSupabaseEdgeFunctionUrl(url: string): boolean {
  return url.includes("supabase.co/functions/");
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

  const edgeUrl = (process.env.WHATSAPP_EDGE_URL || "").trim();
  const templateName = getTemplateNameFromEnv();
  if (!edgeUrl || !templateName) {
    res.status(200).json({
      ok: true,
      skipped: true,
      reason: "WHATSAPP_EDGE_URL ou template do fim do 1o mes promocional nao configurados.",
    });
    return;
  }

  const targetPromotionEndDate = addCalendarDays(todayIsoSaoPaulo(), 2);
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, whatsapp, billing_status, promotional_ends_at, active")
    .eq("active", true);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const candidates = (businesses ?? []).filter((business) => {
    if (!business.whatsapp || !business.promotional_ends_at) return false;
    if (["blocked", "canceled"].includes(String(business.billing_status || ""))) return false;
    return String(business.promotional_ends_at).slice(0, 10) === targetPromotionEndDate;
  });

  let sent = 0;
  let failed = 0;

  for (const business of candidates) {
    try {
      const { data: existingEvent } = await supabase
        .from("support_events")
        .select("id")
        .eq("business_id", business.id)
        .eq("event_type", "first_month_promo_ending_whatsapp")
        .gte("created_at", `${todayIsoSaoPaulo()}T00:00:00.000Z`)
        .limit(1)
        .maybeSingle();

      if (existingEvent?.id) continue;

      const ok = await postWhatsAppEdgePayload({
        phone: business.whatsapp,
        template: {
          name: templateName,
          languageCode: getTemplateLangFromEnv(),
          bodyParams: [business.name || "sua loja", "2 dias", "R$ 29,90 no 1o mes", "R$ 59,90/mês depois"],
        },
      });

      if (!ok) {
        failed += 1;
        continue;
      }

      await supabase.from("support_events").insert({
        business_id: business.id,
        event_type: "first_month_promo_ending_whatsapp",
        title: "Lembrete de 1o mes promocional acabando",
        details: `Mensagem automatica enviada no D-2 do 1o mes promocional. Termino previsto em ${targetPromotionEndDate}.`,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  res.status(200).json({
    ok: true,
    targetPromotionEndDate,
    candidates: candidates.length,
    sent,
    failed,
  });
}
