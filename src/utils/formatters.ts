import { STANDARD_MONTHLY_PRICE } from "../config/env";

export function formatCurrency(value: number | string | undefined | null): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export function formatTime(value: string | undefined | null): string {
  return String(value || "").slice(0, 5);
}

export function getLocalIsoDate(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNextOccurrenceLocalIsoDate(dayOfWeek: number, fromDate: Date = new Date()): string {
  const target = new Date(fromDate);
  const currentDow = target.getDay();
  const diff = (dayOfWeek - currentDow + 7) % 7;
  target.setDate(target.getDate() + diff);
  return getLocalIsoDate(target);
}

export function formatLongDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatDateShort(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatMonthYear(date: string | null | undefined): string {
  if (!date) return "data não informada";
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
}

export function formatBillingLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    active: "Em dia",
    blocked: "Bloqueado",
    past_due: "Em atraso",
    canceled: "Cancelado",
    trial: "Promocional",
    pendente: "Pendente (pagamento)",
  };
  return map[status || ""] || "Não definido";
}

export function formatRecurrenceLabel(type: string): string {
  const labels: Record<string, string> = {
    weekly: "Semanal",
    twice_weekly: "2x por semana",
    monthly: "Mensal",
    none: "Sem recorrência",
  };
  return labels[type] || "Sem recorrência";
}

export function formatTimelineDate(value: string | undefined): string {
  if (!value) return "agora";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizePlanName(planName: string | undefined | null): string {
  if (!planName || /29,90/.test(planName)) {
    return "Plano Mensal 49,90";
  }
  return planName;
}

export function formatHoursSummary(hours: { active: boolean; open_time?: string | null; close_time?: string | null }[]): string {
  const activeHours = (hours || []).filter((item) => item.active && item.open_time && item.close_time);
  if (!activeHours.length) return "Horarios sob consulta";
  const first = activeHours[0];
  const last = activeHours[activeHours.length - 1];
  return `${formatTime(first.open_time)}-${formatTime(last.close_time)}`;
}

export function estimatedMrrActiveCount(activeCount: number): string {
  return formatCurrency(activeCount * STANDARD_MONTHLY_PRICE);
}
