import * as authService from "../services/authService";
import * as billingAccessService from "../services/billingAccessService";
import * as businessService from "../services/businessService";
import * as supportService from "../services/supportService";
import { state } from "../state/store";
import { isSupportAccountEmail, isSupportInternalBusiness, renderSupportBusinesses } from "../ui/render/supportPanel";
import { applyBodyMode, finishInitialBoot, showLoading, showScreen, showToast } from "../ui/dom";
import { hasSupabaseBrowserConfig } from "../config/env";
import { getErrorMessage } from "../utils/errors";
import { slugify } from "../utils/strings";
import { createBusinessAndSeed } from "./businessLifecycle";
import { shouldAutoStartBusinessOnboarding, startBusinessOnboarding } from "./onboarding";
import { refreshAllBusinessData } from "./refresh";
import { syncEntryViewFromUrl } from "./authUi";
import { loadCustomerPortalData, loadPublicData } from "./publicData";
import { pubGoRaw, showCustomerPortal } from "./publicFlow";
import { navTo } from "./navigation";

function isPasswordRecoveryCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("app") === "recovery" || window.location.hash.includes("type=recovery");
}

function getPendingSetup(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem("agendixx_pending_setup");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getPendingSetupFromMetadata(): import("../types").PendingBusinessDraft | null {
  if (isInternalSupportAccount()) {
    return null;
  }
  const pending = state.user?.user_metadata?.pending_business;
  if (!pending?.name || !pending?.slug) {
    return null;
  }
  return {
    name: pending.name,
    slug: slugify(String(pending.slug)),
    category: pending.category || "Salao de Beleza",
    plan_tier: pending.plan_tier === "pro" ? "pro" : "starter",
    plan_name: pending.plan_name || (pending.plan_tier === "pro" ? "Plano Pro" : "Plano Starter"),
  };
}

function isInternalSupportAccount(): boolean {
  return state.isPlatformAdmin && isSupportAccountEmail(state.user?.email || "");
}

export async function ensureBusinessExists(): Promise<void> {
  if (isInternalSupportAccount()) {
    localStorage.removeItem("agendixx_pending_setup");
    state.business = null;
    return;
  }

  state.billingAccess = await billingAccessService.fetchBillingAccessByEmail(state.user?.email);

  const data = await businessService.fetchBusinessByOwner(state.user!.id);

  if (data) {
    state.business = data;
    localStorage.removeItem("agendixx_pending_setup");
    return;
  }

  const pending = getPendingSetup() || getPendingSetupFromMetadata();
  if (pending) {
    await createBusinessAndSeed(pending as import("../types").PendingBusinessDraft);
    localStorage.removeItem("agendixx_pending_setup");
    return;
  }

  state.business = null;
}

export async function loadSupportBusinesses(): Promise<void> {
  state.platformSettings = await supportService.fetchPlatformSettings();
  if (!state.isPlatformAdmin) {
    state.supportBusinesses = [];
    state.supportEvents = [];
    return;
  }
  const data = await supportService.fetchAllBusinesses();
  state.supportBusinesses = data.filter((business) => !isSupportInternalBusiness(business));
  const businessIds = state.supportBusinesses.map((business) => business.id);
  state.supportEvents = await supportService.fetchSupportEventsForBusinessIds(businessIds);
  renderSupportBusinesses();
}

export async function loadPlatformAdminStatus(): Promise<void> {
  if (!state.user) {
    state.isPlatformAdmin = false;
    return;
  }
  state.isPlatformAdmin = await authService.isPlatformAdmin();
}

export async function loadAdminExperience(): Promise<void> {
  await loadPlatformAdminStatus();
  state.platformSettings = await supportService.fetchPlatformSettings();
  await ensureBusinessExists();

  if (!state.isPlatformAdmin && state.billingAccess && !billingAccessService.billingAccessHasActiveUse(state.billingAccess)) {
    const el = document.getElementById("blockedReasonText");
    if (el) {
      el.textContent = billingAccessService.getBillingAccessBlockedReason(state.billingAccess);
    }
    showScreen("blockedPage");
    return;
  }

  if (!state.business && !state.isPlatformAdmin) {
    if (!billingAccessService.billingAccessAllowsSetup(state.billingAccess)) {
      const el = document.getElementById("blockedReasonText");
      if (el) {
        el.textContent = billingAccessService.getBillingAccessBlockedReason(state.billingAccess);
      }
      showScreen("blockedPage");
      return;
    }
    const { showSetupPage } = await import("./setupFlow");
    showSetupPage();
    return;
  }

  if (state.business && !state.business.active && !state.isPlatformAdmin) {
    const el = document.getElementById("blockedReasonText");
    if (el) {
      el.textContent =
        state.business.blocked_reason || "Sua conta está temporariamente bloqueada. Fale com o suporte para regularizar.";
    }
    showScreen("blockedPage");
    return;
  }

  applyBodyMode(state.isPlatformAdmin ? "support" : "app");
  showScreen("adminShell");
  if (state.business) {
    await refreshAllBusinessData();
  }
  await loadSupportBusinesses();
  document.getElementById("supportNavItem")?.classList.toggle("hidden", !state.isPlatformAdmin);
  if (state.isPlatformAdmin) {
    navTo("pageSupport");
    return;
  }
  if (shouldAutoStartBusinessOnboarding()) {
    navTo("pageMeuNegocio");
    window.setTimeout(() => {
      void startBusinessOnboarding();
    }, 120);
    return;
  }
  navTo("pageDashboard");
}

export async function bootstrapApp(): Promise<void> {
  showLoading(true);
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    const clientPortalToken = params.get("client");
    const appMode = params.get("app");
    let handledAuthRedirect = false;

    if (!hasSupabaseBrowserConfig()) {
      if (!slug && !clientPortalToken && !appMode) {
        syncEntryViewFromUrl();
        return;
      }
      throw new Error("Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para o projeto Agendixx.");
    }

    const { session, error } = await authService.getSession();
    if (error) throw error;

    state.session = session;
    state.user = session?.user ?? null;

    authService.onAuthStateChange(async (_event, nextSession) => {
      state.session = nextSession;
      state.user = nextSession?.user ?? null;
      if (handledAuthRedirect) return;
      if (slug || clientPortalToken) return;
      if (_event === "PASSWORD_RECOVERY" || isPasswordRecoveryCallback()) {
        handledAuthRedirect = true;
        const { showPasswordRecoveryPage } = await import("./authActions");
        showPasswordRecoveryPage();
        return;
      }
      if (!nextSession?.user) return;
      handledAuthRedirect = true;
      showLoading(true);
      try {
        await loadAdminExperience();
      } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error));
        showScreen("landingPage");
      } finally {
        showLoading(false);
      }
    });

    if (clientPortalToken) {
      await loadCustomerPortalData(clientPortalToken);
      showScreen("publicShell");
      showCustomerPortal();
      return;
    }

    if (slug) {
      await loadPublicData(slug);
      showScreen("publicShell");
      pubGoRaw(0);
      return;
    }

    if (session?.user) {
      if (isPasswordRecoveryCallback()) {
        const { showPasswordRecoveryPage } = await import("./authActions");
        showPasswordRecoveryPage();
        return;
      }
      await loadAdminExperience();
      return;
    }

    syncEntryViewFromUrl();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
    showScreen("landingPage");
  } finally {
    finishInitialBoot();
    showLoading(false);
  }
}
