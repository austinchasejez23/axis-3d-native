// Axis 3D Test only. This function has privileged service-key access ONLY at runtime.
// A caller must present a valid user JWT AND their CURRENT password.
// Never accept a user ID from the client when deciding what to delete.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_OR_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "axis-model-backups";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function api(path: string, init: RequestInit = {}, service = false) {
  const key = service ? SERVICE_KEY : PUBLISHABLE_OR_ANON_KEY;
  return fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: key,
      ...(service ? { Authorization: "Bearer " + key } : {}),
      ...(init.headers || {}),
    },
  });
}

function encodedObjectPath(name: string) {
  return name.split("/").map(encodeURIComponent).join("/");
}

async function removeOwnedObjects(userId: string) {
  // Only walk this authenticated user's directory, including nested folders.
  const dirs = [userId];
  let visited = 0;
  while (dirs.length) {
    const prefix = dirs.shift()!;
    if (++visited > 3000) throw new Error("Too many backup folders; contact support.");
    while (true) {
      const listing = await api("/storage/v1/object/list/" + BUCKET, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefix + "/", limit: 100, offset: 0 }),
      }, true);
      if (!listing.ok) throw new Error("Could not list private backups.");
      const entries: Array<{ id?: string | null; name: string }> = await listing.json();
      if (!entries.length) break;
      let removed = 0;
      for (const entry of entries) {
        if (entry.name === ".emptyFolderPlaceholder") continue;
        if (!entry.id) { dirs.push(prefix + "/" + entry.name); continue; }
        const path = prefix + "/" + entry.name;
        // Server-only key. Never use client authorization for storage cleanup.
        const response = await api("/storage/v1/object/" + BUCKET + "/" + encodedObjectPath(path),
          { method: "DELETE" }, true);
        if (!response.ok && response.status !== 404) throw new Error("Could not delete all private backups.");
        removed += 1;
      }
      // A folder-only page cannot be deleted here; process it and finish this prefix.
      if (!removed) break;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond(405, "Method not allowed.");
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE_OR_ANON_KEY) return respond(503, "Account service is not configured.");

  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, "Sign in first.");

  // Authenticated user's identity comes exclusively from GoTrue.
  const who = await api("/auth/v1/user", { headers: { Authorization: authorization } });
  if (!who.ok) return respond(401, "Session expired. Sign in again.");
  const user: { id?: string; email?: string } = await who.json();
  if (!user.id || !user.email) return respond(401, "Invalid account.");

  let body: { password?: string; confirm?: string };
  try { body = await req.json(); }
  catch { return respond(400, "Invalid request."); }
  if (body.confirm !== "DELETE" || typeof body.password !== "string" || !body.password) {
    return respond(400, "Enter your current password and type DELETE.");
  }

  // Strong reauthentication for this destructive operation.
  const reauth = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: body.password }),
  });
  if (!reauth.ok) return respond(403, "Current password was not accepted.");
  const credentials: { user?: { id?: string } } = await reauth.json();
  if (credentials.user?.id !== user.id) return respond(403, "Account verification failed.");

  try {
    await removeOwnedObjects(user.id);
  } catch {
    return respond(503, "Could not remove all cloud files; the account was preserved. Try again later.");
  }

  // Foreign keys cascade cleanly through test profiles, cloud metadata and entitlements.
  const deleted = await api("/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "DELETE",
  }, true);
  if (!deleted.ok) return respond(503, "Account removal could not finish. Contact support.");

  return respond(200, "Your test account and cloud data were deleted. Offline models remain on this device.");
});
