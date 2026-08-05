import { FormEvent, useState } from "react";
import {
  isAuthConfigured,
  resetPasswordForEmail,
  supabase,
} from "../services/supabase";
import { usePublicBrand } from "../../settings/services/publicBrand";

export function LoginPage() {
  const brand = usePublicBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery">("login");
  const [recoverySent, setRecoverySent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError("E-mail ou senha inválidos.");
    setLoading(false);
  };

  const sendRecovery = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      setRecoverySent(true);
    } catch {
      setError(
        "Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setMode("login");
    setRecoverySent(false);
    setError("");
  };

  return (
    <main className="login-page">
      <section className="login-card">
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

        {mode === "login" ? (
          <>
            <div className="login-heading">
              <p>ÁREA PROTEGIDA</p>
              <h1>Entre na sua conta</h1>
              <span>Use sua conta administrativa ou de cobrança.</span>
            </div>
            {!isAuthConfigured ? (
              <div className="login-warning">
                <strong>Configure a autenticação</strong>
                <span>
                  Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no
                  arquivo .env.
                </span>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                {error && <div className="login-error">{error}</div>}
                <button className="button primary" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </button>
                <button
                  type="button"
                  className="login-forgot-btn"
                  onClick={() => {
                    setMode("recovery");
                    setError("");
                  }}
                >
                  Esqueceu a senha?
                </button>
              </form>
            )}
            <small>
              Não existe cadastro público. A conta é criada somente pelo
              administrador.
            </small>
          </>
        ) : (
          <>
            <div className="login-heading">
              <p>RECUPERAR ACESSO</p>
              <h1>Redefinir senha</h1>
              <span>
                Informe o e-mail cadastrado e enviaremos um link de recuperação.
              </span>
            </div>
            {recoverySent ? (
              <div className="login-recovery-sent">
                <strong>E-mail enviado!</strong>
                <span>
                  Verifique sua caixa de entrada e siga o link para criar uma
                  nova senha. O link expira em 1 hora.
                </span>
              </div>
            ) : (
              <form onSubmit={sendRecovery}>
                <label>
                  E-mail cadastrado
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                {error && <div className="login-error">{error}</div>}
                <button className="button primary" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </button>
              </form>
            )}
            <button
              type="button"
              className="login-back-btn"
              onClick={backToLogin}
            >
              ← Voltar ao login
            </button>
          </>
        )}
      </section>
    </main>
  );
}
