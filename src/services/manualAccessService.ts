import { getSupabase } from "../lib/supabase";
import type { ManualAccessRole } from "../types";

export async function fetchManualAccessRoleByEmail(email: string): Promise<ManualAccessRole | null> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await getSupabase().rpc("get_manual_access_role", {
    p_email: normalizedEmail,
  });
  if (error) throw error;
  const role = String(data || "").trim();
  return role === "platform_admin" || role === "store_owner" ? role : null;
}
