import { slugify } from "../utils/strings";
import { showScreen } from "../ui/dom";

function getPendingSetup(): { name?: string; slug?: string; category?: string } | null {
  try {
    const raw = localStorage.getItem("agendixx_pending_setup");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function showSetupPage(): void {
  const pending = getPendingSetup();
  if (pending) {
    const nameEl = document.getElementById("setupBusinessName") as HTMLInputElement | null;
    const slugEl = document.getElementById("setupSlug") as HTMLInputElement | null;
    const catEl = document.getElementById("setupCategory") as HTMLSelectElement | null;
    if (nameEl) nameEl.value = pending.name || "";
    if (slugEl) slugEl.value = pending.slug || "";
    if (catEl) catEl.value = pending.category || "Salao de Beleza";
  }
  showScreen("setupPage");
}

export { slugify };
