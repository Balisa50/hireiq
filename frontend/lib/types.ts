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
  interview_link_token: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string | null;
  interview_count: number;
  average_score: number | null;
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

export interface TranscriptEntry {
  question_index: number;
  question: string;
  answer: string;
  timestamp: string;
}

export interface ScoreBreakdown {
  [focusArea: string]: number;
}

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
  status: InterviewStatus;
  started_at: string;
  completed_at: string | null;
  last_saved_at: string;
}

export type InterviewStatus =
  | "in_progress"
  | "completed"
  | "scored"
  | "shortlisted"
  | "rejected";

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
}

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
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

export const HIRING_RECOMMENDATIONS = [
  "Strong Yes",
  "Yes",
  "Maybe",
  "No",
  "Strong No",
] as const;
