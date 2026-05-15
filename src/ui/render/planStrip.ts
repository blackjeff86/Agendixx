import {
  canAccessCustomersModule,
  canAccessReportsModule,
  countActiveProfessionals,
  isProPlan,
  isStarterPlan,
  isPromotionalPeriodActive,
  isPromotionalPeriodExpired,
  promotionalDaysRemaining,
  resolvePlanTier,
  STARTER_ACTIVE_PROFESSIONAL_LIMIT,
} from "../../config/plans";
import { state } from "../../state/store";
import { formatCurrency, getLocalIsoDate } from "../../utils/formatters";

export function applyPlanNavVisibility(): void {
  const b = state.business;
  document.getElementById("navClientesItem")?.classList.toggle("hidden", !canAccessCustomersModule(b));
  document.getElementById("navRelatoriosItem")?.classList.toggle("hidden", !canAccessReportsModule(b));
}

export function renderPlanStatusStrip(): void {
  const el = document.getElementById("planStatusStrip");
  if (!el) return;

  if (state.isPlatformAdmin || !state.business) {
    el.classList.add("hidden");
    el.innerHTML = "";
    document.body.classList.remove("has-plan-strip");
    return;
  }

  const b = state.business;
  const tier = resolvePlanTier(b);
  const days = promotionalDaysRemaining(b);
  const promoOn = isPromotionalPeriodActive(b);
  const expired = isPromotionalPeriodExpired(b);

  const parts: string[] = [];

  if (promoOn && days !== null) {
    const label = days === 1 ? "1 dia restante" : `${days} dias restantes`;
    parts.push(`<span class="plan-status-pill plan-status-promo">1º mês promocional · ${label}</span>`);
  } else if (expired) {
    parts.push(`<span class="plan-status-pill plan-status-warn">Promoção inicial encerrada · acompanhe a renovação</span>`);
  }

  if (tier === "starter") {
    parts.push(`<span class="plan-status-pill">Plano Starter</span>`);
    parts.push(`<span class="plan-status-link plan-status-link-disabled" aria-disabled="true">Plano Pro em breve</span>`);
  } else {
    parts.push(`<span class="plan-status-pill plan-status-pro">Plano Pro</span>`);
  }

  el.innerHTML = `<div class="plan-status-inner">${parts.join("")}</div>`;
  el.classList.remove("hidden");
  document.body.classList.add("has-plan-strip");
}

export function renderProfissionaisPlanHint(): void {
  const host = document.getElementById("profissionaisPlanHint");
  const hostBusiness = document.getElementById("profissionaisPlanHintBusiness");
  if ((!host && !hostBusiness) || !state.business || state.isPlatformAdmin) {
    host?.classList.add("hidden");
    hostBusiness?.classList.add("hidden");
    return;
  }
  if (!isStarterPlan(state.business)) {
    host?.classList.add("hidden");
    hostBusiness?.classList.add("hidden");
    return;
  }
  const activeCount = countActiveProfessionals(state.professionals);
  const overLimit = activeCount > STARTER_ACTIVE_PROFESSIONAL_LIMIT;
  const warning = overLimit
    ? `<div class="plan-limit-warning">Você está com <strong>${activeCount} profissionais ativos</strong>. No Starter, deixe no máximo <strong>${STARTER_ACTIVE_PROFESSIONAL_LIMIT}</strong> ativos.</div>`
    : "";
  const html = `<div class="card card-sm plan-hint-card"><strong>Plano Starter</strong><span class="text-sm text-sub">Inclui até <strong>${STARTER_ACTIVE_PROFESSIONAL_LIMIT} profissionais ativos</strong>, até <strong>50 clientes</strong> visíveis e relatórios resumidos. No Pro você libera equipe completa e automações de WhatsApp.</span>${warning}</div>`;
  host?.classList.remove("hidden");
  hostBusiness?.classList.remove("hidden");
  if (host) host.innerHTML = html;
  if (hostBusiness) hostBusiness.innerHTML = html;
}

export function renderReportsPage(): void {
  const business = state.business;
  const pro = isProPlan(business);
  const now = new Date();
  const todayIso = getLocalIsoDate(now);
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = startOfWeek.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const metrics = state.appointments
    .filter((appointment) => appointment.status !== "cancelado")
    .reduce(
      (acc, appointment) => {
        const svc = state.services.find((s) => s.id === appointment.service_id);
        const value = svc?.price || 0;
        const apptDate = new Date(`${appointment.appointment_date}T12:00:00`);

        if (appointment.appointment_date === todayIso) {
          acc.dayCount += 1;
          acc.dayRevenue += value;
        }
        if (apptDate >= startOfWeek) {
          acc.weekCount += 1;
          acc.weekRevenue += value;
        }
        if (apptDate >= startOfMonth) {
          acc.monthCount += 1;
          acc.monthRevenue += value;
        }
        return acc;
      },
      { dayCount: 0, weekCount: 0, monthCount: 0, dayRevenue: 0, weekRevenue: 0, monthRevenue: 0 }
    );

  const set = (id: string, v: string) => {
    const n = document.getElementById(id);
    if (n) n.textContent = v;
  };
  set("reportsMonthLabel", now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  set("reportsDayCount", String(metrics.dayCount));
  set("reportsWeekCount", String(metrics.weekCount));
  set("reportsMonthCount", String(metrics.monthCount));
  set("reportsMonthRevenue", formatCurrency(metrics.monthRevenue));

  const summary = document.getElementById("reportsSummaryText");
  if (summary) {
    summary.textContent = pro
      ? "Visão consolidada do negócio com agenda e faturamento por dia, semana e mês."
      : "Visão resumida do Starter com total de agendas e receita por dia, semana e mês.";
  }
  const footer = document.getElementById("reportsFooterText");
  if (footer) {
    footer.textContent = pro
      ? "Plano Pro com automações, equipe completa e visão mais madura da operação."
      : "No Starter você acompanha o essencial. No Pro, libera automações de WhatsApp e gestão avançada.";
  }
  const chart = document.getElementById("reportsRevenueChart");
  if (chart) {
    const rows = [
      { label: "Hoje", value: metrics.dayRevenue },
      { label: "Semana", value: metrics.weekRevenue },
      { label: "Mês", value: metrics.monthRevenue },
    ];
    const max = Math.max(1, ...rows.map((row) => row.value));
    chart.innerHTML = `<div class="report-bars">${rows
      .map(
        (row) => `
          <div class="report-bar-row">
            <span class="text-sm text-sub">${row.label}</span>
            <div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.max(8, (row.value / max) * 100)}%"></div></div>
            <span class="report-bar-value">${formatCurrency(row.value)}</span>
          </div>`
      )
      .join("")}</div>`;
  }
}
