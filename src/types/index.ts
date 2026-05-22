export type AppointmentStatus = "confirmado" | "pendente" | "cancelado" | "concluido";

export interface Business {
  id: string;
  owner_id: string;
  owner_email?: string | null;
  name: string;
  slug: string;
  category?: string | null;
  description?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  address?: string | null;
  logo_emoji?: string | null;
  logo_image_url?: string | null;
  cover_image_url?: string | null;
  plan_name?: string | null;
  /** starter | pro — null = conta legada (app trata como Pro). */
  plan_tier?: "starter" | "pro" | null;
  /** Data de encerramento do 1o mes promocional. */
  promotional_ends_at?: string | null;
  /** Próxima data de renovação mensal; editável pelo suporte. */
  next_billing_at?: string | null;
  billing_status?: string | null;
  blocked_reason?: string | null;
  support_notes?: string | null;
  active?: boolean;
  created_at?: string;
}

export interface ServiceRow {
  id: string;
  business_id: string;
  name: string;
  description?: string | null;
  price: number;
  duration: number;
  category?: string | null;
  icon?: string | null;
  active: boolean;
  created_at?: string;
}

export interface ProfessionalRow {
  id: string;
  business_id: string;
  name: string;
  role?: string | null;
  emoji?: string | null;
  active: boolean;
  day_off_weekday?: number | null;
  day_off_weekdays?: number[] | null;
  vacation_start?: string | null;
  vacation_end?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  created_at?: string;
  serviceIds?: string[];
  serviceNames?: string[];
}

export interface ProfessionalServiceRow {
  professional_id: string;
  service_id: string;
}

export interface CustomerRow {
  id: string;
  business_id: string;
  name: string;
  email?: string | null;
  phone: string;
  last_booking_at?: string | null;
  portal_token?: string | null;
}

export interface PlatformSettingsRow {
  id: number;
  support_whatsapp?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ManualAccessAllowlistRow {
  email: string;
  role: "platform_admin";
  active: boolean;
  created_at?: string;
}

export interface AppointmentSeriesRow {
  id: string;
  business_id: string;
  service_id: string;
  professional_id?: string | null;
  start_date: string;
  appointment_time: string;
  recurrence_type: string;
  occurrences: number;
  notes?: string | null;
  created_at?: string;
}

export interface AppointmentRow {
  id: string;
  business_id: string;
  customer_id?: string | null;
  service_id: string;
  professional_id?: string | null;
  client_name: string;
  client_phone: string;
  client_email?: string | null;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  client_reapproval_required?: boolean | null;
  series_id?: string | null;
  /** Lembrete automático (D-1) já enviado ao cliente. */
  reminder_sent_at?: string | null;
}

export interface BusinessHourRow {
  id?: string;
  business_id?: string;
  day_of_week: number;
  day_name: string;
  open_time?: string | null;
  close_time?: string | null;
  active: boolean;
  frozen?: boolean;
  frozen_date?: string | null;
  frozen_time?: string | null;
  frozen_until_time?: string | null;
}

export interface SupportEventRow {
  id: string;
  business_id: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  event_type: string;
  title: string;
  details?: string | null;
  created_at?: string;
}

export interface BillingAccessRow {
  id: string;
  email: string;
  provider: string;
  plan_tier?: "starter" | "pro" | null;
  billing_status: string;
  current_period_end?: string | null;
  auth_user_id?: string | null;
  business_id?: string | null;
  provider_product_id?: string | null;
  provider_product_name?: string | null;
  provider_order_id?: string | null;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  invite_sent_at?: string | null;
  last_event?: string | null;
  last_event_at?: string | null;
  raw_payload?: unknown;
  created_at?: string;
  updated_at?: string;
}

export type SalesStage = "new" | "qualifying" | "qualified" | "proposal" | "won" | "lost" | "nurture";

export type SalesTemperature = "cold" | "warm" | "hot";

export type SalesAgentKey = "sdr" | "qualifier" | "closer" | "followup" | "onboarding";

export interface SalesLeadRow {
  id: string;
  name?: string | null;
  phone: string;
  normalized_phone: string;
  email?: string | null;
  business_type?: string | null;
  source?: string | null;
  owner_name?: string | null;
  stage: SalesStage;
  temperature: SalesTemperature;
  notes?: string | null;
  next_follow_up_at?: string | null;
  follow_up_status?: "none" | "scheduled" | "due" | "done";
  follow_up_note?: string | null;
  follow_up_attempts?: number;
  last_human_action_at?: string | null;
  last_agent_key?: SalesAgentKey | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface SalesConversationRow {
  id: string;
  lead_id: string;
  channel: "whatsapp" | "site" | "instagram" | "email";
  direction: "inbound" | "outbound" | "internal";
  agent_key?: SalesAgentKey | null;
  message_text: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface SalesAgentRunRow {
  id: string;
  lead_id: string;
  agent_key: SalesAgentKey;
  stage_before: SalesStage;
  stage_after: SalesStage;
  temperature: SalesTemperature;
  response_text: string;
  handoff_human: boolean;
  next_step?: string | null;
  reasoning_summary?: string | null;
  auto_sent: boolean;
  created_at?: string;
}

export interface SalesDashboardData {
  leads: SalesLeadRow[];
  conversations: SalesConversationRow[];
  runs: SalesAgentRunRow[];
}

export interface ServiceDraft {
  name: string;
  description: string;
  price: number;
  duration: number;
  category: string;
  icon: string;
  active: boolean;
}

export interface ProfessionalDraft {
  name: string;
  role: string;
  emoji: string;
  active: boolean;
  serviceNames: string[];
  day_off_weekday?: number | null;
  day_off_weekdays?: number[] | null;
  vacation_start?: string | null;
  vacation_end?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
}

export interface BusinessHourDraft {
  day_of_week: number;
  day_name: string;
  open_time: string | null;
  close_time: string | null;
  active: boolean;
  frozen?: boolean;
  frozen_date?: string | null;
  frozen_time?: string | null;
  frozen_until_time?: string | null;
}

export interface PendingBusinessDraft {
  name: string;
  slug: string;
  category: string;
  plan_tier?: "starter" | "pro";
  email?: string;
  password?: string;
  description?: string;
  whatsapp?: string;
  instagram?: string;
  address?: string;
  logo_emoji?: string;
  logo_image_url?: string;
  cover_image_url?: string;
  plan_name?: string;
  billing_status?: string;
}

export interface PublicData {
  business: Business | null;
  services: ServiceRow[];
  professionals: ProfessionalRow[];
  hours: BusinessHourRow[];
}

export interface CustomerPortalData {
  business: Business;
  customer: CustomerRow;
  appointments: AppointmentRow[];
  services: ServiceRow[];
  professionals: ProfessionalRow[];
  hours: BusinessHourRow[];
}

export interface BookingState {
  mode: "service" | "prof";
  serviceId: string | null;
  profId: string | number | null;
  date: string | null;
  time: string | null;
  secondDate?: string | null;
  secondTime?: string | null;
}

export interface LastBookingPayload {
  name: string;
  email: string;
  phone: string;
  notes: string;
  recurrenceType: string;
  recurrenceCount: number;
  service: ServiceRow;
  professional?: ProfessionalRow;
  date: string;
  time: string;
  business: Business;
}
