/**
 * Edge Function: proxy seguro para WhatsApp Cloud API (Meta).
 *
 * Recebe POST JSON:
 * - { "phone": "5511999999999 ou (11) 99999-9999", "text": "mensagem" }
 * - { "phone": "5511999999999 ou (11) 99999-9999", "template": { "name": "template_name", "languageCode": "pt_BR", "bodyParams": ["..."] } }
 * Headers:
 *   Authorization: Bearer <SUPABASE_ANON_KEY ou SERVICE_ROLE>  (exigido pelo gateway Supabase)
 *   x-agendixx-proxy-secret: <WHATSAPP_EDGE_AUTH_TOKEN>      (opcional; recomendado em produção)
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets, ou `supabase secrets set`):
 *   WHATSAPP_ACCESS_TOKEN      — token permanente ou de longa duração da Meta
 *   WHATSAPP_PHONE_NUMBER_ID   — ID do número de envio (Graph API), não é o telefone em si
 *   WHATSAPP_EDGE_AUTH_TOKEN   — (recomendado) mesmo valor que WHATSAPP_EDGE_TOKEN na Vercel
 *
 * URL após deploy: https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-send
 *
 * Observação Meta: em contatos novos fora da janela de 24h pode ser necessário template
 * aprovado; mensagens de texto livre funcionam em conversas já abertas / janela ativa.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const META_API_VERSION = "v21.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agendixx-proxy-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Dígitos com DDI 55 quando for número BR sem DDI. */
function normalizeWhatsAppTo(phone: string): string {
  const d = String(phone).replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const shared = Deno.env.get("WHATSAPP_EDGE_AUTH_TOKEN")?.trim();
  if (shared) {
    const proxy = req.headers.get("x-agendixx-proxy-secret")?.trim();
    if (proxy !== shared) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  if (!accessToken || !phoneNumberId) {
    return jsonResponse(
      { error: "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID on function secrets" },
      500
    );
  }

  let payload: {
    phone?: string;
    text?: string;
    template?: {
      name?: string;
      languageCode?: string;
      bodyParams?: string[];
    };
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const phone = payload.phone?.trim();
  const text = payload.text?.trim();
  const template = payload.template;
  if (!phone || (!text && !template?.name)) {
    return jsonResponse({ error: "Field phone and either text or template.name are required" }, 400);
  }

  const to = normalizeWhatsAppTo(phone);
  if (to.length < 12) {
    return jsonResponse({ error: "Invalid phone number" }, 400);
  }

  const metaPayload = template?.name
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.languageCode?.trim() || "pt_BR" },
          ...(template.bodyParams?.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: template.bodyParams.map((value) => ({
                      type: "text",
                      text: String(value ?? ""),
                    })),
                  },
                ],
              }
            : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
  const metaRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metaPayload),
  });

  const metaBody = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) {
    return jsonResponse({ ok: false, error: "Meta API error", meta: metaBody }, 502);
  }

  return jsonResponse({ ok: true, meta: metaBody }, 200);
});
