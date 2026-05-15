import { DEFAULT_HOURS, DEFAULT_PROFESSIONALS, DEFAULT_SERVICES } from "./defaults";
import type { PublicData } from "../types";

export function buildFallbackPublic(): PublicData {
  return {
    business: {
      id: "demo-business",
      owner_id: "demo",
      name: "Agendixx Demo",
      slug: "demo",
      category: "Salao de Beleza",
      description: "Preview demonstrativo do fluxo publico de agendamento.",
      whatsapp: "(11) 99999-0000",
      instagram: "@agendixx.demo",
      address: "Rua das Flores, 123 - Centro",
      logo_emoji: "✂️",
      logo_image_url: "",
      cover_image_url: "",
      active: true,
    },
    services: DEFAULT_SERVICES.map((item, index) => ({
      ...item,
      id: `demo-service-${index + 1}`,
      business_id: "demo-business",
    })),
    professionals: DEFAULT_PROFESSIONALS.map((item, index) => ({
      name: item.name,
      role: item.role,
      emoji: item.emoji,
      active: item.active,
      id: `demo-prof-${index + 1}`,
      business_id: "demo-business",
      serviceNames: item.serviceNames,
    })),
    hours: DEFAULT_HOURS,
  };
}
