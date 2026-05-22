import { state } from "../state/store";
import { showScreen } from "../ui/dom";
import { getManualAccessSignupMessage, isManualAccessAllowedEmail, isSupportAccountEmail } from "../ui/render/supportPanel";

const SIGNUP_PLAN_STORAGE_KEY = "agendixx_signup_plan";
const PUBLIC_PRO_SIGNUPS_ENABLED = false;

export function normalizeSignupPlan(plan: string | null | undefined): "starter" | "pro" {
  if (!PUBLIC_PRO_SIGNUPS_ENABLED) return "starter";
  return plan === "pro" ? "pro" : "starter";
}

export function getSelectedSignupPlan(): "starter" | "pro" {
  try {
    return normalizeSignupPlan(localStorage.getItem(SIGNUP_PLAN_STORAGE_KEY));
  } catch {
    return "starter";
  }
}

function planLabel(plan: "starter" | "pro"): string {
  return plan === "pro" ? "Plano Pro" : "Plano Starter";
}

export function syncSignupPlanChoice(rawPlan?: string | null, shouldSyncUrl = true): void {
  const plan = normalizeSignupPlan(rawPlan);
  try {
    localStorage.setItem(SIGNUP_PLAN_STORAGE_KEY, plan);
  } catch {}

  const select = document.getElementById("signupPlanTier") as HTMLSelectElement | null;
  if (select) {
    select.value = plan;
    select.disabled = !PUBLIC_PRO_SIGNUPS_ENABLED;
  }

  const badge = document.getElementById("signupPlanBadge");
  if (badge) badge.textContent = `${planLabel(plan)} · 1º mês por R$ 29,90`;

  const hint = document.getElementById("signupPlanHint");
  if (hint) {
    hint.textContent = PUBLIC_PRO_SIGNUPS_ENABLED
      ? plan === "pro"
        ? "Você vai entrar pela oferta promocional do Plano Pro no primeiro mês e, depois, segue com os recursos avançados."
        : "Você vai começar com valor promocional de R$ 29,90 no primeiro mês e pode fazer upgrade para Pro quando quiser."
      : "No momento, novas lojas entram pela oferta de R$ 29,90 no primeiro mês no Plano Starter. O Plano Pro será liberado em breve.";
  }

  if (shouldSyncUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("plan", plan);
    window.history.replaceState(window.history.state || {}, "", url);
  }
}

export function switchAuthMode(mode: "login" | "signup"): void {
  const isLogin = mode === "login";
  document.getElementById("tabLogin")?.classList.toggle("active", isLogin);
  document.getElementById("tabSignup")?.classList.toggle("active", !isLogin);
  document.getElementById("loginForm")?.classList.toggle("hidden", !isLogin);
  document.getElementById("signupForm")?.classList.toggle("hidden", isLogin);
  if (!isLogin) {
    syncSignupFormMode();
  }
}

export function syncSignupFormMode(): void {
  const emailEl = document.getElementById("signupEmail") as HTMLInputElement | null;
  const email = emailEl?.value || "";
  const isSupportSignup = isSupportAccountEmail(email);
  const isManualAccessSignup = isManualAccessAllowedEmail(email);
  const businessFields = document.getElementById("signupBusinessFields");
  const supportNote = document.getElementById("supportSignupNote");
  const submitButton = document.getElementById("signupSubmitButton");
  const businessName = document.getElementById("signupBusinessName") as HTMLInputElement | null;
  const slug = document.getElementById("signupSlug") as HTMLInputElement | null;

  if (!businessFields || !supportNote || !submitButton || !businessName || !slug) {
    return;
  }

  businessFields.classList.toggle("hidden", isManualAccessSignup);
  supportNote.classList.toggle("hidden", !isManualAccessSignup);
  supportNote.textContent = getManualAccessSignupMessage(email);
  businessName.required = !isManualAccessSignup;
  slug.required = !isManualAccessSignup;
  submitButton.textContent = isSupportSignup
    ? "Criar conta de suporte"
    : isManualAccessSignup
      ? "Criar conta autorizada"
      : "Acesso liberado pela Kiwify";
  document.getElementById("signupPlanWrap")?.classList.toggle("hidden", isManualAccessSignup);
  if (!isManualAccessSignup) {
    syncSignupPlanChoice(getSelectedSignupPlan(), false);
  }
}

export function syncEntryViewFromUrl(): void {
  if (state.user) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("slug")) return;
  const appMode = params.get("app");
  const plan = params.get("plan");
  if (plan) {
    syncSignupPlanChoice(plan, false);
  } else {
    syncSignupPlanChoice(getSelectedSignupPlan(), false);
  }
  if (appMode) {
    if (appMode === "recovery") {
      showScreen("passwordRecoveryPage");
      return;
    }
    showScreen("loginPage");
    switchAuthMode(appMode === "signup" ? "signup" : "login");
    return;
  }
  showScreen("landingPage");
}
