/**
 * HireIQ API client.
 * All communication with the FastAPI backend goes through this module.
 * Every method handles errors, provides typed responses, and never exposes
 * raw error codes to the rest of the application.
 */

import type {
  AuthResponse,
  CandidateRequirement,
  Company,
  DashboardStats,
  GeneratedQuestion,
  Interview,
  JobPublicInfo,
  JobSummary,
  Job,
  CandidateSummary,
  SubmittedFile,
  TranscriptEntry,
} from "./types";

const API_BASE_URL  = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_TIMEOUT_MS = 60_000; // Render free tier needs up to 50s to cold-start

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
  const timeoutId  = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requireAuth) {
    const token = getStoredAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
        const errorBody = await response.json() as {
          error?: string;
          detail?: string | Array<{ msg: string }>;
        };
        if (typeof errorBody.detail === "string") {
          errorMessage = errorBody.detail;
        } else if (Array.isArray(errorBody.detail) && errorBody.detail.length > 0) {
          errorMessage = errorBody.detail[0].msg ?? errorMessage;
        } else if (typeof errorBody.error === "string") {
          errorMessage = errorBody.error;
        }
      } catch { /* JSON parse failed — use default */ }

      // Only redirect on 401 for authenticated requests — not for login/signup
      if (response.status === 401 && requireAuth) {
        clearStoredToken();
        if (typeof window !== "undefined") window.location.href = "/login";
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The request timed out. Please check your connection and try again.");
    }
    throw error;
  }
}

/**
 * Upload a file via multipart form — does NOT set Content-Type so the browser
 * can inject the correct multipart boundary automatically.
 */
async function apiUploadFile<T>(
  path: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    // No Content-Type header — XHR sets it with the boundary

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve(undefined as T); }
      } else {
        let msg = "Upload failed. Please try again.";
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          if (typeof body.detail === "string") msg = body.detail;
        } catch { /* noop */ }
        reject(new Error(msg));
      }
    };

    xhr.onerror  = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.timeout  = API_TIMEOUT_MS;

    xhr.send(formData);
  });
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

    // Supabase returned no session — immediately sign in to obtain a real token.
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

  logout(): void { clearStoredToken(); },

  isAuthenticated(): boolean { return !!getStoredAccessToken(); },

  getToken(): string | null { return getStoredAccessToken(); },
};

// ── Company API ───────────────────────────────────────────────────────────────

export const companyAPI = {
  async getProfile(): Promise<Company> {
    return apiFetch<Company>("/api/companies/me");
  },

  async updateProfile(updates: Partial<Company> & { logo_url?: string | null }): Promise<Company> {
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
    candidate_requirements?: CandidateRequirement[];
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
    candidate_requirements?: CandidateRequirement[];
    experience_level?: string;
    work_arrangement?: string;
    openings?: number;
    skills?: string[];
    salary_min?: number;
    salary_max?: number;
    salary_currency?: string;
    salary_period?: string;
    salary_disclosed?: boolean;
    application_deadline?: string;
    application_limit?: number;
    is_paused?: boolean;
  }): Promise<Job> {
    return apiFetch<Job>("/api/jobs/", {
      method: "POST",
      body: JSON.stringify(jobData),
    });
  },

  async closeJob(jobId: string): Promise<void> {
    return apiFetch<void>(`/api/jobs/${jobId}/close`, { method: "PATCH" });
  },

  async deleteJob(jobId: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/jobs/${jobId}`, { method: "DELETE" });
  },

  async updateJobControls(jobId: string, controls: {
    application_deadline?: string | null;
    application_limit?: number;
    is_paused?: boolean;
  }): Promise<void> {
    return apiFetch<void>(`/api/jobs/${jobId}/controls`, {
      method: "PATCH",
      body: JSON.stringify(controls),
    });
  },

  async updateJobStatus(jobId: string, newStatus: "active" | "closed"): Promise<void> {
    return apiFetch<void>(`/api/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
  },

  buildInterviewLink(linkToken: string): string {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
    return `${base}/apply/${linkToken}`;
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
    if (filters?.job_id)                     params.set("job_id",        filters.job_id);
    if (filters?.status)                     params.set("status_filter", filters.status);
    if (filters?.min_score !== undefined)    params.set("min_score",     String(filters.min_score));
    if (filters?.max_score !== undefined)    params.set("max_score",     String(filters.max_score));
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<CandidateSummary[]>(`/api/interviews/${query}`);
  },

  async getInterview(interviewId: string): Promise<Interview> {
    return apiFetch<Interview>(`/api/interviews/${interviewId}`);
  },

  async updateCandidateStatus(interviewId: string, newStatus: string): Promise<void> {
    return apiFetch<void>(`/api/interviews/${interviewId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
  },

  async deleteCandidate(interviewId: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/interviews/${interviewId}`, {
      method: "DELETE",
    });
  },

  async downloadPdfReport(interviewId: string, candidateName: string): Promise<void> {
    const token = getStoredAccessToken() ?? "";
    const response = await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/report/pdf`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Failed to generate PDF report.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HireIQ_Report_${candidateName.replace(/\s+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async generateEmail(
    interviewId: string,
    emailStatus: string,
    tone: string,
  ): Promise<{ subject: string; body: string }> {
    return apiFetch<{ subject: string; body: string }>(
      `/api/interviews/${interviewId}/email/generate`,
      { method: "POST", body: JSON.stringify({ status: emailStatus, tone }) },
    );
  },

  async sendEmail(
    interviewId: string,
    subject: string,
    body: string,
  ): Promise<{ sent: boolean; message: string }> {
    return apiFetch<{ sent: boolean; message: string }>(
      `/api/interviews/${interviewId}/email/send`,
      { method: "POST", body: JSON.stringify({ subject, body }) },
    );
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
  ): Promise<{
    interview_id: string;
    transcript: TranscriptEntry[];
    submitted_files: SubmittedFile[];
    submitted_links: Array<{ requirement_id: string; label: string; url: string; submitted_at: string }>;
    resumed: boolean;
  }> {
    return apiFetch(
      `/api/interviews/public/start?link_token=${linkToken}`,
      {
        method: "POST",
        body: JSON.stringify({ candidate_name: candidateName, candidate_email: candidateEmail }),
      },
      false,
    );
  },

  /**
   * Upload a file on behalf of the candidate.
   * Uses XHR so we get real upload progress events.
   */
  async uploadFile(
    interviewId: string,
    requirementId: string,
    requirementLabel: string,
    presetKey: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ requirement_id: string; file_name: string; file_size: number; file_path: string }> {
    const fd = new FormData();
    fd.append("interview_id",      interviewId);
    fd.append("requirement_id",    requirementId);
    fd.append("requirement_label", requirementLabel);
    fd.append("preset_key",        presetKey);
    fd.append("file",              file, file.name);
    return apiUploadFile("/api/interviews/public/upload-file", fd, onProgress);
  },

  async submitLink(
    interviewId: string,
    requirementId: string,
    requirementLabel: string,
    url: string,
  ): Promise<void> {
    return apiFetch<void>(
      "/api/interviews/public/submit-link",
      {
        method: "POST",
        body: JSON.stringify({
          interview_id:      interviewId,
          requirement_id:    requirementId,
          requirement_label: requirementLabel,
          url,
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
          interview_id:   interviewId,
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
          job_id:       jobId,
          transcript,
          last_answer:  lastAnswer,
        }),
      },
      false,
    );
    return response.question;
  },

  async submitInterview(interviewId: string, transcript: TranscriptEntry[]): Promise<void> {
    return apiFetch<void>(
      "/api/interviews/public/submit",
      {
        method: "POST",
        body: JSON.stringify({ interview_id: interviewId, transcript }),
      },
      false,
    );
  },

  /**
   * Candidate explicitly confirms their application from the review screen.
   * Triggers completion and AI scoring on the backend.
   */
  async confirmSubmission(interviewId: string): Promise<{ confirmed: boolean }> {
    return apiFetch<{ confirmed: boolean }>(
      `/api/interviews/public/confirm/${interviewId}`,
      { method: "POST" },
      false,
    );
  },

  /**
   * Conversational interview driver — send a candidate message, receive AI response.
   * Pass empty string as candidateMessage for the first call (AI greets first)
   * or for resuming an existing session.
   */
  async sendMessage(
    interviewId: string,
    candidateMessage: string,
  ): Promise<{
    message: string;
    action: "continue" | "request_file" | "request_link" | "complete";
    requirement_id: string | null;
    requirement_label: string | null;
  }> {
    return apiFetch(
      "/api/interviews/public/message",
      {
        method: "POST",
        body: JSON.stringify({
          interview_id:      interviewId,
          candidate_message: candidateMessage,
        }),
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
