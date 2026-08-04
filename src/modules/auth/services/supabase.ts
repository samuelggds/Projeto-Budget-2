import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const isAuthConfigured = Boolean(url && publishableKey);

export const supabase = createClient(
  url || "https://configuracao-ausente.supabase.co",
  publishableKey || "configuracao-ausente",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export async function updateRecoveredPassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  return data.user;
}

async function confirmCurrentPassword(currentPassword: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (userError || !email)
    throw new Error("Não foi possível identificar a conta atual");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (error) throw new Error("A senha atual está incorreta");
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string,
) {
  await confirmCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function changeAccountEmail(
  currentPassword: string,
  newEmail: string,
) {
  await confirmCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser(
    { email: newEmail.trim().toLowerCase() },
    { emailRedirectTo: `${window.location.origin}/` },
  );
  if (error) throw new Error(error.message);
}

export async function listFuncionarios(): Promise<{
  users: { userId: string; email: string }[];
}> {
  const { data, error } = await supabase.functions.invoke(
    "admin-manage-users",
    {
      body: { action: "list" },
    },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { users: { userId: string; email: string }[] };
}

export async function updateFuncionarioAuth(
  userId: string,
  newEmail?: string,
  newPassword?: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    "admin-manage-users",
    {
      body: {
        action: "update",
        userId,
        newEmail: newEmail ?? "",
        newPassword: newPassword ?? "",
      },
    },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}
