/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_BASE_URL: string;
  readonly VITE_AGENDIXX_PIX_KEY: string;
  readonly VITE_WHATSAPP_EDGE_URL: string;
  readonly VITE_WHATSAPP_EDGE_TOKEN: string;
  readonly VITE_WHATSAPP_TEMPLATE_LANG: string;
  readonly VITE_WHATSAPP_CONFIRM_TEMPLATE_NAME: string;
  readonly VITE_WHATSAPP_CONFIRM_TEMPLATE_LANG: string;
  readonly VITE_WHATSAPP_CANCEL_TEMPLATE_NAME: string;
  readonly VITE_WHATSAPP_RESCHEDULE_TEMPLATE_NAME: string;
  readonly VITE_WHATSAPP_DAYBEFORE_TEMPLATE_NAME: string;
  readonly VITE_WHATSAPP_RENEWAL_TEMPLATE_NAME: string;
  readonly VITE_WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
