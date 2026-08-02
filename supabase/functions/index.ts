import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      throw new Error("Sessão não encontrada");
    }

    const userClient = createUserClient(authorization);
    const { data: userData, error: userError } =
      await userClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error("Sessão inválida ou expirada");
    }

    const { data: roleData, error: roleError } = await userClient
      .from("app_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (roleError || roleData?.role !== "BILLING_ADMIN") {
      return new Response(JSON.stringify({ error: "Usuário não autorizado" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc(
      "deactivate_app_subscription",
    );
    if (error) throw error;

    return new Response(JSON.stringify({ subscription: data }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível desativar a mensalidade";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
