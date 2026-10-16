// Axis 3D TEST ONLY: read-only Google Play purchase verifier staging.
// Disabled without explicit server-side configuration. No Play purchase launch,
// receipt ledger write, acknowledgement, or Pro entitlement grant exists here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { inspectPlayPurchase } from "./playPurchaseRules.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PLAY_PACKAGE = "com.base6a5340f43f8fd031c5921680.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, proGranted: false, purchasesEnabled: false, ...extra }), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bytesFromPem(pem: string) {
  const value = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function encode64url(input: Uint8Array) {
  let raw = "";
  for (const c of input) raw += String.fromCharCode(c);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function googleAccessToken(account: { client_email: string; private_key: string }) {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", bytesFromPem(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = encode64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = encode64url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 1800,
  })));
  const unsigned = header + "." + claims;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + encode64url(new Uint8Array(signature));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Play API authentication failed.");
  const result: { access_token?: string } = await tokenResponse.json();
  if (!result.access_token) throw new Error("Play API returned no access token.");
  return result.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond(405, "Method not allowed.");

  // Authentication is required even when staging is disabled. Never accept a
  // client-submitted user ID, client Pro flag, or client purchase result.
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, "Sign in to Axis Test.");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return respond(503, "Test authentication is unavailable.");

  const identity = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
  }).catch(() => null);
  if (!identity?.ok) return respond(401, "The test account session is not valid.");
  const user: { id?: string } = await identity.json().catch(() => ({}));
  if (!user.id) return respond(401, "The test account session is not valid.");

  const enabled = Deno.env.get("AXIS_TEST_PLAY_VERIFY_ENABLED") === "true";
  if (!enabled) return respond(503, "Play purchase verification is not configured for this test app.");

  const catalog = Deno.env.get("AXIS_TEST_PLAY_PRODUCTS") || "";
  const accountJSON = Deno.env.get("AXIS_TEST_PLAY_SERVICE_ACCOUNT_JSON") || "";
  if (!catalog.trim() || !accountJSON.trim()) return respond(503, "Play verification credentials or product catalog are missing.");

  const len = Number(req.headers.get("content-length") || "0");
  if (len > 8192) return respond(413, "Request too large.");
  let input: { productId?: string; productType?: string; purchaseToken?: string };
  try {
    const payload = await req.text();
    if (payload.length > 8192) return respond(413, "Request too large.");
    input = JSON.parse(payload);
  } catch { return respond(400, "Invalid request."); }

  const { productId, productType, purchaseToken } = input || {};
  if (typeof productId !== "string" || !/^[a-zA-Z0-9_.-]{1,150}$/.test(productId)
      || !["subs", "inapp"].includes(String(productType))
      || typeof purchaseToken !== "string" || !/^[a-zA-Z0-9._:-]{16,2048}$/.test(purchaseToken)) {
    return respond(400, "Invalid purchase fields.");
  }

  // Allowlist only exact tuples of type and Play Console product ID.
  const allowed = new Set(catalog.split(",").map(value => value.trim()).filter(Boolean));
  if (!allowed.has(productType + ":" + productId)) return respond(400, "Unknown test product.");

  try {
    const account: { client_email?: string; private_key?: string; type?: string } = JSON.parse(accountJSON);
    if (account.type !== "service_account" || !account.client_email || !account.private_key) {
      return respond(503, "Play service account is not configured.");
    }
    const bearer = await googleAccessToken({ client_email: account.client_email, private_key: account.private_key });
    const prefix = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + encodeURIComponent(PLAY_PACKAGE) + "/purchases/";
    const lookup = productType === "subs"
      ? prefix + "subscriptionsv2/tokens/" + encodeURIComponent(purchaseToken)
      : prefix + "products/" + encodeURIComponent(productId) + "/tokens/" + encodeURIComponent(purchaseToken);
    const response = await fetch(lookup, { headers: { Authorization: "Bearer " + bearer } });
    if (!response.ok) return respond(502, "Google Play could not verify that purchase.");
    const googlePurchase = await response.json();
    const check = inspectPlayPurchase(productType, productId, googlePurchase);

    // IMPORTANT: even an apparently good Play response MUST still be bound to
    // exactly one authenticated owner, checked against the private receipt
    // ledger, acknowledged, reconciled for refunds and stored server-side
    // BEFORE it can confer Pro. Those steps are NOT implemented here.
    // We report only a generic read-only result, never tokens or account data.
    return respond(200, "Read-only Google Play check completed.", {
      playStatusEligibleForFurtherChecks: check.accepted,
      verificationOnly: true,
    });
  } catch {
    return respond(503, "Google Play verification is unavailable.");
  }
});
