import { getSupabase } from "../lib/supabase";
import type { Business, CustomerRow, PlatformSettingsRow, SupportEventRow } from "../types";

export async function fetchAllBusinesses(): Promise<Business[]> {
  const { data, error } = await getSupabase().from("businesses").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Business[];
}

export async function fetchSupportEventsForBusinessIds(businessIds: string[]): Promise<SupportEventRow[]> {
  if (!businessIds.length) return [];
  const { data, error } = await getSupabase()
    .from("support_events")
    .select("*")
    .in("business_id", businessIds)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Support events unavailable:", error.message);
    return [];
  }
  return (data ?? []) as SupportEventRow[];
}

export async function insertSupportEvent(payload: Record<string, unknown>) {
  return getSupabase().from("support_events").insert(payload);
}

export async function fetchCustomersForBusinessLimited(businessId: string, limit = 6): Promise<CustomerRow[]> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .order("last_booking_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsRow | null> {
  const { data, error } = await getSupabase().from("platform_settings").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.warn("Platform settings unavailable:", error.message);
    return null;
  }
  return (data as PlatformSettingsRow | null) ?? null;
}

export async function savePlatformSettings(payload: Partial<PlatformSettingsRow>): Promise<PlatformSettingsRow> {
  const { data, error } = await getSupabase()
    .from("platform_settings")
    .upsert({ id: 1, ...payload, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlatformSettingsRow;
}
