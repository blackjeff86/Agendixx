import { countActiveProfessionals, isStarterPlan, STARTER_ACTIVE_PROFESSIONAL_LIMIT } from "../config/plans";
import { DEFAULT_SERVICE_CATEGORIES } from "../constants/serviceCategories";
import { DEFAULT_HOURS } from "../constants/defaults";
import { getServiceIconLibrary } from "../constants/serviceIconLibrary";
import * as appointmentService from "../services/appointmentService";
import * as businessService from "../services/businessService";
import * as professionalService from "../services/professionalService";
import * as serviceCatalogService from "../services/serviceCatalogService";
import { state } from "../state/store";
import type { AppointmentStatus } from "../types";
import { applyBusinessPreview, toggleCardMenu } from "../ui/render/merchantDashboard";
import { formatCurrency, formatLongDate, getLocalIsoDate, getNextOccurrenceLocalIsoDate } from "../utils/formatters";
import { generateTimeSlotsForDate } from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { serializeBusinessHourDayName } from "../utils/businessHours";
import { readFileAsDataUrl } from "../utils/files";
import { slugify } from "../utils/strings";
import { showLoading, showToast, openModal } from "../ui/dom";
import { closeAppointmentModal, closeModal, hasAppointmentBeenRescheduled, notifyCustomerAboutReschedule } from "./appointmentActions";
import { loadSupportBusinesses } from "./bootstrap";
import { refreshAllBusinessData } from "./refresh";
import { createSupportEvent } from "./supportEvents";

export { toggleCardMenu };

let pendingHourFreezeDay: number | null = null;

function getEditingAppointmentSnapshot() {
  if (!state.editingAppointmentId) return null;
  return state.appointments.find((item) => item.id === state.editingAppointmentId) || state.selectedAppointment || null;
}

function getAppointmentModalPayload() {
  return {
    business_id: state.business?.id || "",
    client_name: (document.getElementById("newApptClient") as HTMLInputElement).value.trim(),
    client_phone: (document.getElementById("newApptPhone") as HTMLInputElement).value.trim(),
    service_id: (document.getElementById("newApptService") as HTMLSelectElement).value,
    professional_id: (document.getElementById("newApptProfessional") as HTMLSelectElement).value || null,
    appointment_date: (document.getElementById("newApptDate") as HTMLInputElement).value,
    appointment_time: (document.getElementById("newApptTime") as HTMLInputElement).value,
  };
}

function isSameAppointmentTiming(
  original: { service_id?: string | null; professional_id?: string | null; appointment_date?: string | null; appointment_time?: string | null },
  next: { service_id?: string | null; professional_id?: string | null; appointment_date?: string | null; appointment_time?: string | null }
): boolean {
  return (
    String(original.service_id || "") === String(next.service_id || "") &&
    String(original.professional_id || "") === String(next.professional_id || "") &&
    String(original.appointment_date || "") === String(next.appointment_date || "") &&
    String(original.appointment_time || "").slice(0, 5) === String(next.appointment_time || "").slice(0, 5)
  );
}

async function isAppointmentSlotAllowed(payload: {
  business_id: string;
  service_id: string;
  professional_id: string | null;
  appointment_date: string;
  appointment_time: string;
}): Promise<boolean> {
  const original = getEditingAppointmentSnapshot();
  if (original && isSameAppointmentTiming(original, payload)) {
    return true;
  }
  return appointmentService.isSlotAvailable({
    businessId: payload.business_id,
    serviceId: payload.service_id,
    professionalId: payload.professional_id,
    date: payload.appointment_date,
    time: payload.appointment_time,
  });
}

function setAppointmentAvailabilityState(message: string, contentHtml = ""): void {
  const box = document.getElementById("apptAvailabilityBox");
  const hint = document.getElementById("apptAvailabilityHint");
  const grid = document.getElementById("apptAvailabilityGrid");
  if (!box || !hint || !grid) return;
  box.style.display = "block";
  hint.textContent = message;
  grid.innerHTML = contentHtml;
}

export function selectAppointmentTime(slot: string): void {
  const input = document.getElementById("newApptTime") as HTMLInputElement | null;
  if (!input) return;
  input.value = slot;
  syncAppointmentTimeInput();
}

export function syncAppointmentTimeInput(): void {
  const selected = ((document.getElementById("newApptTime") as HTMLInputElement | null)?.value || "").slice(0, 5);
  document.querySelectorAll("#apptAvailabilityGrid .time-btn").forEach((button) => {
    button.classList.toggle("selected", button.textContent === selected);
  });
}

export async function syncAppointmentAvailability(): Promise<void> {
  const notice = document.getElementById("apptRescheduleNotice");
  if (notice) {
    notice.classList.toggle("hidden", !state.editingAppointmentId);
  }

  if (!state.business) {
    setAppointmentAvailabilityState("Carregando dados do negócio...");
    return;
  }

  const payload = getAppointmentModalPayload();
  if (!payload.service_id || !payload.appointment_date) {
    setAppointmentAvailabilityState("Escolha serviço e data para ver os horários realmente disponíveis.");
    return;
  }

  const service = state.services.find((item) => item.id === payload.service_id);
  const professional = payload.professional_id ? state.professionals.find((item) => item.id === payload.professional_id) : null;
  const slots = generateTimeSlotsForDate(payload.appointment_date, state.hours);

  if (!slots.length) {
    setAppointmentAvailabilityState("Esse dia não tem horários de funcionamento disponíveis.");
    return;
  }

  setAppointmentAvailabilityState("Verificando horários livres...");
  const availability = await Promise.all(
    slots.map(async (slot) => ({
      slot,
      available: await isAppointmentSlotAllowed({
        business_id: payload.business_id,
        service_id: payload.service_id,
        professional_id: payload.professional_id,
        appointment_date: payload.appointment_date,
        appointment_time: slot,
      }),
    }))
  );

  const availableSlots = availability.filter((item) => item.available);
  if (!availableSlots.length) {
    setAppointmentAvailabilityState(
      professional
        ? `${professional.name} não tem horários livres nessa data para ${service?.name || "esse serviço"}.`
        : `Nenhum horário livre nessa data para ${service?.name || "esse serviço"}.`
    );
    return;
  }

  const selectedTime = payload.appointment_time.slice(0, 5);
  if (selectedTime && !availableSlots.some((item) => item.slot === selectedTime)) {
    const timeInput = document.getElementById("newApptTime") as HTMLInputElement | null;
    if (timeInput) timeInput.value = "";
  }

  setAppointmentAvailabilityState(
    professional
      ? `Toque em um horário livre de ${professional.name}.`
      : "Toque em um horário livre para agendar com o primeiro profissional disponível.",
    availableSlots
      .map(
        (item) =>
          `<button class="time-btn time-btn-sm" type="button" onclick="selectAppointmentTime('${item.slot}')">${item.slot}</button>`
      )
      .join("")
  );
  syncAppointmentTimeInput();
}

function getProfessionalTargetBusiness() {
  if (state.supportContextBusinessId) {
    return state.supportBusinesses.find((item) => item.id === state.supportContextBusinessId) || null;
  }
  return state.business;
}

function readNullableValue(id: string): string | null {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  const value = el?.value?.trim() || "";
  return value || null;
}

function validateProfessionalAvailability(payload: {
  vacation_start: string | null;
  vacation_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
}): string | null {
  if ((payload.vacation_start && !payload.vacation_end) || (!payload.vacation_start && payload.vacation_end)) {
    return "Preencha início e fim das férias.";
  }
  if (payload.vacation_start && payload.vacation_end && payload.vacation_end < payload.vacation_start) {
    return "O fim das férias deve ser igual ou posterior ao início.";
  }
  if ((payload.lunch_start && !payload.lunch_end) || (!payload.lunch_start && payload.lunch_end)) {
    return "Preencha início e fim do horário de almoço.";
  }
  if (payload.lunch_start && payload.lunch_end && payload.lunch_end <= payload.lunch_start) {
    return "O fim do almoço deve ser maior que o início.";
  }
  return null;
}

function getServiceCategoryOptions(): string[] {
  const existing = state.services.map((service) => service.category?.trim()).filter(Boolean) as string[];
  return [...new Set([...DEFAULT_SERVICE_CATEGORIES, ...existing])];
}

function renderServiceCategoryOptions(selectedCategory = ""): void {
  const list = document.getElementById("serviceCategoryOptions");
  const input = document.getElementById("newServiceCategory") as HTMLInputElement | null;
  if (!list || !input) return;
  list.innerHTML = getServiceCategoryOptions().map((category) => `<option value="${category}"></option>`).join("");
  if (!input.value) {
    input.value = selectedCategory;
  }
}

function categoryDomKey(category: string): string {
  return encodeURIComponent(category);
}

function renderServiceIconPicker(selectedIcon = ""): void {
  const library = getServiceIconLibrary();
  const grid = document.getElementById("serviceIconLibrary");
  const input = document.getElementById("newServiceIcon") as HTMLInputElement | null;
  const preview = document.getElementById("newServiceIconPreview");
  const hint = document.getElementById("serviceIconLibraryHint");
  if (!grid || !input) return;

  const resolvedIcon = selectedIcon || library[0]?.icon || "✨";
  input.value = resolvedIcon;

  const options = [...library];
  if (resolvedIcon && !options.some((item) => item.icon === resolvedIcon)) {
    options.unshift({ icon: resolvedIcon, label: "Ícone atual" });
  }

  if (preview) preview.textContent = resolvedIcon;
  if (hint) {
    hint.textContent = "Biblioteca única de ícones para serviços de beleza e estética.";
  }

  grid.innerHTML = options
    .map(
      (item) => `
        <button
          class="service-icon-option ${item.icon === resolvedIcon ? "is-selected" : ""}"
          type="button"
          title="${item.label}"
          aria-label="${item.label}"
          onclick="selectServiceIcon('${item.icon}')"
        >
          <span class="service-icon-option-emoji" aria-hidden="true">${item.icon}</span>
        </button>
      `
    )
    .join("");
}

export function selectServiceIcon(icon: string): void {
  const input = document.getElementById("newServiceIcon") as HTMLInputElement | null;
  if (!input) return;
  input.value = icon;
  renderServiceIconPicker(icon);
}

function setHourFrozenState(dayOfWeek: number, frozenDate: string | null, frozenTime: string | null): void {
  const button = document.getElementById(`hour-frozen-${dayOfWeek}`) as HTMLButtonElement | null;
  if (!button) return;
  const frozenUntilTime = button.dataset.frozenUntilTime || "";
  const nextFrozen = Boolean(frozenDate && frozenTime);
  button.dataset.frozen = nextFrozen ? "true" : "false";
  button.dataset.frozenDate = frozenDate || "";
  button.dataset.frozenTime = frozenTime || "";
  button.dataset.frozenUntilTime = nextFrozen ? frozenUntilTime : "";
  button.classList.toggle("is-frozen", nextFrozen);
  button.setAttribute("aria-pressed", nextFrozen ? "true" : "false");
  const titleRange = nextFrozen ? (frozenUntilTime ? ` de ${frozenTime} até ${frozenUntilTime}` : ` às ${frozenTime}`) : "";
  button.title = nextFrozen ? `Agenda pausada em ${frozenDate}${titleRange}` : "Pausar agenda desse dia";
  button.innerHTML = nextFrozen
    ? `<span class="freeze-icon">▶</span><span class="freeze-label">Liberar</span><span class="freeze-meta">${frozenUntilTime ? `Pausado: ${frozenTime}-${frozenUntilTime}` : `Pausado: ${frozenTime}`}</span>`
    : `<span class="freeze-icon">⏸</span><span class="freeze-label">Pausar</span>`;
}

export async function populateProfessionalServicesForBusiness(businessId: string): Promise<void> {
  const data = await serviceCatalogService.listServiceIdNameForBusiness(businessId);
  const el = document.getElementById("newProfServices");
  if (el) el.innerHTML = data.map((service) => `<option value="${service.id}">${service.name}</option>`).join("");
}

export async function saveBusinessProfile(): Promise<void> {
  if (!state.business) return;

  const payload = {
    name: (document.getElementById("businessName") as HTMLInputElement).value.trim(),
    slug: slugify((document.getElementById("businessSlug") as HTMLInputElement).value.trim()),
    category: (document.getElementById("businessCategory") as HTMLSelectElement).value,
    description: (document.getElementById("businessDescription") as HTMLTextAreaElement).value.trim(),
    whatsapp: (document.getElementById("businessWhatsapp") as HTMLInputElement).value.trim(),
    instagram: (document.getElementById("businessInstagram") as HTMLInputElement).value.trim(),
    address: (document.getElementById("businessAddress") as HTMLInputElement).value.trim(),
    logo_emoji: "✂️",
    logo_image_url: state.business.logo_image_url || "",
    cover_image_url: state.business.cover_image_url || "",
  };

  if (!payload.name || !payload.slug) {
    showToast("Nome e slug sao obrigatorios.");
    return;
  }

  const hoursPayload = (state.hours.length ? state.hours : DEFAULT_HOURS).map((hour) => {
    const active = (document.getElementById(`hour-active-${hour.day_of_week}`) as HTMLInputElement).checked;
    const freezeButton = document.getElementById(`hour-frozen-${hour.day_of_week}`) as HTMLButtonElement | null;
    const frozen = freezeButton?.dataset.frozen === "true";
    const frozenDate = frozen ? freezeButton?.dataset.frozenDate || null : null;
    const frozenTime = frozen ? freezeButton?.dataset.frozenTime || null : null;
    const frozenUntilTime = frozen ? freezeButton?.dataset.frozenUntilTime || null : null;
    return {
      business_id: state.business!.id,
      day_of_week: hour.day_of_week,
      day_name: serializeBusinessHourDayName(hour.day_name, frozenDate, frozenTime, frozenUntilTime),
      open_time: active ? (document.getElementById(`hour-open-${hour.day_of_week}`) as HTMLInputElement).value || null : null,
      close_time: active ? (document.getElementById(`hour-close-${hour.day_of_week}`) as HTMLInputElement).value || null : null,
      active,
    };
  });

  showLoading(true);
  try {
    await businessService.updateBusiness(state.business.id, payload);
    await businessService.upsertBusinessHours(hoursPayload);
    state.business = { ...state.business, ...payload };
    showToast("Dados do negocio salvos.");
    await refreshAllBusinessData();
    document.dispatchEvent(new CustomEvent("agendixx:business-profile-saved"));
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function cancelBusinessProfileEdits(): Promise<void> {
  if (!state.business) return;
  showLoading(true);
  try {
    await refreshAllBusinessData();
    showToast("Alterações descartadas.");
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export function toggleHourInputs(dayOfWeek: number): void {
  const active = (document.getElementById(`hour-active-${dayOfWeek}`) as HTMLInputElement).checked;
  (document.getElementById(`hour-open-${dayOfWeek}`) as HTMLInputElement).disabled = !active;
  (document.getElementById(`hour-close-${dayOfWeek}`) as HTMLInputElement).disabled = !active;
  const freezeButton = document.getElementById(`hour-frozen-${dayOfWeek}`) as HTMLButtonElement | null;
  if (freezeButton) freezeButton.disabled = !active;
}

export function toggleHourFrozen(dayOfWeek: number): void {
  const button = document.getElementById(`hour-frozen-${dayOfWeek}`) as HTMLButtonElement | null;
  if (!button || button.disabled) return;
  if (button.dataset.frozen === "true") {
    button.dataset.frozenUntilTime = "";
    setHourFrozenState(dayOfWeek, null, null);
    showToast("Agenda liberada para esse dia.");
    return;
  }

  pendingHourFreezeDay = dayOfWeek;
  const hour = (state.hours.length ? state.hours : DEFAULT_HOURS).find((item) => item.day_of_week === dayOfWeek);
  const targetDate = getNextOccurrenceLocalIsoDate(dayOfWeek);
  const now = new Date();
  const nowTime = now.toTimeString().slice(0, 5);
  const title = document.getElementById("hourFreezeModalTitle");
  const subtitle = document.getElementById("hourFreezeModalSubtitle");
  const timeInput = document.getElementById("hourFreezeSpecificTime") as HTMLInputElement | null;
  const endTimeInput = document.getElementById("hourFreezeUntilTime") as HTMLInputElement | null;
  const timeHint = document.getElementById("hourFreezeSpecificHint");
  const nowLabel = document.getElementById("hourFreezeNowLabel");
  const nowPreview = document.getElementById("hourFreezeNowPreview");
  const radioNow = document.getElementById("hourFreezeModeNow") as HTMLInputElement | null;
  if (title) title.textContent = `Pausar agenda de ${hour?.day_name || "este dia"}`;
  if (subtitle) subtitle.textContent = `Novos agendamentos ficarão indisponíveis na data ${formatLongDate(targetDate)}.`;
  if (nowLabel) nowLabel.textContent = "Pausar a partir de agora";
  if (nowPreview) nowPreview.textContent = `Bloquear novos agendamentos a partir de ${nowTime}.`;
  if (timeInput) {
    timeInput.value = nowTime;
    timeInput.min = hour?.open_time?.slice(0, 5) || "00:00";
    timeInput.max = hour?.close_time?.slice(0, 5) || "23:59";
  }
  if (endTimeInput) {
    endTimeInput.value = "";
    endTimeInput.min = hour?.open_time?.slice(0, 5) || "00:00";
    endTimeInput.max = hour?.close_time?.slice(0, 5) || "23:59";
  }
  if (timeHint) {
    timeHint.textContent = hour?.open_time && hour?.close_time
      ? `Horário de funcionamento: ${hour.open_time.slice(0, 5)} até ${hour.close_time.slice(0, 5)}.`
      : "Escolha o horário em que a agenda deve parar de aceitar novos agendamentos.";
  }
  if (radioNow) radioNow.checked = true;
  syncHourFreezeMode("now");
  openModal("modalHourFreeze");
}

export function syncHourFreezeMode(mode?: string): void {
  const selectedMode =
    mode ||
    ((document.querySelector('input[name="hourFreezeMode"]:checked') as HTMLInputElement | null)?.value ?? "now");
  document.getElementById("hourFreezeSpecificGroup")?.classList.toggle("hidden", selectedMode !== "specific");
}

export function confirmHourFreeze(): void {
  if (pendingHourFreezeDay === null) return;
  const hour = (state.hours.length ? state.hours : DEFAULT_HOURS).find((item) => item.day_of_week === pendingHourFreezeDay);
  if (!hour) return;
  const mode = (document.querySelector('input[name="hourFreezeMode"]:checked') as HTMLInputElement | null)?.value ?? "now";
  const now = new Date();
  const targetDate = getNextOccurrenceLocalIsoDate(pendingHourFreezeDay, now);
  let frozenTime = now.toTimeString().slice(0, 5);
  let frozenUntilTime = "";

  const endTimeInput = document.getElementById("hourFreezeUntilTime") as HTMLInputElement | null;
  const selectedEnd = endTimeInput?.value || "";

  if (mode === "specific") {
    const timeInput = document.getElementById("hourFreezeSpecificTime") as HTMLInputElement | null;
    const selected = timeInput?.value || "";
    if (!selected) {
      showToast("Escolha o horário em que a agenda deve ser pausada.");
      return;
    }
    if (hour.close_time && selected >= hour.close_time.slice(0, 5)) {
      showToast("Escolha um horário anterior ao fechamento desse dia.");
      return;
    }
    if (targetDate === getLocalIsoDate(now) && selected <= now.toTimeString().slice(0, 5)) {
      showToast("Escolha um horário futuro para este dia.");
      return;
    }
    if (selectedEnd && selectedEnd <= selected) {
      showToast("O horário final da pausa deve ser maior que o horário inicial.");
      return;
    }
    if (hour.close_time && selectedEnd && selectedEnd > hour.close_time.slice(0, 5)) {
      showToast("O horário final da pausa não pode passar do fechamento desse dia.");
      return;
    }
    frozenTime = selected;
  }

  if (selectedEnd) {
    if (selectedEnd <= frozenTime) {
      showToast("O horário final da pausa deve ser maior que o horário inicial.");
      return;
    }
    if (hour.close_time && selectedEnd > hour.close_time.slice(0, 5)) {
      showToast("O horário final da pausa não pode passar do fechamento desse dia.");
      return;
    }
    frozenUntilTime = selectedEnd;
  }

  const button = document.getElementById(`hour-frozen-${pendingHourFreezeDay}`) as HTMLButtonElement | null;
  if (button) button.dataset.frozenUntilTime = frozenUntilTime;
  setHourFrozenState(pendingHourFreezeDay, targetDate, frozenTime);
  closeModal("modalHourFreeze");
  pendingHourFreezeDay = null;
  showToast(frozenUntilTime ? `Agenda pausada de ${frozenTime} até ${frozenUntilTime}.` : `Agenda pausada a partir de ${frozenTime}.`);
}

export function closeHourFreezeModal(): void {
  pendingHourFreezeDay = null;
  closeModal("modalHourFreeze");
}

export async function handleBusinessLogoUpload(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.business = { ...(state.business || {}), logo_image_url: dataUrl } as typeof state.business;
    applyBusinessPreview(state.business);
    showToast("Logo carregada. Clique em salvar para gravar.");
  } catch (error) {
    console.error(error);
    showToast("Nao foi possivel carregar a logo.");
  }
}

export async function handleBusinessCoverUpload(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.business = { ...(state.business || {}), cover_image_url: dataUrl } as typeof state.business;
    applyBusinessPreview(state.business);
    showToast("Foto de capa carregada. Clique em salvar para gravar.");
  } catch (error) {
    console.error(error);
    showToast("Nao foi possivel carregar a capa.");
  }
}

export function resetServiceModal(): void {
  state.editingServiceId = null;
  const t = (id: string, v: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (el) el.value = v;
  };
  const title = document.getElementById("serviceModalTitle");
  if (title) title.textContent = "Novo Serviço";
  const saveBtn = document.getElementById("serviceModalSaveBtn");
  if (saveBtn) saveBtn.textContent = "Salvar Serviço";
  t("newServiceName", "");
  t("newServiceDescription", "");
  t("newServiceCategory", "");
  t("newServicePrice", "");
  t("newServiceDuration", "");
  t("newServiceIcon", "");
  const active = document.getElementById("newServiceActive") as HTMLInputElement | null;
  if (active) active.checked = true;
  renderServiceCategoryOptions("");
  renderServiceIconPicker("");
}

export function resetProfessionalModal(): void {
  state.editingProfessionalId = null;
  const title = document.getElementById("professionalModalTitle");
  if (title) title.textContent = "Novo Profissional";
  const saveBtn = document.getElementById("professionalModalSaveBtn");
  if (saveBtn) saveBtn.textContent = "Salvar";
  (document.getElementById("newProfName") as HTMLInputElement).value = "";
  (document.getElementById("newProfRole") as HTMLInputElement).value = "";
  (document.getElementById("newProfEmoji") as HTMLInputElement).value = "";
  Array.from((document.getElementById("newProfServices") as HTMLSelectElement).options).forEach((option) => {
    option.selected = false;
  });
  (document.getElementById("newProfActive") as HTMLInputElement).checked = true;
  (document.getElementById("newProfDayOffWeekday") as HTMLSelectElement).value = "";
  (document.getElementById("newProfVacationStart") as HTMLInputElement).value = "";
  (document.getElementById("newProfVacationEnd") as HTMLInputElement).value = "";
  (document.getElementById("newProfLunchStart") as HTMLInputElement).value = "";
  (document.getElementById("newProfLunchEnd") as HTMLInputElement).value = "";
}

export function openServiceModal(): void {
  resetServiceModal();
  openModal("modalNovoServico");
  document.dispatchEvent(new CustomEvent("agendixx:service-modal-opened"));
}

export function closeServiceModal(): void {
  closeModal("modalNovoServico");
  document.dispatchEvent(new CustomEvent("agendixx:service-modal-closed"));
  state.supportContextBusinessId = null;
  resetServiceModal();
}

export function editService(serviceId: string): void {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  state.editingServiceId = serviceId;
  const title = document.getElementById("serviceModalTitle");
  if (title) title.textContent = "Editar Serviço";
  const saveBtn = document.getElementById("serviceModalSaveBtn");
  if (saveBtn) saveBtn.textContent = "Salvar Alterações";
  (document.getElementById("newServiceName") as HTMLInputElement).value = service.name || "";
  (document.getElementById("newServiceDescription") as HTMLTextAreaElement).value = service.description || "";
  (document.getElementById("newServiceCategory") as HTMLInputElement).value = service.category || "";
  (document.getElementById("newServicePrice") as HTMLInputElement).value = String(service.price || "");
  (document.getElementById("newServiceDuration") as HTMLInputElement).value = String(service.duration || "");
  (document.getElementById("newServiceIcon") as HTMLInputElement).value = service.icon || "";
  (document.getElementById("newServiceActive") as HTMLInputElement).checked = Boolean(service.active);
  renderServiceCategoryOptions(service.category || "");
  renderServiceIconPicker(service.icon || "");
  openModal("modalNovoServico");
  document.dispatchEvent(new CustomEvent("agendixx:service-modal-opened"));
}

export function openServiceCategoryManager(): void {
  const list = document.getElementById("serviceCategoryManagerList");
  const empty = document.getElementById("serviceCategoryManagerEmpty");
  if (!list || !empty) return;
  const categories = [...new Set(state.services.map((service) => service.category?.trim()).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  empty.style.display = categories.length ? "none" : "block";
  const createRow = `
    <div class="category-manager-item">
      <input type="text" id="service-cat-new" value="" placeholder="Nova categoria" />
      <div class="category-manager-actions">
        <button class="btn btn-brand btn-sm" type="button" onclick="applyNewServiceCategory()">Usar no serviço</button>
      </div>
    </div>
  `;
  const existingRows = categories
    .map(
      (category) => `
        <div class="category-manager-item">
          <input type="text" id="service-cat-${categoryDomKey(category)}" value="${category}" />
          <div class="category-manager-actions">
            <button class="btn btn-brand btn-sm" type="button" onclick="renameServiceCategory('${encodeURIComponent(category)}')">Salvar</button>
            <button class="btn btn-ghost btn-sm danger" type="button" onclick="deleteServiceCategory('${encodeURIComponent(category)}')">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");
  list.innerHTML = `${createRow}${existingRows}`;
  openModal("modalServiceCategories");
}

export function closeServiceCategoryManager(): void {
  closeModal("modalServiceCategories");
}

export function applyNewServiceCategory(): void {
  const nextCategory = (document.getElementById("service-cat-new") as HTMLInputElement | null)?.value?.trim() || "";
  if (!nextCategory) {
    showToast("Digite o nome da nova categoria.");
    return;
  }
  const serviceCategoryInput = document.getElementById("newServiceCategory") as HTMLInputElement | null;
  if (!serviceCategoryInput) return;
  serviceCategoryInput.value = nextCategory;
  renderServiceCategoryOptions(nextCategory);
  closeServiceCategoryManager();
}

export async function renameServiceCategory(encodedOldCategory: string): Promise<void> {
  const targetBusinessId = state.business?.id || state.supportContextBusinessId;
  if (!targetBusinessId) return;
  const oldCategory = decodeURIComponent(encodedOldCategory);
  const input = document.getElementById(`service-cat-${categoryDomKey(oldCategory)}`) as HTMLInputElement | null;
  const nextCategory = input?.value?.trim() || "";
  if (!nextCategory || nextCategory === oldCategory) return;
  showLoading(true);
  try {
    await serviceCatalogService.updateServicesCategory(targetBusinessId, oldCategory, nextCategory);
    showToast("Categoria atualizada com sucesso.");
    if (state.business) await refreshAllBusinessData();
    if (state.isPlatformAdmin) await loadSupportBusinesses();
    renderServiceCategoryOptions(nextCategory);
    openServiceCategoryManager();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function deleteServiceCategory(encodedCategory: string): Promise<void> {
  const targetBusinessId = state.business?.id || state.supportContextBusinessId;
  if (!targetBusinessId) return;
  const category = decodeURIComponent(encodedCategory);
  showLoading(true);
  try {
    await serviceCatalogService.clearServicesCategory(targetBusinessId, category);
    showToast("Categoria removida dos serviços.");
    if (state.business) await refreshAllBusinessData();
    if (state.isPlatformAdmin) await loadSupportBusinesses();
    renderServiceCategoryOptions("");
    openServiceCategoryManager();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function toggleServiceActive(serviceId: string): Promise<void> {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  showLoading(true);
  try {
    await serviceCatalogService.setServiceActive(serviceId, !service.active);
    showToast(service.active ? "Servico desativado com sucesso." : "Servico reativado com sucesso.");
    await refreshAllBusinessData();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export function openProfessionalModal(): void {
  resetProfessionalModal();
  openModal("modalNovoProf");
  document.dispatchEvent(new CustomEvent("agendixx:professional-modal-opened"));
}

export function closeProfessionalModal(): void {
  closeModal("modalNovoProf");
  document.dispatchEvent(new CustomEvent("agendixx:professional-modal-closed"));
  state.supportContextBusinessId = null;
  resetProfessionalModal();
}

export function editProfessional(professionalId: string): void {
  const professional = state.professionals.find((item) => item.id === professionalId);
  if (!professional) return;
  state.editingProfessionalId = professionalId;
  const title = document.getElementById("professionalModalTitle");
  if (title) title.textContent = "Editar Profissional";
  const saveBtn = document.getElementById("professionalModalSaveBtn");
  if (saveBtn) saveBtn.textContent = "Salvar Alterações";
  (document.getElementById("newProfName") as HTMLInputElement).value = professional.name || "";
  (document.getElementById("newProfRole") as HTMLInputElement).value = professional.role || "";
  (document.getElementById("newProfEmoji") as HTMLInputElement).value = professional.emoji || "";
  (document.getElementById("newProfActive") as HTMLInputElement).checked = Boolean(professional.active);
  (document.getElementById("newProfDayOffWeekday") as HTMLSelectElement).value = professional.day_off_weekday === null || professional.day_off_weekday === undefined ? "" : String(professional.day_off_weekday);
  (document.getElementById("newProfVacationStart") as HTMLInputElement).value = professional.vacation_start || "";
  (document.getElementById("newProfVacationEnd") as HTMLInputElement).value = professional.vacation_end || "";
  (document.getElementById("newProfLunchStart") as HTMLInputElement).value = professional.lunch_start?.slice(0, 5) || "";
  (document.getElementById("newProfLunchEnd") as HTMLInputElement).value = professional.lunch_end?.slice(0, 5) || "";
  const assignedServiceIds = new Set(
    state.professionalServices.filter((item) => item.professional_id === professionalId).map((item) => item.service_id)
  );
  Array.from((document.getElementById("newProfServices") as HTMLSelectElement).options).forEach((option) => {
    option.selected = assignedServiceIds.has(option.value);
  });
  openModal("modalNovoProf");
  document.dispatchEvent(new CustomEvent("agendixx:professional-modal-opened"));
}

export async function toggleProfessionalActive(professionalId: string): Promise<void> {
  const professional = state.professionals.find((item) => item.id === professionalId);
  if (!professional) return;
  if (state.business && isStarterPlan(state.business) && !professional.active) {
    const otherActive = countActiveProfessionals(state.professionals.filter((p) => p.id !== professionalId));
    if (otherActive >= STARTER_ACTIVE_PROFESSIONAL_LIMIT) {
      showToast(`No Plano Starter você pode manter até ${STARTER_ACTIVE_PROFESSIONAL_LIMIT} profissionais ativos. Faça upgrade ao Pro para adicionar mais.`);
      return;
    }
  }
  showLoading(true);
  try {
    await professionalService.setProfessionalActive(professionalId, !professional.active);
    showToast(professional.active ? "Profissional desativado com sucesso." : "Profissional reativado com sucesso.");
    await refreshAllBusinessData();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function saveService(): Promise<void> {
  if (!state.business && !state.supportContextBusinessId) return;
  const isEditing = Boolean(state.editingServiceId);
  const targetBusinessId = state.supportContextBusinessId || state.business!.id;
  const fromSupport = Boolean(state.supportContextBusinessId);
  const payload = {
    business_id: targetBusinessId,
    name: (document.getElementById("newServiceName") as HTMLInputElement).value.trim(),
    description: (document.getElementById("newServiceDescription") as HTMLTextAreaElement).value.trim(),
    category: (document.getElementById("newServiceCategory") as HTMLInputElement).value.trim(),
    price: Number((document.getElementById("newServicePrice") as HTMLInputElement).value || 0),
    duration: Number((document.getElementById("newServiceDuration") as HTMLInputElement).value || 0),
    icon: (document.getElementById("newServiceIcon") as HTMLInputElement).value.trim() || "✂️",
    active: (document.getElementById("newServiceActive") as HTMLInputElement).checked,
  };

  if (!payload.name || !payload.duration) {
    showToast("Preencha nome e duracao do servico.");
    return;
  }

  showLoading(true);
  try {
    const { error } = isEditing
      ? await serviceCatalogService.updateService(state.editingServiceId!, payload)
      : await serviceCatalogService.insertService(payload);
    if (error) throw error;
    if (fromSupport) {
      await createSupportEvent({
        businessId: targetBusinessId,
        eventType: isEditing ? "service_updated" : "service_created",
        title: isEditing ? "Serviço atualizado pelo suporte" : "Serviço criado pelo suporte",
        details: `${payload.name} · ${formatCurrency(payload.price)} · ${payload.duration} min`,
      });
    }
    closeServiceModal();
    resetServiceModal();
    showToast(isEditing ? "Servico atualizado com sucesso." : "Servico salvo com sucesso.");
    state.supportContextBusinessId = null;
    if (state.business) await refreshAllBusinessData();
    if (state.isPlatformAdmin) await loadSupportBusinesses();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function saveProfessional(): Promise<void> {
  if (!state.business && !state.supportContextBusinessId) return;
  const isEditing = Boolean(state.editingProfessionalId);
  const targetBusinessId = state.supportContextBusinessId || state.business!.id;
  const fromSupport = Boolean(state.supportContextBusinessId);

  const selectedServiceIds = Array.from((document.getElementById("newProfServices") as HTMLSelectElement).selectedOptions).map(
    (option) => option.value
  );
  const payload = {
    business_id: targetBusinessId,
    name: (document.getElementById("newProfName") as HTMLInputElement).value.trim(),
    role: (document.getElementById("newProfRole") as HTMLInputElement).value.trim(),
    emoji: (document.getElementById("newProfEmoji") as HTMLInputElement).value.trim() || "👤",
    active: (document.getElementById("newProfActive") as HTMLInputElement).checked,
    day_off_weekday: readNullableValue("newProfDayOffWeekday") ? Number(readNullableValue("newProfDayOffWeekday")) : null,
    vacation_start: readNullableValue("newProfVacationStart"),
    vacation_end: readNullableValue("newProfVacationEnd"),
    lunch_start: readNullableValue("newProfLunchStart"),
    lunch_end: readNullableValue("newProfLunchEnd"),
  };

  if (!payload.name) {
    showToast("Informe o nome do profissional.");
    return;
  }

  const availabilityError = validateProfessionalAvailability(payload);
  if (availabilityError) {
    showToast(availabilityError);
    return;
  }

  const targetBusiness = getProfessionalTargetBusiness();
  if (targetBusiness && isStarterPlan(targetBusiness) && payload.active) {
    const excludeId = isEditing ? state.editingProfessionalId! : null;
    const pool = excludeId ? state.professionals.filter((p) => p.id !== excludeId) : state.professionals;
    if (countActiveProfessionals(pool) >= STARTER_ACTIVE_PROFESSIONAL_LIMIT) {
      showToast(`No Plano Starter você pode manter até ${STARTER_ACTIVE_PROFESSIONAL_LIMIT} profissionais ativos. Faça upgrade ao Pro para adicionar mais.`);
      return;
    }
  }

  showLoading(true);
  try {
    const result = isEditing
      ? await professionalService.updateProfessional(state.editingProfessionalId!, payload)
      : await professionalService.insertProfessional(payload);
    if (result.error) throw result.error;
    const professional = result.data as { id: string };

    if (isEditing) {
      await professionalService.deleteProfessionalServiceLinks(professional.id);
    }

    if (selectedServiceIds.length) {
      await professionalService.insertProfessionalServiceLinks(
        selectedServiceIds.map((serviceId) => ({
          professional_id: professional.id,
          service_id: serviceId,
        }))
      );
    }

    if (fromSupport) {
      await createSupportEvent({
        businessId: targetBusinessId,
        eventType: isEditing ? "professional_updated" : "professional_created",
        title: isEditing ? "Profissional atualizado pelo suporte" : "Profissional criado pelo suporte",
        details: `${payload.name}${payload.role ? ` · ${payload.role}` : ""}`,
      });
    }

    closeProfessionalModal();
    resetProfessionalModal();
    showToast(isEditing ? "Profissional atualizado com sucesso." : "Profissional salvo com sucesso.");
    state.supportContextBusinessId = null;
    if (state.business) await refreshAllBusinessData();
    if (state.isPlatformAdmin) await loadSupportBusinesses();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function saveAppointment(): Promise<void> {
  if (!state.business) return;
  const isEditing = Boolean(state.editingAppointmentId);
  const previousAppointment = isEditing && state.selectedAppointment ? { ...state.selectedAppointment } : null;

  const formValues = getAppointmentModalPayload();
  const baseStatus = (isEditing ? state.selectedAppointment?.status || "confirmado" : "confirmado") as AppointmentStatus;
  const payload = {
    ...formValues,
    status: baseStatus,
    client_reapproval_required: false,
  };

  if (!payload.client_name || !payload.client_phone || !payload.service_id || !payload.appointment_date || !payload.appointment_time) {
    showToast("Preencha todos os campos do agendamento.");
    return;
  }

  const isSlotAvailable = await isAppointmentSlotAllowed({
    business_id: payload.business_id,
    service_id: payload.service_id,
    professional_id: payload.professional_id,
    appointment_date: payload.appointment_date,
    appointment_time: payload.appointment_time,
  });
  if (!isSlotAvailable) {
    showToast("Esse horário não está mais disponível. Escolha outro horário livre.");
    await syncAppointmentAvailability();
    return;
  }

  showLoading(true);
  try {
    if (isEditing && previousAppointment) {
      const changedTiming = hasAppointmentBeenRescheduled(previousAppointment, {
        ...previousAppointment,
        ...payload,
      } as typeof previousAppointment);
      if (changedTiming && previousAppointment.status !== "cancelado" && previousAppointment.status !== "concluido") {
        payload.status = "pendente";
        payload.client_reapproval_required = true;
      }
    }
    const { error } = isEditing
      ? await appointmentService.updateAppointment(state.editingAppointmentId!, payload)
      : await appointmentService.insertAppointment(payload);
    if (error) throw error;
    closeAppointmentModal();
    let toastMessage = isEditing ? "Agendamento atualizado com sucesso." : "Agendamento criado com sucesso.";
    if (isEditing && previousAppointment) {
      const updatedAppointment = { ...previousAppointment, ...payload };
      if (updatedAppointment.status !== "cancelado" && hasAppointmentBeenRescheduled(previousAppointment, updatedAppointment)) {
        toastMessage = await notifyCustomerAboutReschedule(updatedAppointment);
      }
    }
    showToast(toastMessage);
    await refreshAllBusinessData();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}
