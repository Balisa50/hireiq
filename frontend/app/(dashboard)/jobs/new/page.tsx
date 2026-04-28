"use client";

import React, { useState, useCallback, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import { Check, AlertCircle, CheckCircle2, Plus, FileText, Link2, X, Zap } from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { CandidateRequirement, GeneratedQuestion } from "@/lib/types";
import {
  FOCUS_AREAS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  WORK_ARRANGEMENTS,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  PRESET_REQUIREMENTS,
} from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Step = "form" | "questions" | "published";
type Severity = "surface" | "standard" | "deep";
type ScreeningType = "yes_no" | "number" | "text";

interface QuestionWithSeverity extends GeneratedQuestion {
  severity: Severity;
}

interface ScreeningQuestion {
  id: string;
  question: string;
  type: ScreeningType;
  severity: Severity;
  knockout_enabled: boolean;
  knockout_expected_answer?: "yes" | "no";
  knockout_min_value?: string;
  knockout_max_value?: string;
  knockout_rejection_reason: string;
}

function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

// ── Section card ──────────────────────────────────────────────────────────────
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

// ── Select wrapper ─────────────────────────────────────────────────────────────
function Select({
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
        className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
      >
        {children}
      </select>
    </div>
  );
}

// ── Required / Optional toggle ─────────────────────────────────────────────────
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

// ── Severity dial ──────────────────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<Severity, { label: string; description: string; color: string; activeClass: string }> = {
  surface: {
    label:       "Surface",
    description: "Ask once, accept any answer, move on",
    color:       "#6b7280",
    activeClass: "bg-[#6b7280] text-white border-[#6b7280]",
  },
  standard: {
    label:       "Standard",
    description: "One follow-up if answer is vague",
    color:       "#3b82f6",
    activeClass: "bg-[#3b82f6] text-white border-[#3b82f6]",
  },
  deep: {
    label:       "Deep",
    description: "Probes until something specific and real",
    color:       "#7c3aed",
    activeClass: "bg-[#7c3aed] text-white border-[#7c3aed]",
  },
};

function SeverityDial({ value, onChange }: { value: Severity; onChange: (v: Severity) => void }) {
  return (
    <div className="flex items-center gap-1">
      {(["surface", "standard", "deep"] as Severity[]).map((s) => {
        const cfg = SEVERITY_CONFIG[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            title={cfg.description}
            className={`px-2 py-0.5 rounded-[3px] text-[11px] font-semibold border transition-all ${
              active ? cfg.activeClass : "bg-white text-muted border-border hover:border-sub hover:text-sub"
            }`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Screening question presets ────────────────────────────────────────────────
const SCREENING_PRESETS: Array<{ key: string; label: string; template: Partial<ScreeningQuestion> }> = [
  {
    key: "work_auth",
    label: "Work authorization",
    template: {
      question: "Are you legally authorized to work in this country without employer sponsorship?",
      type: "yes_no",
      severity: "surface",
      knockout_enabled: true,
      knockout_expected_answer: "yes",
      knockout_rejection_reason: "Candidate requires sponsorship, which is not available for this role.",
    },
  },
  {
    key: "salary",
    label: "Salary expectation",
    template: {
      question: "What is your expected annual salary?",
      type: "number",
      severity: "surface",
      knockout_enabled: false,
    },
  },
  {
    key: "experience",
    label: "Years of experience",
    template: {
      question: "How many years of relevant professional experience do you have?",
      type: "number",
      severity: "surface",
      knockout_enabled: true,
      knockout_min_value: "2",
      knockout_rejection_reason: "Does not meet the minimum experience requirement for this role.",
    },
  },
  {
    key: "notice",
    label: "Notice period",
    template: {
      question: "How many weeks notice are you required to give your current employer?",
      type: "number",
      severity: "surface",
      knockout_enabled: false,
    },
  },
  {
    key: "reloc",
    label: "Willing to relocate",
    template: {
      question: "Are you willing to relocate for this role?",
      type: "yes_no",
      severity: "surface",
      knockout_enabled: false,
    },
  },
];

// ── Skills tag input ───────────────────────────────────────────────────────────
function SkillsInput({ skills, onChange }: { skills: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addSkill = useCallback((raw: string) => {
    const trimmed = raw.trim().replace(/,+$/, "").trim();
    if (!trimmed || skills.includes(trimmed) || skills.length >= 30) return;
    onChange([...skills, trimmed]);
    setDraft("");
  }, [skills, onChange]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(draft); }
    else if (e.key === "Backspace" && !draft && skills.length > 0) onChange(skills.slice(0, -1));
  }, [draft, skills, addSkill, onChange]);

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="min-h-[42px] flex flex-wrap gap-1.5 items-center bg-white border border-border rounded-[4px] px-3 py-2 cursor-text focus-within:border-ink transition-colors"
    >
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 bg-[var(--bg)] border border-border text-[12px] text-ink font-medium px-2 py-0.5 rounded-[4px]">
          {s}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(skills.filter((x) => x !== s)); }}
            className="text-muted hover:text-danger transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addSkill(draft)}
        placeholder={skills.length === 0 ? "e.g. React, Python, SQL — press Enter or comma to add" : "Add more…"}
        className="flex-1 min-w-[180px] text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
      />
    </div>
  );
}

export default function NewJobPage() {
  const [step, setStep] = useState<Step>("form");

  // ── Basic info ────────────────────────────────────────────────────────────────
  const [title, setTitle]                       = useState("");
  const [department, setDepartment]             = useState("");
  const [location, setLocation]                 = useState("");
  const [employmentType, setEmploymentType]     = useState("full_time");
  const [experienceLevel, setExperienceLevel]   = useState("any");
  const [workArrangement, setWorkArrangement]   = useState("on_site");
  const [openings, setOpenings]                 = useState(1);

  // ── Job description ───────────────────────────────────────────────────────────
  const [jobDescription, setJobDescription] = useState("");
  const [skills, setSkills]                 = useState<string[]>([]);

  // ── Application settings ──────────────────────────────────────────────────────
  const [questionCount, setQuestionCount] = useState(8);
  const [focusAreas, setFocusAreas]       = useState<string[]>(["Technical Skills", "Problem Solving", "Communication"]);

  // ── Compensation ──────────────────────────────────────────────────────────────
  const [salaryDisclosed, setSalaryDisclosed] = useState(false);
  const [salaryMin, setSalaryMin]             = useState("");
  const [salaryMax, setSalaryMax]             = useState("");
  const [salaryCurrency, setSalaryCurrency]   = useState("USD");
  const [salaryPeriod, setSalaryPeriod]       = useState("year");

  // ── Candidate requirements ────────────────────────────────────────────────────
  const [activePresets, setActivePresets]   = useState<Set<string>>(new Set());
  const [presetRequired, setPresetRequired] = useState<Record<string, boolean>>({});
  const [customReqs, setCustomReqs]         = useState<Array<{ id: string; label: string; type: "file" | "link"; required: boolean }>>([]);

  // ── Screening / knockout questions ────────────────────────────────────────────
  const [screeningQuestions, setScreeningQuestions] = useState<ScreeningQuestion[]>([]);

  const addScreeningQuestion = useCallback((template?: Partial<ScreeningQuestion>) => {
    setScreeningQuestions((p) => [...p, {
      id: `sq-${Date.now()}`,
      question: "",
      type: "yes_no",
      severity: "surface",
      knockout_enabled: false,
      knockout_expected_answer: "yes",
      knockout_min_value: "",
      knockout_max_value: "",
      knockout_rejection_reason: "",
      ...template,
    }]);
  }, []);

  const updateScreeningQ = useCallback((id: string, updates: Partial<ScreeningQuestion>) => {
    setScreeningQuestions((p) => p.map((q) => q.id === id ? { ...q, ...updates } : q));
  }, []);

  const removeScreeningQ = useCallback((id: string) => {
    setScreeningQuestions((p) => p.filter((q) => q.id !== id));
  }, []);

  // ── Severity Engine state ─────────────────────────────────────────────────────
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionWithSeverity[]>([]);
  const [isGenerating, setIsGenerating]             = useState(false);
  const [generateError, setGenerateError]           = useState("");

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing]   = useState(false);
  const [errors, setErrors]               = useState<Record<string, string>>({});
  const [apiError, setApiError]           = useState("");
  const [publishedToken, setPublishedToken] = useState("");
  const [linkCopied, setLinkCopied]       = useState(false);

  const wc = wordCount(jobDescription);

  // ── Requirements helpers ──────────────────────────────────────────────────────
  const buildRequirements = useCallback((): CandidateRequirement[] => {
    const result: CandidateRequirement[] = [];
    for (const preset of PRESET_REQUIREMENTS) {
      if (activePresets.has(preset.id)) result.push({ ...preset, required: presetRequired[preset.id] ?? true });
    }
    for (const c of customReqs) { if (c.label.trim()) result.push(c); }
    return result;
  }, [activePresets, presetRequired, customReqs]);

  const togglePreset = useCallback((id: string) => {
    setActivePresets((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const addCustomReq = useCallback(() => {
    setCustomReqs((p) => [...p, { id: `custom-${Date.now()}`, label: "", type: "file", required: true }]);
  }, []);

  const updateCustomReq = useCallback((id: string, updates: Partial<{ label: string; type: "file" | "link"; required: boolean }>) => {
    setCustomReqs((p) => p.map((r) => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const removeCustomReq = useCallback((id: string) => {
    setCustomReqs((p) => p.filter((r) => r.id !== id));
  }, []);

  const toggleFocusArea = useCallback((area: string) => {
    setFocusAreas((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
  }, []);

  const updateQuestionSeverity = useCallback((id: string, severity: Severity) => {
    setGeneratedQuestions((prev) => prev.map((q) => q.id === id ? { ...q, severity } : q));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim())       e.title      = "Job title is required.";
    if (!department.trim())  e.department = "Department is required.";
    if (!location.trim())    e.location   = "Office location is required.";
    if (wc < 100)            e.desc       = `Minimum 100 words. You have ${wc}.`;
    if (!focusAreas.length)  e.focus      = "Select at least one focus area.";
    if (openings < 1 || openings > 99) e.openings = "Openings must be between 1 and 99.";
    if (salaryDisclosed) {
      const min = parseInt(salaryMin, 10); const max = parseInt(salaryMax, 10);
      if (salaryMin && isNaN(min))  e.salary = "Salary min must be a number.";
      if (salaryMax && isNaN(max))  e.salary = "Salary max must be a number.";
      if (!isNaN(min) && !isNaN(max) && max < min) e.salary = "Max must be greater than min.";
    }
    setErrors(e);
    return !Object.keys(e).length;
  }, [title, department, location, wc, focusAreas, openings, salaryDisclosed, salaryMin, salaryMax]);

  // ── Generate questions ────────────────────────────────────────────────────────
  const handleGenerateQuestions = useCallback(async () => {
    if (!validate()) return;
    setIsGenerating(true);
    setGenerateError("");
    try {
      const result = await jobsAPI.generateQuestions({
        title, department, location,
        employment_type:  employmentType,
        job_description:  jobDescription,
        question_count:   questionCount,
        focus_areas:      focusAreas,
        candidate_requirements: buildRequirements(),
      });
      const withSeverity: QuestionWithSeverity[] = result.questions.map((q: GeneratedQuestion) => ({
        ...q,
        severity: "standard" as Severity,
      }));
      setGeneratedQuestions(withSeverity);
      setStep("questions");
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate questions. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [validate, title, department, location, employmentType, jobDescription, questionCount, focusAreas, buildRequirements]);

  // ── Publish ───────────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setApiError("");
    try {
      // Merge screening (knockout) questions at the start + AI-generated questions after
      const mergedQuestions = [
        ...screeningQuestions
          .filter((q) => q.question.trim())
          .map((q) => ({
            id:                       q.id,
            question:                 q.question,
            type:                     q.type,
            focus_area:               "Screening",
            what_it_reveals:          "",
            severity:                 q.severity,
            knockout_enabled:         q.knockout_enabled,
            knockout_expected_answer: q.knockout_expected_answer ?? null,
            knockout_min_value:       q.knockout_min_value ? parseFloat(q.knockout_min_value) : null,
            knockout_max_value:       q.knockout_max_value ? parseFloat(q.knockout_max_value) : null,
            knockout_rejection_reason: q.knockout_rejection_reason,
          })),
        ...generatedQuestions,
      ];

      const job = await jobsAPI.publishJob({
        title, department, location,
        employment_type:  employmentType,
        job_description:  jobDescription,
        question_count:   questionCount,
        focus_areas:      focusAreas,
        questions:        mergedQuestions,
        candidate_requirements: buildRequirements(),
        experience_level: experienceLevel,
        work_arrangement: workArrangement,
        openings,
        skills,
        salary_min:       salaryDisclosed && salaryMin ? parseInt(salaryMin, 10) : undefined,
        salary_max:       salaryDisclosed && salaryMax ? parseInt(salaryMax, 10) : undefined,
        salary_currency:  salaryCurrency,
        salary_period:    salaryPeriod,
        salary_disclosed: salaryDisclosed,
      });
      setPublishedToken(String(job.interview_link_token));
      setStep("published");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to publish job.");
    } finally { setIsPublishing(false); }
  }, [
    title, department, location, employmentType, jobDescription,
    questionCount, focusAreas, generatedQuestions, buildRequirements,
    experienceLevel, workArrangement, openings, skills,
    salaryDisclosed, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
  ]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(jobsAPI.buildInterviewLink(publishedToken));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [publishedToken]);

  // ── PUBLISHED screen ──────────────────────────────────────────────────────────
  if (step === "published") {
    const link = jobsAPI.buildInterviewLink(publishedToken);
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <div className="w-12 h-12 rounded-[4px] bg-green-50 border border-success/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">Your job is live.</h1>
          <p className="text-sub text-sm mb-7 leading-relaxed">
            Share this link on LinkedIn, your careers page, or email it directly.
            Applicants click it and start right away, no account needed.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 font-mono text-[13px] text-ink bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 outline-none cursor-pointer" />
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied!</> : <><Check className="w-3.5 h-3.5" /> Copy</>}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 text-[13px] mt-4">
            <Link href="/jobs" className="text-sub hover:text-ink transition-colors">View jobs</Link>
            <button onClick={() => {
              setStep("form"); setTitle(""); setDepartment(""); setLocation("");
              setJobDescription(""); setSkills([]); setPublishedToken("");
              setActivePresets(new Set()); setCustomReqs([]);
              setSalaryDisclosed(false); setSalaryMin(""); setSalaryMax("");
              setGeneratedQuestions([]); setScreeningQuestions([]);
            }} className="text-sub hover:text-ink transition-colors">
              Post another job
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONS + SEVERITY screen ────────────────────────────────────────────────
  if (step === "questions") {
    const deepCount     = generatedQuestions.filter((q) => q.severity === "deep").length;
    const surfaceCount  = generatedQuestions.filter((q) => q.severity === "surface").length;
    const standardCount = generatedQuestions.filter((q) => q.severity === "standard").length;

    return (
      <div className="max-w-2xl mx-auto space-y-5 pb-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Set severity levels</h1>
            <p className="text-sub text-sm mt-1">
              Control how hard the AI pushes on each question.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="text-[13px] text-sub hover:text-ink transition-colors shrink-0 mt-1"
          >
            Back
          </button>
        </div>

        {/* Legend */}
        <div className="bg-white border border-border rounded-[4px] p-4 space-y-2">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-3">Severity levels</p>
          {(["surface", "standard", "deep"] as Severity[]).map((s) => {
            const cfg = SEVERITY_CONFIG[s];
            return (
              <div key={s} className="flex items-start gap-3">
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded-[3px] text-[11px] font-semibold text-white shrink-0"
                  style={{ background: cfg.color }}
                >
                  {cfg.label}
                </span>
                <p className="text-[13px] text-sub">{cfg.description}</p>
              </div>
            );
          })}
          <p className="text-[12px] text-muted pt-1">
            Tip: set your most critical competency to Deep. The AI probes it relentlessly and it counts double in the score.
          </p>
        </div>

        {apiError && (
          <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
          </div>
        )}

        {/* Questions */}
        <div className="bg-white border border-border rounded-[4px] divide-y divide-border">
          {generatedQuestions.map((q, i) => (
            <div key={q.id} className="px-5 py-4 space-y-2.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-[11px] font-semibold text-muted mt-0.5 shrink-0 tabular-nums">
                    Q{i + 1}
                  </span>
                  <p className="text-sm text-ink leading-relaxed">{q.question}</p>
                </div>
                <SeverityDial value={q.severity as Severity} onChange={(v) => updateQuestionSeverity(q.id, v)} />
              </div>
              <div className="flex items-center gap-2 pl-7">
                <span className="text-[12px] text-muted">{q.focus_area}</span>
                {q.severity === "deep" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7c3aed]">
                    <Zap className="w-3 h-3" /> Double weight in score
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <p className="text-[13px] text-muted text-center">
          {deepCount > 0 && <span className="font-semibold text-[#7c3aed]">{deepCount} Deep</span>}
          {deepCount > 0 && standardCount > 0 && " · "}
          {standardCount > 0 && <span>{standardCount} Standard</span>}
          {(deepCount > 0 || standardCount > 0) && surfaceCount > 0 && " · "}
          {surfaceCount > 0 && <span>{surfaceCount} Surface</span>}
        </p>

        <Button className="w-full" size="lg" onClick={handlePublish} isLoading={isPublishing} loadingText="Publishing…">
          Publish Job →
        </Button>
      </div>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create a job</h1>
        <p className="text-sub text-sm mt-1">
          Fill in the details and HireIQ will run a smart application conversation for every candidate.
        </p>
      </div>

      {apiError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
        </div>
      )}

      {generateError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{generateError}
        </div>
      )}

      {/* 1. Basic information */}
      <Card title="Basic information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input label="Job Title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Data Analyst" error={errors.title} required />
          <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering" error={errors.department} required />
          <Select label="Employment Type" value={employmentType} onChange={setEmploymentType}>
            {EMPLOYMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select label="Experience Level" value={experienceLevel} onChange={setExperienceLevel}>
            {EXPERIENCE_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Number of Openings</label>
            <input
              type="number" min={1} max={99} value={openings}
              onChange={(e) => setOpenings(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
              className={`w-full bg-white border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors ${errors.openings ? "border-danger" : "border-border"}`}
            />
            {errors.openings && <p className="text-[13px] text-danger">{errors.openings}</p>}
          </div>
        </div>
      </Card>

      {/* 2. Location */}
      <Card title="Location & Work Arrangement">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Select label="Work Arrangement" value={workArrangement} onChange={setWorkArrangement}>
            {WORK_ARRANGEMENTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">
              Office Location <span className="text-danger">*</span>
            </label>
            <input
              value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder={workArrangement === "remote" ? "e.g. Worldwide / US only" : "e.g. London, UK"}
              className={`w-full bg-white border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted ${errors.location ? "border-danger" : "border-border"}`}
            />
            {errors.location && <p className="text-[13px] text-danger">{errors.location}</p>}
          </div>
        </div>
      </Card>

      {/* 3. Compensation */}
      <Card title="Compensation">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSalaryDisclosed((v) => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors ${salaryDisclosed ? "bg-ink" : "bg-border"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${salaryDisclosed ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <span className="text-sm text-ink font-medium">
            {salaryDisclosed ? "Salary range disclosed to applicants" : "Don't disclose salary"}
          </span>
        </div>
        {salaryDisclosed && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Min Salary</label>
                <input type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 60000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Max Salary</label>
                <input type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 90000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted" />
              </div>
            </div>
            {errors.salary && <p className="text-[13px] text-danger">{errors.salary}</p>}
            <div className="grid grid-cols-2 gap-4">
              <Select label="Currency" value={salaryCurrency} onChange={setSalaryCurrency}>
                {SALARY_CURRENCIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select label="Period" value={salaryPeriod} onChange={setSalaryPeriod}>
                {SALARY_PERIODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* 4. Job description & skills */}
      <Card title="Job Description & Skills">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink">Description <span className="text-danger">*</span></span>
            <span className={`text-[13px] font-medium tabular-nums ${wc >= 100 ? "text-success" : "text-muted"}`}>{wc} / 100 words min</span>
          </div>
          <textarea
            value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={9}
            placeholder="Describe the role in detail: responsibilities, day-to-day work, what success looks like, team context. The AI uses this to run a relevant application conversation. Aim for 150+ words."
            className={`w-full bg-white border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink ${errors.desc ? "border-danger" : "border-border"}`}
          />
          {errors.desc && <p className="text-[13px] text-danger mt-1">{errors.desc}</p>}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Required Skills
            <span className="ml-2 text-[12px] font-normal text-muted">optional, press Enter or comma to add</span>
          </label>
          <SkillsInput skills={skills} onChange={setSkills} />
        </div>
      </Card>

      {/* 5. Screening questions */}
      <Card title="Screening Questions" subtitle="Asked first, before AI questions. Enable knockout to auto-reject candidates who don't qualify.">
        {/* Preset quick-adds */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Quick add</p>
          <div className="flex flex-wrap gap-2">
            {SCREENING_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => addScreeningQuestion(preset.template)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-border bg-white text-[13px] text-sub hover:border-ink hover:text-ink transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />{preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question list */}
        {screeningQuestions.length > 0 && (
          <div className="space-y-3">
            {screeningQuestions.map((q) => (
              <div key={q.id} className="border border-border rounded-[4px] p-4 space-y-3 bg-[var(--bg)]">
                {/* Question text + remove */}
                <div className="flex items-start gap-2">
                  <input
                    value={q.question}
                    onChange={(e) => updateScreeningQ(q.id, { question: e.target.value })}
                    placeholder="e.g. Are you authorized to work in the UK without sponsorship?"
                    className="flex-1 bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => removeScreeningQ(q.id)}
                    className="text-muted hover:text-danger transition-colors mt-2 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Type + knockout toggle + severity */}
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={q.type}
                    onChange={(e) => updateScreeningQ(q.id, { type: e.target.value as ScreeningType })}
                    className="bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
                  >
                    <option value="yes_no">Yes / No</option>
                    <option value="number">Number</option>
                    <option value="text">Free text</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => updateScreeningQ(q.id, { knockout_enabled: !q.knockout_enabled })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border text-[13px] font-medium transition-colors ${
                      q.knockout_enabled
                        ? "bg-red-50 border-danger/40 text-danger"
                        : "bg-white border-border text-muted hover:border-sub hover:text-sub"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${q.knockout_enabled ? "bg-danger" : "bg-border"}`} />
                    Knockout
                  </button>

                  <SeverityDial value={q.severity} onChange={(v) => updateScreeningQ(q.id, { severity: v })} />
                </div>

                {/* Knockout config */}
                {q.knockout_enabled && (
                  <div className="space-y-2.5 pt-0.5">
                    {q.type === "yes_no" && (
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] text-sub">Must answer:</span>
                        <div className="flex items-center border border-border rounded-[4px] overflow-hidden text-[13px] font-medium">
                          <button
                            type="button"
                            onClick={() => updateScreeningQ(q.id, { knockout_expected_answer: "yes" })}
                            className={`px-3 py-1.5 transition-colors ${q.knockout_expected_answer === "yes" ? "bg-ink text-white" : "bg-white text-muted hover:text-sub"}`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => updateScreeningQ(q.id, { knockout_expected_answer: "no" })}
                            className={`px-3 py-1.5 transition-colors ${q.knockout_expected_answer === "no" ? "bg-ink text-white" : "bg-white text-muted hover:text-sub"}`}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                    {q.type === "number" && (
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-sub">Min:</span>
                          <input
                            type="number"
                            value={q.knockout_min_value ?? ""}
                            onChange={(e) => updateScreeningQ(q.id, { knockout_min_value: e.target.value })}
                            placeholder="—"
                            className="w-24 bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-sub">Max:</span>
                          <input
                            type="number"
                            value={q.knockout_max_value ?? ""}
                            onChange={(e) => updateScreeningQ(q.id, { knockout_max_value: e.target.value })}
                            placeholder="—"
                            className="w-24 bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors text-center"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-sub shrink-0">Rejection reason:</span>
                      <input
                        value={q.knockout_rejection_reason}
                        onChange={(e) => updateScreeningQ(q.id, { knockout_rejection_reason: e.target.value })}
                        placeholder="Shown internally. e.g. 'Does not meet experience requirement'"
                        className="flex-1 bg-white border border-border rounded-[4px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => addScreeningQuestion()}
          className="flex items-center gap-2 text-[13px] text-sub hover:text-ink transition-colors"
        >
          <Plus className="w-4 h-4" /> Add custom screening question
        </button>
      </Card>

      {/* 6. Application settings */}
      <Card title="Application Settings">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">Depth of application</label>
            <span className="text-sm font-semibold text-ink tabular-nums">{questionCount} questions</span>
          </div>
          <input type="range" min={5} max={15} value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-[13px] text-muted">
            <span>5 — Quick screen</span><span>15 — In-depth</span>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">Focus areas</label>
          {errors.focus && <p className="text-[13px] text-danger">{errors.focus}</p>}
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const sel = focusAreas.includes(area);
              return (
                <button key={area} type="button" onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border ${sel ? "bg-ink text-white border-ink" : "bg-white text-sub border-border hover:border-ink hover:text-ink"}`}>
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 6. Candidate requirements */}
      <Card title="Candidate Requirements" subtitle="What applicants must provide. The AI collects these naturally during the conversation.">
        <div className="space-y-2">
          {PRESET_REQUIREMENTS.map((preset) => {
            const active = activePresets.has(preset.id);
            return (
              <div key={preset.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[4px] border transition-colors ${active ? "bg-white border-ink" : "bg-[var(--bg)] border-border"}`}>
                <button type="button" onClick={() => togglePreset(preset.id)}
                  className={`w-4 h-4 rounded-[2px] border-2 flex items-center justify-center shrink-0 transition-colors ${active ? "bg-ink border-ink" : "border-border bg-white"}`}>
                  {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </button>
                {preset.type === "file" ? <FileText className="w-3.5 h-3.5 text-muted shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />}
                <span className={`text-[13px] flex-1 ${active ? "text-ink font-medium" : "text-sub"}`}>{preset.label}</span>
                {active && (
                  <RequiredToggle
                    required={presetRequired[preset.id] ?? true}
                    onChange={(v) => setPresetRequired((p) => ({ ...p, [preset.id]: v }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        {customReqs.length > 0 && (
          <div className="space-y-2 pt-1">
            {customReqs.map((req) => (
              <div key={req.id} className="flex flex-col bg-white border border-ink rounded-[4px] px-3 py-2.5 gap-2">
                <input
                  value={req.label} onChange={(e) => updateCustomReq(req.id, { label: e.target.value })}
                  placeholder="e.g. Writing sample"
                  className="w-full text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={req.type} onChange={(e) => updateCustomReq(req.id, { type: e.target.value as "file" | "link" })}
                    className="text-[12px] text-sub bg-[var(--bg)] border border-border rounded-[4px] px-2 py-1 outline-none cursor-pointer shrink-0">
                    <option value="file">File upload</option>
                    <option value="link">Link</option>
                  </select>
                  <RequiredToggle required={req.required} onChange={(v) => updateCustomReq(req.id, { required: v })} />
                  <button type="button" onClick={() => removeCustomReq(req.id)}
                    className="ml-auto p-1 text-muted hover:text-danger transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={addCustomReq}
          className="text-[13px] text-sub hover:text-ink transition-colors flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add custom requirement
        </button>

        {buildRequirements().length > 0 && (
          <p className="text-[12px] text-muted">
            {buildRequirements().filter((r) => r.required).length} required ·{" "}
            {buildRequirements().filter((r) => !r.required).length} optional
          </p>
        )}
      </Card>

      <Button className="w-full" size="lg" onClick={handleGenerateQuestions} isLoading={isGenerating} loadingText="Generating questions…">
        Generate Questions →
      </Button>
    </div>
  );
}
