import type { Session, User } from "@supabase/supabase-js";
import { buildFallbackPublic } from "../constants/fallbackPublic";
import type {
  AppointmentRow,
  AppointmentSeriesRow,
  BookingState,
  Business,
  BusinessHourRow,
  CustomerRow,
  ProfessionalRow,
  ProfessionalServiceRow,
  PublicData,
  CustomerPortalData,
  BillingAccessRow,
  PlatformSettingsRow,
  ServiceRow,
  SupportEventRow,
} from "../types";

export const FALLBACK_PUBLIC: PublicData = buildFallbackPublic();

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  confirmado: { label: "Confirmado", cls: "badge-success" },
  pendente: { label: "Pendente", cls: "badge-warning" },
  cancelado: { label: "Cancelado", cls: "badge-danger" },
  concluido: { label: "Atendido", cls: "badge-brand" },
};

export interface AppState {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  billingAccess: BillingAccessRow | null;
  business: Business | null;
  services: ServiceRow[];
  professionals: ProfessionalRow[];
  professionalServices: ProfessionalServiceRow[];
  customers: CustomerRow[];
  appointmentSeries: AppointmentSeriesRow[];
  appointments: AppointmentRow[];
  hours: BusinessHourRow[];
  currentFilter: string;
  historyFilter: string;
  selectedDashboardDate: string | null;
  selectedAppointment: AppointmentRow | null;
  editingAppointmentId: string | null;
  editingServiceId: string | null;
  editingProfessionalId: string | null;
  pendingConfirmAction: (() => Promise<void>) | null;
  supportBusinesses: Business[];
  supportEvents: SupportEventRow[];
  supportSelectedBusinessId: string | null;
  supportContextBusinessId: string | null;
  supportFilter: string;
  supportPage: number;
  platformSettings: PlatformSettingsRow | null;
  publicData: PublicData;
  publicCustomerPortal: CustomerPortalData | null;
  customerPortalSelectedDate: string | null;
  customerPortalStatusFilter: string;
  customerPortalSelectedAppointmentId: string | null;
}

export const state: AppState = {
  session: null,
  user: null,
  isPlatformAdmin: false,
  billingAccess: null,
  business: null,
  services: [],
  professionals: [],
  professionalServices: [],
  customers: [],
  appointmentSeries: [],
  appointments: [],
  hours: [],
  currentFilter: "todos",
  historyFilter: "todos",
  selectedDashboardDate: null,
  selectedAppointment: null,
  editingAppointmentId: null,
  editingServiceId: null,
  editingProfessionalId: null,
  pendingConfirmAction: null,
  supportBusinesses: [],
  supportEvents: [],
  supportSelectedBusinessId: null,
  supportContextBusinessId: null,
  supportFilter: "todos",
  supportPage: 1,
  platformSettings: null,
  publicData: {
    business: null,
    services: [],
    professionals: [],
    hours: [],
  },
  publicCustomerPortal: null,
  customerPortalSelectedDate: null,
  customerPortalStatusFilter: "todos",
  customerPortalSelectedAppointmentId: null,
};

export let bookingState: BookingState = {
  mode: "service",
  serviceId: null,
  profId: null,
  date: null,
  time: null,
  secondDate: null,
  secondTime: null,
};

export function setBookingState(next: BookingState): void {
  bookingState = next;
}

export let pubStepHistory: number[] = [0];

export function setPubStepHistory(next: number[]): void {
  pubStepHistory = next;
}

export let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function setToastTimer(t: ReturnType<typeof setTimeout> | null): void {
  toastTimer = t;
}
