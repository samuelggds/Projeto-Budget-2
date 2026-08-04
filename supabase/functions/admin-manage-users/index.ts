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
    if (!authorization.startsWith("Bearer "))
      throw new Error("Sessão não encontrada");

    const userClient = createUserClient(authorization);
    const { data: userData, error: userError } =
      await userClient.auth.getUser();
    if (userError || !userData.user)
      throw new Error("Sessão inválida ou expirada");

    const { data: roleData, error: roleError } = await userClient
      .from("app_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (roleError || roleData?.role !== "ADMIN") {
      return new Response(
        JSON.stringify({ error: "Acesso negado: apenas administradores" }),
        {
          status: 403,
          headers: jsonHeaders,
        },
      );
    }

    const adminClient = createAdminClient();
    const body = (await request.json()) as Record<string, string>;

    if (body.action === "list") {
      const { data: roles, error: rolesError } = await adminClient
        .from("app_user_roles")
        .select("user_id")
        .eq("role", "FUNCIONARIO");
      if (rolesError) throw rolesError;

      const users = await Promise.all(
        (roles ?? []).map(async ({ user_id }: { user_id: string }) => {
          const { data } = await adminClient.auth.admin.getUserById(user_id);
          return { userId: user_id, email: data.user?.email ?? "" };
        }),
      );
      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    if (body.action === "update") {
      const { userId, newEmail, newPassword } = body;
      if (!userId) throw new Error("userId é obrigatório");

      const { data: targetRole } = await adminClient
        .from("app_user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (targetRole?.role !== "FUNCIONARIO")
        throw new Error("Usuário não é um funcionário");

      const updates: { email?: string; password?: string } = {};
      if (newEmail) updates.email = newEmail.trim().toLowerCase();
      if (newPassword) updates.password = newPassword;
      if (Object.keys(updates).length === 0)
        throw new Error("Nada para atualizar");

      const { error: updateError } =
        await adminClient.auth.admin.updateUserById(userId, updates);
      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ message: "Dados atualizados com sucesso" }),
        {
          status: 200,
          headers: jsonHeaders,
        },
      );
    }

    throw new Error("Ação inválida");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
