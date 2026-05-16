import * as appointmentService from "../services/appointmentService";
import * as customerPortalService from "../services/customerPortalService";
import { generateTimeSlotsForDate } from "../utils/dates";
import { getErrorMessage, getFriendlyAppointmentError } from "../utils/errors";
import { formatLongDate, formatRecurrenceLabel, formatTime } from "../utils/formatters";
import { onlyDigits } from "../utils/phone";
import { bookingState, pubStepHistory, setBookingState, state } from "../state/store";
import type { LastBookingPayload } from "../types";
import { emptyStateHtml } from "../ui/components/emptyState";
import { getPublicAppUrl, showLoading, showScreen, showToast, openModal } from "../ui/dom";
import { applyPublicData, getFallbackPublic, loadPublicData, resetPublicBookingFlow } from "./publicData";
import {
  fillSummary,
  renderCustomerPortal,
  renderCustomerPortalAppointments,
  renderCustomerPortalDateScroll,
  renderDateScroll,
  renderPubProfs,
  renderPubServices,
  renderSecondDateScroll,
} from "../ui/render/publicViews";

let customerPortalRescheduleDate: string | null = null;
let customerPortalRescheduleTime: string | null = null;

export function pubGoRaw(step: number): void {
  document.querySelectorAll("#publicShell .page").forEach((page) => {
    page.classList.remove("active");
    page.classList.add("hidden");
  });
  const success = document.getElementById("pubSuccess");
  if (success) {
    success.style.display = "none";
    success.classList.add("hidden");
  }

  const page = document.getElementById(`pubStep${step}`);
  if (page) {
    page.classList.remove("hidden");
    page.classList.add("active");
  }
}

export function pubGoStep(step: number): void {
  if (step === 1) {
    renderPubServices(bookingState.profId && bookingState.profId !== 0 ? String(bookingState.profId) : null);
  }
  if (step === 2) {
    renderPubProfs(bookingState.serviceId || null);
  }
  if (step === 3) {
    renderDateScroll();
    void renderTimeGrid();
  }
  if (step === 4) {
    fillSummary();
    renderSecondDateScroll();
    const secondGrid = document.getElementById("secondTimeGrid");
    if (secondGrid) secondGrid.innerHTML = "";
  }
  pubStepHistory.push(step);
  pubGoRaw(step);
}

export function pubBack(): void {
  if (pubStepHistory.length <= 1) {
    pubGoRaw(0);
    return;
  }
  pubStepHistory.pop();
  pubGoRaw(pubStepHistory[pubStepHistory.length - 1]!);
}

export function startBooking(mode: "service" | "prof"): void {
  resetPublicBookingFlow(mode);
  if (mode === "service") {
    renderPubServices();
    pubStepHistory.length = 0;
    pubStepHistory.push(0, 1);
    pubGoRaw(1);
    return;
  }
  renderPubProfs();
  pubStepHistory.length = 0;
  pubStepHistory.push(0, 2);
  pubGoRaw(2);
}

export function startFromServicePreview(serviceId: string): void {
  startBooking("service");
  selectService(serviceId);
}

export function startFromProfessionalPreview(professionalId: string): void {
  startBooking("prof");
  selectProf(professionalId);
}

export function selectService(id: string): void {
  setBookingState({ ...bookingState, serviceId: id });
  document.querySelectorAll("#pubServiceList .service-card").forEach((card) => card.classList.remove("selected"));
  document.getElementById(`svc-${id}`)?.classList.add("selected");
  const btn = document.getElementById("btnNextFromService") as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
}

export function selectProf(id: string): void {
  setBookingState({ ...bookingState, profId: id === "0" ? 0 : id });
  document.querySelectorAll("#pubProfList .prof-card").forEach((card) => card.classList.remove("selected"));
  document.getElementById(`prof-${id}`)?.classList.add("selected");
  const btn = document.getElementById("btnNextFromProf") as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
}

export function goNextFromService(): void {
  if (!bookingState.serviceId) return;
  if (bookingState.mode === "prof" && bookingState.profId !== null) {
    pubGoStep(3);
    return;
  }
  renderPubProfs(bookingState.serviceId);
  pubGoStep(2);
}

export function goNextFromProf(): void {
  if (bookingState.mode === "prof" && !bookingState.serviceId) {
    renderPubServices(bookingState.profId === 0 ? null : String(bookingState.profId));
    pubGoStep(1);
    return;
  }
  pubGoStep(3);
}

export function selectDate(iso: string): void {
  setBookingState({ ...bookingState, date: iso, time: null });
  document.querySelectorAll("#dateScroll .date-btn").forEach((button) => button.classList.remove("selected"));
  const target = document.querySelector(`#dateScroll .date-btn[data-iso="${iso}"]`) as HTMLElement | null;
  target?.classList.add("selected");
  target?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const btn = document.getElementById("btnNextFromDateTime") as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  void renderTimeGrid();
}

export async function renderTimeGrid(): Promise<void> {
  const container = document.getElementById("timeGrid");
  if (!container) return;
  container.innerHTML = `<div class="text-sm text-sub">Carregando horarios...</div>`;

  if (!bookingState.date || !bookingState.serviceId) {
    container.innerHTML = emptyStateHtml("Escolha servico e data para ver horarios.");
    return;
  }

  const slots = generateTimeSlotsForDate(bookingState.date, state.publicData.hours);
  const professionalId = bookingState.profId === 0 ? null : (bookingState.profId as string | null);
  const availability = await Promise.all(
    slots.map(async (slot) => ({
      slot,
      available: state.publicData.business
        ? await appointmentService.isSlotAvailable({
            businessId: state.publicData.business.id,
            serviceId: bookingState.serviceId!,
            professionalId,
            date: bookingState.date!,
            time: slot,
          })
        : false,
    }))
  );

  if (!availability.length) {
    container.innerHTML = emptyStateHtml("Nao ha horarios disponiveis nessa data.");
    return;
  }

  container.innerHTML = availability
    .map(
      ({ slot, available }) => `
        <button class="time-btn" type="button" ${available ? "" : "disabled"} onclick="selectTime('${slot}')">${slot}</button>
      `
    )
    .join("");
}

export function selectTime(slot: string): void {
  setBookingState({ ...bookingState, time: slot });
  document.querySelectorAll(".time-btn").forEach((button) => button.classList.remove("selected"));
  const target = Array.from(document.querySelectorAll(".time-btn")).find((button) => button.textContent === slot);
  target?.classList.add("selected");
  const btn = document.getElementById("btnNextFromDateTime") as HTMLButtonElement | null;
  if (btn) btn.disabled = !bookingState.date || !bookingState.time;
}

export function selectSecondDate(iso: string): void {
  setBookingState({ ...bookingState, secondDate: iso, secondTime: null });
  document.querySelectorAll("#secondDateScroll .date-btn").forEach((button) => button.classList.remove("selected"));
  const target = document.querySelector(`#secondDateScroll .date-btn[data-iso="${iso}"]`) as HTMLElement | null;
  target?.classList.add("selected");
  target?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  void renderSecondTimeGrid();
}

export function scrollDateStrip(stripId: string, direction: number): void {
  const container = document.getElementById(stripId);
  if (!container) return;

  const offset = Math.max(container.clientWidth * 0.72, 180) * direction;
  container.scrollBy({ left: offset, behavior: "smooth" });
}

export async function renderSecondTimeGrid(): Promise<void> {
  const container = document.getElementById("secondTimeGrid");
  if (!container) return;
  container.innerHTML = `<div class="text-sm text-sub">Carregando horarios...</div>`;

  if (!bookingState.secondDate || !bookingState.serviceId) {
    container.innerHTML = emptyStateHtml("Escolha a segunda data para ver os horários.");
    return;
  }

  const slots = generateTimeSlotsForDate(bookingState.secondDate, state.publicData.hours);
  const professionalId = bookingState.profId === 0 ? null : (bookingState.profId as string | null);
  const availability = await Promise.all(
    slots.map(async (slot) => ({
      slot,
      available:
        bookingState.date !== bookingState.secondDate || bookingState.time !== slot
          ? state.publicData.business
            ? await appointmentService.isSlotAvailable({
                businessId: state.publicData.business.id,
                serviceId: bookingState.serviceId!,
                professionalId,
                date: bookingState.secondDate!,
                time: slot,
              })
            : false
          : false,
    }))
  );

  if (!availability.length) {
    container.innerHTML = emptyStateHtml("Não há horários disponíveis para a segunda sessão nessa data.");
    return;
  }

  container.innerHTML = availability
    .map(
      ({ slot, available }) => `
        <button class="time-btn time-btn-sm" type="button" ${available ? "" : "disabled"} onclick="selectSecondTime('${slot}')">${slot}</button>
      `
    )
    .join("");
}

export function selectSecondTime(slot: string): void {
  setBookingState({ ...bookingState, secondTime: slot });
  document.querySelectorAll("#secondTimeGrid .time-btn").forEach((button) => button.classList.remove("selected"));
  const target = Array.from(document.querySelectorAll("#secondTimeGrid .time-btn")).find((button) => button.textContent === slot);
  target?.classList.add("selected");
}

export async function confirmBooking(): Promise<void> {
  const name = (document.getElementById("clientName") as HTMLInputElement).value.trim();
  const email = (document.getElementById("clientEmail") as HTMLInputElement).value.trim();
  const phone = (document.getElementById("clientPhone") as HTMLInputElement).value.trim();
  const notes = (document.getElementById("clientNotes") as HTMLTextAreaElement).value.trim();
  const recurrenceType = (document.getElementById("clientRecurrenceType") as HTMLSelectElement).value;
  const recurrencePeriodCount = Number((document.getElementById("clientRecurrenceCount") as HTMLInputElement).value || 1);
  const service = state.publicData.services.find((item) => item.id === bookingState.serviceId);
  const professional =
    bookingState.profId && bookingState.profId !== 0
      ? state.publicData.professionals.find((item) => item.id === bookingState.profId)
      : undefined;

  if (!name || !phone || !bookingState.date || !bookingState.time || !service || !state.publicData.business) {
    showToast("Preencha seus dados e escolha um horario valido.");
    return;
  }

  const normalizedPeriodCount =
    recurrenceType === "none"
      ? 1
      : Number.isFinite(recurrencePeriodCount) && recurrencePeriodCount > 0
        ? Math.max(2, Math.floor(recurrencePeriodCount))
        : 2;
  const occurrencesToCreate =
    recurrenceType === "none"
      ? 1
      : recurrenceType === "twice_weekly"
        ? normalizedPeriodCount * 2
        : normalizedPeriodCount;

  if (recurrenceType === "twice_weekly" && (!bookingState.secondDate || !bookingState.secondTime)) {
    showToast("Escolha a segunda data e o segundo horário para concluir o agendamento 2x por semana.");
    return;
  }

  showLoading(true);
  try {
    if (recurrenceType === "twice_weekly") {
      const firstResult = await appointmentService.createPublicBooking({
        p_business_id: state.publicData.business.id,
        p_service_id: service.id,
        p_professional_id: professional?.id || null,
        p_client_name: name,
        p_client_phone: phone,
        p_client_email: email || null,
        p_client_notes: notes || null,
        p_appointment_date: bookingState.date,
        p_appointment_time: bookingState.time,
        p_recurrence_type: "weekly",
        p_occurrences: normalizedPeriodCount,
      });
      if (firstResult.error) throw firstResult.error;

      const secondResult = await appointmentService.createPublicBooking({
        p_business_id: state.publicData.business.id,
        p_service_id: service.id,
        p_professional_id: professional?.id || null,
        p_client_name: name,
        p_client_phone: phone,
        p_client_email: email || null,
        p_client_notes: notes || null,
        p_appointment_date: bookingState.secondDate,
        p_appointment_time: bookingState.secondTime,
        p_recurrence_type: "weekly",
        p_occurrences: normalizedPeriodCount,
      });
      if (secondResult.error) throw secondResult.error;
    } else {
      const { error } = await appointmentService.createPublicBooking({
        p_business_id: state.publicData.business.id,
        p_service_id: service.id,
        p_professional_id: professional?.id || null,
        p_client_name: name,
        p_client_phone: phone,
        p_client_email: email || null,
        p_client_notes: notes || null,
        p_appointment_date: bookingState.date,
        p_appointment_time: bookingState.time,
        p_recurrence_type: recurrenceType,
        p_occurrences: occurrencesToCreate,
      });
      if (error) throw error;
    }

    document.querySelectorAll("#publicShell .page").forEach((page) => {
      page.classList.remove("active");
      page.classList.add("hidden");
    });

    const ss = document.getElementById("successService");
    const sp = document.getElementById("successProf");
    const sdt = document.getElementById("successDateTime");
    if (ss) ss.textContent = service.name;
    if (sp) sp.textContent = professional ? `${professional.emoji || "👤"} ${professional.name}` : "Primeiro disponivel";
    if (sdt) sdt.textContent = `${formatLongDate(bookingState.date)} as ${bookingState.time}`;

    const success = document.getElementById("pubSuccess");
    if (success) {
      success.classList.remove("hidden");
      success.style.display = "flex";
    }

    const payload: LastBookingPayload = {
      name,
      email,
      phone,
      notes,
      recurrenceType,
      recurrenceCount: occurrencesToCreate,
      service,
      professional,
      date: formatLongDate(bookingState.date),
      time: bookingState.time,
      business: state.publicData.business,
    };
    window._lastBooking = payload;
  } catch (error) {
    console.error(error);
    showToast(getFriendlyAppointmentError(error));
  } finally {
    showLoading(false);
  }
}

export function sendWAConfirmation(): void {
  const booking = window._lastBooking;
  if (!booking) return;
  const recurrenceLine =
    booking.recurrenceType && booking.recurrenceType !== "none"
      ? `Recorrencia: ${formatRecurrenceLabel(booking.recurrenceType)} (${booking.recurrenceCount} agendamentos)\n`
      : "";
  const message =
    `Ola, ${booking.name}! Seu agendamento foi reservado com sucesso em ${booking.business.name}.\n\n` +
    `Servico: ${booking.service.name}\n` +
    `Profissional: ${booking.professional ? booking.professional.name : "Primeiro disponivel"}\n` +
    `Data: ${booking.date}\n` +
    `Horario: ${booking.time}\n` +
    recurrenceLine +
    `Endereco: ${booking.business.address || "Nao informado"}\n\n` +
    `Se precisar remarcar, fale conosco pelo WhatsApp.`;
  window._waMsg = message;
  const el = document.getElementById("waMessageText");
  if (el) el.textContent = message;
  openModal("modalWAMsg");
}

export function copyWAMsg(): void {
  void navigator.clipboard.writeText(window._waMsg || "").then(() => showToast("Mensagem copiada."));
}

export function copyLink(): void {
  const link = document.getElementById("bizLink")?.textContent || "";
  void navigator.clipboard.writeText(link).then(() => showToast("Link copiado."));
}

export function shareWhatsApp(): void {
  const link = document.getElementById("bizLink")?.textContent || "";
  const text = encodeURIComponent(`Agende seu horario comigo: ${link}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

export function openHostedPublicPage(): void {
  if (!state.business?.slug) {
    showToast("Salve o negocio para gerar o link publico.");
    return;
  }
  window.open(getPublicAppUrl(state.business.slug), "_blank");
}

export async function showPublicBooking(): Promise<void> {
  showLoading(true);
  try {
    const slug = state.business?.slug || new URLSearchParams(window.location.search).get("slug");
    if (slug) {
      await loadPublicData(slug);
    } else {
      applyPublicData(getFallbackPublic());
    }
    showScreen("publicShell");
    pubGoRaw(0);
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
    applyPublicData(getFallbackPublic());
    showScreen("publicShell");
    pubGoRaw(0);
  } finally {
    showLoading(false);
  }
}

export function showCustomerPortal(): void {
  document.querySelectorAll("#publicShell .page").forEach((page) => {
    page.classList.remove("active");
    page.classList.add("hidden");
  });
  const portalPage = document.getElementById("publicClientPortal");
  if (portalPage) {
    portalPage.classList.remove("hidden");
    portalPage.classList.add("active");
  }
  renderCustomerPortal();
}

export function selectCustomerPortalDate(date: string): void {
  state.customerPortalSelectedDate = date;
  renderCustomerPortalDateScroll();
  renderCustomerPortalAppointments();
}

export function clearCustomerPortalDateFilter(): void {
  state.customerPortalSelectedDate = null;
  state.customerPortalStatusFilter = "todos";
  renderCustomerPortalDateScroll();
  renderCustomerPortalAppointments();
}

export function selectCustomerPortalStatusFilter(status: string): void {
  state.customerPortalStatusFilter = status;
  renderCustomerPortalAppointments();
}

function getCustomerPortalSelectedAppointment() {
  const portal = state.publicCustomerPortal;
  if (!portal || !state.customerPortalSelectedAppointmentId) return null;
  return portal.appointments.find((item) => item.id === state.customerPortalSelectedAppointmentId) || null;
}

function renderCustomerPortalRescheduleDateScroll(): void {
  const portal = state.publicCustomerPortal;
  const appointment = getCustomerPortalSelectedAppointment();
  const container = document.getElementById("clientPortalRescheduleDateScroll");
  if (!portal || !appointment || !container) return;

  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const buttons: string[] = [];
  for (let index = 0; index < 14; index += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const selected = customerPortalRescheduleDate === iso;
    buttons.push(`
      <button class="date-btn dashboard-date-btn ${selected ? "selected" : ""}" type="button" onclick="selectCustomerPortalRescheduleDate('${iso}')">
        <span style="font-size:10px;">${labels[date.getDay()]}</span>
        <span class="day-num">${date.getDate()}</span>
      </button>
    `);
  }
  container.innerHTML = buttons.join("");
}

async function renderCustomerPortalRescheduleTimeGrid(): Promise<void> {
  const portal = state.publicCustomerPortal;
  const appointment = getCustomerPortalSelectedAppointment();
  const container = document.getElementById("clientPortalRescheduleTimeGrid");
  if (!portal || !appointment || !container) return;

  if (!customerPortalRescheduleDate) {
    container.innerHTML = emptyStateHtml("Escolha uma nova data para ver os horários disponíveis.");
    return;
  }

  container.innerHTML = `<div class="text-sm text-sub">Carregando horários...</div>`;
  const service = portal.services.find((item) => item.id === appointment.service_id);
  if (!service) {
    container.innerHTML = emptyStateHtml("Serviço não encontrado para esse agendamento.");
    return;
  }

  const slots = generateTimeSlotsForDate(customerPortalRescheduleDate, portal.hours);
  if (!slots.length) {
    container.innerHTML = emptyStateHtml("Nenhum horário disponível nessa data.");
    return;
  }

  const availability = await Promise.all(
    slots.map(async (slot) => {
      const isSameSlot = appointment.appointment_date === customerPortalRescheduleDate && formatTime(appointment.appointment_time) === slot;
      const available = isSameSlot
        ? false
        : await appointmentService.isSlotAvailable({
            businessId: portal.business.id,
            serviceId: appointment.service_id,
            professionalId: appointment.professional_id || null,
            date: customerPortalRescheduleDate!,
            time: slot,
          });
      return { slot, available };
    })
  );

  container.innerHTML = availability
    .map(
      ({ slot, available }) => `
        <button class="time-btn ${customerPortalRescheduleTime === slot ? "selected" : ""}" type="button" ${available ? "" : "disabled"} onclick="selectCustomerPortalRescheduleTime('${slot}')">${slot}</button>
      `
    )
    .join("");
}

export function openCustomerPortalReschedule(appointmentId: string): void {
  const portal = state.publicCustomerPortal;
  if (!portal) return;
  const appointment = portal.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;

  state.customerPortalSelectedAppointmentId = appointmentId;
  customerPortalRescheduleDate = null;
  customerPortalRescheduleTime = null;

  const service = portal.services.find((item) => item.id === appointment.service_id);
  const professional = portal.professionals.find((item) => item.id === appointment.professional_id);
  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText("clientPortalRescheduleIntro", "Escolha uma nova data e um novo horário disponível para solicitar o reagendamento.");
  setText("clientPortalRescheduleService", service?.name || "Serviço");
  setText("clientPortalRescheduleProfessional", professional ? `${professional.emoji || "👤"} ${professional.name}` : "Primeiro disponível");
  setText("clientPortalRescheduleCurrentDate", `${formatLongDate(appointment.appointment_date)} às ${formatTime(appointment.appointment_time)}`);

  renderCustomerPortalRescheduleDateScroll();
  const grid = document.getElementById("clientPortalRescheduleTimeGrid");
  if (grid) grid.innerHTML = emptyStateHtml("Escolha uma nova data para ver os horários disponíveis.");
  openModal("modalClientPortalReschedule");
}

export function selectCustomerPortalRescheduleDate(date: string): void {
  customerPortalRescheduleDate = date;
  customerPortalRescheduleTime = null;
  renderCustomerPortalRescheduleDateScroll();
  void renderCustomerPortalRescheduleTimeGrid();
}

export function selectCustomerPortalRescheduleTime(time: string): void {
  customerPortalRescheduleTime = time;
  void renderCustomerPortalRescheduleTimeGrid();
}

export async function confirmCustomerPortalReschedule(): Promise<void> {
  const portal = state.publicCustomerPortal;
  const appointment = getCustomerPortalSelectedAppointment();
  if (!portal || !appointment || !portal.customer.portal_token) return;
  if (!customerPortalRescheduleDate || !customerPortalRescheduleTime) {
    showToast("Escolha uma nova data e um novo horário para continuar.");
    return;
  }

  showLoading(true);
  try {
    const updated = await customerPortalService.rescheduleCustomerPortalAppointment({
      portalToken: portal.customer.portal_token,
      appointmentId: appointment.id,
      appointmentDate: customerPortalRescheduleDate,
      appointmentTime: customerPortalRescheduleTime,
    });

    portal.appointments = portal.appointments.map((item) => (item.id === updated.id ? updated : item));
    state.publicCustomerPortal = { ...portal };
    state.customerPortalSelectedDate = updated.appointment_date;
    state.customerPortalSelectedAppointmentId = null;
    customerPortalRescheduleDate = null;
    customerPortalRescheduleTime = null;
    const modal = document.getElementById("modalClientPortalReschedule");
    modal?.classList.remove("open");
    renderCustomerPortal();
    showToast("Reagendamento solicitado com sucesso.");
  } catch (error) {
    console.error(error);
    showToast(getFriendlyAppointmentError(error));
  } finally {
    showLoading(false);
  }
}

export async function approveCustomerPortalAppointment(appointmentId: string): Promise<void> {
  const portal = state.publicCustomerPortal;
  if (!portal?.customer.portal_token) return;
  showLoading(true);
  try {
    const updated = await customerPortalService.approveCustomerPortalAppointment({
      portalToken: portal.customer.portal_token,
      appointmentId,
    });
    portal.appointments = portal.appointments.map((item) => (item.id === updated.id ? updated : item));
    state.publicCustomerPortal = { ...portal };
    renderCustomerPortal();
    showToast("Novo horário aprovado com sucesso.");
  } catch (error) {
    console.error(error);
    showToast(getFriendlyAppointmentError(error));
  } finally {
    showLoading(false);
  }
}

export function closeCustomerPortalRescheduleModal(): void {
  state.customerPortalSelectedAppointmentId = null;
  customerPortalRescheduleDate = null;
  customerPortalRescheduleTime = null;
  const modal = document.getElementById("modalClientPortalReschedule");
  modal?.classList.remove("open");
}

export function openBusinessWhatsApp(): void {
  const phone = onlyDigits(state.publicData.business?.whatsapp || "");
  if (!phone) {
    showToast("WhatsApp nao configurado.");
    return;
  }
  window.open(`https://wa.me/55${phone}`, "_blank");
}

export function openBusinessInstagram(): void {
  const handle = (state.publicData.business?.instagram || "").replace(/^@/, "");
  if (!handle) {
    showToast("Instagram nao configurado.");
    return;
  }
  window.open(`https://instagram.com/${handle}`, "_blank");
}
