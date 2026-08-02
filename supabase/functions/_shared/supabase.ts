import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function namedKey(jsonValue: string | undefined) {
  if (!jsonValue) return "";

  try {
    const keys = JSON.parse(jsonValue) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return jsonValue;
  }
}

export function createUserClient(authorization: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = namedKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"))
    || Deno.env.get("SUPABASE_ANON_KEY")
    || "";

  return createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = namedKey(Deno.env.get("SUPABASE_SECRET_KEYS"))
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
