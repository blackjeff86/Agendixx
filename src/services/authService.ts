import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase";

export async function getSession(): Promise<{ session: Session | null; error: Error | null }> {
  const { data, error } = await getSupabase().auth.getSession();
  return { session: data.session, error: error as Error | null };
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): { unsubscribe: () => void } {
  const { data } = getSupabase().auth.onAuthStateChange(callback);
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function signInWithPassword(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email, password });
}

export async function signUp(
  email: string,
  password: string,
  options: { data: Record<string, unknown> }
) {
  return getSupabase().auth.signUp({ email, password, options });
}

export async function signOut() {
  return getSupabase().auth.signOut();
}

export async function resetPasswordForEmail(email: string, redirectTo: string) {
  return getSupabase().auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(password: string) {
  return getSupabase().auth.updateUser({ password });
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("is_platform_admin");
  if (error) return false;
  return Boolean(data);
}
