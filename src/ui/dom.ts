import { getAppBaseUrl } from "../config/env";
import { setToastTimer, toastTimer } from "../state/store";

export function showScreen(id: string): void {
  ["landingPage", "loginPage", "passwordRecoveryPage", "setupPage", "blockedPage", "adminShell", "publicShell"].forEach((screenId) => {
    document.getElementById(screenId)?.classList.toggle("hidden", screenId !== id);
  });
  if (id === "landingPage") {
    applyBodyMode("landing");
  } else if (id === "loginPage" || id === "passwordRecoveryPage" || id === "setupPage" || id === "blockedPage") {
    applyBodyMode("auth");
  } else if (id === "publicShell") {
    applyBodyMode("public");
  }
}

export function finishInitialBoot(): void {
  document.body.classList.remove("app-booting");
}

export function applyBodyMode(mode: "landing" | "auth" | "public" | "app" | "support"): void {
  document.body.classList.remove("body-landing", "body-auth", "body-public", "body-app", "body-support");
  document.body.classList.add(`body-${mode}`);
}

export function showLoading(active: boolean): void {
  document.getElementById("loadingOverlay")?.classList.toggle("hidden", !active);
}

export function showToast(message: string): void {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  setToastTimer(
    setTimeout(() => {
      toast.classList.remove("show");
      setToastTimer(null);
    }, 2800)
  );
}

export function openModal(id: string): void {
  document.getElementById(id)?.classList.add("open");
}

export function closeModal(id: string, onClose?: () => void): void {
  document.getElementById(id)?.classList.remove("open");
  onClose?.();
}

export function setTodayDate(): void {
  const date = new Date();
  const el = document.getElementById("todayDate");
  if (el) {
    el.textContent = date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
}

export function getPublicAppUrl(slug: string): string {
  return `${getAppBaseUrl()}/?slug=${slug}`;
}

export function getCustomerPortalUrl(portalToken: string): string {
  return `${getAppBaseUrl()}/?client=${encodeURIComponent(portalToken)}`;
}
