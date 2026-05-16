import { getAppBaseUrl, KIWIFY_STARTER_CHECKOUT_URL } from "../config/env";
import * as authService from "../services/authService";
import { isSupportAccountEmail } from "../ui/render/supportPanel";
import { normalizeSignupPlan, syncEntryViewFromUrl, switchAuthMode } from "./authUi";
import { state } from "../state/store";
import { applyBodyMode, showLoading, showScreen, showToast } from "../ui/dom";
import { getErrorMessage } from "../utils/errors";
import { slugify } from "../utils/strings";
import { loadAdminExperience } from "./bootstrap";
import { createBusinessAndSeed } from "./businessLifecycle";

const PASSWORD_RECOVERY_PENDING_KEY = "agendixx_password_recovery_pending";

function setPasswordRecoveryPending(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, "1");
    } else {
      localStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
    }
  } catch {}
}

function clearPasswordRecoveryUrlState(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("app");
    url.hash = "";
    window.history.replaceState(window.history.state || {}, "", url);
  } catch {}
}

export function hasPasswordRecoveryPending(): boolean {
  try {
    return localStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function planNameFromTier(planTier: "starter" | "pro"): "Plano Starter" | "Plano Pro" {
  return planTier === "pro" ? "Plano Pro" : "Plano Starter";
}

export function openAppEntry(mode: "signup" | "login", plan?: "starter" | "pro"): void {
  const url = new URL(window.location.href || getAppBaseUrl());
  url.searchParams.delete("slug");
  url.searchParams.set("app", mode);
  if (mode === "signup") {
    const chosenPlan = normalizeSignupPlan(plan);
    url.searchParams.set("plan", chosenPlan);
  } else {
    url.searchParams.delete("plan");
  }
  window.history.pushState({ app: mode }, "", url);
  syncEntryViewFromUrl();
}

export function openStarterCheckout(): void {
  if (!KIWIFY_STARTER_CHECKOUT_URL) {
    showToast("Checkout da Kiwify não configurado.");
    return;
  }
  window.location.href = KIWIFY_STARTER_CHECKOUT_URL;
}

export async function doLogin(): Promise<void> {
  const email = (document.getElementById("loginEmail") as HTMLInputElement).value.trim();
  const password = (document.getElementById("loginPass") as HTMLInputElement).value.trim();
  if (!email || !password) {
    showToast("Preencha e-mail e senha.");
    return;
  }

  showLoading(true);
  try {
    const { data, error } = await authService.signInWithPassword(email, password);
    if (error) throw error;
    state.session = data.session;
    state.user = data.user;
    await loadAdminExperience();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function sendPasswordRecovery(): Promise<void> {
  const email = (document.getElementById("loginEmail") as HTMLInputElement | null)?.value.trim() || "";
  if (!email) {
    showToast("Informe seu e-mail para receber o link de redefinição.");
    return;
  }

  showLoading(true);
  try {
    setPasswordRecoveryPending(true);
    const { error } = await authService.resetPasswordForEmail(email, `${getAppBaseUrl()}/?app=recovery`);
    if (error) throw error;
    showToast("E-mail de redefinição enviado. Verifique sua caixa de entrada.");
  } catch (error) {
    setPasswordRecoveryPending(false);
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export function showPasswordRecoveryPage(): void {
  setPasswordRecoveryPending(true);
  clearPasswordRecoveryUrlState();
  showScreen("passwordRecoveryPage");
}

export async function completePasswordRecovery(): Promise<void> {
  const password = (document.getElementById("recoveryPass") as HTMLInputElement | null)?.value.trim() || "";
  const confirmPassword = (document.getElementById("recoveryPassConfirm") as HTMLInputElement | null)?.value.trim() || "";
  if (!password || !confirmPassword) {
    showToast("Preencha e confirme a nova senha.");
    return;
  }
  if (password.length < 6) {
    showToast("A nova senha deve ter pelo menos 6 caracteres.");
    return;
  }
  if (password !== confirmPassword) {
    showToast("As senhas não coincidem.");
    return;
  }

  showLoading(true);
  try {
    const { error } = await authService.updatePassword(password);
    if (error) throw error;
    setPasswordRecoveryPending(false);
    clearPasswordRecoveryUrlState();
    showToast("Senha atualizada com sucesso.");
    await loadAdminExperience();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function doSignup(): Promise<void> {
  const isSupportSignup = isSupportAccountEmail((document.getElementById("signupEmail") as HTMLInputElement).value.trim());
  if (!isSupportSignup) {
    showToast("Novos acessos são liberados após a compra na Kiwify. Faça a compra e depois entre com o mesmo e-mail usado no pagamento.");
    switchAuthMode("login");
    return;
  }
  const draft = {
    name: (document.getElementById("signupBusinessName") as HTMLInputElement).value.trim(),
    slug: slugify((document.getElementById("signupSlug") as HTMLInputElement).value.trim()),
    category: (document.getElementById("signupCategory") as HTMLSelectElement).value,
    plan_tier: normalizeSignupPlan((document.getElementById("signupPlanTier") as HTMLSelectElement | null)?.value),
    email: (document.getElementById("signupEmail") as HTMLInputElement).value.trim(),
    password: (document.getElementById("signupPass") as HTMLInputElement).value.trim(),
  };
  const businessDraft = {
    ...draft,
    plan_name: planNameFromTier(draft.plan_tier),
  };

  if ((!isSupportSignup && (!draft.name || !draft.slug)) || !draft.email || !draft.password) {
    showToast("Preencha todos os campos para criar a conta.");
    return;
  }

  showLoading(true);
  try {
    if (isSupportSignup) {
      localStorage.removeItem("agendixx_pending_setup");
    } else {
      localStorage.setItem("agendixx_pending_setup", JSON.stringify(businessDraft));
    }
    const { data, error } = await authService.signUp(draft.email, draft.password, {
      data: isSupportSignup
        ? {}
        : {
            pending_business: {
              name: draft.name,
              slug: draft.slug,
              category: draft.category,
              plan_tier: draft.plan_tier,
              plan_name: planNameFromTier(draft.plan_tier),
            },
          },
    });
    if (error) throw error;

    if (data.session?.user) {
      state.session = data.session;
      state.user = data.user;
      if (!isSupportSignup) {
        await createBusinessAndSeed(businessDraft);
      }
      await loadAdminExperience();
      return;
    }

    showToast(
      isSupportSignup
        ? "Conta interna criada. Confirme seu e-mail e depois faça login no painel de suporte."
        : "Conta criada. Confirme seu e-mail no Supabase e depois faça login."
    );
    switchAuthMode("login");
    (document.getElementById("loginEmail") as HTMLInputElement).value = draft.email;
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function completeInitialSetup(): Promise<void> {
  const draft = {
    name: (document.getElementById("setupBusinessName") as HTMLInputElement).value.trim(),
    slug: slugify((document.getElementById("setupSlug") as HTMLInputElement).value.trim()),
    category: (document.getElementById("setupCategory") as HTMLSelectElement).value,
    description: (document.getElementById("setupDescription") as HTMLTextAreaElement).value.trim(),
    whatsapp: (document.getElementById("setupWhatsapp") as HTMLInputElement).value.trim(),
  };

  if (!draft.name || !draft.slug) {
    showToast("Informe nome e slug do negocio.");
    return;
  }

  showLoading(true);
  try {
    await createBusinessAndSeed(draft);
    await loadAdminExperience();
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error));
  } finally {
    showLoading(false);
  }
}

export async function logout(): Promise<void> {
  showLoading(true);
  try {
    setPasswordRecoveryPending(false);
    await authService.signOut();
    state.session = null;
    state.user = null;
    state.isPlatformAdmin = false;
    state.business = null;
    document.body.classList.remove("has-plan-strip");
    showScreen("loginPage");
    applyBodyMode("auth");
  } finally {
    showLoading(false);
  }
}
