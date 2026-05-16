import { getSupabase } from "../lib/supabase";
import type { BillingAccessRow } from "../types";

export async function fetchBillingAccessByEmail(email: string | null | undefined): Promise<BillingAccessRow | null> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await getSupabase()
    .from("billing_access")
    .select("*")
    .eq("email", normalized)
    .eq("provider", "kiwify")
    .maybeSingle();
  if (error) throw error;
  return (data as BillingAccessRow | null) || null;
}

export function billingAccessAllowsSetup(access: BillingAccessRow | null | undefined): boolean {
  return billingAccessHasActiveUse(access);
}

export function billingAccessHasActiveUse(access: BillingAccessRow | null | undefined): boolean {
  if (!access) return false;
  const status = String(access.billing_status || "");
  if (["active", "invited", "pendente", "past_due"].includes(status)) return true;
  if (status === "canceled") {
    const end = new Date(String(access.current_period_end || "")).getTime();
    return !Number.isNaN(end) && end >= Date.now();
  }
  return false;
}

export function getBillingAccessBlockedReason(access: BillingAccessRow | null | undefined): string {
  if (!access) {
    return "Seu acesso ao Agendixx é liberado após a compra na Kiwify. Use o mesmo e-mail da compra para entrar.";
  }
  const status = String(access.billing_status || "");
  if (status === "chargeback" || status === "refunded") {
    return "Seu acesso foi desativado porque a compra foi reembolsada ou sofreu chargeback.";
  }
  if (status === "canceled") {
    return "Sua assinatura foi encerrada e o período contratado já terminou.";
  }
  if (status === "past_due") {
    return "Seu pagamento está em atraso. Regularize sua assinatura para continuar usando o Agendixx.";
  }
  return "Seu acesso ainda não foi liberado. Confirme sua compra na Kiwify e use o mesmo e-mail para entrar.";
}
