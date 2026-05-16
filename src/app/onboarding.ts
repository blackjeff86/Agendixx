import { state } from "../state/store";
import { navTo } from "./navigation";

type OnboardingStep = {
  pageId: "pageMeuNegocio" | "pageAtendimento";
  selector: string;
  title: string;
  description: string;
  accordionId?: string;
  modalId?: string;
  modalSelector?: string;
};

const PENDING_PREFIX = "agendixx_onboarding_pending_";
const DONE_PREFIX = "agendixx_onboarding_done_";

const steps: OnboardingStep[] = [
  {
    pageId: "pageMeuNegocio",
    accordionId: "negocioInfoAccordion",
    selector: "#businessInstagram",
    title: "Comece pelo Instagram",
    description: "Adicione o Instagram do seu salão para facilitar o contato e deixar sua página pública mais completa.",
  },
  {
    pageId: "pageMeuNegocio",
    accordionId: "negocioInfoAccordion",
    selector: "#businessAddress",
    title: "Informe o endereço",
    description: "Preencha o endereço para ajudar seus clientes a encontrarem o salão com mais facilidade.",
  },
  {
    pageId: "pageMeuNegocio",
    accordionId: "negocioInfoAccordion",
    selector: "#businessLogoFile",
    title: "Escolha a logo do salão",
    description: "Você pode enviar a logo do seu salão aqui. Se não enviar agora, a Agendixx usa a tesoura como logo padrão.",
  },
  {
    pageId: "pageMeuNegocio",
    accordionId: "negocioHorariosAccordion",
    selector: "#horariosList",
    title: "Configure seus horários",
    description: "Nesta seção você define os dias de funcionamento, horários de abertura e fechamento e também pode pausar a agenda em datas específicas.",
  },
  {
    pageId: "pageMeuNegocio",
    selector: "#saveBusinessProfileBtn",
    title: "Salve as informações do negócio",
    description: "Depois de preencher Instagram, endereço, logo e horários, clique em Salvar Alterações para guardar tudo de verdade antes de continuar.",
  },
  {
    pageId: "pageAtendimento",
    selector: "#btnAddService",
    modalId: "modalNovoServico",
    modalSelector: "#modalNovoServico .modal-sheet",
    title: "Cadastre os serviços oferecidos",
    description: "Clique em + Serviço para abrir o cadastro. É aqui que você organiza nome, valor, duração e o que vai aparecer para o cliente na hora de agendar.",
  },
  {
    pageId: "pageAtendimento",
    selector: "#btnAddProfessional",
    modalId: "modalNovoProf",
    modalSelector: "#modalNovoProf .modal-sheet",
    title: "Monte sua equipe disponível",
    description: "Depois, clique em + Profissional para cadastrar quem atende no salão e distribuir melhor os horários da equipe.",
  },
];

let currentStepIndex = 0;
let manualMode = false;
let listenersBound = false;

function getPendingKey(businessId: string): string {
  return `${PENDING_PREFIX}${businessId}`;
}

function getDoneKey(businessId: string): string {
  return `${DONE_PREFIX}${businessId}`;
}

function getOverlay(): HTMLElement | null {
  return document.getElementById("onboardingOverlay");
}

function getCard(): HTMLElement | null {
  return document.getElementById("onboardingCard");
}

function clearHighlight(): void {
  document.querySelectorAll(".onboarding-target").forEach((node) => node.classList.remove("onboarding-target"));
}

function setAccordionOpen(accordionId?: string): void {
  if (!accordionId) return;
  const accordion = document.getElementById(accordionId) as HTMLDetailsElement | null;
  if (accordion) accordion.open = true;
}

function getCurrentStep(): OnboardingStep {
  return steps[currentStepIndex];
}

function resolveStepTarget(step: OnboardingStep): HTMLElement | null {
  if (step.modalId && step.modalSelector) {
    const modal = document.getElementById(step.modalId);
    if (modal?.classList.contains("open")) {
      return document.querySelector(step.modalSelector) as HTMLElement | null;
    }
  }
  return document.querySelector(step.selector) as HTMLElement | null;
}

function syncOverlayCopy(): void {
  const step = getCurrentStep();
  const title = document.getElementById("onboardingTitle");
  const description = document.getElementById("onboardingDescription");
  const progress = document.getElementById("onboardingProgress");
  const previousButton = document.getElementById("onboardingPrevBtn") as HTMLButtonElement | null;
  const nextButton = document.getElementById("onboardingNextBtn") as HTMLButtonElement | null;
  if (title) title.textContent = step.title;
  if (description) description.textContent = step.description;
  if (progress) progress.textContent = `Passo ${currentStepIndex + 1} de ${steps.length}`;
  if (previousButton) previousButton.disabled = currentStepIndex === 0;
  if (nextButton) nextButton.textContent = currentStepIndex === steps.length - 1 ? "Concluir" : "Próximo";
}

function positionCardNearTarget(target: HTMLElement | null): void {
  const card = getCard();
  if (!card) return;
  const margin = 16;
  const cardWidth = Math.min(360, window.innerWidth - margin * 2);
  card.style.width = `${cardWidth}px`;

  if (!target) {
    card.style.left = `${Math.max(margin, (window.innerWidth - cardWidth) / 2)}px`;
    card.style.top = `${Math.max(96, (window.innerHeight - card.offsetHeight) / 2)}px`;
    return;
  }

  const rect = target.getBoundingClientRect();
  let left = Math.max(margin, Math.min(rect.left, window.innerWidth - cardWidth - margin));
  let top = rect.bottom + 16;
  const estimatedHeight = card.offsetHeight || 220;
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - 16);
  }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

async function focusCurrentStep(): Promise<void> {
  const step = getCurrentStep();
  navTo(step.pageId);
  setAccordionOpen(step.accordionId);
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  clearHighlight();
  const target = resolveStepTarget(step);
  if (target) {
    target.classList.add("onboarding-target");
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
  syncOverlayCopy();
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  positionCardNearTarget(target);
}

async function refreshCurrentStepTarget(scrollIntoView = false): Promise<void> {
  const target = resolveStepTarget(getCurrentStep());
  clearHighlight();
  if (target) {
    target.classList.add("onboarding-target");
    if (scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }
  syncOverlayCopy();
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  positionCardNearTarget(target);
}

function bindLifecycleListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener("agendixx:business-profile-saved", () => {
    if (!getOverlay()?.classList.contains("open")) return;
    if (getCurrentStep().selector !== "#saveBusinessProfileBtn") return;
    void nextOnboardingStep();
  });

  document.addEventListener("agendixx:service-modal-opened", () => {
    if (!getOverlay()?.classList.contains("open")) return;
    if (getCurrentStep().modalId !== "modalNovoServico") return;
    window.setTimeout(() => {
      void refreshCurrentStepTarget(true);
    }, 120);
  });

  document.addEventListener("agendixx:service-modal-closed", () => {
    if (!getOverlay()?.classList.contains("open")) return;
    if (getCurrentStep().selector !== "#btnAddService") return;
    window.setTimeout(() => {
      void refreshCurrentStepTarget(false);
    }, 120);
  });

  document.addEventListener("agendixx:professional-modal-opened", () => {
    if (!getOverlay()?.classList.contains("open")) return;
    if (getCurrentStep().modalId !== "modalNovoProf") return;
    window.setTimeout(() => {
      void refreshCurrentStepTarget(true);
    }, 120);
  });

  document.addEventListener("agendixx:professional-modal-closed", () => {
    if (!getOverlay()?.classList.contains("open")) return;
    if (getCurrentStep().selector !== "#btnAddProfessional") return;
    window.setTimeout(() => {
      void refreshCurrentStepTarget(false);
    }, 120);
  });
}

function finishOnboarding(markDone: boolean): void {
  clearHighlight();
  getOverlay()?.classList.remove("open");
  const businessId = state.business?.id;
  if (markDone && businessId) {
    try {
      localStorage.setItem(getDoneKey(businessId), "1");
      localStorage.removeItem(getPendingKey(businessId));
    } catch {}
  }
  manualMode = false;
}

export function markBusinessOnboardingPending(businessId: string): void {
  try {
    localStorage.setItem(getPendingKey(businessId), "1");
    localStorage.removeItem(getDoneKey(businessId));
  } catch {}
}

export function shouldAutoStartBusinessOnboarding(): boolean {
  const businessId = state.business?.id;
  if (!businessId) return false;
  try {
    return localStorage.getItem(getPendingKey(businessId)) === "1" && localStorage.getItem(getDoneKey(businessId)) !== "1";
  } catch {
    return false;
  }
}

export async function startBusinessOnboarding(force = false): Promise<void> {
  if (!state.business) return;
  if (!force && !shouldAutoStartBusinessOnboarding()) return;
  bindLifecycleListeners();
  manualMode = force;
  currentStepIndex = 0;
  getOverlay()?.classList.add("open");
  await focusCurrentStep();
}

export async function nextOnboardingStep(): Promise<void> {
  if (currentStepIndex >= steps.length - 1) {
    finishOnboarding(true);
    return;
  }
  currentStepIndex += 1;
  await focusCurrentStep();
}

export async function previousOnboardingStep(): Promise<void> {
  if (currentStepIndex === 0) return;
  currentStepIndex -= 1;
  await focusCurrentStep();
}

export function skipOnboarding(): void {
  finishOnboarding(!manualMode);
}

export function reRunBusinessOnboarding(): void {
  void startBusinessOnboarding(true);
}
