/**
 * HireIQ shared TypeScript types.
 * Single source of truth for all data shapes used across the frontend.
 */

export interface Company {
  id: string;
  email: string;
  company_name: string;
  industry: string | null;
  company_size: string | null;
  website_url: string | null;
  logo_url: string | null;
  default_question_count: number;
  default_focus_areas: string[];
  custom_intro_message: string | null;
  email_notifications: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  company: Company;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  type: string;
  focus_area: string;
  what_it_reveals: string;
  severity?: "surface" | "standard" | "deep";
}

// ── Candidate requirements ────────────────────────────────────────────────────

export interface CandidateRequirement {
  id: string;
  label: string;
  type: "file" | "link";
  preset_key?: string;  // e.g. "cv", "linkedin", "github"
  required: boolean;
}

// ── Submitted materials ───────────────────────────────────────────────────────

export interface SubmittedFile {
  requirement_id: string;
  label: string;
  preset_key?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  submitted_at: string;
  signed_url?: string | null;   // populated by backend on report fetch
  extracted_text?: string | null;
}

export interface SubmittedLink {
  requirement_id: string;
  label: string;
  preset_key?: string;
  url: string;
  submitted_at: string;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  company_id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  job_description: string;
  question_count: number;
  focus_areas: string[];
  questions: GeneratedQuestion[];
  candidate_requirements: CandidateRequirement[];
  interview_link_token: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string | null;
  interview_count: number;
  average_score: number | null;
  // Extended fields
  experience_level: string;
  work_arrangement: string;
  openings: number;
  skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  salary_disclosed: boolean;
  // Job-level controls
  application_deadline: string | null;
  application_limit: number;
  is_paused: boolean;
}

export interface JobSummary {
  id: string;
  title: string;
  department: string | null;
  status: "active" | "closed";
  created_at: string;
  interview_count: number;
  average_score: number | null;
  interview_link_token: string;
}

// ── Interviews ────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  question_index: number;
  question: string;
  answer: string;
  timestamp: string;
}

export interface ScoreBreakdown {
  [focusArea: string]: number;
}

export type DocumentAlignment =
  | "Strong alignment"
  | "Moderate alignment"
  | "Weak alignment"
  | "Discrepancies found"
  | "No documents submitted";

export interface Interview {
  id: string;
  job_id: string;
  company_id: string;
  candidate_name: string;
  candidate_email: string;
  transcript: TranscriptEntry[];
  overall_score: number | null;
  score_breakdown: ScoreBreakdown | null;
  executive_summary: string | null;
  key_strengths: string[] | null;
  areas_of_concern: string[] | null;
  recommended_follow_up_questions: string[] | null;
  hiring_recommendation: string | null;
  document_interview_alignment: DocumentAlignment | null;
  submitted_files: SubmittedFile[];
  submitted_links: SubmittedLink[];
  status: InterviewStatus;
  started_at: string;
  completed_at: string | null;
  last_saved_at: string;
  knockout_reason?: string | null;
}

export type InterviewStatus =
  | "in_progress"
  | "completed"
  | "scored"
  | "shortlisted"
  | "rejected"
  | "auto_rejected"
  | "accepted";

export interface CandidateSummary {
  id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  overall_score: number | null;
  hiring_recommendation: string | null;
  status: InterviewStatus;
  started_at: string;
  completed_at: string | null;
  interview_duration_minutes: number | null;
}

export interface DashboardStats {
  active_jobs: number;
  total_interviews: number;
  average_score: number | null;
  interviews_this_week: number;
  recent_activity: RecentActivity[];
}

export interface RecentActivity {
  candidate_name: string;
  job_title: string;
  overall_score: number | null;
  started_at: string;
  status: string;
}

export interface JobPublicInfo {
  id: string;
  title: string;
  company_name: string;
  company_logo_url: string | null;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  question_count: number;
  custom_intro_message: string | null;
  candidate_requirements: CandidateRequirement[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const FOCUS_AREAS = [
  "Technical Skills",
  "Problem Solving",
  "Communication",
  "Leadership",
  "Culture Fit",
  "Motivation and Ambition",
  "Experience Depth",
  "Situational Judgement",
] as const;

export type FocusArea = (typeof FOCUS_AREAS)[number];

export const EMPLOYMENT_TYPES = [
  { value: "full_time",  label: "Full Time" },
  { value: "part_time",  label: "Part Time" },
  { value: "contract",   label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

export const EXPERIENCE_LEVELS = [
  { value: "any",       label: "Any Level" },
  { value: "entry",     label: "Entry Level" },
  { value: "mid",       label: "Mid Level" },
  { value: "senior",    label: "Senior" },
  { value: "lead",      label: "Lead / Principal" },
  { value: "executive", label: "Executive / Director" },
] as const;

export const WORK_ARRANGEMENTS = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid",  label: "Hybrid" },
  { value: "remote",  label: "Remote" },
] as const;

export const SALARY_CURRENCIES = [
  { value: "USD", label: "USD, US Dollar" },
  { value: "EUR", label: "EUR, Euro" },
  { value: "GBP", label: "GBP, British Pound" },
  { value: "CAD", label: "CAD, Canadian Dollar" },
  { value: "AUD", label: "AUD, Australian Dollar" },
  { value: "GHS", label: "GHS, Ghanaian Cedi" },
  { value: "GMD", label: "GMD, Gambian Dalasi" },
  { value: "NGN", label: "NGN, Nigerian Naira" },
  { value: "KES", label: "KES, Kenyan Shilling" },
  { value: "ZAR", label: "ZAR, South African Rand" },
] as const;

export const SALARY_PERIODS = [
  { value: "hour",  label: "per hour" },
  { value: "month", label: "per month" },
  { value: "year",  label: "per year" },
] as const;

export const HIRING_RECOMMENDATIONS = [
  "Strong Yes",
  "Yes",
  "Maybe",
  "No",
  "Strong No",
] as const;

// Preset candidate requirement options shown in the job creation form
export const PRESET_REQUIREMENTS: Omit<CandidateRequirement, "required">[] = [
  { id: "cv",         label: "CV / Resume",              type: "file", preset_key: "cv" },
  { id: "cover_letter", label: "Cover Letter",           type: "file", preset_key: "cover_letter" },
  { id: "certificates", label: "Certificates / Qualifications", type: "file", preset_key: "certificates" },
  { id: "portfolio",  label: "Portfolio",                type: "file", preset_key: "portfolio" },
  { id: "linkedin",   label: "LinkedIn Profile URL",     type: "link", preset_key: "linkedin" },
  { id: "github",     label: "GitHub Profile URL",       type: "link", preset_key: "github" },
  { id: "dribbble",   label: "Dribbble or Behance URL",  type: "link", preset_key: "dribbble" },
  { id: "website",    label: "Personal Website URL",     type: "link", preset_key: "website" },
];
