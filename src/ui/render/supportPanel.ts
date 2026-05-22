import {
  formatSupportDueLine,
  formatSupportPromotionalSummary,
  getMonthlyPriceForBusiness,
  getPaymentDueDate,
  isInRenewalWindow,
  planDisplayLabel,
  PLAN_PRO_MONTHLY_BRL,
  PLAN_STARTER_MONTHLY_BRL,
  sumEstimatedMonthlyRevenue,
} from "../../config/billing";
import { AGENDIXX_PIX_KEY, RENEWAL_REMINDER_WINDOW_DAYS, SUPPORT_PAGE_SIZE } from "../../config/env";
import { escapeHtml } from "../../utils/strings";
import {
  formatBillingLabel,
  formatCurrency,
  formatMonthYear,
  formatTimelineDate,
  normalizePlanName,
} from "../../utils/formatters";
import { state } from "../../state/store";
import { buildWhatsAppWebUrlWithText } from "../../utils/phone";
import type { Business, ManualAccessAllowlistRow } from "../../types";
import { emptyStateHtml } from "../components/emptyState";
import { MANUAL_ACCESS_ALLOWED_EMAILS, SUPPORT_ACCOUNT_EMAIL } from "../../config/env";

type RenewalVisualState = {
  label: string;
  badgeClass: string;
  summaryClass: string;
};

function getRenewalVisualState(business: Business, due?: Date | null): RenewalVisualState {
  if (!due || Number.isNaN(due.getTime())) {
    return {
      label: "Sem vencimento",
      badgeClass: "support-billing-badge is-undated",
      summaryClass: "is-undated",
    };
  }
  if (due.getTime() < Date.now()) {
    return {
      label: "Atrasado",
      badgeClass: "support-billing-badge is-overdue",
      summaryClass: "is-overdue",
    };
  }
  if (isInRenewalWindow(business)) {
    return {
      label: "Próximo de vencer",
      badgeClass: "support-billing-badge is-soon",
      summaryClass: "is-soon",
    };
  }
  return {
    label: "Em dia",
    badgeClass: "support-billing-badge is-current",
    summaryClass: "is-current",
  };
}

export function isSupportAccountEmail(email?: string | null): boolean {
  return String(email || "").trim().toLowerCase() === SUPPORT_ACCOUNT_EMAIL;
}

export function isManualAccessAllowedEmail(email?: string | null): boolean {
  return MANUAL_ACCESS_ALLOWED_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export function getManualAccessSignupMessage(email?: string | null): string {
  return isSupportAccountEmail(email)
    ? "Você está usando o e-mail interno de suporte da Agendixx. Essa conta será criada sem abrir uma loja nova."
    : "Esse e-mail foi autorizado manualmente pela Agendixx. A conta será criada sem passar pela Kiwify e sem abrir uma loja nova.";
}

export function isSupportInternalBusiness(business: Business | undefined | null): boolean {
  return isSupportAccountEmail(business?.owner_email);
}

export function getSupportEventsForBusiness(businessId: string) {
  return state.supportEvents.filter((event) => event.business_id === businessId);
}

export function renderSupportTimeline(businessId: string): void {
  const container = document.getElementById("supportTimelineList");
  if (!container) return;
  const events = getSupportEventsForBusiness(businessId);
  container.innerHTML = events.length
    ? events
        .slice(0, 12)
        .map(
          (event) => `
            <div class="support-timeline-item">
              <div class="support-timeline-dot"></div>
              <div class="support-timeline-content">
                <div class="support-timeline-title">${escapeHtml(event.title)}</div>
                <div class="support-timeline-meta">${formatTimelineDate(event.created_at)} · ${escapeHtml(event.actor_email || "Sistema")}</div>
                ${event.details ? `<div class="support-timeline-details">${escapeHtml(event.details)}</div>` : ""}
              </div>
            </div>`
        )
        .join("")
    : `<div class="empty-state">Ainda não há histórico de suporte para esta loja.</div>`;
}

export function renderSupportBusinesses(): void {
  if (!state.isPlatformAdmin) return;
  const searchInput = document.getElementById("supportSearch");
  const search = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : "";
  const filtered = state.supportBusinesses.filter((business) => {
    const haystack = [business.name, business.slug, business.owner_email, business.whatsapp].join(" ").toLowerCase();
    const matchesSearch = haystack.includes(search);
    const matchesFilter =
      state.supportFilter === "todos" ||
      (state.supportFilter === "ativas" && business.active) ||
      (state.supportFilter === "bloqueadas" && !business.active) ||
      (state.supportFilter === "sem_email" && !business.owner_email);
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / SUPPORT_PAGE_SIZE));
  state.supportPage = Math.min(state.supportPage, totalPages);
  const start = (state.supportPage - 1) * SUPPORT_PAGE_SIZE;
  const paginated = filtered.slice(start, start + SUPPORT_PAGE_SIZE);

  const setText = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  setText("supportTotalBusinesses", String(state.supportBusinesses.length));
  setText("supportActiveBusinesses", String(state.supportBusinesses.filter((item) => item.active).length));
  setText("supportBlockedBusinesses", String(state.supportBusinesses.filter((item) => !item.active).length));
  setText("supportNoEmailBusinesses", String(state.supportBusinesses.filter((item) => !item.owner_email).length));
  setText("supportEstimatedMrr", formatCurrency(sumEstimatedMonthlyRevenue(state.supportBusinesses)));
  setText("supportResultsLabel", `${filtered.length} resultado(s) encontrado(s)`);
  setText("supportPricingPill", `Cobrança via PIX · Starter ${formatCurrency(PLAN_STARTER_MONTHLY_BRL)} · Pro ${formatCurrency(PLAN_PRO_MONTHLY_BRL)}`);
  const supportWhatsapp = document.getElementById("supportGlobalWhatsapp") as HTMLInputElement | null;
  if (supportWhatsapp) {
    supportWhatsapp.value = state.platformSettings?.support_whatsapp || "";
  }

  const list = document.getElementById("supportBusinessList");
  if (list) {
    list.innerHTML = paginated.length
      ? paginated
          .map(
            (business) => `
            <div class="support-business-card ${business.active ? "" : "soft-inactive"}">
              <div class="support-business-top">
                <div>
                  <div class="font-bold support-business-name">${business.name}</div>
                  <div class="support-business-meta">${business.category || "Salão"} · desde ${formatMonthYear(business.created_at)}</div>
                </div>
                <span class="badge ${business.active ? "badge-success" : "badge-danger"}">${business.active ? "Ativa" : "Bloqueada"}</span>
              </div>

              <div class="support-business-grid">
                <div class="support-business-info">
                  <span class="support-business-label">Contato</span>
                  <strong>${business.owner_email || "Sem e-mail cadastrado"}</strong>
                </div>
                <div class="support-business-info">
                  <span class="support-business-label">WhatsApp</span>
                  <strong>${business.whatsapp || "Não informado"}</strong>
                </div>
                <div class="support-business-info">
                  <span class="support-business-label">Link público</span>
                  <strong>/${"?slug="}${business.slug}</strong>
                </div>
                <div class="support-business-info">
                  <span class="support-business-label">Cobrança</span>
                  <strong>${formatBillingLabel(business.billing_status)}</strong>
                </div>
                <div class="support-business-info support-business-info-wide">
                  <span class="support-business-label">Plano · valor mensal</span>
                  <strong>${planDisplayLabel(business)} · ${formatCurrency(getMonthlyPriceForBusiness(business))}</strong>
                </div>
                <div class="support-business-info support-business-info-wide">
                  <span class="support-business-label">Promoção / vencimento</span>
                  <strong>${escapeHtml(formatSupportPromotionalSummary(business))}</strong>
                  <div class="text-xs text-sub" style="margin-top:4px;font-weight:500;">${escapeHtml(formatSupportDueLine(business))}</div>
                </div>
              </div>

              <div class="support-business-plan-row">
                <span class="chip">${normalizePlanName(business.plan_name)}</span>
                ${
                  business.support_notes
                    ? `<span class="support-note-preview">${escapeHtml(business.support_notes)}</span>`
                    : `<span class="support-note-preview empty">Sem notas de suporte</span>`
                }
              </div>

              <div class="card-actions" style="margin-top:14px;">
                <button class="btn btn-ghost btn-sm" type="button" onclick="openSupportPublicLink('${business.slug}')">Abrir link</button>
                <button class="btn btn-link btn-sm" type="button" onclick="openSupportBusinessModal('${business.id}')">Gerenciar</button>
                <button class="btn ${business.active ? "btn-warning" : "btn-success"} btn-sm" type="button" onclick="toggleBusinessBlocked('${business.id}')">${business.active ? "Bloquear" : "Desbloquear"}</button>
                <button class="btn btn-ghost btn-sm" type="button" onclick="sendSupportPasswordReset('${business.id}')">Reset senha</button>
              </div>
            </div>`
          )
          .join("")
      : emptyStateHtml("Nenhuma loja encontrada.");
  }

  const pageLabel = document.getElementById("supportPageLabel");
  const prevButton = document.getElementById("supportPrevPageButton") as HTMLButtonElement | null;
  const nextButton = document.getElementById("supportNextPageButton") as HTMLButtonElement | null;
  if (pageLabel) pageLabel.textContent = `Página ${state.supportPage} de ${totalPages}`;
  if (prevButton) prevButton.disabled = state.supportPage <= 1;
  if (nextButton) nextButton.disabled = state.supportPage >= totalPages;

  renderSupportRenewalList();
  renderSupportSalesLeads();
  renderSupportManualAccessList();
}

export function renderSupportManualAccessList(): void {
  if (!state.isPlatformAdmin) return;
  const searchInput = document.getElementById("supportManualAccessSearch");
  const search = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : "";

  const filtered = state.supportManualAccessEntries.filter((entry) => {
    const matchesSearch = entry.email.toLowerCase().includes(search);
    const matchesFilter =
      state.supportManualAccessFilter === "todos" ||
      (state.supportManualAccessFilter === "ativos" && entry.active) ||
      (state.supportManualAccessFilter === "inativos" && !entry.active);
    return matchesSearch && matchesFilter;
  });

  const activeCount = state.supportManualAccessEntries.filter((entry) => entry.active).length;
  const inactiveCount = state.supportManualAccessEntries.length - activeCount;

  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("supportManualAccessTotal", String(state.supportManualAccessEntries.length));
  setText("supportManualAccessActive", String(activeCount));
  setText("supportManualAccessInactive", String(inactiveCount));
  setText("supportManualAccessResultsLabel", `${filtered.length} acesso(s) encontrado(s)`);

  const list = document.getElementById("supportManualAccessList");
  if (!list) return;

  const renderRoleLabel = (entry: ManualAccessAllowlistRow) =>
    entry.role === "platform_admin" ? "Admin da plataforma" : entry.role;

  list.innerHTML = filtered.length
    ? filtered
        .map(
          (entry) => `
            <div class="support-access-card ${entry.active ? "" : "soft-inactive"}">
              <div class="support-access-top">
                <div>
                  <div class="font-bold support-access-email">${escapeHtml(entry.email)}</div>
                  <div class="support-access-meta">${escapeHtml(renderRoleLabel(entry))} · ${
                    entry.created_at ? `desde ${formatMonthYear(entry.created_at)}` : "criado manualmente"
                  }</div>
                </div>
                <span class="badge ${entry.active ? "badge-success" : "badge-danger"}">${entry.active ? "Ativo" : "Inativo"}</span>
              </div>
              <div class="support-access-note">
                Quando esse e-mail cria conta, o sistema libera cadastro fora da Kiwify e concede acesso interno automaticamente.
              </div>
              <div class="card-actions">
                <button
                  class="btn ${entry.active ? "btn-warning" : "btn-success"} btn-sm"
                  type="button"
                  onclick="${entry.active ? "disableSupportManualAccess" : "enableSupportManualAccess"}('${entry.email}')"
                >
                  ${entry.active ? "Desativar acesso" : "Reativar acesso"}
                </button>
              </div>
            </div>`
        )
        .join("")
    : emptyStateHtml("Nenhum acesso manual encontrado para esse filtro.");
}

export function renderSupportRenewalList(): void {
  const container = document.getElementById("supportRenewalList");
  const summary = document.getElementById("supportRenewalSummary");
  const pixEl = document.getElementById("supportPixKeyDisplay");
  const daysEl = document.getElementById("supportRenewalWindowDays");
  if (daysEl) daysEl.textContent = String(RENEWAL_REMINDER_WINDOW_DAYS);
  if (pixEl) {
    pixEl.textContent = AGENDIXX_PIX_KEY || "Chave PIX não configurada";
  }
  if (!container) return;

  const activeBusinesses = state.supportBusinesses.filter((b) => b.active);
  const dated = activeBusinesses
    .map((b) => ({ b, due: getPaymentDueDate(b) }))
    .filter((row): row is { b: Business; due: Date } => row.due !== null && !Number.isNaN(row.due.getTime()));

  const overdue = dated
    .filter(({ due }) => due.getTime() < Date.now())
    .sort((a, c) => a.due.getTime() - c.due.getTime());
  const dueSoon = dated
    .filter(({ b, due }) => due.getTime() >= Date.now() && isInRenewalWindow(b))
    .sort((a, c) => a.due.getTime() - c.due.getTime());
  const later = dated
    .filter(({ b, due }) => due.getTime() >= Date.now() && !isInRenewalWindow(b))
    .sort((a, c) => a.due.getTime() - c.due.getTime());
  const withoutDue = activeBusinesses
    .filter((b) => !getPaymentDueDate(b))
    .sort((a, c) => a.name.localeCompare(c.name, "pt-BR"));

  if (summary) {
    summary.innerHTML = `
      <div class="support-renewal-pill is-overdue"><strong>${overdue.length}</strong><span>Atrasadas</span></div>
      <div class="support-renewal-pill is-soon"><strong>${dueSoon.length}</strong><span>Vencendo em até ${RENEWAL_REMINDER_WINDOW_DAYS} dias</span></div>
      <div class="support-renewal-pill is-current"><strong>${later.length}</strong><span>Em dia</span></div>
      <div class="support-renewal-pill is-undated"><strong>${withoutDue.length}</strong><span>Sem vencimento definido</span></div>
    `;
  }

  const renderCard = ({ b, due }: { b: Business; due: Date }) => {
    const status = getRenewalVisualState(b, due);
    const canCharge = Boolean((b.whatsapp || "").trim());
    return `
          <div class="support-renewal-card">
            <div class="support-renewal-top">
              <div>
                <div class="font-bold">${escapeHtml(b.name)}</div>
                <div class="text-sm text-sub">/?slug=${escapeHtml(b.slug)} · ${escapeHtml(b.whatsapp || "sem WhatsApp")}</div>
              </div>
              <div class="support-renewal-side-tags">
                <span class="${status.badgeClass}">${status.label}</span>
                <span class="chip">${escapeHtml(planDisplayLabel(b))}</span>
              </div>
            </div>
            <div class="support-renewal-meta">
              <div><span class="text-sub">Vencimento</span><strong>${due.toLocaleDateString("pt-BR")}</strong></div>
              <div><span class="text-sub">Valor</span><strong>${formatCurrency(getMonthlyPriceForBusiness(b))}</strong></div>
              <div><span class="text-sub">Cobrança</span><strong>${status.label}</strong></div>
            </div>
            <div class="text-sm text-sub mb-2">${escapeHtml(formatSupportPromotionalSummary(b))}</div>
            <div class="card-actions">
              <button class="btn btn-wa btn-sm" type="button" onclick="openRenewalReminderWhatsApp('${b.id}')" ${canCharge ? "" : "disabled"}>Realizar cobrança</button>
              <button class="btn btn-link btn-sm" type="button" onclick="openSupportBusinessModal('${b.id}')">Gerenciar</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="openSupportPublicLink('${b.slug}')">Abrir link</button>
            </div>
          </div>`;
  };

  const renderSimpleCard = (b: Business, note: string) => {
    const status = getRenewalVisualState(b, null);
    const canCharge = Boolean((b.whatsapp || "").trim());
    return `
    <div class="support-renewal-card">
      <div class="support-renewal-top">
        <div>
          <div class="font-bold">${escapeHtml(b.name)}</div>
          <div class="text-sm text-sub">/?slug=${escapeHtml(b.slug)} · ${escapeHtml(b.whatsapp || "sem WhatsApp")}</div>
        </div>
        <div class="support-renewal-side-tags">
          <span class="${status.badgeClass}">${status.label}</span>
          <span class="chip">${escapeHtml(planDisplayLabel(b))}</span>
        </div>
      </div>
      <div class="support-renewal-meta support-renewal-meta-single">
        <div><span class="text-sub">Cobrança</span><strong>${status.label}</strong></div>
      </div>
      <div class="text-sm text-sub mb-2">${escapeHtml(note)}</div>
      <div class="card-actions">
        <button class="btn btn-wa btn-sm" type="button" onclick="openRenewalReminderWhatsApp('${b.id}')" ${canCharge ? "" : "disabled"}>Realizar cobrança</button>
        <button class="btn btn-link btn-sm" type="button" onclick="openSupportBusinessModal('${b.id}')">Gerenciar</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="openSupportPublicLink('${b.slug}')">Abrir link</button>
      </div>
    </div>`;
  };

  const section = (title: string, subtitle: string, content: string) => `
    <div class="support-renewal-section">
      <div class="support-renewal-section-head">
        <div class="font-semibold">${title}</div>
        <div class="text-sm text-sub">${subtitle}</div>
      </div>
      ${content}
    </div>`;

  const blocks: string[] = [];
  if (overdue.length) {
    blocks.push(section("Atrasadas", "Contas que já passaram do vencimento e precisam de ação imediata.", overdue.map(renderCard).join("")));
  }
  if (dueSoon.length) {
    blocks.push(section("Vencendo em breve", `Contas que vencem hoje ou nos próximos ${RENEWAL_REMINDER_WINDOW_DAYS} dias.`, dueSoon.map(renderCard).join("")));
  }
  if (later.length) {
    blocks.push(section("Em dia", "Contas ativas com vencimento futuro fora da janela imediata.", later.map(renderCard).join("")));
  }
  if (withoutDue.length) {
    blocks.push(section("Sem vencimento definido", "Contas ativas que precisam de revisão manual de data de cobrança.", withoutDue.map((b) => renderSimpleCard(b, "Sem vencimento cadastrado no sistema.")).join("")));
  }

  container.innerHTML = blocks.length
    ? blocks.join("")
    : `<div class="empty-state">Nenhuma loja ativa encontrada para acompanhamento de cobrança no momento.</div>`;
}

function getSalesStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    new: "Novo",
    qualifying: "Qualificando",
    qualified: "Qualificado",
    proposal: "Em proposta",
    won: "Cliente",
    lost: "Perdido",
    nurture: "Nutrição",
  };
  return labels[stage] || stage;
}

function getSalesStageClass(stage: string): string {
  if (stage === "won") return "badge-success";
  if (stage === "proposal" || stage === "qualified") return "badge-brand";
  if (stage === "lost") return "badge-danger";
  return "badge-warning";
}

function getSalesTemperatureLabel(temperature: string): string {
  const labels: Record<string, string> = {
    cold: "Frio",
    warm: "Morno",
    hot: "Quente",
  };
  return labels[temperature] || temperature;
}

function getSalesTemperatureClass(temperature: string): string {
  if (temperature === "hot") return "support-billing-badge is-overdue";
  if (temperature === "warm") return "support-billing-badge is-soon";
  return "support-billing-badge is-undated";
}

function formatSalesChannel(channel: string): string {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    site: "Site",
    instagram: "Instagram",
    email: "E-mail",
  };
  return labels[channel] || channel;
}

function getFollowUpStatusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    none: "Sem follow-up",
    scheduled: "Agendado",
    due: "Vencido",
    done: "Concluído",
  };
  return labels[String(status || "none")] || "Sem follow-up";
}

function getFollowUpStatusClass(status?: string | null): string {
  if (status === "due") return "support-billing-badge is-overdue";
  if (status === "scheduled") return "support-billing-badge is-soon";
  if (status === "done") return "support-billing-badge is-current";
  return "support-billing-badge is-undated";
}

function isFollowUpDue(lead: { next_follow_up_at?: string | null }): boolean {
  if (!lead.next_follow_up_at) return false;
  return new Date(lead.next_follow_up_at).getTime() <= Date.now();
}

function getLeadConversations(leadId: string) {
  return state.supportSalesConversations.filter((item) => item.lead_id === leadId);
}

function getLatestAgentRun(leadId: string) {
  return state.supportSalesRuns.find((item) => item.lead_id === leadId) || null;
}

function getLeadWhatsappHref(leadId: string): string {
  const lead = state.supportSalesLeads.find((item) => item.id === leadId);
  if (!lead) return "";
  const latestRun = getLatestAgentRun(leadId);
  const message = latestRun?.response_text || "Olá! Quero retomar nossa conversa sobre o Agendixx.";
  return buildWhatsAppWebUrlWithText(lead.phone, message) || "";
}

export function renderSupportSalesLeads(): void {
  if (!state.isPlatformAdmin) return;
  const searchInput = document.getElementById("supportSalesSearch");
  const search = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : "";
  const filter = state.supportSalesFilter;

  const normalizedLeads = state.supportSalesLeads.map((lead) =>
    isFollowUpDue(lead) && lead.follow_up_status === "scheduled" ? { ...lead, follow_up_status: "due" as const } : lead
  );

  const filtered = normalizedLeads.filter((lead) => {
    const haystack = [
      lead.name,
      lead.phone,
      lead.email,
      lead.business_type,
      lead.source,
      lead.owner_name,
      lead.notes,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = haystack.includes(search);
    const matchesFilter =
      filter === "todos" ||
      (filter === "quentes" && lead.temperature === "hot") ||
      (filter === "novos" && lead.stage === "new") ||
      (filter === "proposta" && lead.stage === "proposal") ||
      (filter === "clientes" && lead.stage === "won") ||
      (filter === "followups" && (lead.follow_up_status === "scheduled" || lead.follow_up_status === "due"));

    return matchesSearch && matchesFilter;
  });

  const totalLeads = normalizedLeads.length;
  const hotLeads = normalizedLeads.filter((lead) => lead.temperature === "hot").length;
  const proposalLeads = normalizedLeads.filter((lead) => lead.stage === "proposal").length;
  const wonLeads = normalizedLeads.filter((lead) => lead.stage === "won").length;
  const dueFollowUps = normalizedLeads.filter((lead) => lead.follow_up_status === "due").length;

  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("supportSalesTotalLeads", String(totalLeads));
  setText("supportSalesHotLeads", String(hotLeads));
  setText("supportSalesProposalLeads", String(proposalLeads));
  setText("supportSalesWonLeads", String(wonLeads));
  setText("supportSalesDueFollowUps", String(dueFollowUps));
  setText("supportSalesResultsLabel", `${filtered.length} lead(s) encontrado(s)`);

  const list = document.getElementById("supportSalesLeadList");
  if (!list) return;

  list.innerHTML = filtered.length
    ? filtered
        .map((lead) => {
          const conversations = getLeadConversations(lead.id);
          const latestRun = getLatestAgentRun(lead.id);
          const latestMessages = conversations.slice(-4);
          const whatsappHref = getLeadWhatsappHref(lead.id);
          const firstName = String(lead.name || "Lead").trim().split(" ")[0] || "Lead";
          return `
            <details class="support-sales-card">
              <summary class="support-sales-summary">
                <div class="support-sales-summary-main">
                  <div>
                    <div class="support-sales-title-row">
                      <strong class="support-sales-name">${escapeHtml(lead.name || "Lead sem nome")}</strong>
                      <span class="badge ${getSalesStageClass(lead.stage)}">${getSalesStageLabel(lead.stage)}</span>
                      <span class="${getSalesTemperatureClass(lead.temperature)}">${getSalesTemperatureLabel(lead.temperature)}</span>
                      <span class="${getFollowUpStatusClass(lead.follow_up_status)}">${getFollowUpStatusLabel(lead.follow_up_status)}</span>
                    </div>
                    <div class="support-sales-meta">
                      ${escapeHtml(lead.business_type || "Nicho não informado")} · ${escapeHtml(lead.source || "Origem não informada")} · ${escapeHtml(lead.phone)}
                    </div>
                  </div>
                  <div class="support-sales-agent">
                    <span>Último agente</span>
                    <strong>${escapeHtml(latestRun?.agent_key || lead.last_agent_key || "—")}</strong>
                  </div>
                </div>
                <div class="support-sales-summary-side">
                  <span>${latestMessages.length} msg(s)</span>
                  <span class="support-expand-icon" aria-hidden="true">⌄</span>
                </div>
              </summary>

              <div class="support-sales-body">
                <div class="support-sales-grid">
                  <div class="support-sales-pane">
                    <div class="support-sales-pane-title">Contexto do lead</div>
                    <div class="support-sales-facts">
                      <div><span>Nicho</span><strong>${escapeHtml(lead.business_type || "Não informado")}</strong></div>
                      <div><span>Origem</span><strong>${escapeHtml(lead.source || "Não informada")}</strong></div>
                      <div><span>Contato</span><strong>${escapeHtml(lead.phone)}</strong></div>
                      <div><span>Responsável</span><strong>${escapeHtml(lead.owner_name || firstName)}</strong></div>
                      <div><span>Próximo contato</span><strong>${lead.next_follow_up_at ? escapeHtml(formatTimelineDate(lead.next_follow_up_at)) : "Não agendado"}</strong></div>
                      <div><span>Tentativas</span><strong>${lead.follow_up_attempts || 0}</strong></div>
                    </div>
                    ${
                      lead.notes || lead.follow_up_note
                        ? `<div class="support-sales-note">${escapeHtml([lead.notes, lead.follow_up_note ? `Follow-up: ${lead.follow_up_note}` : ""].filter(Boolean).join(" · "))}</div>`
                        : `<div class="support-sales-note empty">Sem notas adicionais no lead.</div>`
                    }
                  </div>

                  <div class="support-sales-pane">
                    <div class="support-sales-pane-title">Última recomendação do agente</div>
                    <div class="support-sales-run-card">
                      <div class="support-sales-run-top">
                        <strong>${escapeHtml(latestRun?.agent_key || "sem execução")}</strong>
                        <span>${escapeHtml(latestRun?.next_step || "seguir conversa")}</span>
                      </div>
                      <div class="support-sales-run-text">${escapeHtml(latestRun?.response_text || "Ainda não há resposta registrada.")}</div>
                      <div class="support-sales-run-foot">
                        <span>${escapeHtml(latestRun?.reasoning_summary || "Aguardando primeira atuação.")}</span>
                        <span>${latestRun?.handoff_human ? "Pedir apoio humano" : "Pode seguir no fluxo"}</span>
                      </div>
                    </div>
                    <div class="card-actions support-sales-actions">
                      ${
                        whatsappHref
                          ? `<a class="btn btn-wa btn-sm" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>`
                          : `<button class="btn btn-wa btn-sm" type="button" disabled>Sem WhatsApp</button>`
                      }
                      <button class="btn btn-link btn-sm" type="button" onclick="openSupportSalesLeadModal('${lead.id}')">Rodar agente agora</button>
                      <button class="btn btn-ghost btn-sm" type="button" onclick="openSupportSalesFollowUpModal('${lead.id}')">Agendar follow-up</button>
                      <button class="btn btn-link btn-sm" type="button" onclick="markSupportSalesFollowUpDone('${lead.id}')">Concluir</button>
                    </div>
                  </div>
                </div>

                <div class="support-sales-pane">
                  <div class="support-sales-pane-title">Histórico recente</div>
                  <div class="support-sales-timeline">
                    ${
                      latestMessages.length
                        ? latestMessages
                            .map(
                              (item) => `
                              <div class="support-sales-message ${item.direction === "inbound" ? "is-inbound" : "is-outbound"}">
                                <div class="support-sales-message-head">
                                  <strong>${item.direction === "inbound" ? "Lead" : "Agente"}</strong>
                                  <span>${escapeHtml(formatSalesChannel(item.channel))} · ${escapeHtml(formatTimelineDate(item.created_at))}</span>
                                </div>
                                <div class="support-sales-message-text">${escapeHtml(item.message_text)}</div>
                              </div>`
                            )
                            .join("")
                        : `<div class="empty-state">Ainda não há mensagens registradas para este lead.</div>`
                    }
                  </div>
                </div>
              </div>
            </details>`
        })
        .join("")
    : emptyStateHtml("Nenhum lead encontrado para esse filtro.");
}
