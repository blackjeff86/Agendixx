import type { Business } from "../types";
import { formatCurrency } from "../utils/formatters";
import { AGENDIXX_PIX_KEY, RENEWAL_REMINDER_WINDOW_DAYS } from "./env";
import { resolvePlanTier, trialDaysRemaining } from "./plans";

export const PLAN_STARTER_MONTHLY_BRL = 39.9;
export const PLAN_PRO_MONTHLY_BRL = 59.9;
/** Contas sem plan_tier (legado). */
export const PLAN_LEGACY_MONTHLY_BRL = 49.9;

export type SupportPlanTierKey = "legado" | "starter" | "pro";

export function defaultPlanNameForTierKey(tier: SupportPlanTierKey): string {
  if (tier === "starter") return "Plano Starter";
  if (tier === "pro") return "Plano Pro";
  return "Plano Pro (legado)";
}

export function getMonthlyPriceForBusiness(business: Business | null | undefined): number {
  if (!business) return PLAN_LEGACY_MONTHLY_BRL;
  if (!business.plan_tier) return PLAN_LEGACY_MONTHLY_BRL;
  return resolvePlanTier(business) === "pro" ? PLAN_PRO_MONTHLY_BRL : PLAN_STARTER_MONTHLY_BRL;
}

export function planDisplayLabel(business: Business | null | undefined): string {
  if (!business?.plan_tier) return "Pro (legado)";
  return resolvePlanTier(business) === "pro" ? "Plano Pro" : "Plano Starter";
}

/** Data relevante para cobrança: fim do trial ou próxima mensalidade. */
export function getPaymentDueDate(business: Business): Date | null {
  if (["canceled", "blocked"].includes(business.billing_status || "")) return null;
  if (business.billing_status === "trial" && business.trial_ends_at) {
    return new Date(business.trial_ends_at);
  }
  if (business.next_billing_at && ["active", "past_due", "pendente"].includes(business.billing_status || "")) {
    return new Date(business.next_billing_at);
  }
  /** Pendente sem próxima data: ainda usa fim do trial como referência de cobrança. */
  if (business.billing_status === "pendente" && business.trial_ends_at) {
    return new Date(business.trial_ends_at);
  }
  return null;
}

export function isInRenewalWindow(business: Business, windowDays: number = RENEWAL_REMINDER_WINDOW_DAYS): boolean {
  const due = getPaymentDueDate(business);
  if (!due || Number.isNaN(due.getTime())) return false;
  const horizon = Date.now() + windowDays * 86400000;
  return due.getTime() <= horizon;
}

export function formatSupportDueLine(business: Business): string {
  const due = getPaymentDueDate(business);
  if (!due || Number.isNaN(due.getTime())) return "Sem vencimento cadastrado.";
  const d = due.toLocaleDateString("pt-BR");
  const diff = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diff > 0) return `${d} — em ${diff} dia(s)`;
  if (diff === 0) return `${d} — hoje`;
  return `${d} — atrasado ${Math.abs(diff)} dia(s)`;
}

export function formatSupportTrialSummary(business: Business): string {
  if (business.billing_status === "pendente") {
    return "Pagamento da mensalidade pendente de confirmação — entra nos lembretes automáticos de renovação (PIX).";
  }
  if (business.billing_status !== "trial") return "Fora do período de testes.";
  if (!business.trial_ends_at) return "Trial sem data de término.";
  const end = new Date(business.trial_ends_at).toLocaleDateString("pt-BR");
  const left = trialDaysRemaining(business);
  if (left !== null) return `Período até ${end} (${left} dia(s) restante(s)).`;
  if (new Date(business.trial_ends_at).getTime() <= Date.now()) return `Trial encerrado em ${end}.`;
  return `Período até ${end}.`;
}

export function sumEstimatedMonthlyRevenue(businesses: Business[]): number {
  return businesses.filter((b) => b.active).reduce((sum, b) => sum + getMonthlyPriceForBusiness(b), 0);
}

export function buildRenewalReminderMessage(business: Business): string {
  const name = business.name || "seu negócio";
  const plan = planDisplayLabel(business);
  const price = formatCurrency(getMonthlyPriceForBusiness(business));
  const due = getPaymentDueDate(business);
  const dueLine = due && !Number.isNaN(due.getTime()) ? `Vencimento: ${due.toLocaleDateString("pt-BR")}` : "";
  const pixLine = AGENDIXX_PIX_KEY
    ? `Chave PIX: ${AGENDIXX_PIX_KEY}`
    : "Chave PIX: ainda não configurada no sistema.";
  const pendenteLines =
    business.billing_status === "pendente"
      ? [
          "",
          "📌 *Situação:* identificamos o pagamento como *pendente* no sistema. Se você já realizou o PIX, basta enviar o comprovante por aqui para conferência.",
        ]
      : [];

  return [
    `Olá! Aqui é da *Agendixx* 👋`,
    "",
    `Passando para lembrar da renovação mensal da loja *${name}*.`,
    "",
    `*Resumo da cobrança*`,
    `Plano: ${plan}`,
    `Valor: ${price}`,
    dueLine,
    ...pendenteLines,
    "",
    `*Pagamento via PIX*`,
    pixLine,
    "",
    AGENDIXX_PIX_KEY
      ? `Assim que fizer o pagamento, envie o comprovante por aqui para regularizarmos seu acesso sem atraso.`
      : `Assim que a chave PIX for configurada, esta mensagem já sairá pronta para envio manual.`
    ,
    "",
    `Obrigado!`,
  ]
    .filter(Boolean)
    .join("\n");
}
