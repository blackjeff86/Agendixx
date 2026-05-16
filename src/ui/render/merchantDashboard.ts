import { DEFAULT_HOURS } from "../../constants/defaults";
import { countActiveProfessionals, getCustomerManagementLimit, isStarterPlan, STARTER_ACTIVE_PROFESSIONAL_LIMIT } from "../../config/plans";
import { SUPPORT_WHATSAPP_FALLBACK } from "../../config/env";
import { findProfessional, findService } from "../../state/selectors";
import { state, STATUS_LABELS } from "../../state/store";
import type { Business } from "../../types";
import { emptyStateHtml } from "../components/emptyState";
import { getPublicAppUrl } from "../dom";
import { formatFreezeMetaLabel } from "../../utils/businessHours";
import { formatCurrency, formatDateShort, formatTime, getLocalIsoDate } from "../../utils/formatters";
import { buildWhatsAppWebUrlWithText } from "../../utils/phone";
import { applyPlanNavVisibility, renderPlanStatusStrip, renderProfissionaisPlanHint } from "./planStrip";

let vipCustomersOnly = false;
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type CustomerMetrics = {
  recurrentCount: number;
  appointmentsCount: number;
  appointmentsThisMonth: number;
  lastAppointment: string;
};

function getCustomerMetrics(customerId: string): CustomerMetrics {
  const currentMonthPrefix = getLocalIsoDate().slice(0, 7);
  const appointments = state.appointments.filter((item) => item.customer_id === customerId && item.status !== "cancelado");
  const latestAppointment = [...appointments].sort((left, right) => {
    const leftKey = `${left.appointment_date} ${left.appointment_time}`;
    const rightKey = `${right.appointment_date} ${right.appointment_time}`;
    return rightKey.localeCompare(leftKey);
  })[0];
  return {
    recurrentCount: appointments.filter((item) => item.series_id).length,
    appointmentsCount: appointments.length,
    appointmentsThisMonth: appointments.filter((item) => item.appointment_date.startsWith(currentMonthPrefix)).length,
    lastAppointment: latestAppointment
      ? `${formatDateShort(latestAppointment.appointment_date)}, ${formatTime(latestAppointment.appointment_time)}`
      : "Ainda sem agendamento",
  };
}

function getVipCustomerIds(customers = state.customers): Set<string> {
  const metrics = customers.map((customer) => ({
    customerId: customer.id,
    ...getCustomerMetrics(customer.id),
  }));
  const maxRecurrent = Math.max(0, ...metrics.map((item) => item.recurrentCount));
  const maxMonthlyBookings = Math.max(0, ...metrics.map((item) => item.appointmentsThisMonth));
  return new Set(
    metrics
      .filter(
        (item) =>
          (maxRecurrent > 0 && item.recurrentCount === maxRecurrent) ||
          (maxMonthlyBookings > 0 && item.appointmentsThisMonth === maxMonthlyBookings)
      )
      .map((item) => item.customerId)
  );
}

function buildCustomerWhatsAppMessage(name: string): string {
  return `Olá, ${name}! Tudo bem?`;
}

function buildSupportWhatsAppMessage(): string {
  return "Olá! Preciso de ajuda com a Agendixx.";
}

function formatAvailabilitySummary(professionalId: string): string {
  const professional = state.professionals.find((item) => item.id === professionalId);
  if (!professional) return "";
  const chunks: string[] = [];
  if (professional.day_off_weekday !== null && professional.day_off_weekday !== undefined) {
    chunks.push(`Folga: ${WEEKDAY_LABELS[professional.day_off_weekday] || "Dia"}`);
  }
  if (professional.vacation_start && professional.vacation_end) {
    chunks.push(`Férias: ${new Date(`${professional.vacation_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${professional.vacation_end}T12:00:00`).toLocaleDateString("pt-BR")}`);
  }
  if (professional.lunch_start && professional.lunch_end) {
    chunks.push(`Almoço: ${formatTime(professional.lunch_start)}-${formatTime(professional.lunch_end)}`);
  }
  return chunks.join(" · ");
}

function getDashboardActiveDate(): string {
  return state.selectedDashboardDate || getLocalIsoDate();
}

function formatDashboardMonthLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function buildDashboardDateOptions(days = 7): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return getLocalIsoDate(date);
  });
}

function renderDashboardDateStrip(): void {
  const container = document.getElementById("dashboardDateStrip");
  if (!container) return;
  const activeDate = getDashboardActiveDate();
  const days = buildDashboardDateOptions();
  container.innerHTML = days
    .map((date) => {
      const current = new Date(`${date}T12:00:00`);
      const weekday = current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
      const day = current.toLocaleDateString("pt-BR", { day: "2-digit" });
      const isSelected = activeDate === date;
      const isToday = date === getLocalIsoDate();
      return `
        <button
          type="button"
          class="date-btn dashboard-date-btn ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}"
          onclick="selectDashboardDate('${date}', event)"
        >
          <span>${weekday}</span>
          <span class="day-num">${day}</span>
        </button>`;
    })
    .join("");
}

export function toggleCustomerVipFilter(): void {
  vipCustomersOnly = !vipCustomersOnly;
  renderCustomers();
}

export function openCustomerWhatsApp(phone: string, name: string): void {
  const url = buildWhatsAppWebUrlWithText(phone, buildCustomerWhatsAppMessage(name));
  if (!url) return;
  window.open(url, "_blank");
}

export function openSupportWhatsApp(): void {
  const phone = state.platformSettings?.support_whatsapp || SUPPORT_WHATSAPP_FALLBACK;
  const url = buildWhatsAppWebUrlWithText(phone, buildSupportWhatsAppMessage());
  if (!url) return;
  window.open(url, "_blank");
}

export function applyBusinessPreview(business: Business | null): void {
  const avatar = document.getElementById("bizAvatarPreview");
  const cover = document.getElementById("bizCoverPreview");
  const logoImage = business?.logo_image_url || "";
  const coverImage = business?.cover_image_url || "";
  const emoji = business?.logo_emoji || "✂️";

  if (avatar) {
    avatar.style.backgroundImage = logoImage ? `url(${logoImage})` : "";
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";
    avatar.style.color = logoImage ? "transparent" : "var(--brand)";
    avatar.textContent = logoImage ? "" : emoji;
  }

  if (cover) {
    cover.style.backgroundImage = coverImage
      ? `linear-gradient(rgba(30,27,75,.15), rgba(30,27,75,.15)), url(${coverImage})`
      : "";
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }
}

export function getTopServiceName(): string {
  const counts = new Map<string, number>();
  state.appointments.forEach((appointment) => {
    counts.set(appointment.service_id, (counts.get(appointment.service_id) || 0) + 1);
  });
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? findService(top[0])?.name || "-" : "-";
}

export function getTopProfessionalName(): string {
  const counts = new Map<string, number>();
  state.appointments.forEach((appointment) => {
    if (appointment.professional_id) {
      counts.set(appointment.professional_id, (counts.get(appointment.professional_id) || 0) + 1);
    }
  });
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? findProfessional(top[0])?.name || "-" : "-";
}

export function getTopServiceRevenue(): string {
  const totals = new Map<string, number>();
  state.appointments.forEach((appointment) => {
    const service = findService(appointment.service_id);
    totals.set(appointment.service_id, (totals.get(appointment.service_id) || 0) + Number(service?.price || 0));
  });
  const top = [...totals.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? formatCurrency(top[1]) : formatCurrency(0);
}

export function getTopProfessionalBookingCount(): string {
  const counts = new Map<string, number>();
  state.appointments.forEach((appointment) => {
    if (appointment.professional_id) {
      counts.set(appointment.professional_id, (counts.get(appointment.professional_id) || 0) + 1);
    }
  });
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? `${top[1]} reservas` : "0 reservas";
}

export function renderBusinessProfile(): void {
  const business = state.business;
  if (!business) return;

  const set = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = value;
  };

  const greeting = document.getElementById("greetingName");
  if (greeting) greeting.textContent = business.name;
  const avatarInitial = document.getElementById("avatarInitial");
  if (avatarInitial) avatarInitial.textContent = (business.name || "A").trim().charAt(0).toUpperCase();

  set("businessName", business.name || "");
  set("businessSlug", business.slug || "");
  set("businessCategory", business.category || "Barbearia");
  set("businessDescription", business.description || "");
  set("businessWhatsapp", business.whatsapp || "");
  set("businessInstagram", business.instagram || "");
  set("businessAddress", business.address || "");
  set("businessLogoEmoji", business.logo_emoji || "✂️");
  applyBusinessPreview(business);
}

export function renderDashboard(): void {
  const activeDate = getDashboardActiveDate();
  let dayItems = state.appointments.filter((item) => item.appointment_date === activeDate && item.status !== "cancelado");
  if (state.currentFilter !== "todos") {
    dayItems = dayItems.filter((item) => item.status === state.currentFilter);
  }
  const revenue = dayItems.reduce((total, item) => total + (findService(item.service_id)?.price || 0), 0);

  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("dashboardDatePrefix", "Visão geral");
  setText("todayDate", formatDashboardMonthLabel(activeDate));
  setText("statTodayCount", String(dayItems.length));
  setText("statTodayLabel", state.selectedDashboardDate ? "Agendamentos no dia" : "Agendamentos de hoje");
  setText("statRevenue", formatCurrency(revenue));
  const serviceCounts = new Map<string, { count: number; revenue: number }>();
  const professionalCounts = new Map<string, number>();
  dayItems.forEach((appointment) => {
    const service = findService(appointment.service_id);
    if (service) {
      serviceCounts.set(appointment.service_id, {
        count: (serviceCounts.get(appointment.service_id)?.count || 0) + 1,
        revenue: (serviceCounts.get(appointment.service_id)?.revenue || 0) + Number(service.price || 0),
      });
    }
    if (appointment.professional_id) {
      professionalCounts.set(appointment.professional_id, (professionalCounts.get(appointment.professional_id) || 0) + 1);
    }
  });
  const topService = [...serviceCounts.entries()].sort((left, right) => right[1].count - left[1].count)[0];
  const topProfessional = [...professionalCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  setText("statTopService", topService ? findService(topService[0])?.name || "-" : "-");
  setText("statTopProfessional", topProfessional ? findProfessional(topProfessional[0])?.name || "-" : "-");
  setText("statTopServiceMeta", topService ? formatCurrency(topService[1].revenue) : formatCurrency(0));
  setText("statTopProfessionalMeta", topProfessional ? `${topProfessional[1]} reservas` : "0 reservas");

  renderDashboardDateStrip();
  const clearButton = document.getElementById("clearDashboardDateBtn");
  clearButton?.classList.toggle("hidden", !state.selectedDashboardDate);
}

export function renderApptList(filter: string): void {
  const activeDate = state.selectedDashboardDate;
  const todayIso = getLocalIsoDate();
  let list = activeDate
    ? state.appointments.filter((item) => item.appointment_date === activeDate)
    : state.appointments.filter((item) => item.appointment_date >= todayIso);
  if (filter !== "todos") {
    list = list.filter((item) => item.status === filter);
  }

  const apptList = document.getElementById("apptList");
  if (!apptList) return;
  apptList.innerHTML = list.length
    ? list
        .map((appointment) => {
          const service = findService(appointment.service_id);
          const professional = findProfessional(appointment.professional_id);
          const status = STATUS_LABELS[appointment.status] || STATUS_LABELS.pendente;
          const dateStr = formatDateShort(appointment.appointment_date);
          const recurrenceBadge = appointment.series_id
            ? `<span class="chip" style="margin:0 0 0 8px;padding:2px 8px;font-size:10px;">Recorrente</span>`
            : "";
          return `
            <div class="appt-item" onclick="openApptDetail('${appointment.id}')">
              <div>
                <div class="appt-time">${formatTime(appointment.appointment_time)}</div>
                <div class="text-xs text-sub">${dateStr}</div>
              </div>
              <div class="appt-info">
                <div class="name ${appointment.status === "concluido" ? "is-done" : ""}">${appointment.client_name}${recurrenceBadge}</div>
                <div class="detail">${service?.name || "Servico"} · ${professional?.emoji || "👤"} ${professional?.name || "Sem preferencia"}</div>
              </div>
              <span class="badge ${status.cls}">${status.label}</span>
            </div>`;
        })
        .join("")
    : emptyStateHtml("Nenhum agendamento encontrado.");
}

export function renderApptHistoryList(filter: string): void {
  const container = document.getElementById("apptHistoryList");
  if (!container) return;
  const todayIso = getLocalIsoDate();
  let list = state.appointments.filter((item) => item.appointment_date < todayIso);
  if (filter !== "todos") {
    list = list.filter((item) => item.status === filter);
  }

  container.innerHTML = list.length
    ? list
        .sort((left, right) => {
          const leftKey = `${left.appointment_date} ${left.appointment_time}`;
          const rightKey = `${right.appointment_date} ${right.appointment_time}`;
          return rightKey.localeCompare(leftKey);
        })
        .map((appointment) => {
          const service = findService(appointment.service_id);
          const professional = findProfessional(appointment.professional_id);
          const status = STATUS_LABELS[appointment.status] || STATUS_LABELS.pendente;
          return `
            <div class="appt-item" onclick="openApptDetail('${appointment.id}')">
              <div>
                <div class="appt-time">${formatTime(appointment.appointment_time)}</div>
                <div class="text-xs text-sub">${formatDateShort(appointment.appointment_date)}</div>
              </div>
              <div class="appt-info">
                <div class="name ${appointment.status === "concluido" ? "is-done" : ""}">${appointment.client_name}</div>
                <div class="detail">${service?.name || "Servico"} · ${professional?.emoji || "👤"} ${professional?.name || "Sem preferencia"}</div>
              </div>
              <span class="badge ${status.cls}">${status.label}</span>
            </div>`;
        })
        .join("")
    : emptyStateHtml("Nenhum agendamento antigo no histórico.");
}

export function renderCustomers(): void {
  const container = document.getElementById("clientesList");
  if (!container) return;
  const limit = getCustomerManagementLimit(state.business);
  const searchInput = document.getElementById("customerSearchInput");
  const rawSearch = searchInput instanceof HTMLInputElement ? searchInput.value.trim() : "";
  const search = rawSearch.toLowerCase();
  const sortedCustomers = [...state.customers].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const vipIds = getVipCustomerIds(sortedCustomers);
  let filteredCustomers = search
    ? sortedCustomers.filter((customer) => customer.name.toLowerCase().includes(search))
    : sortedCustomers;
  if (vipCustomersOnly) {
    filteredCustomers = filteredCustomers.filter((customer) => vipIds.has(customer.id));
  }
  const visibleCustomers = filteredCustomers.slice(0, limit);
  const totalAppointments = visibleCustomers.reduce(
    (acc, customer) => acc + getCustomerMetrics(customer.id).appointmentsCount,
    0
  );
  const recurrentCustomers = visibleCustomers.filter((customer) => getCustomerMetrics(customer.id).recurrentCount > 0).length;
  const vipCustomers = visibleCustomers.filter((customer) => vipIds.has(customer.id)).length;
  const starterHint =
    state.business && isStarterPlan(state.business) && filteredCustomers.length > limit
      ? `<div class="card card-sm plan-hint-card"><strong>Plano Starter</strong><span class="text-sm text-sub">Você está vendo os primeiros <strong>${limit} clientes</strong>. Faça upgrade para o Pro para liberar a base completa.</span></div>`
      : "";
  const controls = `
      <div class="card card-sm customer-tools-card">
        <div class="customer-tools-row">
          <div class="input-group">
            <label for="customerSearchInput">Buscar cliente</label>
            <input type="text" id="customerSearchInput" placeholder="Digite o nome do cliente" oninput="filterCustomers()" />
          </div>
          <button class="customer-filter-chip ${vipCustomersOnly ? "is-active" : ""}" type="button" onclick="toggleCustomerVipFilter()">
            ⭐ Clientes VIP
          </button>
        </div>
      </div>`;
  const listHtml = visibleCustomers.length
    ? visibleCustomers
        .map((customer) => {
          const metrics = getCustomerMetrics(customer.id);
          const isVip = vipIds.has(customer.id);
          const initial = customer.name?.trim()?.charAt(0)?.toUpperCase() || "C";
          return `
            <details class="card customer-card customer-accordion">
              <summary class="customer-card-summary">
                <div class="customer-card-top">
                  <div class="customer-card-main-wrap">
                    <div class="customer-card-avatar">${initial}</div>
                    <div class="customer-card-main">
                      <div class="customer-card-name-row">
                        <div class="customer-card-name">${customer.name}</div>
                        ${isVip ? `<span class="customer-vip-badge" title="Cliente VIP">⭐ VIP</span>` : ""}
                      </div>
                      <div class="customer-card-contact">${customer.email || "Sem e-mail"} · ${customer.phone}</div>
                    </div>
                  </div>
                </div>
                <div class="customer-summary-footer">
                  <span class="badge badge-brand">${metrics.appointmentsCount} agendamento(s)</span>
                  <span class="customer-expand-icon" aria-hidden="true">⌄</span>
                </div>
              </summary>
              <div class="customer-card-body">
                <div class="customer-card-meta-grid">
                  <div class="customer-mini-info">
                    <span>Último agendamento</span>
                    <strong>${metrics.lastAppointment}</strong>
                  </div>
                  <div class="customer-mini-info">
                    <span>Recorrência</span>
                    <strong>${metrics.recurrentCount ? `${metrics.recurrentCount} recorrente(s)` : "Sem recorrência"}</strong>
                  </div>
                </div>
                <div class="customer-chip-row">
                  <button class="chip customer-chip-btn" type="button" onclick="openCustomerWhatsApp('${customer.phone}', '${customer.name.replace(/'/g, "\\'")}')">WhatsApp: ${customer.phone}</button>
                  ${customer.email ? `<span class="chip">E-mail: ${customer.email}</span>` : ""}
                  ${metrics.recurrentCount ? `<span class="chip">Recorrentes: ${metrics.recurrentCount}</span>` : `<span class="chip">Cliente avulso</span>`}
                  ${isVip ? `<span class="chip chip-vip">Mais ativo no mês</span>` : ""}
                </div>
              </div>
            </details>`;
        })
        .join("")
    : emptyStateHtml(search || vipCustomersOnly ? "Nenhum cliente encontrado com esse filtro." : "Os clientes aparecerão aqui conforme fizerem agendamentos pelo link público.");
  const summary = visibleCustomers.length
    ? `
      <div class="stat-grid customer-summary-grid">
        <div class="stat-card customer-stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-val">${visibleCustomers.length}</div>
          <div class="stat-label">Clientes visíveis</div>
        </div>
        <div class="stat-card customer-stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-val">${totalAppointments}</div>
          <div class="stat-label">Agendamentos vinculados</div>
        </div>
        <div class="stat-card customer-stat-card">
          <div class="stat-icon">🔁</div>
          <div class="stat-val">${recurrentCustomers}</div>
          <div class="stat-label">Clientes recorrentes</div>
        </div>
        <div class="stat-card customer-stat-card">
          <div class="stat-icon">⭐</div>
          <div class="stat-val">${vipCustomers}</div>
          <div class="stat-label">Clientes VIP</div>
        </div>
      </div>`
    : "";
  container.innerHTML = `${starterHint}${summary}${controls}${listHtml}`;
  const nextSearchInput = document.getElementById("customerSearchInput");
  if (nextSearchInput instanceof HTMLInputElement) {
    nextSearchInput.value = rawSearch;
  }
}

export function renderServicos(): void {
  const el = document.getElementById("servicosList");
  if (!el) return;
  el.innerHTML = state.services.length
    ? state.services
        .map(
          (service) => `
            <div class="card card-sm flex items-center gap-3 ${service.active ? "" : "soft-inactive"}" style="margin-bottom:10px;">
              <div class="service-icon">${service.icon || "✂️"}</div>
              <div style="flex:1;">
                <div class="flex justify-between items-center gap-2">
                  <div class="font-semibold">${service.name}</div>
                  <div class="flex items-center gap-2">
                    <span class="badge ${service.active ? "badge-success" : "badge-danger"}">${service.active ? "Ativo" : "Inativo"}</span>
                    <div class="card-menu" id="service-menu-${service.id}">
                      <button class="card-menu-btn" type="button" onclick="toggleCardMenu('service-menu-${service.id}')">⋯</button>
                      <div class="card-menu-sheet">
                        <button class="card-menu-item" type="button" onclick="editService('${service.id}')">Editar</button>
                        <button class="card-menu-item warning" type="button" onclick="toggleServiceActive('${service.id}')">${service.active ? "Desativar" : "Reativar"}</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-sm text-sub mt-1">${service.description || ""}</div>
                <div class="flex gap-3 mt-1">
                  <span class="text-sm font-bold text-brand">${formatCurrency(service.price)}</span>
                  <span class="text-sm text-sub">⏱ ${service.duration} min</span>
                  <span class="chip" style="margin:0;padding:2px 8px;font-size:10px;">${service.category || "Servico"}</span>
                </div>
              </div>
            </div>`
        )
        .join("")
    : emptyStateHtml("Cadastre seu primeiro servico.");
}

export function renderProfissionais(): void {
  const activeCount = countActiveProfessionals(state.professionals);
  const addButton = document.getElementById("btnAddProfessional") as HTMLButtonElement | null;
  if (addButton && state.business && isStarterPlan(state.business)) {
    const blocked = activeCount >= STARTER_ACTIVE_PROFESSIONAL_LIMIT;
    addButton.disabled = blocked;
    addButton.title = blocked
      ? `No Plano Starter você pode manter até ${STARTER_ACTIVE_PROFESSIONAL_LIMIT} profissionais ativos.`
      : "";
  }

  const sortedProfessionals = [...state.professionals].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });

  const html = sortedProfessionals.length
    ? sortedProfessionals
        .map((professional) => {
          const serviceNames = state.professionalServices
            .filter((item) => item.professional_id === professional.id)
            .map((item) => findService(item.service_id)?.name)
            .filter(Boolean);
          const availabilitySummary = formatAvailabilitySummary(professional.id);
          const starterBlocked = Boolean(
            state.business &&
              isStarterPlan(state.business) &&
              !professional.active &&
              activeCount >= STARTER_ACTIVE_PROFESSIONAL_LIMIT
          );
          const inlineHint = starterBlocked
            ? "Limite do Starter atingido. Desative outro profissional para reativar este."
            : "Disponível para reativação porque sua conta ainda está dentro do limite de profissionais ativos.";
          const inlineAction = professional.active
            ? ""
            : `
                <div class="professional-inline-actions">
                  <button
                    class="btn btn-sm btn-success"
                    type="button"
                    onclick="toggleProfessionalActive('${professional.id}')"
                    ${starterBlocked ? "disabled" : ""}
                  >
                    Reativar profissional
                  </button>
                  <div class="professional-inline-hint">${inlineHint}</div>
                </div>`;

          return `
            <div class="card card-sm flex items-center gap-3 ${professional.active ? "" : "soft-inactive"}" style="margin-bottom:10px;">
              <div class="avatar avatar-lg">${professional.emoji || "👤"}</div>
              <div style="flex:1;">
                <div class="flex justify-between items-center gap-2">
                  <div class="font-bold">${professional.name}</div>
                  <div class="flex items-center gap-2">
                    <span class="badge ${professional.active ? "badge-success" : "badge-danger"}">${professional.active ? "Ativo" : "Inativo"}</span>
                    <div class="card-menu" id="professional-menu-${professional.id}">
                      <button class="card-menu-btn" type="button" onclick="toggleCardMenu('professional-menu-${professional.id}')">⋯</button>
                      <div class="card-menu-sheet">
                        <button class="card-menu-item" type="button" onclick="editProfessional('${professional.id}')">Editar</button>
                        <button class="card-menu-item warning" type="button" onclick="toggleProfessionalActive('${professional.id}')">${professional.active ? "Desativar" : "Reativar"}</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-sm text-sub">${professional.role || ""}</div>
                <div class="mt-1">${serviceNames.map((name) => `<span class="chip" style="margin-bottom:0;">${name}</span>`).join("")}</div>
                ${availabilitySummary ? `<div class="text-xs text-sub mt-2">${availabilitySummary}</div>` : ""}
                ${inlineAction}
              </div>
            </div>`;
        })
        .join("")
    : emptyStateHtml("Cadastre seu primeiro profissional.");
  const targets = ["profissionaisList", "profissionaisNegocioList"];
  targets.forEach((targetId) => {
    const target = document.getElementById(targetId);
    if (target) target.innerHTML = html;
  });
}

export function renderHorarios(): void {
  const list = state.hours.length ? state.hours : DEFAULT_HOURS;
  const el = document.getElementById("horariosList");
  if (!el) return;
  el.innerHTML = list
    .map((hour) => {
      const freezeMeta = formatFreezeMetaLabel(hour);
      return `
        <div class="hour-card ${hour.frozen ? "is-frozen" : ""}">
          <div class="hour-card-head">
            <div class="hour-day-name">${hour.day_name}</div>
            <label class="hour-switch-wrap">
              <span class="hour-inline-label">Dia ativo</span>
              <span class="toggle">
                <input type="checkbox" id="hour-active-${hour.day_of_week}" ${hour.active ? "checked" : ""} onchange="toggleHourInputs(${hour.day_of_week})" />
                <span class="toggle-slider"></span>
              </span>
            </label>
          </div>

          <button
            type="button"
            id="hour-frozen-${hour.day_of_week}"
            class="hour-freeze-btn ${hour.frozen ? "is-frozen" : ""}"
            data-frozen="${hour.frozen ? "true" : "false"}"
            data-frozen-date="${hour.frozen_date || ""}"
            data-frozen-time="${hour.frozen_time || ""}"
            data-frozen-until-time="${hour.frozen_until_time || ""}"
            aria-pressed="${hour.frozen ? "true" : "false"}"
            title="${hour.frozen && hour.frozen_time ? `Agenda pausada às ${hour.frozen_time}` : "Pausar agenda desse dia"}"
            onclick="toggleHourFrozen(${hour.day_of_week})"
            ${hour.active ? "" : "disabled"}
          >
            <span class="freeze-icon">${hour.frozen ? "▶" : "⏸"}</span>
            <span class="freeze-label">${hour.frozen ? "Liberar agenda" : "Pausar agenda"}</span>
            ${freezeMeta ? `<span class="freeze-meta">${freezeMeta}</span>` : ""}
          </button>

          <div class="hour-time-grid">
            <label class="hour-time-field">
              <span class="hour-field-label">Abre às</span>
              <input class="hour-time-input" type="time" id="hour-open-${hour.day_of_week}" value="${hour.open_time || ""}" ${hour.active ? "" : "disabled"} />
            </label>
            <label class="hour-time-field">
              <span class="hour-field-label">Fecha às</span>
              <input class="hour-time-input" type="time" id="hour-close-${hour.day_of_week}" value="${hour.close_time || ""}" ${hour.active ? "" : "disabled"} />
            </label>
          </div>
        </div>`
    })
    .join("");
}

export function populateModalOptions(): void {
  const serviceOptions = state.services.map((service) => `<option value="${service.id}">${service.name}</option>`).join("");
  const professionalOptions = [`<option value="">Sem preferencia</option>`]
    .concat(state.professionals.map((professional) => `<option value="${professional.id}">${professional.name}</option>`))
    .join("");

  const newApptService = document.getElementById("newApptService");
  const newApptProfessional = document.getElementById("newApptProfessional");
  const newProfServices = document.getElementById("newProfServices");
  if (newApptService) newApptService.innerHTML = serviceOptions;
  if (newApptProfessional) newApptProfessional.innerHTML = professionalOptions;
  if (newProfServices) newProfServices.innerHTML = serviceOptions;
}

export function updatePublicLink(): void {
  if (!state.business) return;
  const publicUrl = getPublicAppUrl(state.business.slug);
  const bizLink = document.getElementById("bizLink");
  if (bizLink) bizLink.textContent = publicUrl;
}

export function toggleCardMenu(menuId: string): void {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const isOpen = menu.classList.contains("open");
  document.querySelectorAll(".card-menu").forEach((item) => item.classList.remove("open"));
  if (!isOpen) menu.classList.add("open");
}

export function renderAdmin(): void {
  renderPlanStatusStrip();
  applyPlanNavVisibility();
  renderBusinessProfile();
  renderDashboard();
  renderApptList(state.currentFilter);
  renderApptHistoryList(state.historyFilter);
  renderServicos();
  renderProfissionais();
  renderProfissionaisPlanHint();
  renderHorarios();
  renderCustomers();
  populateModalOptions();
  updatePublicLink();
}
