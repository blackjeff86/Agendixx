import { SUPABASE_ANON_KEY, WHATSAPP_EDGE_TOKEN, WHATSAPP_EDGE_URL } from "../config/env";
import { buildWhatsAppWebUrlWithText } from "../utils/phone";

export interface WhatsAppTemplatePayload {
  name: string;
  languageCode?: string;
  bodyParams?: string[];
}

interface WhatsAppSendOptions {
  preferApi?: boolean;
}

type WhatsAppRequestPayload =
  | { phone: string; text: string }
  | { phone: string; template: WhatsAppTemplatePayload };

/**
 * Envio de texto WhatsApp.
 * - Se `VITE_WHATSAPP_EDGE_URL` estiver definido: POST com `{ phone, text }`.
 * - Supabase Edge (`…supabase.co/functions/…`): use `Authorization: Bearer <anon>` (gateway) +
 *   `x-agendixx-proxy-secret` quando `VITE_WHATSAPP_EDGE_TOKEN` estiver definido (igual ao secret da função).
 * - Outro backend: `Authorization: Bearer VITE_WHATSAPP_EDGE_TOKEN` se houver token.
 * - Sem URL: abre `wa.me` (uma aba por envio).
 */
function isSupabaseEdgeFunctionUrl(url: string): boolean {
  return url.includes("supabase.co/functions/");
}

async function postWhatsAppPayload(payload: WhatsAppRequestPayload): Promise<{ ok: boolean; usedApi: boolean }> {
  const edgeUrl = WHATSAPP_EDGE_URL;
  if (edgeUrl) {
    try {
      const proxySecret = WHATSAPP_EDGE_TOKEN;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseEdgeFunctionUrl(edgeUrl)) {
        const anon = String(SUPABASE_ANON_KEY || "").trim();
        if (!anon) return { ok: false, usedApi: true };
        headers.Authorization = `Bearer ${anon}`;
        if (proxySecret) headers["x-agendixx-proxy-secret"] = proxySecret;
      } else if (proxySecret) {
        headers.Authorization = `Bearer ${proxySecret}`;
      }
      const res = await fetch(edgeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, usedApi: true };
    } catch {
      return { ok: false, usedApi: true };
    }
  }

  return { ok: false, usedApi: false };
}

export async function sendWhatsAppText(
  rawPhone: string,
  body: string,
  options: WhatsAppSendOptions = {}
): Promise<{ ok: boolean; usedApi: boolean }> {
  if (options.preferApi !== false) {
    const apiResult = await postWhatsAppPayload({ phone: rawPhone, text: body });
    if (apiResult.usedApi) {
      return apiResult;
    }
  }

  const url = buildWhatsAppWebUrlWithText(rawPhone, body);
  if (!url) return { ok: false, usedApi: false };
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true, usedApi: false };
}

export async function sendWhatsAppTemplate(
  rawPhone: string,
  template: WhatsAppTemplatePayload
): Promise<{ ok: boolean; usedApi: boolean }> {
  return postWhatsAppPayload({ phone: rawPhone, template });
}
