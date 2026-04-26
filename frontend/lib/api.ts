/**
 * HireIQ API client.
 * All communication with the FastAPI backend goes through this module.
 * Every method handles errors, provides typed responses, and never exposes
 * raw error codes to the rest of the application.
 */

import type {
  AuthResponse,
  Company,
  DashboardStats,
  GeneratedQuestion,
  Interview,
  JobPublicInfo,
  JobSummary,
  Job,
  CandidateSummary,
  TranscriptEntry,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_TIMEOUT_MS = 15_000;

// ── Internal helpers ──────────────────────────────────────────────────────────

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hireiq_token");
}

function storeAccessToken(token: string): void {
  localStorage.setItem("hireiq_token", token);
}

export function clearStoredToken(): void {
  localStorage.removeItem("hireiq_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requireAuth) {
    const token = getStoredAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = "Something went wrong. Please try again.";
      try {
        const errorBody = await response.json() as { error?: string; detail?: string | Array<{ msg: string }> };
        if (typeof errorBody.detail === "string") {
          errorMessage = errorBody.detail;
        } else if (Array.isArray(errorBody.detail) && errorBody.detail.length > 0) {
          // FastAPI 422 validation errors return an array
          errorMessage = errorBody.detail[0].msg ?? errorMessage;
        } else if (typeof errorBody.error === "string") {
          errorMessage = errorBody.error;
        }
      } catch {
        // JSON parse failed — use default message
      }

      if (response.status === 401) {
        clearStoredToken();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "The request timed out. Please check your connection and try again.",
      );
    }

    throw error;
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authAPI = {
  async signUp(email: string, password: string, companyName: string): Promise<AuthResponse> {
    const response = await apiFetch<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, company_name: companyName }),
    }, false);

    if (response.access_token) {
      storeAccessToken(response.access_token);
      return response;
    }

    // Supabase returned no session (email confirmation setting).
    // Immediately sign in to obtain a real token.
    const loginResponse = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
    storeAccessToken(loginResponse.access_token);
    return loginResponse;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
    storeAccessToken(response.access_token);
    return response;
  },

  logout(): void {
    clearStoredToken();
  },

  isAuthenticated(): boolean {
    return !!getStoredAccessToken();
  },

  getToken(): string | null {
    return getStoredAccessToken();
  },
};

// ── Company API ───────────────────────────────────────────────────────────────

export const companyAPI = {
  async getProfile(): Promise<Company> {
    return apiFetch<Company>("/api/companies/me");
  },

  async updateProfile(updates: Partial<Company>): Promise<Company> {
    return apiFetch<Company>("/api/companies/me", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  async getDashboardStats(): Promise<DashboardStats> {
    return apiFetch<DashboardStats>("/api/companies/me/dashboard-stats");
  },
};

// ── Jobs API ──────────────────────────────────────────────────────────────────

export const jobsAPI = {
  async listJobs(): Promise<JobSummary[]> {
    return apiFetch<JobSummary[]>("/api/jobs/");
  },

  async getJob(jobId: string): Promise<Job> {
    return apiFetch<Job>(`/api/jobs/${jobId}`);
  },

  async generateQuestions(jobData: {
    title: string;
    department: string;
    location: string;
    employment_type: string;
    job_description: string;
    question_count: number;
    focus_areas: string[];
  }): Promise<{ questions: GeneratedQuestion[] }> {
    return apiFetch<{ questions: GeneratedQuestion[] }>("/api/jobs/generate-questions", {
      method: "POST",
      body: JSON.stringify(jobData),
    });
  },

  async publishJob(jobData: {
    title: string;
    department: string;
    location: string;
    employment_type: string;
    job_description: string;
    question_count: number;
    focus_areas: string[];
    questions: GeneratedQuestion[];
  }): Promise<Job> {
    return apiFetch<Job>("/api/jobs/", {
      method: "POST",
      body: JSON.stringify(jobData),
    });
  },

  async closeJob(jobId: string): Promise<void> {
    return apiFetch<void>(`/api/jobs/${jobId}/close`, { method: "PATCH" });
  },

  async updateJobStatus(jobId: string, status: "active" | "closed"): Promise<void> {
    return apiFetch<void>(`/api/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  buildInterviewLink(linkToken: string): string {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
    return `${base}/interview/${linkToken}`;
  },
};

// ── Candidates / Interviews API (company side) ────────────────────────────────

export const candidatesAPI = {
  async listCandidates(filters?: {
    job_id?: string;
    status?: string;
    min_score?: number;
    max_score?: number;
  }): Promise<CandidateSummary[]> {
    const params = new URLSearchParams();
    if (filters?.job_id) params.set("job_id", filters.job_id);
    if (filters?.status) params.set("status_filter", filters.status);
    if (filters?.min_score !== undefined) params.set("min_score", String(filters.min_score));
    if (filters?.max_score !== undefined) params.set("max_score", String(filters.max_score));
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<CandidateSummary[]>(`/api/interviews/${query}`);
  },

  async getInterview(interviewId: string): Promise<Interview> {
    return apiFetch<Interview>(`/api/interviews/${interviewId}`);
  },

  async updateCandidateStatus(
    interviewId: string,
    newStatus: string,
  ): Promise<void> {
    return apiFetch<void>(`/api/interviews/${interviewId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
  },

  getPdfReportUrl(interviewId: string): string {
    const token = getStoredAccessToken() ?? "";
    return `${API_BASE_URL}/api/interviews/${interviewId}/report/pdf?token=${token}`;
  },
};

// ── Public interview API (candidate side — no auth) ───────────────────────────

export const interviewAPI = {
  async getJobInfo(linkToken: string): Promise<JobPublicInfo> {
    return apiFetch<JobPublicInfo>(
      `/api/interviews/public/job/${linkToken}`,
      {},
      false,
    );
  },

  async startInterview(
    linkToken: string,
    candidateName: string,
    candidateEmail: string,
  ): Promise<{ interview_id: string; transcript: TranscriptEntry[]; resumed: boolean }> {
    return apiFetch<{ interview_id: string; transcript: TranscriptEntry[]; resumed: boolean }>(
      `/api/interviews/public/start?link_token=${linkToken}`,
      {
        method: "POST",
        body: JSON.stringify({
          candidate_name: candidateName,
          candidate_email: candidateEmail,
        }),
      },
      false,
    );
  },

  async saveAnswer(
    interviewId: string,
    questionIndex: number,
    question: string,
    answer: string,
  ): Promise<void> {
    return apiFetch<void>(
      "/api/interviews/public/save-answer",
      {
        method: "POST",
        body: JSON.stringify({
          interview_id: interviewId,
          question_index: questionIndex,
          question,
          answer,
        }),
      },
      false,
    );
  },

  async getNextQuestion(
    interviewId: string,
    jobId: string,
    transcript: TranscriptEntry[],
    lastAnswer: string,
  ): Promise<string> {
    const response = await apiFetch<{ question: string }>(
      "/api/interviews/public/next-question",
      {
        method: "POST",
        body: JSON.stringify({
          interview_id: interviewId,
          job_id: jobId,
          transcript,
          last_answer: lastAnswer,
        }),
      },
      false,
    );
    return response.question;
  },

  async submitInterview(
    interviewId: string,
    transcript: TranscriptEntry[],
  ): Promise<void> {
    return apiFetch<void>(
      "/api/interviews/public/submit",
      {
        method: "POST",
        body: JSON.stringify({ interview_id: interviewId, transcript }),
      },
      false,
    );
  },
};

// ── Health check ──────────────────────────────────────────────────────────────

export async function pingBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
