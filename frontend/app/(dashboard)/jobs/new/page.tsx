"use client";

import React, { useState, useCallback, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import {
  Check, AlertCircle, CheckCircle2, Plus, FileText, Link2, X,
  Sparkles, Globe, Lock, EyeOff,
} from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type {
  CandidateRequirement,
  GeneratedQuestion,
  EligibilityCriteria,
  CandidateInfoConfig,
  DeiConfig,
  LanguageRequirement,
} from "@/lib/types";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  WORK_ARRANGEMENTS,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  PRESET_REQUIREMENTS,
} from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "intro" | "form" | "published";
type ScreeningType = "yes_no" | "number" | "text";
type JobVisibility = "public" | "internal" | "unlisted";

interface ScreeningQuestion {
  id: string;
  question: string;
  type: ScreeningType;
  knockout_enabled: boolean;
  knockout_expected_answer?: "yes" | "no";
  knockout_min_value?: string;
  knockout_max_value?: string;
  knockout_rejection_reason: string;
}

interface CustomQuestion {
  id: string;
  question: string;
  type: string;
  focus_area: string;
  what_it_reveals: string;
  severity: string;
}

interface CustomDoc {
  id: string;
  label: string;
  type: "file" | "link";
  required: boolean;
}

function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

const LANGUAGE_PROFICIENCIES: Array<{ value: LanguageRequirement["proficiency"]; label: string }> = [
  { value: "basic",         label: "Basic" },
  { value: "conversational",label: "Conversational" },
  { value: "professional",  label: "Professional" },
  { value: "fluent",        label: "Fluent" },
  { value: "native",        label: "Native" },
];

const JOB_VISIBILITY_OPTIONS: Array<{ value: JobVisibility; label: string; desc: string; icon: React.ReactNode }> = [
  { value: "public",   label: "Public",         desc: "Listed on your public job board",        icon: <Globe className="w-4 h-4" /> },
  { value: "internal", label: "Internal Only",  desc: "Visible to employees with the link",     icon: <Lock className="w-4 h-4" /> },
  { value: "unlisted", label: "Unlisted",        desc: "Link-only — not on public board",        icon: <EyeOff className="w-4 h-4" /> },
];

// ── Reusable UI bits ──────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <div>
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{title}</h2>
        {subtitle && <p className="text-[13px] text-sub mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function FieldSelect({
  label, value, onChange, children, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  children: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
      >
        {children}
      </select>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-ink" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
      </button>
      <span className="text-sm text-ink">{label}</span>
    </div>
  );
}

function RequiredToggle({ required, onChange }: { required: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center bg-[var(--bg)] border border-border rounded-[4px] text-[12px] font-medium overflow-hidden shrink-0">
      <button type="button" onClick={() => onChange(true)}
        className={`px-2.5 py-1 transition-colors ${required ? "bg-ink text-white" : "text-muted hover:text-sub"}`}>
        Required
      </button>
      <button type="button" onClick={() => onChange(false)}
        className={`px-2.5 py-1 transition-colors ${!required ? "bg-ink text-white" : "text-muted hover:text-sub"}`}>
        Optional
      </button>
    </div>
  );
}

function TagInput({
  tags, onChange, placeholder, max = 20,
}: {
  tags: string[]; onChange: (v: string[]) => void;
  placeholder?: string; max?: number;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const add = useCallback((raw: string) => {
    const t = raw.trim().replace(/,+$/, "").trim();
    if (!t || tags.includes(t) || tags.length >= max) return;
    onChange([...tags, t]);
    setDraft("");
  }, [tags, onChange, max]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
    else if (e.key === "Backspace" && !draft && tags.length > 0) onChange(tags.slice(0, -1));
  }, [draft, tags, add, onChange]);

  return (
    <div
      onClick={() => ref.current?.focus()}
      className="min-h-[42px] flex flex-wrap gap-1.5 items-center bg-white border border-border rounded-[4px] px-3 py-2 cursor-text focus-within:border-ink transition-colors"
    >
      {tags.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 bg-[var(--bg)] border border-border text-[12px] text-ink font-medium px-2 py-0.5 rounded-[4px]">
          {s}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(tags.filter((x) => x !== s)); }}
            className="text-muted hover:text-danger transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => add(draft)}
        placeholder={tags.length === 0 ? (placeholder ?? "Press Enter or comma to add") : "Add more…"}
        className="flex-1 min-w-[140px] text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
      />
    </div>
  );
}

// ── Language rows ──────────────────────────────────────────────────────────────

function LanguageRows({
  languages, onChange,
}: {
  languages: LanguageRequirement[];
  onChange: (v: LanguageRequirement[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addLang = useCallback(() => {
    const name = draft.trim();
    if (!name || languages.some((l) => l.language.toLowerCase() === name.toLowerCase())) return;
    onChange([...languages, { language: name, proficiency: "professional" }]);
    setDraft("");
  }, [draft, languages, onChange]);

  return (
    <div className="space-y-2">
      {languages.map((lang, i) => (
        <div key={lang.language} className="flex items-center gap-2">
          <span className="flex-1 text-[13px] text-ink bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2">
            {lang.language}
          </span>
          <select
            value={lang.proficiency}
            onChange={(e) => {
              const updated = [...languages];
              updated[i] = { ...lang, proficiency: e.target.value as LanguageRequirement["proficiency"] };
              onChange(updated);
            }}
            className="bg-white border border-border rounded-[4px] px-2.5 py-2 text-[13px] text-ink outline-none appearance-none cursor-pointer focus:border-ink transition-colors"
          >
            {LANGUAGE_PROFICIENCIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(languages.filter((_, j) => j !== i))}
            className="text-muted hover:text-danger transition-colors shrink-0 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLang(); } }}
          placeholder="Add a language…"
          className="flex-1 text-[13px] text-ink bg-white border border-border rounded-[4px] px-3 py-2 outline-none focus:border-ink transition-colors placeholder:text-muted"
        />
        <button
          type="button"
          onClick={addLang}
          className="px-3 py-2 rounded-[4px] border border-border bg-white text-[13px] text-sub hover:border-ink hover:text-ink transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

// ── Screening question presets ─────────────────────────────────────────────────

const SCREENING_PRESETS: Array<{ key: string; label: string; template: Partial<ScreeningQuestion> }> = [
  {
    key: "work_auth", label: "Work authorization",
    template: {
      question: "Are you legally authorized to work in this country without employer sponsorship?",
      type: "yes_no", knockout_enabled: true, knockout_expected_answer: "yes",
      knockout_rejection_reason: "Candidate requires sponsorship, which is not available for this role.",
    },
  },
  {
    key: "salary", label: "Salary expectation",
    template: { question: "What is your expected annual salary?", type: "number", knockout_enabled: false },
  },
  {
    key: "experience", label: "Years of experience",
    template: {
      question: "How many years of relevant professional experience do you have?",
      type: "number", knockout_enabled: true, knockout_min_value: "2",
      knockout_rejection_reason: "Does not meet the minimum experience requirement.",
    },
  },
  {
    key: "notice", label: "Notice period",
    template: { question: "How many weeks notice are you required to give your current employer?", type: "number", knockout_enabled: false },
  },
  {
    key: "reloc", label: "Willing to relocate",
    template: { question: "Are you willing to relocate for this role?", type: "yes_no", knockout_enabled: false },
  },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function NewJobPage() {
  const [phase, setPhase]               = useState<Phase>("intro");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  // ── Intro phase ───────────────────────────────────────────────────────────
  const [title, setTitle]           = useState("");
  const [department, setDepartment] = useState("");

  // ── Section 1: Basic info ─────────────────────────────────────────────────
  const [jobVisibility, setJobVisibility]             = useState<JobVisibility>("public");
  const [employmentType, setEmploymentType]           = useState("full_time");
  const [experienceLevel, setExperienceLevel]         = useState("any");
  const [openings, setOpenings]                       = useState(1);
  const [jobCode, setJobCode]                         = useState("");
  const [hiringManager, setHiringManager]             = useState("");

  // ── Section 2: Location ───────────────────────────────────────────────────
  const [workArrangement, setWorkArrangement]           = useState("on_site");
  const [location, setLocation]                         = useState("");
  const [relocationConsidered, setRelocationConsidered] = useState(false);
  const [travelRequired, setTravelRequired]             = useState(false);

  // ── Section 3: Compensation ───────────────────────────────────────────────
  const [salaryDisclosed, setSalaryDisclosed] = useState(false);
  const [salaryMin, setSalaryMin]             = useState("");
  const [salaryMax, setSalaryMax]             = useState("");
  const [salaryCurrency, setSalaryCurrency]   = useState("USD");
  const [salaryPeriod, setSalaryPeriod]       = useState("year");
  const [equityOffered, setEquityOffered]     = useState(false);
  const [benefitsSummary, setBenefitsSummary] = useState("");

  // ── Section 4: Description & skills ──────────────────────────────────────
  const [jobDescription, setJobDescription]     = useState("");
  const [skills, setSkills]                     = useState<string[]>([]);
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);

  // ── Section 5: Eligibility ────────────────────────────────────────────────
  const [minEducation, setMinEducation]             = useState<EligibilityCriteria["min_education"]>("none");
  const [fieldsOfStudy, setFieldsOfStudy]           = useState<string[]>([]);
  const [equivalentExpAccepted, setEquivalentExpAccepted] = useState(true);
  const [minExpYears, setMinExpYears]               = useState(0);
  const [experienceContext, setExperienceContext]   = useState("");
  const [requiredCerts, setRequiredCerts]           = useState<string[]>([]);
  const [minGPA, setMinGPA]                         = useState("");
  const [workAuthRequired, setWorkAuthRequired]     = useState(false);
  const [languages, setLanguages]                   = useState<LanguageRequirement[]>([
    { language: "English", proficiency: "professional" },
  ]);
  const [knockoutQs, setKnockoutQs]                 = useState<ScreeningQuestion[]>([]);

  // ── Section 6A: Personal details ─────────────────────────────────────────
  const [collectPhone, setCollectPhone]                   = useState(true);
  const [collectDOB, setCollectDOB]                       = useState(false);
  const [collectGender, setCollectGender]                 = useState(false);
  const [collectNationality, setCollectNationality]       = useState(false);
  const [collectCountryOfResidence, setCollectCountryOfResidence] = useState(false);
  const [collectCurrLocation, setCollectCurrLocation]     = useState(true);
  const [collectFullAddress, setCollectFullAddress]       = useState(false);

  // ── Section 6B: Professional background ──────────────────────────────────
  const [collectCurrentJobTitle, setCollectCurrentJobTitle]   = useState(true);
  const [collectCurrentEmployer, setCollectCurrentEmployer]   = useState(true);
  const [collectTotalYearsExp, setCollectTotalYearsExp]       = useState(false);
  const [collectNoticePeriod, setCollectNoticePeriod]         = useState(true);
  const [collectExpectedSalary, setCollectExpectedSalary]     = useState(false);
  const [collectEmpHistory, setCollectEmpHistory]             = useState(true);
  const [collectEduHistory, setCollectEduHistory]             = useState(true);
  const [collectWillingToRelocate, setCollectWillingToRelocate] = useState(false);

  // ── Section 6C: References ────────────────────────────────────────────────
  const [collectRefs, setCollectRefs] = useState(false);
  const [refsCount, setRefsCount]     = useState(2);

  // ── Documents ─────────────────────────────────────────────────────────────
  const [activeDocPresets, setActiveDocPresets]     = useState<Set<string>>(new Set(["cv"]));
  const [docPresetRequired, setDocPresetRequired]   = useState<Record<string, boolean>>({ cv: true });
  const [customDocs, setCustomDocs]                 = useState<CustomDoc[]>([]);

  // ── Section 7: DEI ────────────────────────────────────────────────────────
  const [deiEnabled, setDeiEnabled]       = useState(false);
  const [deiEthnicity, setDeiEthnicity]   = useState(false);
  const [deiGender, setDeiGender]         = useState(false);
  const [deiDisability, setDeiDisability] = useState(false);
  const [deiVeteran, setDeiVeteran]       = useState(false);

  // ── Section 8: Custom interview questions ─────────────────────────────────
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);

  // ── Section 9: AI deterrent ───────────────────────────────────────────────
  const [deterrentEnabled, setDeterrentEnabled]     = useState(true);
  const [deterrentPlacement, setDeterrentPlacement] = useState("before_questions");
  const [deterrentMessage, setDeterrentMessage]     = useState(
    "This application uses AI to assist in evaluation. We can detect AI-generated responses — please answer genuinely and in your own words."
  );

  // ── App settings ──────────────────────────────────────────────────────────
  const [appDeadline, setAppDeadline] = useState("");
  const [appLimit, setAppLimit]       = useState(0);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing]       = useState(false);
  const [errors, setErrors]                   = useState<Record<string, string>>({});
  const [apiError, setApiError]               = useState("");
  const [publishedToken, setPublishedToken]   = useState("");
  const [linkCopied, setLinkCopied]           = useState(false);

  const wc = wordCount(jobDescription);

  // ── AI generate handler ───────────────────────────────────────────────────
  const handleAIGenerate = useCallback(async () => {
    const titleErr = title.trim() ? "" : "Job title is required.";
    const deptErr  = department.trim() ? "" : "Department is required.";
    if (titleErr || deptErr) { setErrors({ title: titleErr, department: deptErr }); return; }
    setErrors({});
    setIsGenerating(true);
    setGenerateError("");
    try {
      const result = await jobsAPI.aiFillJob({ title: title.trim(), department: department.trim() });
      setJobDescription(result.description ?? "");
      setSkills(result.required_skills ?? []);
      setNiceToHaveSkills(result.nice_to_have_skills ?? []);
      if (result.eligibility) {
        const e = result.eligibility;
        setMinEducation((e.min_education as EligibilityCriteria["min_education"]) ?? "none");
        setMinExpYears(e.min_experience_years ?? 0);
        setRequiredCerts(e.required_certifications ?? []);
        setWorkAuthRequired(e.work_auth_required ?? false);
        // AI returns languages as string[] — convert to LanguageRequirement[]
        if (e.languages?.length) {
          setLanguages(
            (e.languages as string[]).map((l) => ({
              language: l,
              proficiency: "professional" as const,
            }))
          );
        }
      }
      if (result.questions?.length) {
        setCustomQuestions(result.questions.map((q) => ({
          id: q.id ?? `q-${Date.now()}-${Math.random()}`,
          question: q.question,
          type: q.type ?? "behavioral",
          focus_area: q.focus_area ?? "",
          what_it_reveals: q.what_it_reveals ?? "",
          severity: (q.severity as string) ?? "standard",
        })));
      }
      setPhase("form");
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "AI generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [title, department]);

  // ── Knockout question helpers ─────────────────────────────────────────────
  const addKnockoutQ = useCallback((template?: Partial<ScreeningQuestion>) => {
    setKnockoutQs((p) => [...p, {
      id: `kq-${Date.now()}`,
      question: "",
      type: "yes_no",
      knockout_enabled: false,
      knockout_expected_answer: "yes",
      knockout_min_value: "",
      knockout_max_value: "",
      knockout_rejection_reason: "",
      ...template,
    }]);
  }, []);
  const updateKnockoutQ = useCallback((id: string, up: Partial<ScreeningQuestion>) => {
    setKnockoutQs((p) => p.map((q) => q.id === id ? { ...q, ...up } : q));
  }, []);
  const removeKnockoutQ = useCallback((id: string) => {
    setKnockoutQs((p) => p.filter((q) => q.id !== id));
  }, []);

  // ── Custom question helpers ────────────────────────────────────────────────
  const addCustomQ = useCallback(() => {
    setCustomQuestions((p) => [...p, {
      id: `cq-${Date.now()}`,
      question: "",
      type: "behavioral",
      focus_area: "",
      what_it_reveals: "",
      severity: "standard",
    }]);
  }, []);
  const updateCustomQ = useCallback((id: string, up: Partial<CustomQuestion>) => {
    setCustomQuestions((p) => p.map((q) => q.id === id ? { ...q, ...up } : q));
  }, []);
  const removeCustomQ = useCallback((id: string) => {
    setCustomQuestions((p) => p.filter((q) => q.id !== id));
  }, []);

  // ── Doc preset helpers ─────────────────────────────────────────────────────
  const toggleDocPreset = useCallback((id: string) => {
    setActiveDocPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const addCustomDoc = useCallback(() => {
    setCustomDocs((p) => [...p, { id: `cd-${Date.now()}`, label: "", type: "file", required: true }]);
  }, []);
  const updateCustomDoc = useCallback((id: string, up: Partial<CustomDoc>) => {
    setCustomDocs((p) => p.map((d) => d.id === id ? { ...d, ...up } : d));
  }, []);
  const removeCustomDoc = useCallback((id: string) => {
    setCustomDocs((p) => p.filter((d) => d.id !== id));
  }, []);

  // ── Build derived data ─────────────────────────────────────────────────────
  const buildCandidateRequirements = useCallback((): CandidateRequirement[] => {
    const result: CandidateRequirement[] = [];
    for (const preset of PRESET_REQUIREMENTS) {
      if (activeDocPresets.has(preset.id)) {
        result.push({ ...preset, required: docPresetRequired[preset.id] ?? true });
      }
    }
    for (const d of customDocs) {
      if (d.label.trim()) result.push({ id: d.id, label: d.label, type: d.type, required: d.required });
    }
    return result;
  }, [activeDocPresets, docPresetRequired, customDocs]);

  const buildEligibility = useCallback((): EligibilityCriteria => ({
    min_education:               minEducation,
    fields_of_study:             fieldsOfStudy,
    equivalent_experience_accepted: equivalentExpAccepted,
    min_experience_years:        minExpYears,
    experience_context:          experienceContext,
    required_certifications:     requiredCerts,
    min_gpa:                     minGPA ? parseFloat(minGPA) : null,
    work_auth_required:          workAuthRequired,
    required_languages:          languages,
  }), [minEducation, fieldsOfStudy, equivalentExpAccepted, minExpYears, experienceContext, requiredCerts, minGPA, workAuthRequired, languages]);

  const buildCandidateInfoConfig = useCallback((): CandidateInfoConfig => ({
    collect_phone:              collectPhone,
    collect_date_of_birth:      collectDOB,
    collect_gender:             collectGender,
    collect_nationality:        collectNationality,
    collect_country_of_residence: collectCountryOfResidence,
    collect_current_location:   collectCurrLocation,
    collect_full_address:       collectFullAddress,
    collect_current_job_title:  collectCurrentJobTitle,
    collect_current_employer:   collectCurrentEmployer,
    collect_total_years_exp:    collectTotalYearsExp,
    collect_notice_period:      collectNoticePeriod,
    collect_expected_salary:    collectExpectedSalary,
    collect_employment_history: collectEmpHistory,
    collect_education_history:  collectEduHistory,
    collect_willing_to_relocate: collectWillingToRelocate,
    collect_references:         collectRefs,
    references_count:           refsCount,
  }), [
    collectPhone, collectDOB, collectGender, collectNationality,
    collectCountryOfResidence, collectCurrLocation, collectFullAddress,
    collectCurrentJobTitle, collectCurrentEmployer, collectTotalYearsExp,
    collectNoticePeriod, collectExpectedSalary, collectEmpHistory,
    collectEduHistory, collectWillingToRelocate, collectRefs, refsCount,
  ]);

  const buildDeiConfig = useCallback((): DeiConfig => ({
    enabled:           deiEnabled,
    collect_ethnicity: deiEthnicity,
    collect_gender:    deiGender,
    collect_disability:deiDisability,
    collect_veteran:   deiVeteran,
  }), [deiEnabled, deiEthnicity, deiGender, deiDisability, deiVeteran]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim())      e.title    = "Job title is required.";
    if (!department.trim()) e.dept     = "Department is required.";
    if (!location.trim())   e.location = "Location is required.";
    if (wc < 50)            e.desc     = `Please write at least 50 words. You have ${wc}.`;
    if (openings < 1 || openings > 99) e.openings = "Openings must be 1–99.";
    if (salaryDisclosed) {
      const mn = parseInt(salaryMin, 10); const mx = parseInt(salaryMax, 10);
      if (salaryMin && isNaN(mn)) e.salary = "Min salary must be a number.";
      if (salaryMax && isNaN(mx)) e.salary = "Max salary must be a number.";
      if (!isNaN(mn) && !isNaN(mx) && mx < mn) e.salary = "Max must be greater than min.";
    }
    if (minGPA) {
      const g = parseFloat(minGPA);
      if (isNaN(g) || g < 0 || g > 4) e.gpa = "GPA must be 0.0–4.0.";
    }
    setErrors(e);
    return !Object.keys(e).length;
  }, [title, department, location, wc, openings, salaryDisclosed, salaryMin, salaryMax, minGPA]);

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!validate()) return;
    setIsPublishing(true);
    setApiError("");
    try {
      const allQuestions: GeneratedQuestion[] = [
        ...knockoutQs
          .filter((q) => q.question.trim())
          .map((q) => ({
            id: q.id,
            question: q.question,
            type: q.type,
            focus_area: "Screening",
            what_it_reveals: "",
            severity: "surface" as const,
            knockout_enabled: q.knockout_enabled,
            knockout_expected_answer: q.knockout_expected_answer ?? null,
            knockout_min_value: q.knockout_min_value ? parseFloat(q.knockout_min_value) : null,
            knockout_max_value: q.knockout_max_value ? parseFloat(q.knockout_max_value) : null,
            knockout_rejection_reason: q.knockout_rejection_reason,
          })),
        ...customQuestions.filter((q) => q.question.trim()),
      ];

      const job = await jobsAPI.publishJob({
        title:           title.trim(),
        department:      department.trim(),
        location:        location.trim(),
        employment_type: employmentType,
        job_description: jobDescription,
        question_count:  allQuestions.length || 7,
        focus_areas:     [],
        questions:       allQuestions,
        candidate_requirements: buildCandidateRequirements(),
        // Section 1
        job_visibility:   jobVisibility,
        experience_level: experienceLevel,
        work_arrangement: workArrangement,
        openings,
        job_code:         jobCode || undefined,
        hiring_manager:   hiringManager || undefined,
        // Section 2
        relocation_considered: relocationConsidered,
        travel_required:       travelRequired,
        // Section 3
        skills,
        nice_to_have_skills: niceToHaveSkills,
        salary_min:      salaryDisclosed && salaryMin ? parseInt(salaryMin, 10) : undefined,
        salary_max:      salaryDisclosed && salaryMax ? parseInt(salaryMax, 10) : undefined,
        salary_currency: salaryCurrency,
        salary_period:   salaryPeriod,
        salary_disclosed: salaryDisclosed,
        equity_offered:  equityOffered,
        benefits_summary: benefitsSummary || undefined,
        // Extended config
        eligibility_criteria:  buildEligibility(),
        candidate_info_config: buildCandidateInfoConfig(),
        dei_config:            buildDeiConfig(),
        // AI deterrent
        ai_deterrent_enabled:   deterrentEnabled,
        ai_deterrent_placement: deterrentPlacement,
        ai_deterrent_message:   deterrentEnabled ? deterrentMessage : undefined,
        // Controls
        application_deadline: appDeadline || undefined,
        application_limit:    appLimit,
      });

      setPublishedToken(String(job.interview_link_token));
      setPhase("published");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to publish. Please try again.");
    } finally { setIsPublishing(false); }
  }, [
    validate, title, department, location, employmentType, jobDescription,
    knockoutQs, customQuestions, buildCandidateRequirements,
    jobVisibility, experienceLevel, workArrangement, openings, jobCode, hiringManager,
    relocationConsidered, travelRequired, skills, niceToHaveSkills,
    salaryDisclosed, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    equityOffered, benefitsSummary, buildEligibility, buildCandidateInfoConfig,
    buildDeiConfig, deterrentEnabled, deterrentPlacement, deterrentMessage,
    appDeadline, appLimit,
  ]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(jobsAPI.buildInterviewLink(publishedToken));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [publishedToken]);

  // ── PUBLISHED ─────────────────────────────────────────────────────────────
  if (phase === "published") {
    const link = jobsAPI.buildInterviewLink(publishedToken);
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <div className="w-12 h-12 rounded-[4px] bg-green-50 border border-success/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">Your job is live.</h1>
          <p className="text-sub text-sm mb-7 leading-relaxed">
            Share this link and candidates will jump straight into an AI-powered interview.
            No account needed on their end.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 font-mono text-[13px] text-ink bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 outline-none cursor-pointer" />
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied!</> : <><Check className="w-3.5 h-3.5" /> Copy</>}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 text-[13px] mt-4">
            <Link href="/jobs" className="text-sub hover:text-ink transition-colors">View all jobs</Link>
            <button onClick={() => { setPhase("intro"); setTitle(""); setDepartment(""); }} className="text-sub hover:text-ink transition-colors">
              Post another job
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── INTRO — Title + Department ────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="space-y-2 mb-8">
          <h1 className="text-2xl font-bold text-ink">Create a job</h1>
          <p className="text-sub text-sm">
            Enter the role and department. HireIQ will draft the entire posting in seconds.
          </p>
        </div>

        <div className="bg-white border border-border rounded-[4px] p-8 space-y-6">
          <Input
            label="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Data Analyst"
            error={errors.title}
            required
            autoFocus
          />
          <Input
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            error={errors.department}
            required
            onKeyDown={(e) => { if (e.key === "Enter" && !isGenerating) handleAIGenerate(); }}
          />

          {generateError && (
            <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{generateError}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleAIGenerate}
            isLoading={isGenerating}
            loadingText="Generating job details…"
          >
            <Sparkles className="w-4 h-4" /> Generate with AI
          </Button>

          <p className="text-[12px] text-muted text-center">
            AI will pre-fill the description, skills, eligibility, and interview questions.
            You can edit everything before publishing.
          </p>
        </div>
      </div>
    );
  }

  // ── FORM — Full 9-section form ────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
            <span className="text-[11px] font-semibold text-success bg-green-50 border border-success/20 px-2 py-0.5 rounded-[4px]">
              AI pre-filled
            </span>
          </div>
          <p className="text-sub text-sm">Review, edit, and publish when ready.</p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("intro")}
          className="text-[13px] text-sub hover:text-ink transition-colors shrink-0 mt-1"
        >
          ← Back
        </button>
      </div>

      {apiError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
        </div>
      )}

      {/* ── 1. Basic Information ─────────────────────────────────────────────── */}
      <Card title="1. Basic Information">
        {/* Job Visibility */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Job Visibility</label>
          <div className="grid grid-cols-3 gap-2">
            {JOB_VISIBILITY_OPTIONS.map(({ value, label, desc, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setJobVisibility(value)}
                className={`flex flex-col items-start gap-1 p-3 rounded-[4px] border text-left transition-colors ${
                  jobVisibility === value
                    ? "border-ink bg-white"
                    : "border-border bg-[var(--bg)] hover:border-sub"
                }`}
              >
                <span className={`${jobVisibility === value ? "text-ink" : "text-muted"}`}>{icon}</span>
                <span className={`text-[13px] font-medium ${jobVisibility === value ? "text-ink" : "text-sub"}`}>{label}</span>
                <span className="text-[11px] text-muted leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input label="Job Title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Data Analyst" error={errors.title} required />
          <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering" error={errors.dept} required />
          <FieldSelect label="Employment Type" value={employmentType} onChange={setEmploymentType}>
            {EMPLOYMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
          <FieldSelect label="Experience Level" value={experienceLevel} onChange={setExperienceLevel}>
            {EXPERIENCE_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Number of Openings</label>
            <input type="number" min={1} max={99} value={openings}
              onChange={(e) => setOpenings(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
              className={`w-full bg-white border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors ${errors.openings ? "border-danger" : "border-border"}`} />
            {errors.openings && <p className="text-[13px] text-danger">{errors.openings}</p>}
          </div>
          <Input label="Job Code" value={jobCode} onChange={(e) => setJobCode(e.target.value)}
            placeholder="e.g. ENG-042 (optional)" />
          <Input label="Hiring Manager" value={hiringManager} onChange={(e) => setHiringManager(e.target.value)}
            placeholder="e.g. Jane Smith (optional)" className="sm:col-span-1" />
        </div>
      </Card>

      {/* ── 2. Location & Work Arrangement ─────────────────────────────────── */}
      <Card title="2. Location & Work Arrangement">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FieldSelect label="Work Arrangement" value={workArrangement} onChange={setWorkArrangement}>
            {WORK_ARRANGEMENTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">
              Office Location <span className="text-danger">*</span>
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={workArrangement === "remote" ? "e.g. Worldwide / US only" : "e.g. London, UK"}
              className={`w-full bg-white border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted ${errors.location ? "border-danger" : "border-border"}`}
            />
            {errors.location && <p className="text-[13px] text-danger">{errors.location}</p>}
          </div>
        </div>
        <div className="space-y-3 pt-1">
          <Toggle on={relocationConsidered} onChange={setRelocationConsidered} label="Relocation assistance available" />
          <Toggle on={travelRequired} onChange={setTravelRequired} label="Travel required for this role" />
        </div>
      </Card>

      {/* ── 3. Compensation ──────────────────────────────────────────────────── */}
      <Card title="3. Compensation">
        <Toggle on={salaryDisclosed} onChange={setSalaryDisclosed}
          label={salaryDisclosed ? "Salary range disclosed to applicants" : "Salary not disclosed"} />

        {salaryDisclosed && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Min Salary</label>
                <input type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 60000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Max Salary</label>
                <input type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 90000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted" />
              </div>
            </div>
            {errors.salary && <p className="text-[13px] text-danger">{errors.salary}</p>}
            <div className="grid grid-cols-2 gap-4">
              <FieldSelect label="Currency" value={salaryCurrency} onChange={setSalaryCurrency}>
                {SALARY_CURRENCIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </FieldSelect>
              <FieldSelect label="Period" value={salaryPeriod} onChange={setSalaryPeriod}>
                {SALARY_PERIODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </FieldSelect>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-1">
          <Toggle on={equityOffered} onChange={setEquityOffered} label="Equity / stock options offered" />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">
            Benefits Summary <span className="text-muted font-normal text-[12px]">optional</span>
          </label>
          <textarea
            value={benefitsSummary}
            onChange={(e) => setBenefitsSummary(e.target.value)}
            rows={2}
            placeholder="e.g. Health insurance, 25 days PTO, remote stipend…"
            className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none resize-none placeholder:text-muted focus:border-ink transition-colors"
          />
        </div>
      </Card>

      {/* ── 4. Job Description & Skills ──────────────────────────────────────── */}
      <Card title="4. Job Description & Skills">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink">Description <span className="text-danger">*</span></span>
            <span className={`text-[13px] font-medium tabular-nums ${wc >= 100 ? "text-success" : "text-muted"}`}>{wc} words</span>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            placeholder="Describe the role: responsibilities, day-to-day work, success criteria, team context…"
            className={`w-full bg-white border rounded-[4px] px-4 py-3 text-base text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink ${errors.desc ? "border-danger" : "border-border"}`}
          />
          {errors.desc && <p className="text-[13px] text-danger mt-1">{errors.desc}</p>}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Required Skills <span className="text-muted font-normal text-[12px]">press Enter or comma to add</span>
          </label>
          <TagInput tags={skills} onChange={setSkills} placeholder="e.g. React, Python, SQL…" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Nice-to-have Skills <span className="text-muted font-normal text-[12px]">optional</span>
          </label>
          <TagInput tags={niceToHaveSkills} onChange={setNiceToHaveSkills} placeholder="e.g. GraphQL, Docker…" />
        </div>
      </Card>

      {/* ── 5. Eligibility & Screening Criteria ──────────────────────────────── */}
      <Card title="5. Eligibility & Screening Criteria">

        {/* Education */}
        <div className="space-y-3">
          <FieldSelect label="Minimum Education" value={minEducation} onChange={(v) => setMinEducation(v as EligibilityCriteria["min_education"])}>
            <option value="none">No requirement</option>
            <option value="high_school">High School / GED</option>
            <option value="associate">Associate Degree</option>
            <option value="bachelor">Bachelor&apos;s Degree</option>
            <option value="master">Master&apos;s Degree</option>
            <option value="phd">PhD / Doctorate</option>
            <option value="professional">Professional Degree (e.g. MD, JD)</option>
          </FieldSelect>

          {minEducation !== "none" && (
            <div className="space-y-1.5 pl-1">
              <label className="block text-sm font-medium text-ink">
                Accepted Field(s) of Study <span className="text-muted font-normal text-[12px]">optional</span>
              </label>
              <TagInput
                tags={fieldsOfStudy}
                onChange={setFieldsOfStudy}
                placeholder="e.g. Computer Science, Engineering, Business…"
              />
              <Toggle
                on={equivalentExpAccepted}
                onChange={setEquivalentExpAccepted}
                label="Allow equivalent work experience in place of degree"
              />
            </div>
          )}
        </div>

        {/* Experience */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink">Min Years of Experience</label>
              <input type="number" min={0} max={30} value={minExpYears}
                onChange={(e) => setMinExpYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink">
                Min GPA <span className="text-muted font-normal text-[12px]">optional, 0.0–4.0</span>
              </label>
              <input type="number" min={0} max={4} step={0.1} value={minGPA}
                onChange={(e) => setMinGPA(e.target.value)}
                placeholder="e.g. 3.0"
                className={`w-full bg-white border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted ${errors.gpa ? "border-danger" : "border-border"}`} />
              {errors.gpa && <p className="text-[13px] text-danger">{errors.gpa}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">
              Experience Context <span className="text-muted font-normal text-[12px]">optional — specify industry or type</span>
            </label>
            <input
              value={experienceContext}
              onChange={(e) => setExperienceContext(e.target.value)}
              placeholder="e.g. SaaS product development, financial services, B2B sales…"
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
          </div>
        </div>

        {/* Certifications */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Required Certifications / Licenses</label>
          <TagInput tags={requiredCerts} onChange={setRequiredCerts} placeholder="e.g. AWS Certified, PMP, CPA…" />
        </div>

        {/* Languages */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Languages Required
            <span className="text-muted font-normal text-[12px] ml-2">set minimum proficiency for each</span>
          </label>
          <LanguageRows languages={languages} onChange={setLanguages} />
        </div>

        {/* Work auth */}
        <Toggle on={workAuthRequired} onChange={setWorkAuthRequired}
          label="Work authorisation required (no sponsorship available)" />

        {/* Knockout questions */}
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Knockout Questions</p>
          <p className="text-[13px] text-sub">
            Asked first. Enable knockout to auto-reject candidates who don&apos;t qualify.
          </p>

          <div className="flex flex-wrap gap-2">
            {SCREENING_PRESETS.map((preset) => (
              <button key={preset.key} type="button" onClick={() => addKnockoutQ(preset.template)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-border bg-white text-[13px] text-sub hover:border-ink hover:text-ink transition-colors">
                <Plus className="w-3.5 h-3.5" />{preset.label}
              </button>
            ))}
          </div>

          {knockoutQs.length > 0 && (
            <div className="space-y-3">
              {knockoutQs.map((q) => (
                <div key={q.id} className="border border-border rounded-[4px] p-4 space-y-3 bg-[var(--bg)]">
                  <div className="flex items-start gap-2">
                    <input
                      value={q.question}
                      onChange={(e) => updateKnockoutQ(q.id, { question: e.target.value })}
                      placeholder="e.g. Are you authorised to work without sponsorship?"
                      className="flex-1 bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
                    />
                    <button type="button" onClick={() => removeKnockoutQ(q.id)}
                      className="text-muted hover:text-danger transition-colors mt-2 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select value={q.type} onChange={(e) => updateKnockoutQ(q.id, { type: e.target.value as ScreeningType })}
                      className="bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none appearance-none cursor-pointer">
                      <option value="yes_no">Yes / No</option>
                      <option value="number">Number</option>
                      <option value="text">Free text</option>
                    </select>
                    <button type="button"
                      onClick={() => updateKnockoutQ(q.id, { knockout_enabled: !q.knockout_enabled })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border text-[13px] font-medium transition-colors ${q.knockout_enabled ? "bg-red-50 border-danger/40 text-danger" : "bg-white border-border text-muted hover:border-sub"}`}>
                      <span className={`w-2 h-2 rounded-full ${q.knockout_enabled ? "bg-danger" : "bg-border"}`} />
                      Knockout
                    </button>
                  </div>
                  {q.knockout_enabled && (
                    <div className="space-y-2.5 pt-0.5">
                      {q.type === "yes_no" && (
                        <div className="flex items-center gap-3">
                          <span className="text-[13px] text-sub">Must answer:</span>
                          <div className="flex items-center border border-border rounded-[4px] overflow-hidden text-[13px] font-medium">
                            {(["yes", "no"] as const).map((v) => (
                              <button key={v} type="button"
                                onClick={() => updateKnockoutQ(q.id, { knockout_expected_answer: v })}
                                className={`px-3 py-1.5 transition-colors capitalize ${q.knockout_expected_answer === v ? "bg-ink text-white" : "bg-white text-muted hover:text-sub"}`}>
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {q.type === "number" && (
                        <div className="flex flex-wrap items-center gap-4">
                          {(["Min", "Max"] as const).map((label) => {
                            const key = label === "Min" ? "knockout_min_value" : "knockout_max_value";
                            return (
                              <div key={label} className="flex items-center gap-2">
                                <span className="text-[13px] text-sub">{label}:</span>
                                <input type="number" value={(q[key] as string) ?? ""}
                                  onChange={(e) => updateKnockoutQ(q.id, { [key]: e.target.value })}
                                  placeholder="—"
                                  className="w-24 bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors text-center" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-sub shrink-0">Rejection reason:</span>
                        <input value={q.knockout_rejection_reason}
                          onChange={(e) => updateKnockoutQ(q.id, { knockout_rejection_reason: e.target.value })}
                          placeholder="Shown internally"
                          className="flex-1 bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors placeholder:text-muted" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => addKnockoutQ()}
            className="flex items-center gap-2 text-[13px] text-sub hover:text-ink transition-colors">
            <Plus className="w-4 h-4" /> Add custom screening question
          </button>
        </div>
      </Card>

      {/* ── 6. Candidate Information to Collect ──────────────────────────────── */}
      <Card title="6. Candidate Information to Collect" subtitle="Name and email are always collected. Configure what else to ask.">

        {/* 6A — Personal */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">6A — Personal Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { label: "Phone number",           state: collectPhone,              set: setCollectPhone },
              { label: "Current location",        state: collectCurrLocation,       set: setCollectCurrLocation },
              { label: "Date of birth",           state: collectDOB,                set: setCollectDOB },
              { label: "Gender",                  state: collectGender,             set: setCollectGender },
              { label: "Nationality",             state: collectNationality,        set: setCollectNationality },
              { label: "Country of residence",    state: collectCountryOfResidence, set: setCollectCountryOfResidence },
              { label: "Full address",            state: collectFullAddress,        set: setCollectFullAddress },
            ] as Array<{ label: string; state: boolean; set: (v: boolean) => void }>).map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => set(!state)}
                  className={`w-4 h-4 rounded-[2px] border-2 flex items-center justify-center shrink-0 transition-colors ${state ? "bg-ink border-ink" : "border-border bg-white"}`}>
                  {state && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </button>
                <span className="text-[13px] text-sub">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 6B — Professional */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">6B — Professional Background</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { label: "Current job title",          state: collectCurrentJobTitle,   set: setCollectCurrentJobTitle },
              { label: "Current / most recent employer", state: collectCurrentEmployer, set: setCollectCurrentEmployer },
              { label: "Total years of experience",  state: collectTotalYearsExp,     set: setCollectTotalYearsExp },
              { label: "Notice period / availability", state: collectNoticePeriod,    set: setCollectNoticePeriod },
              { label: "Expected salary",            state: collectExpectedSalary,    set: setCollectExpectedSalary },
              { label: "Employment history",         state: collectEmpHistory,        set: setCollectEmpHistory },
              { label: "Education history",          state: collectEduHistory,        set: setCollectEduHistory },
              { label: "Willing to relocate",        state: collectWillingToRelocate, set: setCollectWillingToRelocate },
            ] as Array<{ label: string; state: boolean; set: (v: boolean) => void }>).map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => set(!state)}
                  className={`w-4 h-4 rounded-[2px] border-2 flex items-center justify-center shrink-0 transition-colors ${state ? "bg-ink border-ink" : "border-border bg-white"}`}>
                  {state && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </button>
                <span className="text-[13px] text-sub">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 6C — References */}
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">6C — References</p>
          <Toggle on={collectRefs} onChange={setCollectRefs} label="Collect professional references" />
          {collectRefs && (
            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-sub">Number of references to collect:</span>
                <div className="flex items-center border border-border rounded-[4px] overflow-hidden text-[13px] font-medium">
                  {([1, 2, 3] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setRefsCount(n)}
                      className={`w-9 py-1.5 transition-colors ${refsCount === n ? "bg-ink text-white" : "bg-white text-muted hover:text-sub"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[12px] text-muted">
                For each reference, candidates will provide: Name, Job title, Company, Relationship, Email, Phone.
              </p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">6D — Documents & Links</p>
          <div className="space-y-2">
            {PRESET_REQUIREMENTS.map((preset) => {
              const active = activeDocPresets.has(preset.id);
              return (
                <div key={preset.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[4px] border transition-colors ${active ? "bg-white border-ink" : "bg-[var(--bg)] border-border"}`}>
                  <button type="button" onClick={() => toggleDocPreset(preset.id)}
                    className={`w-4 h-4 rounded-[2px] border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "bg-ink border-ink" : "border-border bg-white"}`}>
                    {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </button>
                  {preset.type === "file" ? <FileText className="w-3.5 h-3.5 text-muted shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />}
                  <span className={`text-[13px] flex-1 ${active ? "text-ink font-medium" : "text-sub"}`}>{preset.label}</span>
                  {active && (
                    <RequiredToggle
                      required={docPresetRequired[preset.id] ?? true}
                      onChange={(v) => setDocPresetRequired((p) => ({ ...p, [preset.id]: v }))}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {customDocs.length > 0 && (
            <div className="space-y-2">
              {customDocs.map((doc) => (
                <div key={doc.id} className="flex flex-col bg-white border border-ink rounded-[4px] px-3 py-2.5 gap-2">
                  <input value={doc.label} onChange={(e) => updateCustomDoc(doc.id, { label: e.target.value })}
                    placeholder="e.g. Writing sample"
                    className="w-full text-[13px] text-ink bg-transparent outline-none placeholder:text-muted" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={doc.type} onChange={(e) => updateCustomDoc(doc.id, { type: e.target.value as "file" | "link" })}
                      className="text-[12px] text-sub bg-[var(--bg)] border border-border rounded-[4px] px-2 py-1 outline-none cursor-pointer shrink-0">
                      <option value="file">File upload</option>
                      <option value="link">Link</option>
                    </select>
                    <RequiredToggle required={doc.required} onChange={(v) => updateCustomDoc(doc.id, { required: v })} />
                    <button type="button" onClick={() => removeCustomDoc(doc.id)}
                      className="ml-auto p-1 text-muted hover:text-danger transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addCustomDoc}
            className="text-[13px] text-sub hover:text-ink transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add custom document
          </button>
        </div>
      </Card>

      {/* ── 7. Diversity & Equal Opportunity ─────────────────────────────────── */}
      <Card title="7. Diversity & Equal Opportunity" subtitle="All diversity data is anonymous, voluntary, and never used in scoring.">
        <Toggle on={deiEnabled} onChange={setDeiEnabled}
          label="Collect voluntary diversity data from candidates" />
        {deiEnabled && (
          <div className="space-y-3 pt-2">
            <p className="text-[13px] text-sub">Select which categories to collect:</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: "Ethnicity / race",  state: deiEthnicity,  set: setDeiEthnicity },
                { label: "Gender identity",   state: deiGender,     set: setDeiGender },
                { label: "Disability status", state: deiDisability, set: setDeiDisability },
                { label: "Veteran status",    state: deiVeteran,    set: setDeiVeteran },
              ] as Array<{ label: string; state: boolean; set: (v: boolean) => void }>).map(({ label, state, set }) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => set(!state)}
                    className={`w-4 h-4 rounded-[2px] border-2 flex items-center justify-center shrink-0 transition-colors ${state ? "bg-ink border-ink" : "border-border bg-white"}`}>
                    {state && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-[13px] text-sub">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[12px] text-muted">
              Candidates will see a statement that this data is optional, confidential, and used only for aggregate reporting.
            </p>
          </div>
        )}
      </Card>

      {/* ── 8. Interview Questions ────────────────────────────────────────────── */}
      <Card title="8. Interview Questions" subtitle="AI pre-filled these questions. Edit, reorder, add more, or remove any.">
        {customQuestions.length > 0 ? (
          <div className="space-y-3">
            {customQuestions.map((q, i) => (
              <div key={q.id} className="border border-border rounded-[4px] p-4 space-y-3 bg-[var(--bg)]">
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-muted mt-2.5 shrink-0 tabular-nums">Q{i + 1}</span>
                  <textarea
                    value={q.question}
                    onChange={(e) => updateCustomQ(q.id, { question: e.target.value })}
                    rows={2}
                    placeholder="Type your interview question…"
                    className="flex-1 bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none resize-none focus:border-ink transition-colors placeholder:text-muted"
                  />
                  <button type="button" onClick={() => removeCustomQ(q.id)}
                    className="text-muted hover:text-danger transition-colors mt-2 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 pl-7">
                  <span className="text-[12px] text-muted">{q.focus_area}</span>
                  {q.what_it_reveals && (
                    <span className="text-[12px] text-muted">· {q.what_it_reveals}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted py-2">No questions yet. Add some below.</p>
        )}

        <button type="button" onClick={addCustomQ}
          className="flex items-center gap-2 text-[13px] text-sub hover:text-ink transition-colors">
          <Plus className="w-4 h-4" /> Add interview question
        </button>
      </Card>

      {/* ── 9. AI Response Deterrent ──────────────────────────────────────────── */}
      <Card title="9. AI Response Deterrent" subtitle="AI detection always runs. This controls whether candidates see a deterrent notice.">
        <div className="rounded-[4px] bg-[var(--bg)] border border-border px-4 py-3 text-[13px] text-sub">
          <strong className="text-ink">AI detection is always active.</strong> Every candidate response
          is scanned for AI-generated content. If deterrent is enabled, candidates see a warning and
          AI-flagged responses receive a stronger score penalty.
        </div>

        <Toggle on={deterrentEnabled} onChange={setDeterrentEnabled}
          label={deterrentEnabled ? "Show deterrent notice to candidates" : "Deterrent notice hidden"} />

        {deterrentEnabled && (
          <div className="space-y-4">
            <FieldSelect label="Show notice" value={deterrentPlacement} onChange={setDeterrentPlacement}>
              <option value="at_start">At the start (before any questions)</option>
              <option value="before_questions">Before interview questions begin</option>
              <option value="after_questions">At the end (after all questions)</option>
            </FieldSelect>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink">Notice message</label>
              <textarea
                value={deterrentMessage}
                onChange={(e) => setDeterrentMessage(e.target.value)}
                rows={3}
                className="w-full bg-white border border-border rounded-[4px] px-3 py-2.5 text-base text-ink outline-none resize-none focus:border-ink transition-colors"
              />
            </div>
          </div>
        )}
      </Card>

      {/* ── Application Controls ──────────────────────────────────────────────── */}
      <Card title="Application Controls">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Application deadline</label>
            <input type="date" value={appDeadline} onChange={(e) => setAppDeadline(e.target.value)}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors" />
            <p className="text-[12px] text-muted">Auto-closes on this date. Leave blank for no deadline.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Application limit</label>
            <input type="number" min={0} max={10000} value={appLimit}
              onChange={(e) => setAppLimit(Number(e.target.value))}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors" />
            <p className="text-[12px] text-muted">Max applications before auto-closing. 0 = unlimited.</p>
          </div>
        </div>
      </Card>

      <Button className="w-full" size="lg" onClick={handlePublish} isLoading={isPublishing} loadingText="Publishing…">
        Publish Job →
      </Button>
    </div>
  );
}
