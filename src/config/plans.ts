import type { Business } from "../types";

export type PlanTier = "starter" | "pro";

export const PROMOTIONAL_MONTH_DAYS = 30;
export const STARTER_ACTIVE_PROFESSIONAL_LIMIT = 2;
export const STARTER_CUSTOMER_LIMIT = 50;

/** Contas antigas sem plan_tier: tratamos como Pro para não bloquear quem já usava o sistema. */
export function resolvePlanTier(business: Business | null | undefined): PlanTier {
  if (!business?.plan_tier) return "pro";
  return business.plan_tier === "pro" ? "pro" : "starter";
}

export function isProPlan(business: Business | null | undefined): boolean {
  return resolvePlanTier(business) === "pro";
}

export function isStarterPlan(business: Business | null | undefined): boolean {
  return resolvePlanTier(business) === "starter";
}

/** Dias completos restantes no primeiro mes promocional (1 = ultimo dia). */
export function promotionalDaysRemaining(business: Business | null | undefined): number | null {
  if (!business?.promotional_ends_at) return null;
  const end = new Date(business.promotional_ends_at).getTime();
  const now = Date.now();
  if (Number.isNaN(end) || end <= now) return null;
  return Math.ceil((end - now) / 86400000);
}

export function isPromotionalPeriodActive(business: Business | null | undefined): boolean {
  return promotionalDaysRemaining(business) !== null;
}

export function isPromotionalPeriodExpired(business: Business | null | undefined): boolean {
  if (!business?.promotional_ends_at) return false;
  return new Date(business.promotional_ends_at).getTime() <= Date.now();
}

export function maxActiveProfessionals(business: Business | null | undefined): number {
  return isProPlan(business) ? 99 : STARTER_ACTIVE_PROFESSIONAL_LIMIT;
}

export function canAccessCustomersModule(business: Business | null | undefined): boolean {
  return Boolean(business);
}

export function canAccessReportsModule(business: Business | null | undefined): boolean {
  return Boolean(business);
}

export function canUseAutomaticCustomerWhatsApp(business: Business | null | undefined): boolean {
  return isProPlan(business);
}

export function canUseAutomaticDayBeforeReminders(business: Business | null | undefined): boolean {
  return isProPlan(business);
}

export function getCustomerManagementLimit(business: Business | null | undefined): number {
  return isProPlan(business) ? 999999 : STARTER_CUSTOMER_LIMIT;
}

export function countActiveProfessionals(professionals: { active: boolean }[]): number {
  return professionals.filter((p) => p.active).length;
}
