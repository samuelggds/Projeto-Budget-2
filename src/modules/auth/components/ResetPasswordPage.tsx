import { useMemo, useState } from "react";
import { PasswordInput } from "../../shared/components/PasswordInput";
import { usePublicBrand } from "../../settings/services/publicBrand";
import { supabase, updateRecoveredPassword } from "../services/supabase";

export function ResetPasswordPage({ onComplete }: { onComplete: () => void }) {
  const brand = usePublicBrand();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const rules = useMemo(
    () => ({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    }),
    [password],
  );
  const valid = Object.values(rules).every(Boolean);
  const matches = confirmation.length > 0 && confirmation === password;

  const save = async () => {
    if (!valid || !matches)
      return setError("Confira os requisitos e a confirmação da nova senha.");
    setLoading(true);
    setError("");
    try {
      await updateRecoveredPassword(password);
      await supabase.auth.signOut({ scope: "local" });
      window.history.replaceState({}, document.title, window.location.pathname);
      onComplete();
    } catch (caught) {
      setError(
        (caught as Error).message.includes("session")
          ? "O link expirou ou já foi utilizado. Solicite uma nova recuperação."
          : (caught as Error).message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card reset-password-card">
        <div className="login-brand">
          <img
            src={brand.logoDataUrl || "/logo-placeholder.svg"}
            alt={`Logo de ${brand.companyName}`}
          />
          <div>
            <strong>{brand.appName}</strong>
            <span>{brand.companyName}</span>
          </div>
        </div>
        <div className="login-heading">
          <p>RECUPERAÇÃO DE ACESSO</p>
          <h1>Cadastre uma nova senha</h1>
          <span>Crie uma senha segura para voltar ao painel.</span>
        </div>
        <div className="reset-password-form">
          <label>
            Nova senha
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <ul className="password-requirements" aria-live="polite">
            <li
              className={password ? (rules.length ? "valid" : "invalid") : ""}
            >
              Pelo menos 8 caracteres
            </li>
            <li
              className={
                password ? (rules.uppercase ? "valid" : "invalid") : ""
              }
            >
              Uma letra maiúscula
            </li>
            <li
              className={
                password ? (rules.lowercase ? "valid" : "invalid") : ""
              }
            >
              Uma letra minúscula
            </li>
            <li
              className={password ? (rules.number ? "valid" : "invalid") : ""}
            >
              Um número
            </li>
            <li
              className={password ? (rules.special ? "valid" : "invalid") : ""}
            >
              Um caractere especial, como @, # ou !
            </li>
          </ul>
          <label>
            Confirmar nova senha
            <PasswordInput
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {confirmation && (
            <span
              className={`password-confirmation ${matches ? "valid" : "invalid"}`}
            >
              {matches ? "As senhas são iguais." : "As senhas não são iguais."}
            </span>
          )}
          {error && <div className="login-error">{error}</div>}
          <button
            className="button primary"
            disabled={loading || !valid || !matches}
            onClick={() => void save()}
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      </section>
    </main>
  );
}
