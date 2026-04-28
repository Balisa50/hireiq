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
  timezone: string;
  language: string;
  default_question_count: number;
  default_focus_areas: string[];
  custom_intro_message: string | null;
  default_severity: string;
  auto_close_on_limit: boolean;
  default_deadline_days: number | null;
  data_retention_days: number;
  sender_name: string | null;
  reply_to_email: string | null;
  email_footer: string | null;
  email_signature: string | null;
  brand_color: string;
  closing_message: string | null;
  email_notifications: boolean;
  notify_on_application: boolean;
  notify_on_scored: boolean;
  notify_daily_digest: boolean;
  notify_weekly_summary: boolean;
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

// ── Job eligibility criteria (JSONB) ─────────────────────────────────────────

export interface LanguageRequirement {
  language: string;
  proficiency: "basic" | "conversational" | "professional" | "fluent" | "native";
}

export interface EligibilityCriteria {
  min_education: "none" | "high_school" | "associate" | "bachelor" | "master" | "phd" | "professional";
  fields_of_study: string[];
  equivalent_experience_accepted: boolean;
  min_experience_years: number;
  experience_context: string;
  required_certifications: string[];
  min_gpa: number | null;
  work_auth_required: boolean;
  required_languages: LanguageRequirement[];
}

export const DEFAULT_ELIGIBILITY: EligibilityCriteria = {
  min_education: "none",
  fields_of_study: [],
  equivalent_experience_accepted: true,
  min_experience_years: 0,
  experience_context: "",
  required_certifications: [],
  min_gpa: null,
  work_auth_required: false,
  required_languages: [{ language: "English", proficiency: "professional" }],
};

// ── Candidate info to collect (JSONB) ────────────────────────────────────────

export interface CandidateInfoConfig {
  // 6A — Personal
  collect_phone: boolean;
  collect_date_of_birth: boolean;
  collect_gender: boolean;
  collect_nationality: boolean;
  collect_country_of_residence: boolean;
  collect_current_location: boolean;
  collect_full_address: boolean;
  // 6B — Professional
  collect_current_job_title: boolean;
  collect_current_employer: boolean;
  collect_total_years_exp: boolean;
  collect_notice_period: boolean;
  collect_expected_salary: boolean;
  collect_employment_history: boolean;
  collect_education_history: boolean;
  collect_willing_to_relocate: boolean;
  // 6C — References
  collect_references: boolean;
  references_count: number;
}

export const DEFAULT_CANDIDATE_INFO_CONFIG: CandidateInfoConfig = {
  collect_phone: true,
  collect_date_of_birth: false,
  collect_gender: false,
  collect_nationality: false,
  collect_country_of_residence: false,
  collect_current_location: true,
  collect_full_address: false,
  collect_current_job_title: true,
  collect_current_employer: true,
  collect_total_years_exp: false,
  collect_notice_period: true,
  collect_expected_salary: false,
  collect_employment_history: true,
  collect_education_history: true,
  collect_willing_to_relocate: false,
  collect_references: false,
  references_count: 2,
};

// ── DEI config (JSONB) ────────────────────────────────────────────────────────

export interface DeiConfig {
  enabled: boolean;
  collect_ethnicity: boolean;
  collect_gender: boolean;
  collect_disability: boolean;
  collect_veteran: boolean;
}

export const DEFAULT_DEI_CONFIG: DeiConfig = {
  enabled: false,
  collect_ethnicity: false,
  collect_gender: false,
  collect_disability: false,
  collect_veteran: false,
};

// ── AI prefill response ───────────────────────────────────────────────────────

export interface AIPrefillResult {
  description: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  eligibility: {
    min_education: string;
    min_experience_years: number;
    required_certifications: string[];
    work_auth_required: boolean;
    languages: string[];
  };
  questions: GeneratedQuestion[];
}

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
  // Visibility
  job_visibility: string;
  // Basic info extras
  experience_level: string;
  work_arrangement: string;
  openings: number;
  job_code: string | null;
  hiring_manager: string | null;
  // Location
  relocation_considered: boolean;
  travel_required: boolean;
  // Compensation
  skills: string[];
  nice_to_have_skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  salary_disclosed: boolean;
  equity_offered: boolean;
  benefits_summary: string | null;
  // Extended config
  eligibility_criteria: EligibilityCriteria;
  candidate_info_config: CandidateInfoConfig;
  dei_config: DeiConfig;
  // AI deterrent
  ai_deterrent_enabled: boolean;
  ai_deterrent_placement: string;
  ai_deterrent_message: string | null;
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
