/** Configuracao do app via variaveis VITE_ para apontar o frontend ao projeto Supabase correto. */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const WHATSAPP_EDGE_URL = String(import.meta.env.VITE_WHATSAPP_EDGE_URL || "").trim();
export const WHATSAPP_EDGE_TOKEN = String(import.meta.env.VITE_WHATSAPP_EDGE_TOKEN || "").trim();
export const WHATSAPP_TEMPLATE_LANG = String(
  import.meta.env.VITE_WHATSAPP_TEMPLATE_LANG || import.meta.env.VITE_WHATSAPP_CONFIRM_TEMPLATE_LANG || "pt_BR"
).trim();
export const WHATSAPP_CONFIRM_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_CONFIRM_TEMPLATE_NAME || "").trim();
export const WHATSAPP_CONFIRM_TEMPLATE_LANG = String(import.meta.env.VITE_WHATSAPP_CONFIRM_TEMPLATE_LANG || "pt_BR").trim();
export const WHATSAPP_CANCEL_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_CANCEL_TEMPLATE_NAME || "").trim();
export const WHATSAPP_RESCHEDULE_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_RESCHEDULE_TEMPLATE_NAME || "").trim();
export const WHATSAPP_DAYBEFORE_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_DAYBEFORE_TEMPLATE_NAME || "").trim();
export const WHATSAPP_RENEWAL_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_RENEWAL_TEMPLATE_NAME || "").trim();
export const WHATSAPP_TRIAL_END_TEMPLATE_NAME = String(import.meta.env.VITE_WHATSAPP_TRIAL_END_TEMPLATE_NAME || "").trim();

export function getAppBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "https://agendixx.vercel.app";
}

export const SUPPORT_ACCOUNT_EMAIL = "agendixx26@gmail.com";
export const STANDARD_MONTHLY_PRICE = 49.9;
export const SUPPORT_PAGE_SIZE = 6;

/** Chave PIX da plataforma (ex.: CNPJ, e-mail ou telefone) — usada nas mensagens de renovação do suporte. */
export const AGENDIXX_PIX_KEY = String(import.meta.env.VITE_AGENDIXX_PIX_KEY || "").trim();

/** Quantos dias à frente (e vencidos) entram na lista de renovações do suporte. */
export const RENEWAL_REMINDER_WINDOW_DAYS = Math.max(1, Number(import.meta.env.VITE_RENEWAL_REMINDER_WINDOW_DAYS) || 7);

/** Ao marcar “pagamento recebido” no suporte, próxima renovação = hoje + N dias. */
export const DEFAULT_BILLING_CYCLE_DAYS = Math.max(1, Number(import.meta.env.VITE_DEFAULT_BILLING_CYCLE_DAYS) || 30);
