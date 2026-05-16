import * as businessService from "../services/businessService";
import * as billingAccessService from "../services/billingAccessService";
import { state } from "../state/store";
import type { PendingBusinessDraft } from "../types";

export async function createBusinessAndSeed(draft: PendingBusinessDraft): Promise<void> {
  const access = state.billingAccess || (await billingAccessService.fetchBillingAccessByEmail(state.user?.email));
  if (!billingAccessService.billingAccessAllowsSetup(access)) {
    throw new Error("Seu acesso é liberado após a compra pela Kiwify. Use o mesmo e-mail da compra para entrar.");
  }
  const resolvedTier = draft.plan_tier || access?.plan_tier || "pro";
  const resolvedDraft: PendingBusinessDraft = {
    ...draft,
    plan_tier: resolvedTier,
    plan_name: draft.plan_name || (resolvedTier === "starter" ? "Plano Starter" : "Plano Pro"),
  };
  const payload = businessService.buildNewBusinessPayload(state.user!.id, state.user?.email, resolvedDraft);
  const business = await businessService.insertBusiness(payload);
  state.business = business;
  await businessService.seedBusinessDefaults(business.id);
  if (access) {
    state.billingAccess = await billingAccessService.fetchBillingAccessByEmail(state.user?.email);
    if (!state.billingAccess) {
      state.billingAccess = {
        ...access,
        auth_user_id: state.user?.id || null,
        business_id: business.id,
        plan_tier: resolvedTier,
      };
    }
  }
}
