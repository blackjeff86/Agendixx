import {
  buildRenewalReminderMessage,
  defaultPlanNameForTierKey,
  formatSupportDueLine,
  formatSupportPromotionalSummary,
  getMonthlyPriceForBusiness,
  isInRenewalWindow,
  planDisplayLabel,
  PLAN_PRO_MONTHLY_BRL,
  PLAN_STARTER_MONTHLY_BRL,
  type SupportPlanTierKey,
} from "../config/billing";
import { AGENDIXX_PIX_KEY, DEFAULT_BILLING_CYCLE_DAYS, getAppBaseUrl, SUPPORT_PAGE_SIZE } from "../config/env";
import * as authService from "../services/authService";
import * as businessService from "../services/businessService";
import * as supportService from "../services/supportService";
import { sendWhatsAppTemplate, sendWhatsAppText } from "../services/whatsappOutbound";
import { state } from "../state/store";
import { formatBillingLabel, formatCurrency, formatMonthYear, normalizePlanName } from "../utils/formatters";
import { onlyDigits } from "../utils/phone";
import { getErrorMessage } from "../utils/errors";
import { buildRenewalReminderTemplate } from "../utils/whatsappTemplates";
import { getPublicAppUrl, openModal, showLoading, showToast } from "../ui/dom";
import { renderSupportBusinesses, renderSupportRenewalList, renderSupportTimeline } from "../ui/render/supportPanel";
import { loadSupportBusinesses } from "./bootstrap";
import { closeModal, openConfirmActionModal } from "./appointmentActions";
import { createSupportEvent } from "./supportEvents";
import {
  openProfessionalModal,
  openServiceModal,
  populateProfessionalServicesForBusiness,
  resetProfessionalModal,
  resetServiceModal,
} from "./merchantActions";

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function syncSupportPlanNameFromTier(): void {
  const tier = (document.getElementById("supportBusinessPlanTier") as HTMLSelectElement).value as SupportPlanTierKey;
  const el = document.getElementById("supportBusinessPlan") as HTMLInputElement | null;
  if (el) el.value = defaultPlanNameForTierKey(tier);
}

export function toggleSupportPaymentCheckbox(): void {
  const billing = (document.getElementById("supportBusinessBilling") as HTMLSelectElement | null)?.value;
  const cb = document.getElementById("supportPaymentReceived") as HTMLInputElement | null;
  if (!cb) return;
  if (billing === "blocked") {
    cb.checked = false;
    cb.disabled = true;
  } else {
    cb.disabled = false;
  }
}

export function switchSupportTab(tab: "lojas" | "renovacoes"): void {
  document.getElementById("supportPanelLojas")?.classList.toggle("hidden", tab !== "lojas");
  document.getElementById("supportPanelRenovacoes")?.classList.toggle("hidden", tab !== "renovacoes");
  document.getElementById("supportTabLojasBtn")?.classList.toggle("is-active", tab === "lojas");
  document.getElementById("supportTabRenovacoesBtn")?.classList.toggle("is-active", tab === "renovacoes");
  document.getElementById("supportTabLojasBtn")?.setAttribute("aria-selected", tab === "lojas" ? "true" : "false");
  document.getElementById("supportTabRenovacoesBtn")?.setAttribute("aria-selected", tab === "renovacoes" ? "true" : "false");
  if (tab === "renovacoes") renderSupportRenewalList();
}

export async function saveSupportPlatformSettings(): Promise<void> {
  const supportWhatsapp = (document.getElementById("supportGlobalWhatsapp") as HTMLInputElement | null)?.value.trim() || "";
  showLoading(true);
  try {
    state.platformSettings = await supportService.savePlatformSettings({
      support_whatsapp: supportWhatsapp || null,
    });
    const pill = document.getElementById("supportPricingPill");
    if (pill) {
      pill.textContent = `Cobrança via PIX · Starter ${formatCurrency(PLAN_STARTER_MONTHLY_BRL)} · Pro ${formatCurrency(PLAN_PRO_MONTHLY_BRL)}`;
    }
    showToast("Configurações de suporte salvas.");
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function openRenewalReminderWhatsApp(businessId: string): Promise<void> {
  const business = state.supportBusinesses.find((item) => item.id === businessId);
  if (!business) return;
  const msg = buildRenewalReminderMessage(business);
  const r = await sendWhatsAppText(business.whatsapp || "", msg, { preferApi: false });
  if (!r.ok) {
    showToast("Cadastre um WhatsApp válido da loja para abrir a cobrança manual.");
    return;
  }
  await createSupportEvent({
    businessId,
    eventType: "renewal_whatsapp",
    title: "Cobrança manual via WhatsApp (PIX)",
    details: msg.slice(0, 900),
  });
  await loadSupportBusinesses();
}

export async function supportBatchRenewalWhatsapp(): Promise<void> {
  const edgeUrl = String(import.meta.env.VITE_WHATSAPP_EDGE_URL || "").trim();
  if (!edgeUrl) {
    showToast("Para vários envios automáticos, configure VITE_WHATSAPP_EDGE_URL (backend com WhatsApp Cloud API). Por loja, use o botão no card.");
    return;
  }
  const targets = state.supportBusinesses.filter(
    (b) => b.active && isInRenewalWindow(b) && onlyDigits(b.whatsapp || "").length >= 10
  );
  if (!targets.length) {
    showToast("Nenhuma loja na janela de renovação com WhatsApp válido.");
    return;
  }
  showLoading(true);
  let ok = 0;
  try {
    for (const b of targets) {
      const msg = buildRenewalReminderMessage(b);
      const template = buildRenewalReminderTemplate(b, AGENDIXX_PIX_KEY);
      const r = template ? await sendWhatsAppTemplate(b.whatsapp || "", template) : await sendWhatsAppText(b.whatsapp || "", msg);
      if (r.ok) ok += 1;
      await new Promise((res) => setTimeout(res, 450));
    }
    showToast(`Envio em lote: ${ok}/${targets.length} aceito(s) pela API.`);
    await loadSupportBusinesses();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export function setSupportFilter(filter: string, event?: Event): void {
  state.supportFilter = filter;
  state.supportPage = 1;
  document.querySelectorAll(".support-filter-btn").forEach((button) => {
    const el = button as HTMLElement;
    const active = el.dataset.filter === filter;
    el.classList.toggle("is-active", active);
    el.classList.toggle("btn-brand", active);
    el.classList.toggle("btn-link", !active);
  });
  if (event?.target instanceof HTMLElement) {
    event.target.blur();
  }
  renderSupportBusinesses();
}

export function prevSupportPage(): void {
  if (state.supportPage <= 1) return;
  state.supportPage -= 1;
  renderSupportBusinesses();
}

export function nextSupportPage(): void {
  const filtered = state.supportBusinesses.filter((business) => {
    const search =
      document.getElementById("supportSearch") instanceof HTMLInputElement
        ? (document.getElementById("supportSearch") as HTMLInputElement).value.trim().toLowerCase()
        : "";
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
  if (state.supportPage >= totalPages) return;
  state.supportPage += 1;
  renderSupportBusinesses();
}

export function openSupportPublicLink(slug: string): void {
  window.open(getPublicAppUrl(slug), "_blank");
}

async function renderSupportBusinessCustomers(businessId: string): Promise<void> {
  const container = document.getElementById("supportBusinessCustomers");
  if (!container) return;
  try {
    const data = await supportService.fetchCustomersForBusinessLimited(businessId, 6);
    container.innerHTML = data.length
      ? data
          .map(
            (customer) => `
            <div class="support-customer-item">
              <div class="font-semibold">${customer.name}</div>
              <div class="text-sm text-sub">${customer.email || "Sem e-mail"} · ${customer.phone}</div>
            </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhum cliente capturado ainda.</div>`;
  } catch {
    container.innerHTML = `<div class="empty-state">Não foi possível carregar os clientes dessa loja.</div>`;
  }
}

export async function openSupportBusinessModal(businessId: string): Promise<void> {
  const business = state.supportBusinesses.find((item) => item.id === businessId);
  if (!business) return;
  state.supportSelectedBusinessId = businessId;
  const setText = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setText("supportBusinessTitle", `Gestão da loja · ${business.name}`);
  setText("supportBusinessHeaderName", business.name);
  setText("supportBusinessHeaderMeta", `${business.category || "Salão"} · ${business.slug ? `/?slug=${business.slug}` : "Sem link público"}`);
  const statusEl = document.getElementById("supportBusinessHeaderStatus");
  if (statusEl) {
    statusEl.textContent = business.active ? "Conta ativa" : "Conta bloqueada";
    statusEl.className = `badge ${business.active ? "badge-success" : "badge-danger"}`;
  }
  (document.getElementById("supportBusinessName") as HTMLInputElement).value = business.name || "";
  (document.getElementById("supportBusinessOwnerEmail") as HTMLInputElement).value = business.owner_email || "";
  (document.getElementById("supportBusinessWhatsapp") as HTMLInputElement).value = business.whatsapp || "";
  const tierSel = document.getElementById("supportBusinessPlanTier") as HTMLSelectElement | null;
  if (tierSel) tierSel.value = !business.plan_tier ? "legado" : business.plan_tier;
  (document.getElementById("supportBusinessPromotionEnds") as HTMLInputElement).value = isoToDateInput(
    business.promotional_ends_at
  );
  (document.getElementById("supportBusinessNextBilling") as HTMLInputElement).value = isoToDateInput(business.next_billing_at);
  (document.getElementById("supportBusinessPlan") as HTMLInputElement).value = normalizePlanName(business.plan_name);
  (document.getElementById("supportBusinessBilling") as HTMLSelectElement).value = business.billing_status || "active";
  (document.getElementById("supportBusinessBlockedReason") as HTMLTextAreaElement).value = business.blocked_reason || "";
  (document.getElementById("supportBusinessNotes") as HTMLTextAreaElement).value = business.support_notes || "";
  setText("supportBusinessMiniMrr", formatCurrency(getMonthlyPriceForBusiness(business)));
  setText("supportBusinessMiniCreated", formatMonthYear(business.created_at));
  setText("supportBusinessMiniEmail", business.owner_email || "Sem e-mail");
  setText("supportBusinessMiniBilling", formatBillingLabel(business.billing_status));
  setText("supportBusinessReadPlan", `${planDisplayLabel(business)} · ${formatCurrency(getMonthlyPriceForBusiness(business))}/mês`);
  setText("supportBusinessReadPromotion", formatSupportPromotionalSummary(business));
  setText("supportBusinessReadDue", formatSupportDueLine(business));
  const pr = document.getElementById("supportPaymentReceived") as HTMLInputElement | null;
  if (pr) pr.checked = false;
  toggleSupportPaymentCheckbox();
  renderSupportTimeline(businessId);
  await renderSupportBusinessCustomers(businessId);
  openModal("modalSupportBusiness");
}

export async function saveSupportBusiness(): Promise<void> {
  if (!state.supportSelectedBusinessId) return;
  const billingStatus = (document.getElementById("supportBusinessBilling") as HTMLSelectElement).value;
  const planTierRaw = (document.getElementById("supportBusinessPlanTier") as HTMLSelectElement).value as SupportPlanTierKey;
  const promotionEndsVal = (document.getElementById("supportBusinessPromotionEnds") as HTMLInputElement).value;
  const nextBillingVal = (document.getElementById("supportBusinessNextBilling") as HTMLInputElement).value;
  const markPaid = (document.getElementById("supportPaymentReceived") as HTMLInputElement)?.checked ?? false;
  const toIsoOrNull = (d: string) => (d ? new Date(`${d}T12:00:00.000Z`).toISOString() : null);

  let finalBilling = billingStatus;
  let next_billing_at = toIsoOrNull(nextBillingVal);
  if (markPaid && billingStatus !== "blocked") {
    finalBilling = "active";
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + DEFAULT_BILLING_CYCLE_DAYS);
    d.setUTCHours(12, 0, 0, 0);
    next_billing_at = d.toISOString();
  }

  const plan_name =
    (document.getElementById("supportBusinessPlan") as HTMLInputElement).value.trim() || defaultPlanNameForTierKey(planTierRaw);

  const payload = {
    name: (document.getElementById("supportBusinessName") as HTMLInputElement).value.trim(),
    owner_email: (document.getElementById("supportBusinessOwnerEmail") as HTMLInputElement).value.trim(),
    whatsapp: (document.getElementById("supportBusinessWhatsapp") as HTMLInputElement).value.trim(),
    plan_tier: planTierRaw === "legado" ? null : planTierRaw,
    promotional_ends_at: toIsoOrNull(promotionEndsVal),
    next_billing_at,
    plan_name,
    billing_status: finalBilling,
    blocked_reason: (document.getElementById("supportBusinessBlockedReason") as HTMLTextAreaElement).value.trim(),
    support_notes: (document.getElementById("supportBusinessNotes") as HTMLTextAreaElement).value.trim(),
    active: finalBilling !== "blocked",
  };

  showLoading(true);
  try {
    await businessService.updateBusiness(state.supportSelectedBusinessId, payload);
    await createSupportEvent({
      businessId: state.supportSelectedBusinessId,
      eventType: "business_updated",
      title: "Dados da loja atualizados",
      details: `Cobrança: ${formatBillingLabel(finalBilling)}. Plano: ${payload.plan_name}. Tier: ${planTierRaw}.${markPaid ? " Pagamento PIX registrado." : ""}`,
    });
    closeModal("modalSupportBusiness");
    showToast("Dados de suporte salvos.");
    await loadSupportBusinesses();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function sendSupportPasswordReset(businessId: string | null = null): Promise<void> {
  const targetBusiness = state.supportBusinesses.find((item) => item.id === (businessId || state.supportSelectedBusinessId));
  if (!targetBusiness?.owner_email) {
    showToast("Essa loja não possui e-mail de contato salvo.");
    return;
  }
  showLoading(true);
  try {
    const { error } = await authService.resetPasswordForEmail(targetBusiness.owner_email, `${getAppBaseUrl()}/?app=login`);
    if (error) throw error;
    await createSupportEvent({
      businessId: targetBusiness.id,
      eventType: "password_reset",
      title: "Redefinição de senha enviada",
      details: `Reset enviado para ${targetBusiness.owner_email}.`,
    });
    showToast("E-mail de redefinição enviado.");
    await loadSupportBusinesses();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export function toggleBusinessBlocked(businessId: string): void {
  const business = state.supportBusinesses.find((item) => item.id === businessId);
  if (!business) return;
  openConfirmActionModal({
    title: business.active ? "Bloquear conta" : "Desbloquear conta",
    message: business.active
      ? `Deseja bloquear a conta de "${business.name}"?`
      : `Deseja desbloquear a conta de "${business.name}"?`,
    confirmLabel: business.active ? "Bloquear conta" : "Desbloquear conta",
    confirmClass: business.active ? "btn btn-danger" : "btn btn-success",
    onConfirm: async () => {
      const payload = business.active
        ? { active: false, billing_status: "blocked", blocked_reason: business.blocked_reason || "Conta bloqueada pelo suporte." }
        : { active: true, billing_status: "active", blocked_reason: null as string | null };
      await businessService.updateBusiness(businessId, payload);
      await createSupportEvent({
        businessId,
        eventType: business.active ? "account_blocked" : "account_unblocked",
        title: business.active ? "Conta bloqueada" : "Conta desbloqueada",
        details: business.active ? String(payload.blocked_reason) : "Conta reativada e cobrança voltando para ativa.",
      });
      showToast(business.active ? "Conta bloqueada." : "Conta desbloqueada.");
      await loadSupportBusinesses();
    },
  });
}

export function supportCreateService(): void {
  if (!state.supportSelectedBusinessId) return;
  state.supportContextBusinessId = state.supportSelectedBusinessId;
  resetServiceModal();
  openServiceModal();
}

export async function supportCreateProfessional(): Promise<void> {
  if (!state.supportSelectedBusinessId) return;
  state.supportContextBusinessId = state.supportSelectedBusinessId;
  await populateProfessionalServicesForBusiness(state.supportSelectedBusinessId);
  resetProfessionalModal();
  openProfessionalModal();
}
