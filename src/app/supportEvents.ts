import * as supportService from "../services/supportService";
import { state } from "../state/store";

export async function createSupportEvent(payload: {
  businessId: string;
  eventType: string;
  title: string;
  details: string;
}): Promise<void> {
  if (!state.isPlatformAdmin || !payload.businessId) return;
  const { error } = await supportService.insertSupportEvent({
    business_id: payload.businessId,
    actor_user_id: state.user?.id || null,
    actor_email: state.user?.email || "suporte@agendixx",
    event_type: payload.eventType,
    title: payload.title,
    details: payload.details,
  });
  if (error) {
    console.warn("Could not persist support event:", error.message);
  }
}
