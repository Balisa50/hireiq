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
import { authAPI, companyAPI } from "./api";
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
    try {
      const profile = await companyAPI.getProfile();
      setCompany(profile);
    } catch {
      // Token is invalid or expired — clear it silently.
      // The dashboard layout's useEffect will redirect to /login.
      clearStoredToken();
      setCompany(null);
    } finally {
      setIsLoading(false);
    }
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
