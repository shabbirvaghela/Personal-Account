export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function getToken(): string | null {
  return localStorage.getItem("ledger_token");
}

export function setToken(token: string) {
  localStorage.setItem("ledger_token", token);
}

export function clearToken() {
  localStorage.removeItem("ledger_token");
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: { id: string; name: string; email: string } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; name: string; email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  loginWithGoogle: (credential: string) =>
    request<{ token: string; user: { id: string; name: string; email: string }; isNewUser: boolean }>(
      "/auth/google",
      { method: "POST", body: JSON.stringify({ credential }) }
    ),
  push: (ops: unknown[]) =>
    request<{ results: Record<string, { status: string; version?: number; reason?: string }> }>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ ops }),
    }),
  pull: (since: number) =>
    request<{ changes: { clients: any[]; works: any[]; transactions: any[] }; cursor: number }>(
      `/sync/pull?since=${since}`
    ),
  health: () => request<{ ok: boolean }>("/health"),
};
