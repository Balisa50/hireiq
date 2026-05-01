"use client";

/**
 * HireIQ Authentication Context
 * Provides company auth state to all dashboard pages.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { authAPI, companyAPI, clearStoredToken } from "./api";
import type { Company } from "./types";

interface AuthContextValue {
  company: Company | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, companyName: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadCompanyProfile = useCallback(async () => {
    if (!authAPI.isAuthenticated()) {
      setIsLoading(false);
      return;
    }
    // Retry up to 3 times, Render cold-starts can take a few seconds.
    // Only a 401 should log the user out (apiFetch handles that already).
    // Never clear the token here, network errors must not kill the session.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const profile = await companyAPI.getProfile();
        setCompany(profile);
        setIsLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        // apiFetch already redirected + cleared token on 401, stop retrying.
        if (!authAPI.isAuthenticated()) {
          setIsLoading(false);
          return;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    // All retries failed but token still exists, keep user logged in visually,
    // just leave company null. Dashboard will show an empty state rather than
    // bouncing to /login for a transient server error.
    console.warn("Profile load failed after 3 attempts:", lastErr);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadCompanyProfile();
  }, [loadCompanyProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authAPI.login(email, password);
      setCompany(response.company);
      router.push("/dashboard");
    },
    [router],
  );

  const signUp = useCallback(
    async (email: string, password: string, companyName: string) => {
      const response = await authAPI.signUp(email, password, companyName);
      setCompany(response.company);
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    setCompany(null);
    authAPI.logout();
    router.push("/login");
  }, [router]);

  const refreshProfile = useCallback(async () => {
    const profile = await companyAPI.getProfile();
    setCompany(profile);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        company,
        isLoading,
        isAuthenticated: !!company,
        login,
        signUp,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
