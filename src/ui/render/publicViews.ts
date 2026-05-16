import { bookingState, state } from "../../state/store";
import { emptyStateHtml } from "../components/emptyState";
import { formatCurrency, formatDateShort, formatHoursSummary, formatLongDate, formatTime } from "../../utils/formatters";
import { STATUS_LABELS } from "../../state/store";
import { findProfessional, findService } from "../../state/selectors";

function normalizeName(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizePhone(value: string): string {
  return (value || "").replace(/\D/g, "");
}

function matchesPortalCustomerNamePhone(clientName: string, clientPhone: string): boolean {
  const portal = state.publicCustomerPortal;
  if (!portal) return false;
  return normalizeName(clientName) === normalizeName(portal.customer.name) && normalizePhone(clientPhone) === normalizePhone(portal.customer.phone);
}

export function renderPublicLanding(): void {
  const { business, services, professionals, hours } = state.publicData;
  if (!business) return;

  const hero = document.getElementById("publicHeroEmoji");
  if (hero) {
    if (business.logo_image_url) {
      hero.innerHTML = `<img src="${business.logo_image_url}" alt="Logo do negocio" style="width:100%;height:100%;object-fit:cover;border-radius:20px;" />`;
    } else {
      hero.textContent = business.logo_emoji || "✂️";
    }
  }
  const setText = (id: string, t: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t;
  };
  setText("publicHeroName", business.name);
  setText("publicHeroDescription", business.description || "Agende seu horario online.");
  setText("publicHeroAddress", `📍 ${business.address || "Endereco nao informado"}`);
  setText("publicHeroWhatsapp", `💬 ${business.whatsapp || "WhatsApp"}`);
  setText("publicHeroHours", `🕐 ${formatHoursSummary(hours)}`);
  setText("publicAddressCard", business.address || "Endereco nao informado");
  setText("publicInstagramCard", business.instagram || "@sem-instagram");

  const pubHero = document.querySelector(".pub-hero") as HTMLElement | null;
  if (pubHero) {
    if (business.cover_image_url) {
      pubHero.style.backgroundImage = `linear-gradient(160deg, rgba(124,58,237,.8) 0%, rgba(91,33,182,.8) 100%), url(${business.cover_image_url})`;
      pubHero.style.backgroundSize = "cover";
      pubHero.style.backgroundPosition = "center";
    } else {
      pubHero.style.backgroundImage = "";
    }
  }

  const pubServicePreview = document.getElementById("pubServicePreview");
  if (pubServicePreview) {
    pubServicePreview.innerHTML = services.length
      ? services
          .map(
            (service) => `
            <div class="service-card" onclick="startFromServicePreview('${service.id}')">
              <div class="service-icon">${service.icon || "✂️"}</div>
              <div style="flex:1;">
                <div class="font-semibold">${service.name}</div>
                <div class="text-xs text-sub mt-1">${service.description || ""}</div>
                <div class="flex gap-3 mt-1">
                  <span class="text-sm font-bold text-brand">${formatCurrency(service.price)}</span>
                  <span class="text-xs text-sub">⏱ ${service.duration}min</span>
                </div>
              </div>
            </div>`
          )
          .join("")
      : emptyStateHtml("Nenhum servico publico ativo.");
  }

  const pubProfPreview = document.getElementById("pubProfPreview");
  if (pubProfPreview) {
    pubProfPreview.innerHTML = professionals.length
      ? professionals
          .map(
            (professional) => `
            <div class="prof-card" onclick="startFromProfessionalPreview('${professional.id}')">
              <div class="avatar">${professional.emoji || "👤"}</div>
              <div>
                <div class="font-bold">${professional.name}</div>
                <div class="text-sm text-sub">${professional.role || ""}</div>
              </div>
            </div>`
          )
          .join("")
      : emptyStateHtml("Nenhum profissional disponivel.");
  }
}

export function renderPubServices(filteredProfessionalId: string | null = null): void {
  const services = filteredProfessionalId
    ? state.publicData.services.filter((service) => {
        const professional = state.publicData.professionals.find((item) => item.id === filteredProfessionalId);
        return professional?.serviceIds?.includes(service.id);
      })
    : state.publicData.services;

  const el = document.getElementById("pubServiceList");
  if (!el) return;
  el.innerHTML = services
    .map(
      (service) => `
        <div class="service-card" id="svc-${service.id}" onclick="selectService('${service.id}')">
          <div class="service-icon">${service.icon || "✂️"}</div>
          <div style="flex:1;">
            <div class="font-semibold">${service.name}</div>
            <div class="text-xs text-sub mt-1">${service.description || ""}</div>
            <div class="flex gap-3 mt-1">
              <span class="text-sm font-bold text-brand">${formatCurrency(service.price)}</span>
              <span class="text-xs text-sub">⏱ ${service.duration}min</span>
            </div>
          </div>
        </div>`
    )
    .join("");
}

export function renderPubProfs(serviceId: string | null = null): void {
  const professionals = serviceId
    ? state.publicData.professionals.filter((professional) => professional.serviceIds?.includes(serviceId))
    : state.publicData.professionals;

  const firstOption = `
    <div class="prof-card" id="prof-0" onclick="selectProf('0')">
      <div class="avatar">👤</div>
      <div style="flex:1;">
        <div class="font-bold">Sem preferencia</div>
        <div class="text-sm text-sub">Primeiro profissional disponivel</div>
      </div>
    </div>`;

  const el = document.getElementById("pubProfList");
  if (!el) return;
  el.innerHTML =
    firstOption +
    professionals
      .map(
        (professional) => `
          <div class="prof-card" id="prof-${professional.id}" onclick="selectProf('${professional.id}')">
            <div class="avatar">${professional.emoji || "👤"}</div>
            <div style="flex:1;">
              <div class="font-bold">${professional.name}</div>
              <div class="text-sm text-sub">${professional.role || ""}</div>
            </div>
          </div>`
      )
      .join("");
}

export function renderDateScroll(): void {
  const list: string[] = [];
  const base = new Date();
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  for (let index = 0; index < 14; index += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    list.push(`
      <button class="date-btn ${index === 0 ? "today" : ""}" type="button" data-iso="${iso}" onclick="selectDate('${iso}')">
        <span style="font-size:10px;">${labels[date.getDay()]}</span>
        <span class="day-num">${date.getDate()}</span>
      </button>
    `);
  }
  const el = document.getElementById("dateScroll");
  if (el) el.innerHTML = list.join("");
}

export function renderSecondDateScroll(): void {
  const list: string[] = [];
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const primaryDate = bookingState.date ? new Date(`${bookingState.date}T12:00:00`) : new Date();
  const base = new Date(primaryDate);
  base.setDate(primaryDate.getDate() + 1);

  for (let index = 0; index < 14; index += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    list.push(`
      <button class="date-btn date-btn-sm" type="button" data-iso="${iso}" onclick="selectSecondDate('${iso}')">
        <span style="font-size:10px;">${labels[date.getDay()]}</span>
        <span class="day-num">${date.getDate()}</span>
      </button>
    `);
  }
  const el = document.getElementById("secondDateScroll");
  if (el) el.innerHTML = list.join("");
}

export function fillSummary(): void {
  const service = state.publicData.services.find((item) => item.id === bookingState.serviceId);
  const professional =
    bookingState.profId && bookingState.profId !== 0
      ? state.publicData.professionals.find((item) => item.id === bookingState.profId)
      : undefined;
  const set = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("sumService", service?.name || "—");
  set("sumProf", professional ? `${professional.emoji || "👤"} ${professional.name}` : "Primeiro disponivel");
  set("sumDate", bookingState.date ? formatLongDate(bookingState.date) : "—");
  set("sumTime", bookingState.time || "—");
  set("sumDuration", service ? `${service.duration} minutos` : "—");
  set("sumPrice", service ? formatCurrency(service.price) : "—");
}

export function renderCustomerPortal(): void {
  const portal = state.publicCustomerPortal;
  if (!portal) return;

  const hero = document.getElementById("clientPortalHeroEmoji");
  if (hero) {
    if (portal.business.logo_image_url) {
      hero.innerHTML = `<img src="${portal.business.logo_image_url}" alt="Logo do negócio" style="width:100%;height:100%;object-fit:cover;border-radius:20px;" />`;
    } else {
      hero.textContent = portal.business.logo_emoji || "✂️";
    }
  }

  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const firstName = portal.customer.name.split(/\s+/)[0] || portal.customer.name;
  setText("clientPortalHeroName", portal.business.name);
  setText("clientPortalHeroWelcome", `Seja bem-vindo, ${firstName}`);
  setText("clientPortalHeroKicker", "(área do cliente)");
  setText("clientPortalAddressMeta", `📍 ${portal.business.address || "Endereço não informado"}`);
  setText("clientPortalWhatsappMeta", `💬 ${portal.business.whatsapp || "WhatsApp"}`);
  setText("clientPortalHoursMeta", `🕐 ${formatHoursSummary(portal.hours)}`);

  const stats = document.getElementById("clientPortalStats");
  if (stats) {
    const ownAppointments = portal.appointments.filter((item) => matchesPortalCustomerNamePhone(item.client_name, item.client_phone));
    const all = ownAppointments.length;
    const confirmed = ownAppointments.filter((item) => item.status === "confirmado").length;
    const pending = ownAppointments.filter((item) => item.status === "pendente").length;
    const done = ownAppointments.filter((item) => item.status === "concluido").length;
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-val">${all}</div><div class="stat-label">Reservas feitas</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-val">${confirmed}</div><div class="stat-label">Confirmadas</div></div>
      <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-val">${pending}</div><div class="stat-label">Pendentes</div></div>
      <div class="stat-card"><div class="stat-icon">✨</div><div class="stat-val">${done}</div><div class="stat-label">Concluídas</div></div>
    `;
  }

  renderCustomerPortalDateScroll();
  renderCustomerPortalAppointments();
}

export function renderCustomerPortalDateScroll(): void {
  const portal = state.publicCustomerPortal;
  const container = document.getElementById("clientPortalDateScroll");
  if (!portal || !container) return;
  const upcoming = [...portal.appointments]
    .filter((item) => matchesPortalCustomerNamePhone(item.client_name, item.client_phone))
    .filter((item) => item.status !== "cancelado" && item.status !== "concluido")
    .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`));
  const uniqueDates = [...new Set(upcoming.map((item) => item.appointment_date))].slice(0, 10);

  if (!uniqueDates.length) {
    container.innerHTML = emptyStateHtml("Você não tem novos horários agendados no momento.");
    return;
  }

  container.innerHTML = uniqueDates
    .map((date) => {
      const d = new Date(`${date}T12:00:00`);
      const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
      const selected = state.customerPortalSelectedDate === date;
      return `
        <button class="date-btn dashboard-date-btn ${selected ? "selected" : ""}" type="button" onclick="selectCustomerPortalDate('${date}')">
          <span style="font-size:10px;text-transform:capitalize;">${weekday}</span>
          <span class="day-num">${d.getDate()}</span>
        </button>
      `;
    })
    .join("");
}

export function renderCustomerPortalAppointments(): void {
  const portal = state.publicCustomerPortal;
  const container = document.getElementById("clientPortalAppointmentList");
  const dateLabel = document.getElementById("clientPortalDateLabel");
  const clearBtn = document.getElementById("clientPortalClearDate");
  const clearStatusBtn = document.getElementById("clientPortalClearStatus");
  if (!portal || !container || !dateLabel || !clearBtn) return;

  const filters = document.querySelectorAll("#clientPortalStatusFilters .portal-filter-pill");
  filters.forEach((filter) => {
    const isActive = filter.getAttribute("onclick") === `selectCustomerPortalStatusFilter('${state.customerPortalStatusFilter}')`;
    filter.classList.toggle("active", isActive);
  });

  const filtered = portal.appointments
    .filter((item) => matchesPortalCustomerNamePhone(item.client_name, item.client_phone))
    .filter((item) => (state.customerPortalSelectedDate ? item.appointment_date === state.customerPortalSelectedDate : true))
    .filter((item) => (state.customerPortalStatusFilter !== "todos" ? item.status === state.customerPortalStatusFilter : true));

  clearBtn.classList.toggle("hidden", !state.customerPortalSelectedDate && state.customerPortalStatusFilter === "todos");
  clearStatusBtn?.classList.toggle("hidden", !state.customerPortalSelectedDate && state.customerPortalStatusFilter === "todos");
  dateLabel.textContent = state.customerPortalSelectedDate
    ? `Filtro aplicado: ${formatLongDate(state.customerPortalSelectedDate)}`
    : state.customerPortalStatusFilter !== "todos"
      ? `Filtro aplicado: ${STATUS_LABELS[state.customerPortalStatusFilter]?.label || state.customerPortalStatusFilter}`
      : "Visualize seus horários futuros, acompanhe o status e reagende quando precisar.";

  const ordered = [...filtered].sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`));
  container.innerHTML = ordered.length
    ? ordered
        .map((appointment) => {
          const service = portal.services.find((item) => item.id === appointment.service_id) || findService(appointment.service_id);
          const professional = portal.professionals.find((item) => item.id === appointment.professional_id) || findProfessional(appointment.professional_id);
          const status = STATUS_LABELS[appointment.status];
          const canReschedule = appointment.status !== "cancelado" && appointment.status !== "concluido";
          const canApprove = appointment.status === "pendente" && appointment.client_reapproval_required;
          return `
            <div class="appt-item portal-appt-item">
              <div class="portal-appt-time">
                <span class="portal-appt-time-hour">${formatTime(appointment.appointment_time)}</span>
                <span class="portal-appt-time-date">${formatDateShort(appointment.appointment_date)}</span>
              </div>
              <div class="portal-appt-info">
                <div class="portal-appt-title-row">
                  <div class="portal-appt-name">${service?.name || "Serviço"}</div>
                  <span class="badge ${status?.cls || "badge-brand"}">${status?.label || appointment.status}</span>
                </div>
                <div class="portal-appt-detail portal-appt-professional">${professional ? `${professional.emoji || "👤"} ${professional.name}` : "Primeiro disponível"}</div>
                <div class="portal-appt-meta-row">
                  <span class="portal-appt-meta-chip">📅 ${formatLongDate(appointment.appointment_date)}</span>
                </div>
                <div class="portal-appt-actions ${!canApprove && !canReschedule ? "is-empty" : ""}">
                  ${canApprove ? `<button class="btn btn-brand btn-sm" type="button" onclick="approveCustomerPortalAppointment('${appointment.id}')">Aprovar horário</button>` : ""}
                  ${canReschedule ? `<button class="btn btn-outline btn-sm portal-appt-secondary" type="button" onclick="openCustomerPortalReschedule('${appointment.id}')">Reagendar</button>` : ""}
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : emptyStateHtml("Nenhum agendamento encontrado para esse filtro.");
}
