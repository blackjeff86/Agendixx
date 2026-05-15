import {
  WHATSAPP_CANCEL_TEMPLATE_NAME,
  WHATSAPP_CONFIRM_TEMPLATE_NAME,
  WHATSAPP_DAYBEFORE_TEMPLATE_NAME,
  WHATSAPP_RESCHEDULE_TEMPLATE_NAME,
  WHATSAPP_RENEWAL_TEMPLATE_NAME,
  WHATSAPP_TEMPLATE_LANG,
  WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME,
} from "../config/env";
import { getMonthlyPriceForBusiness, getPaymentDueDate, planDisplayLabel } from "../config/billing";
import type { AppointmentRow, Business } from "../types";
import { formatCurrency, formatLongDate, formatTime } from "./formatters";
import type { WhatsAppTemplatePayload } from "../services/whatsappOutbound";

const EMOJI_WAVE = "👋";
const EMOJI_CALENDAR = "📅";
const EMOJI_CLOCK = "🕐";
const EMOJI_SCISSORS = "✂️";
const EMOJI_PERSON = "👤";
const EMOJI_MONEY = "💰";

function getFirstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function buildTemplate(name: string, bodyParams: string[]): WhatsAppTemplatePayload | null {
  if (!name) return null;
  return {
    name,
    languageCode: WHATSAPP_TEMPLATE_LANG || "pt_BR",
    bodyParams,
  };
}

export function buildAppointmentConfirmationMessage(params: {
  clientName: string;
  businessName: string;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
  priceLabel: string;
}): string {
  const { clientName, businessName, serviceName, professionalName, appointmentDate, appointmentTime, priceLabel } = params;
  const first = getFirstName(clientName);
  return [
    `Olá, ${first}! ${EMOJI_WAVE}`,
    "",
    `Seu agendamento em *${businessName}* foi *confirmado*.`,
    "",
    `${EMOJI_CALENDAR} ${formatLongDate(appointmentDate)}`,
    `${EMOJI_CLOCK} ${formatTime(appointmentTime)}`,
    `${EMOJI_SCISSORS} ${serviceName}`,
    professionalName && professionalName !== "Sem preferencia" ? `${EMOJI_PERSON} ${professionalName}` : "",
    `${EMOJI_MONEY} ${priceLabel}`,
    "",
    `Qualquer dúvida, responda esta mensagem.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAppointmentConfirmationFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  professionalName: string,
  price: number
): string {
  return buildAppointmentConfirmationMessage({
    clientName: appt.client_name,
    businessName,
    serviceName: serviceName || "Serviço",
    professionalName: professionalName || "",
    appointmentDate: appt.appointment_date,
    appointmentTime: appt.appointment_time,
    priceLabel: formatCurrency(price),
  });
}

export function buildAppointmentConfirmationTemplateFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  professionalName: string,
  price: number
): WhatsAppTemplatePayload | null {
  if (!WHATSAPP_CONFIRM_TEMPLATE_NAME) {
    return null;
  }
  const first = getFirstName(appt.client_name);
  return buildTemplate(WHATSAPP_CONFIRM_TEMPLATE_NAME, [
    first,
    businessName,
    formatLongDate(appt.appointment_date),
    formatTime(appt.appointment_time),
    serviceName || "Serviço",
    professionalName || "Sem preferência",
    formatCurrency(price),
  ]);
}

/** Lembrete no dia anterior ao agendamento (envio automático via cron + API WhatsApp). */
export function buildAppointmentDayBeforeReminderMessage(params: {
  clientName: string;
  businessName: string;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
}): string {
  const { clientName, businessName, serviceName, professionalName, appointmentDate, appointmentTime } = params;
  const first = getFirstName(clientName);
  return [
    `Olá, ${first}! ${EMOJI_WAVE}`,
    "",
    `Lembrete: *amanhã* você tem horário em *${businessName}*.`,
    "",
    `${EMOJI_CALENDAR} ${formatLongDate(appointmentDate)}`,
    `${EMOJI_CLOCK} ${formatTime(appointmentTime)}`,
    `${EMOJI_SCISSORS} ${serviceName}`,
    professionalName && professionalName !== "Sem preferencia" ? `${EMOJI_PERSON} ${professionalName}` : "",
    "",
    `Te esperamos! Se não puder comparecer, avise com antecedência.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAppointmentDayBeforeReminderTemplateFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  professionalName: string
): WhatsAppTemplatePayload | null {
  return buildTemplate(WHATSAPP_DAYBEFORE_TEMPLATE_NAME, [
    getFirstName(appt.client_name),
    businessName,
    serviceName || "Serviço",
    formatTime(appt.appointment_time),
    professionalName || "Sem preferência",
  ]);
}

export function buildAppointmentRescheduledMessage(params: {
  clientName: string;
  businessName: string;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
  priceLabel: string;
}): string {
  const { clientName, businessName, serviceName, professionalName, appointmentDate, appointmentTime, priceLabel } = params;
  const first = getFirstName(clientName);
  return [
    `Olá, ${first}! ${EMOJI_WAVE}`,
    "",
    `O salão *${businessName}* sugeriu um *novo horário* para o seu agendamento.`,
    "",
    `${EMOJI_CALENDAR} ${formatLongDate(appointmentDate)}`,
    `${EMOJI_CLOCK} ${formatTime(appointmentTime)}`,
    `${EMOJI_SCISSORS} ${serviceName}`,
    professionalName && professionalName !== "Sem preferencia" ? `${EMOJI_PERSON} ${professionalName}` : "",
    `${EMOJI_MONEY} ${priceLabel}`,
    "",
    `Para aceitar esse novo horário, acesse sua área do cliente pelo link abaixo.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAppointmentRescheduledFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  professionalName: string,
  price: number
): string {
  return buildAppointmentRescheduledMessage({
    clientName: appt.client_name,
    businessName,
    serviceName: serviceName || "Serviço",
    professionalName: professionalName || "",
    appointmentDate: appt.appointment_date,
    appointmentTime: appt.appointment_time,
    priceLabel: formatCurrency(price),
  });
}

export function buildAppointmentRescheduledTemplateFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  professionalName: string,
  price: number
): WhatsAppTemplatePayload | null {
  return buildTemplate(WHATSAPP_RESCHEDULE_TEMPLATE_NAME, [
    getFirstName(appt.client_name),
    businessName,
    formatLongDate(appt.appointment_date),
    formatTime(appt.appointment_time),
    serviceName || "Serviço",
    professionalName || "Sem preferência",
    formatCurrency(price),
  ]);
}

export type AppointmentCancellationKind = "status_cancelado" | "deleted";

/** Cliente final: cancelamento / recusa (status cancelado) ou exclusão da agenda. */
export function buildAppointmentCancellationMessage(params: {
  clientName: string;
  businessName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  kind: AppointmentCancellationKind;
}): string {
  const { clientName, businessName, serviceName, appointmentDate, appointmentTime, kind } = params;
  const first = getFirstName(clientName);
  const bodyLine =
    kind === "deleted"
      ? "Seu agendamento foi *removido* da nossa agenda."
      : "Informamos que seu horário *não está mais confirmado* (cancelado ou não aceito).";
  return [
    `Olá, ${first}!`,
    "",
    bodyLine,
    "",
    `🏷️ *${businessName}*`,
    `${EMOJI_CALENDAR} ${formatLongDate(appointmentDate)}`,
    `${EMOJI_CLOCK} ${formatTime(appointmentTime)}`,
    `${EMOJI_SCISSORS} ${serviceName}`,
    "",
    `Dúvidas ou remarcação, fale conosco por aqui.`,
  ].join("\n");
}

export function buildAppointmentCancellationFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string,
  kind: AppointmentCancellationKind
): string {
  return buildAppointmentCancellationMessage({
    clientName: appt.client_name,
    businessName,
    serviceName: serviceName || "Serviço",
    appointmentDate: appt.appointment_date,
    appointmentTime: appt.appointment_time,
    kind,
  });
}

export function buildAppointmentCancellationTemplateFromRow(
  appt: AppointmentRow,
  businessName: string,
  serviceName: string
): WhatsAppTemplatePayload | null {
  return buildTemplate(WHATSAPP_CANCEL_TEMPLATE_NAME, [
    getFirstName(appt.client_name),
    businessName,
    formatLongDate(appt.appointment_date),
    formatTime(appt.appointment_time),
    serviceName || "Serviço",
  ]);
}

export function buildRenewalReminderTemplate(business: Business, pixKey: string): WhatsAppTemplatePayload | null {
  const due = getPaymentDueDate(business);
  const dueLabel = due && !Number.isNaN(due.getTime()) ? due.toLocaleDateString("pt-BR") : "a combinar";
  return buildTemplate(WHATSAPP_RENEWAL_TEMPLATE_NAME, [
    business.name || "Sua loja",
    planDisplayLabel(business),
    formatCurrency(getMonthlyPriceForBusiness(business)),
    dueLabel,
    pixKey || "Solicite a chave PIX ao suporte",
  ]);
}

export function buildFirstMonthEndingPlanChoiceTemplate(
  business: Business,
  daysRemainingLabel: string
): WhatsAppTemplatePayload | null {
  return buildTemplate(WHATSAPP_FIRST_MONTH_END_TEMPLATE_NAME, [
    business.name || "sua loja",
    daysRemainingLabel,
    "R$ 29,90 no 1o mes",
    "R$ 59,90/mês depois",
  ]);
}
