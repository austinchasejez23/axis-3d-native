// Google Play purchases for AXIS Pro.
// The app sends a purchase token; this function asks Google whether it is
// real, acknowledges it, binds it to the signed-in account and updates that
// account's Pro entitlement. The app never decides Pro by itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PACKAGE = "com.base6a5340f43f8fd031c5921680.app";
const SUBSCRIPTION = "axis_pro";
const LIFETIME = "axis_pro_lifetime";
const PRODUCTS = new Set(["subs:" + SUBSCRIPTION, "inapp:" + LIFETIME]);
const PLAY = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + PACKAGE + "/purchases/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Service-role database access (server only).
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error("Database request failed (" + response.status + "): " + (await response.text()).slice(0, 200));
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function base64url(bytes: Uint8Array) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

let cachedToken: { value: string; expires: number } | null = null;
async function googleToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const accountText = await db("rpc/axis_play_service_account", { method: "POST", body: "{}" });
  const account = JSON.parse(accountText);
  const pem = String(account.private_key).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + base64url(new Uint8Array(signature)),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error("Google sign-in for purchase checks failed.");
  cachedToken = { value: result.access_token, expires: Date.now() + (Number(result.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function play(path: string, init: RequestInit = {}) {
  const response = await fetch(PLAY + path, {
    ...init,
    headers: { Authorization: "Bearer " + await googleToken(), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : {} };
}

type Check = { state: string; expiresAt: string | null; needsAck: boolean; accountId: string | null; basePlanId: string | null };

// Turn Google's answer into one state the database understands.
function evaluate(type: string, productId: string, g: any): Check {
  if (type === "subs") {
    const items = (Array.isArray(g.lineItems) ? g.lineItems : []).filter((i: any) => i?.productId === productId);
    const expiry = Math.max(0, ...items.map((i: any) => Date.parse(i.expiryTime)).filter(Number.isFinite));
    const expiresAt = expiry ? new Date(expiry).toISOString() : null;
    const s = g.subscriptionState;
    let state = "invalid";
    if (!items.length) state = "invalid";
    else if (s === "SUBSCRIPTION_STATE_ACTIVE" || s === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") state = "purchased";
    // Canceled keeps access until the paid period ends.
    else if (s === "SUBSCRIPTION_STATE_CANCELED") state = expiry > Date.now() ? "purchased" : "expired";
    else if (s === "SUBSCRIPTION_STATE_PENDING") state = "pending";
    else if (s === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") state = "canceled";
    else if (s === "SUBSCRIPTION_STATE_ON_HOLD" || s === "SUBSCRIPTION_STATE_PAUSED" || s === "SUBSCRIPTION_STATE_EXPIRED") state = "expired";
    return {
      state, expiresAt,
      needsAck: g.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
      accountId: g.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      basePlanId: items[0]?.offerDetails?.basePlanId ?? null,
    };
  }
  const state = g.purchaseState === 0 ? "purchased" : g.purchaseState === 2 ? "pending" : "revoked";
  return {
    state, expiresAt: null,
    needsAck: g.purchaseState === 0 && g.acknowledgementState === 0,
    accountId: g.obfuscatedExternalAccountId ?? null,
    basePlanId: null,
  };
}

async function lookup(type: string, productId: string, token: string) {
  const path = type === "subs"
    ? "subscriptionsv2/tokens/" + encodeURIComponent(token)
    : "products/" + encodeURIComponent(productId) + "/tokens/" + encodeURIComponent(token);
  return play(path);
}

async function acknowledge(type: string, productId: string, token: string) {
  const path = (type === "subs" ? "subscriptions/" : "products/") + encodeURIComponent(productId) +
    "/tokens/" + encodeURIComponent(token) + ":acknowledge";
  const result = await play(path, { method: "POST", body: "{}" });
  return result.ok;
}

// Rebuild the account's Pro access from every purchase stored for it.
async function recompute(userId: string) {
  const receipts = await db("axis_google_play_receipts?select=product_id,product_type,purchase_state,expires_at,base_plan_id&user_id=eq." + userId);
  const now = Date.now();
  const live = (receipts || []).filter((r: any) => r.purchase_state === "purchased" &&
    (r.product_type === "inapp" || (r.expires_at && Date.parse(r.expires_at) > now)));
  const lifetime = live.find((r: any) => r.product_id === LIFETIME);
  const subs = live.filter((r: any) => r.product_type === "subs").sort((a: any, b: any) => Date.parse(b.expires_at) - Date.parse(a.expires_at));
  const best = lifetime || subs[0];
  const existing = await db("axis_pro_entitlements?select=source&user_id=eq." + userId);
  if (existing?.[0] && existing[0].source !== "google_play" && !best) {
    // Pro from another source (manual) is left alone.
    return { isPro: true, plan: existing[0].source, validUntil: null };
  }
  const row = best
    ? { user_id: userId, plan: "pro", status: "active", source: "google_play", verified_at: new Date().toISOString(),
        valid_until: lifetime ? null : best.expires_at,
        external_reference: lifetime ? LIFETIME : SUBSCRIPTION + (best.base_plan_id ? ":" + best.base_plan_id : ""),
        updated_at: new Date().toISOString() }
    : { user_id: userId, plan: "pro", status: "expired", source: "google_play", verified_at: new Date().toISOString(),
        valid_until: null, external_reference: null, updated_at: new Date().toISOString() };
  if (best || existing?.[0]) {
    await db("axis_pro_entitlements?on_conflict=user_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row),
    });
  }
  return { isPro: !!best, plan: best ? row.external_reference : null, validUntil: best ? row.valid_until : null };
}

async function record(userId: string, type: string, productId: string, token: string) {
  const tokenHash = await sha256(token);
  const owner = await db("axis_google_play_receipts?select=user_id&token_sha256=eq." + tokenHash);
  if (owner?.[0] && owner[0].user_id !== userId) {
    return { error: "This purchase belongs to a different AXIS account.", status: 409 };
  }
  const result = await lookup(type, productId, token);
  if (!result.ok) return { error: "Google Play could not confirm this purchase.", status: 502 };
  const check = evaluate(type, productId, result.body);
  const expectedAccount = await sha256(userId);
  if (check.accountId && check.accountId !== expectedAccount) {
    return { error: "This purchase was made for a different AXIS account.", status: 409 };
  }
  let acknowledged = !check.needsAck;
  if (check.state === "purchased" && check.needsAck) acknowledged = await acknowledge(type, productId, token);
  await db("axis_google_play_receipts?on_conflict=token_sha256", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      token_sha256: tokenHash, user_id: userId, product_id: productId, product_type: type,
      purchase_state: check.state, verified_package_name: PACKAGE, expires_at: check.expiresAt,
      acknowledged, purchase_token: token, base_plan_id: check.basePlanId,
      verified_at: new Date().toISOString(), last_checked_at: new Date().toISOString(),
    }),
  });
  return { state: check.state };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { message: "Method not allowed." });
  const authorization = req.headers.get("authorization") || "";
  const identity = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: authorization, apikey: ANON_KEY },
  }).catch(() => null);
  const user = identity?.ok ? await identity.json().catch(() => ({})) : {};
  if (!user?.id) return reply(401, { message: "Sign in to your AXIS account first." });

  let input: any = {};
  try {
    const text = await req.text();
    if (text.length > 8192) return reply(413, { message: "Request too large." });
    input = text ? JSON.parse(text) : {};
  } catch { return reply(400, { message: "Invalid request." }); }

  try {
    if (input.action === "verify") {
      const purchases = Array.isArray(input.purchases) ? input.purchases.slice(0, 10) : [];
      const results = [];
      for (const p of purchases) {
        const type = String(p?.productType), productId = String(p?.productId), token = String(p?.purchaseToken || "");
        if (!PRODUCTS.has(type + ":" + productId) || !/^[A-Za-z0-9._:-]{16,2048}$/.test(token)) {
          results.push({ productId, error: "Unknown product." });
          continue;
        }
        results.push({ productId, ...(await record(user.id, type, productId, token)) });
      }
      const access = await recompute(user.id);
      return reply(200, { ...access, results });
    }
    if (input.action === "refresh") {
      // Re-check every stored purchase with Google, so refunds, cancellations
      // and renewals made outside the app are reflected.
      const stored = await db("axis_google_play_receipts?select=product_id,product_type,purchase_token&user_id=eq." + user.id);
      for (const r of stored || []) {
        if (r.purchase_token) await record(user.id, r.product_type, r.product_id, r.purchase_token);
      }
      return reply(200, await recompute(user.id));
    }
    if (input.action === "accountId") {
      return reply(200, { accountId: await sha256(user.id) });
    }
    return reply(400, { message: "Unknown action." });
  } catch (error) {
    console.error(error);
    return reply(503, { message: "Purchase checks are unavailable right now." });
  }
});
