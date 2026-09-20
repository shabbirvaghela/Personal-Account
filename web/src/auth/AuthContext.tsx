import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, clearToken } from "../api/client";
import { syncEngine } from "../sync/syncEngine";
import { seedOfficeLedger } from "../sync/mutations";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = "ledger_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem("ledger_token");
    if (cached && token) {
      setUser(JSON.parse(cached));
      syncEngine.start();
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setToken(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    syncEngine.start();
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.register(name, email, password);
    setToken(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    syncEngine.start();
    await seedOfficeLedger();
  }

  async function loginWithGoogle(credential: string) {
    const res = await api.loginWithGoogle(credential);
    setToken(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    syncEngine.start();
    if (res.isNewUser) await seedOfficeLedger();
  }

  function logout() {
    clearToken();
    localStorage.removeItem(USER_KEY);
    syncEngine.stop();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
