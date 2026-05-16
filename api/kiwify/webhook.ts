import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type JsonRecord = Record<string, unknown>;
type PlanTier = "starter" | "pro";
type BillingStatus = "invited" | "active" | "pendente" | "past_due" | "canceled" | "refunded" | "chargeback";

type NormalizedWebhook = {
  eventName: string;
  email: string;
  customerName: string | null;
  productId: string | null;
  productName: string | null;
  orderId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  eventAt: string;
  periodEnd: string | null;
  rawPayload: JsonRecord;
};

type BillingAccessRecord = {
  id: string;
  email: string;
  provider: string;
  plan_tier?: PlanTier | null;
  billing_status: BillingStatus;
  current_period_end?: string | null;
  auth_user_id?: string | null;
  business_id?: string | null;
  provider_product_id?: string | null;
  provider_product_name?: string | null;
  provider_order_id?: string | null;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  invite_sent_at?: string | null;
};

function getUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      typeof record.message === "string" ? record.message : "",
      typeof record.error_description === "string" ? record.error_description : "",
      typeof record.details === "string" ? record.details : "",
      typeof record.hint === "string" ? record.hint : "",
      typeof record.code === "string" ? `code=${record.code}` : "",
    ].filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  return "Unknown webhook error";
}

function getEnv(name: string, fallback = ""): string {
  return String(process.env[name] || fallback).trim();
}

function parseJsonBody(body: unknown): JsonRecord {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as JsonRecord;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8")) as JsonRecord;
    } catch {
      return {};
    }
  }
  if (typeof body === "object") {
    return body as JsonRecord;
  }
  return {};
}

function getNested(record: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, record);
}

function firstString(record: JsonRecord, paths: string[]): string | null {
  for (const path of paths) {
    const value = getNested(record, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function normalizeEmail(value: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function parseDateCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function parseCsvSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function resolvePlanTier(productId: string | null): PlanTier {
  const starterIds = parseCsvSet(getEnv("KIWIFY_STARTER_PRODUCT_IDS"));
  const proIds = parseCsvSet(getEnv("KIWIFY_PRO_PRODUCT_IDS"));
  if (productId && starterIds.has(productId)) return "starter";
  if (productId && proIds.has(productId)) return "pro";
  return getEnv("KIWIFY_DEFAULT_PLAN_TIER", "starter") === "pro" ? "pro" : "starter";
}

function mapEventToBillingStatus(eventName: string): BillingStatus | null {
  switch (eventName) {
    case "compra_aprovada":
    case "subscription_renewed":
      return "active";
    case "subscription_late":
      return "pendente";
    case "subscription_canceled":
      return "canceled";
    case "compra_reembolsada":
      return "refunded";
    case "chargeback":
      return "chargeback";
    default:
      return null;
  }
}

function resolvePeriodEnd(payload: JsonRecord, eventName: string, existing: BillingAccessRecord | null): string | null {
  const direct = parseDateCandidate(
    firstString(payload, [
      "subscription.next_payment_at",
      "subscription.next_charge_date",
      "subscription.next_payment_date",
      "subscription.expires_at",
      "subscription.end_date",
      "sale.next_payment_at",
      "sale.next_charge_date",
      "order.next_payment_at",
      "order.next_charge_date",
      "next_payment_at",
      "next_charge_date",
      "expires_at",
      "end_date",
    ])
  );
  if (direct) return direct;
  if (eventName === "compra_aprovada" || eventName === "subscription_renewed") {
    const cycleDays = Math.max(1, Number(getEnv("KIWIFY_BILLING_CYCLE_DAYS", "30")) || 30);
    return addDaysIso(cycleDays);
  }
  return existing?.current_period_end || null;
}

function buildEventKey(eventName: string, payload: JsonRecord): string {
  const explicitId =
    firstString(payload, ["id", "event_id", "webhook_id", "data.id"]) ||
    firstString(payload, ["order_id", "order.id", "sale.id", "subscription_id", "subscription.id"]) ||
    firstString(payload, ["customer.email", "buyer.email", "order.customer.email", "data.customer.email"]) ||
    "no-id";
  const when =
    firstString(payload, ["created_at", "updated_at", "approved_at", "paid_at", "event_at", "date_created"]) || "no-date";
  return ["kiwify", eventName, explicitId, when].join(":");
}

function getAppBaseUrl(): string {
  return (
    getEnv("KIWIFY_INVITE_REDIRECT_URL") ||
    getEnv("APP_BASE_URL") ||
    getEnv("VITE_APP_BASE_URL") ||
    "https://agendixx.vercel.app?app=login"
  );
}

function extractNormalizedWebhook(payload: JsonRecord): NormalizedWebhook | null {
  const eventName = firstString(payload, ["trigger", "event", "event_name", "type", "webhook_event"]);
  const email = normalizeEmail(
    firstString(payload, [
      "customer.email",
      "buyer.email",
      "order.customer.email",
      "sale.customer.email",
      "data.customer.email",
      "data.email",
      "email",
    ])
  );
  if (!eventName || !email) return null;

  return {
    eventName,
    email,
    customerName: firstString(payload, [
      "customer.name",
      "buyer.name",
      "order.customer.name",
      "sale.customer.name",
      "data.customer.name",
      "name",
    ]),
    productId: firstString(payload, [
      "product.id",
      "product_id",
      "order.product.id",
      "order.product_id",
      "sale.product.id",
      "sale.product_id",
      "subscription.product.id",
      "data.product.id",
    ]),
    productName: firstString(payload, [
      "product.name",
      "product_name",
      "order.product.name",
      "sale.product.name",
      "subscription.product.name",
      "data.product.name",
    ]),
    orderId: firstString(payload, ["order.id", "order_id", "sale.id", "transaction.id", "data.order_id"]),
    subscriptionId: firstString(payload, ["subscription.id", "subscription_id", "sale.subscription_id", "data.subscription_id"]),
    customerId: firstString(payload, ["customer.id", "customer_id", "buyer.id", "order.customer.id", "data.customer.id"]),
    eventAt:
      parseDateCandidate(firstString(payload, ["created_at", "updated_at", "approved_at", "paid_at", "event_at"])) ||
      new Date().toISOString(),
    periodEnd: null,
    rawPayload: payload,
  };
}

async function fetchExistingAccess(
  supabase: SupabaseClient,
  normalized: NormalizedWebhook
): Promise<BillingAccessRecord | null> {
  if (normalized.subscriptionId) {
    const { data } = await supabase
      .from("billing_access")
      .select("*")
      .eq("provider", "kiwify")
      .eq("provider_subscription_id", normalized.subscriptionId)
      .maybeSingle();
    if (data) return data as BillingAccessRecord;
  }

  if (normalized.orderId) {
    const { data } = await supabase
      .from("billing_access")
      .select("*")
      .eq("provider", "kiwify")
      .eq("provider_order_id", normalized.orderId)
      .maybeSingle();
    if (data) return data as BillingAccessRecord;
  }

  const { data } = await supabase
    .from("billing_access")
    .select("*")
    .eq("provider", "kiwify")
    .eq("email", normalized.email)
    .maybeSingle();
  return (data as BillingAccessRecord | null) || null;
}

async function createWebhookDedupMarker(supabase: SupabaseClient, eventName: string, payload: JsonRecord): Promise<boolean> {
  const eventKey = buildEventKey(eventName, payload);
  const { error } = await supabase.from("billing_webhook_events").insert({
    provider: "kiwify",
    event_name: eventName,
    event_key: eventKey,
    payload,
  });
  if (!error) return true;
  if (String(error.message || "").toLowerCase().includes("duplicate")) return false;
  throw error;
}

async function findAuthUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await supabase.from("user_directory").select("user_id").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as { user_id?: string } | null)?.user_id || null;
}

async function ensureInvitedUser(
  supabase: SupabaseClient,
  normalized: NormalizedWebhook,
  access: BillingAccessRecord | null
): Promise<{ authUserId: string | null; inviteSentAt: string | null }> {
  const existingAuthUserId = access?.auth_user_id || (await findAuthUserIdByEmail(supabase, normalized.email));
  if (existingAuthUserId) {
    return { authUserId: existingAuthUserId, inviteSentAt: access?.invite_sent_at || null };
  }

  const inviteSentAt = new Date().toISOString();
  const response = await supabase.auth.admin.inviteUserByEmail(normalized.email, {
    redirectTo: getAppBaseUrl(),
    data: {
      billing_provider: "kiwify",
      billing_email: normalized.email,
      buyer_name: normalized.customerName,
    },
  });
  if (response.error) throw response.error;
  return {
    authUserId: response.data.user?.id || null,
    inviteSentAt,
  };
}

async function upsertBillingAccess(
  supabase: SupabaseClient,
  normalized: NormalizedWebhook,
  status: BillingStatus,
  planTier: PlanTier,
  existing: BillingAccessRecord | null,
  authUserId: string | null,
  inviteSentAt: string | null
): Promise<BillingAccessRecord> {
  const periodEnd = resolvePeriodEnd(normalized.rawPayload, normalized.eventName, existing);
  const payload = {
    email: normalized.email,
    provider: "kiwify",
    plan_tier: planTier,
    billing_status: status,
    current_period_end: periodEnd,
    auth_user_id: authUserId || existing?.auth_user_id || null,
    business_id: existing?.business_id || null,
    provider_product_id: normalized.productId,
    provider_product_name: normalized.productName,
    provider_order_id: normalized.orderId,
    provider_subscription_id: normalized.subscriptionId,
    provider_customer_id: normalized.customerId,
    invite_sent_at: inviteSentAt || existing?.invite_sent_at || null,
    last_event: normalized.eventName,
    last_event_at: normalized.eventAt,
    raw_payload: normalized.rawPayload,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("billing_access")
    .upsert(payload, { onConflict: "email,provider" })
    .select("*")
    .single();
  if (error) throw error;
  return data as BillingAccessRecord;
}

function businessAccessShouldRemainActive(access: BillingAccessRecord): boolean {
  if (["active", "invited", "pendente", "past_due"].includes(access.billing_status)) return true;
  if (access.billing_status === "canceled") {
    const end = new Date(String(access.current_period_end || "")).getTime();
    return !Number.isNaN(end) && end >= Date.now();
  }
  return false;
}

async function syncLinkedBusiness(supabase: SupabaseClient, access: BillingAccessRecord): Promise<void> {
  let businessId = access.business_id || null;

  if (!businessId) {
    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_email", access.email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    businessId = (data as { id?: string } | null)?.id || null;
  }

  if (!businessId) return;

  const shouldRemainActive = businessAccessShouldRemainActive(access);
  const businessPayload: Record<string, unknown> = {
    plan_tier: access.plan_tier || "pro",
    plan_name: access.plan_tier === "starter" ? "Plano Starter" : "Plano Pro",
    next_billing_at: access.current_period_end,
    active: shouldRemainActive,
  };

  if (access.billing_status === "chargeback" || access.billing_status === "refunded") {
    businessPayload.billing_status = "blocked";
    businessPayload.blocked_reason = "Acesso desativado após reembolso ou chargeback confirmado na Kiwify.";
  } else if (access.billing_status === "canceled" && !shouldRemainActive) {
    businessPayload.billing_status = "canceled";
    businessPayload.blocked_reason = "Assinatura encerrada ao fim do ciclo contratado.";
  } else {
    businessPayload.billing_status = access.billing_status === "pendente" ? "pendente" : "active";
    businessPayload.blocked_reason = null;
  }

  const { error } = await supabase.from("businesses").update(businessPayload).eq("id", businessId);
  if (error) throw error;

  if (businessId !== access.business_id) {
    const { error: linkError } = await supabase.from("billing_access").update({ business_id: businessId }).eq("id", access.id);
    if (linkError) throw linkError;
  }
}

function resolveWebhookToken(req: VercelRequest, payload: JsonRecord): string {
  const headerValue =
    String(req.headers["x-kiwify-webhook-token"] || "") ||
    String(req.headers["x-webhook-token"] || "") ||
    String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (headerValue.trim()) return headerValue.trim();
  return firstString(payload, ["token", "webhook_token", "secret"]) || "";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, provider: "kiwify" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }

  const payload = parseJsonBody(req.body);
  const expectedWebhookToken = getEnv("KIWIFY_WEBHOOK_TOKEN") || getEnv("KIWIFY_WEBHOOK_SECRET");
  if (expectedWebhookToken) {
    const receivedToken = resolveWebhookToken(req, payload);
    if (receivedToken !== expectedWebhookToken) {
      res.status(401).json({ error: "Invalid webhook token" });
      return;
    }
  }

  const normalized = extractNormalizedWebhook(payload);
  if (!normalized) {
    res.status(400).json({ error: "Unable to parse Kiwify payload" });
    return;
  }

  const status = mapEventToBillingStatus(normalized.eventName);
  if (!status) {
    res.status(200).json({ ok: true, skipped: true, event: normalized.eventName });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const isNewEvent = await createWebhookDedupMarker(supabase, normalized.eventName, payload);
    if (!isNewEvent) {
      res.status(200).json({ ok: true, deduped: true, event: normalized.eventName });
      return;
    }

    const existing = await fetchExistingAccess(supabase, normalized);
    const planTier = resolvePlanTier(normalized.productId || existing?.provider_product_id || null);
    const inviteContext = await ensureInvitedUser(supabase, normalized, existing);
    const access = await upsertBillingAccess(
      supabase,
      normalized,
      status,
      planTier,
      existing,
      inviteContext.authUserId,
      inviteContext.inviteSentAt
    );
    await syncLinkedBusiness(supabase, access);

    res.status(200).json({
      ok: true,
      event: normalized.eventName,
      email: normalized.email,
      status,
      plan_tier: planTier,
      invited: Boolean(inviteContext.inviteSentAt && !existing?.invite_sent_at),
    });
  } catch (error) {
    console.error("Kiwify webhook error", error);
    res.status(500).json({
      error: getUnknownErrorMessage(error),
    });
  }
}
