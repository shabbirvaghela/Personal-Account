import { FormEvent, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export function LoginPage() {
  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onGoogleCredential = useCallback(
    async (credential: string) => {
      setError(null);
      setBusy(true);
      try {
        await loginWithGoogle(credential);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
      } finally {
        setBusy(false);
      }
    },
    [loginWithGoogle, navigate]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      navigate("/");
    } catch (err) {
      setError(
        !navigator.onLine
          ? "You're offline — first login needs an internet connection. Please reconnect and try again."
          : err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Legal Ledger</h1>
        <p className="subtitle">Offline-first account &amp; dues tracker</p>
        <form onSubmit={onSubmit}>
          {mode === "register" && (
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
        <GoogleSignInButton onCredential={onGoogleCredential} />
      </div>
    </div>
  );
}
