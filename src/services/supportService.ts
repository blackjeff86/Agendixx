import { getSupabase } from "../lib/supabase";
import type {
  Business,
  CustomerRow,
  ManualAccessAllowlistRow,
  ManualAccessRole,
  PlatformSettingsRow,
  SalesAgentRunRow,
  SalesConversationRow,
  SalesDashboardData,
  SalesLeadRow,
  SupportEventRow,
} from "../types";

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

export async function fetchManualAccessAllowlist(): Promise<ManualAccessAllowlistRow[]> {
  const { data, error } = await getSupabase()
    .from("manual_access_allowlist")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ManualAccessAllowlistRow[];
}

export async function saveManualAccessEntry(email: string, role: ManualAccessRole): Promise<ManualAccessAllowlistRow> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const { data, error } = await getSupabase()
    .from("manual_access_allowlist")
    .upsert({ email: normalizedEmail, role, active: true }, { onConflict: "email" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ManualAccessAllowlistRow;
}

export async function updateManualAccessEntry(email: string, payload: Partial<ManualAccessAllowlistRow>): Promise<ManualAccessAllowlistRow> {
  const { data, error } = await getSupabase()
    .from("manual_access_allowlist")
    .update(payload)
    .eq("email", String(email || "").trim().toLowerCase())
    .select("*")
    .single();
  if (error) throw error;
  return data as ManualAccessAllowlistRow;
}

export async function fetchSalesDashboardData(limit = 120): Promise<SalesDashboardData> {
  const { data: leadsData, error: leadsError } = await getSupabase()
    .from("sales_leads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (leadsError) {
    console.warn("Sales leads unavailable:", leadsError.message);
    return { leads: [], conversations: [], runs: [] };
  }

  const leads = (leadsData ?? []) as SalesLeadRow[];
  const leadIds = leads.map((lead) => lead.id);
  if (!leadIds.length) {
    return { leads, conversations: [], runs: [] };
  }

  const [{ data: conversationsData, error: conversationsError }, { data: runsData, error: runsError }] = await Promise.all([
    getSupabase()
      .from("sales_conversations")
      .select("*")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true }),
    getSupabase()
      .from("sales_agent_runs")
      .select("*")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false }),
  ]);

  if (conversationsError) {
    console.warn("Sales conversations unavailable:", conversationsError.message);
  }
  if (runsError) {
    console.warn("Sales runs unavailable:", runsError.message);
  }

  return {
    leads,
    conversations: (conversationsData ?? []) as SalesConversationRow[],
    runs: (runsData ?? []) as SalesAgentRunRow[],
  };
}

export async function updateSalesLead(leadId: string, payload: Partial<SalesLeadRow>): Promise<SalesLeadRow> {
  const { data, error } = await getSupabase().from("sales_leads").update(payload).eq("id", leadId).select("*").single();
  if (error) throw error;
  return data as SalesLeadRow;
}
