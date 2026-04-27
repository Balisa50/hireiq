"use client";

import React, { useState, useCallback, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import { Check, AlertCircle, CheckCircle2, Plus, FileText, Link2, X } from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { CandidateRequirement } from "@/lib/types";
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

type Step = "form" | "published";

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

// ── Select wrapper ────────────────────────────────────────────────────────────
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

// ── Required / Optional pill toggle ──────────────────────────────────────────
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

// ── Skills tag input ──────────────────────────────────────────────────────────
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
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(draft);
    } else if (e.key === "Backspace" && !draft && skills.length > 0) {
      onChange(skills.slice(0, -1));
    }
  }, [draft, skills, addSkill, onChange]);

  const removeSkill = useCallback((s: string) => {
    onChange(skills.filter((x) => x !== s));
  }, [skills, onChange]);

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="min-h-[42px] flex flex-wrap gap-1.5 items-center bg-white border border-border rounded-[4px] px-3 py-2 cursor-text focus-within:border-ink transition-colors"
    >
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 bg-[var(--bg)] border border-border text-[12px] text-ink font-medium px-2 py-0.5 rounded-[4px]">
          {s}
          <button type="button" onClick={(e) => { e.stopPropagation(); removeSkill(s); }}
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
        placeholder={skills.length === 0 ? "e.g. React, Python, SQL , press Enter or comma to add" : "Add more…"}
        className="flex-1 min-w-[180px] text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
      />
    </div>
  );
}

export default function NewJobPage() {
  const [step, setStep] = useState<Step>("form");

  // ── Basic info ──────────────────────────────────────────────────────────────
  const [title, setTitle]               = useState("");
  const [department, setDepartment]     = useState("");
  const [location, setLocation]         = useState("");
  const [employmentType, setEmploymentType]     = useState("full_time");
  const [experienceLevel, setExperienceLevel]   = useState("any");
  const [workArrangement, setWorkArrangement]   = useState("on_site");
  const [openings, setOpenings]                 = useState(1);

  // ── Job description ─────────────────────────────────────────────────────────
  const [jobDescription, setJobDescription] = useState("");
  const [skills, setSkills]                 = useState<string[]>([]);

  // ── Interview settings ──────────────────────────────────────────────────────
  const [questionCount, setQuestionCount] = useState(8);
  const [focusAreas, setFocusAreas]       = useState<string[]>(["Technical Skills", "Problem Solving", "Communication"]);

  // ── Compensation ────────────────────────────────────────────────────────────
  const [salaryDisclosed, setSalaryDisclosed] = useState(false);
  const [salaryMin, setSalaryMin]             = useState("");
  const [salaryMax, setSalaryMax]             = useState("");
  const [salaryCurrency, setSalaryCurrency]   = useState("USD");
  const [salaryPeriod, setSalaryPeriod]       = useState("year");

  // ── Candidate requirements ──────────────────────────────────────────────────
  const [activePresets, setActivePresets] = useState<Set<string>>(new Set());
  const [presetRequired, setPresetRequired] = useState<Record<string, boolean>>({});
  const [customReqs, setCustomReqs] = useState<Array<{ id: string; label: string; type: "file" | "link"; required: boolean }>>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing]       = useState(false);
  const [errors, setErrors]                   = useState<Record<string, string>>({});
  const [apiError, setApiError]               = useState("");
  const [publishedToken, setPublishedToken]   = useState("");
  const [linkCopied, setLinkCopied]           = useState(false);

  const wc = wordCount(jobDescription);

  // ── Requirements helpers ────────────────────────────────────────────────────
  const buildRequirements = useCallback((): CandidateRequirement[] => {
    const result: CandidateRequirement[] = [];
    for (const preset of PRESET_REQUIREMENTS) {
      if (activePresets.has(preset.id)) {
        result.push({ ...preset, required: presetRequired[preset.id] ?? true });
      }
    }
    for (const c of customReqs) {
      if (c.label.trim()) result.push(c);
    }
    return result;
  }, [activePresets, presetRequired, customReqs]);

  const togglePreset = useCallback((id: string) => {
    setActivePresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim())       e.title      = "Job title is required.";
    if (!department.trim())  e.department = "Department is required.";
    if (!location.trim())    e.location   = "Office location is required.";
    if (wc < 100)            e.desc       = `Minimum 100 words. You have ${wc}.`;
    if (!focusAreas.length)  e.focus      = "Select at least one focus area.";
    if (openings < 1 || openings > 99) e.openings = "Openings must be between 1 and 99.";
    if (salaryDisclosed) {
      const min = parseInt(salaryMin, 10);
      const max = parseInt(salaryMax, 10);
      if (salaryMin && isNaN(min))  e.salary = "Salary min must be a number.";
      if (salaryMax && isNaN(max))  e.salary = "Salary max must be a number.";
      if (!isNaN(min) && !isNaN(max) && max < min) e.salary = "Max salary must be greater than min.";
    }
    setErrors(e);
    return !Object.keys(e).length;
  }, [title, department, location, wc, focusAreas, openings, salaryDisclosed, salaryMin, salaryMax]);

  // ── Publish ─────────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!validate()) return;
    setIsPublishing(true); setApiError("");
    try {
      const job = await jobsAPI.publishJob({
        title, department, location,
        employment_type:  employmentType,
        job_description:  jobDescription,
        question_count:   questionCount,
        focus_areas:      focusAreas,
        questions:        [],
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
    validate, title, department, location, employmentType, jobDescription,
    questionCount, focusAreas, buildRequirements, experienceLevel, workArrangement,
    openings, skills, salaryDisclosed, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
  ]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(jobsAPI.buildInterviewLink(publishedToken));
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  }, [publishedToken]);

  // ── PUBLISHED screen ────────────────────────────────────────────────────────
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
            Candidates click and start their interview immediately , no account needed.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 font-mono text-[13px] text-ink bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 outline-none cursor-pointer" />
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied
                ? <><Check className="w-3.5 h-3.5 text-success" /> Copied!</>
                : <><Check className="w-3.5 h-3.5" /> Copy</>}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 text-[13px] mt-4">
            <Link href="/jobs" className="text-sub hover:text-ink transition-colors">View this job</Link>
            <button onClick={() => {
              setStep("form"); setTitle(""); setDepartment(""); setLocation("");
              setJobDescription(""); setSkills([]); setPublishedToken("");
              setActivePresets(new Set()); setCustomReqs([]);
              setSalaryDisclosed(false); setSalaryMin(""); setSalaryMax("");
            }} className="text-sub hover:text-ink transition-colors">
              Post another job
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create a job</h1>
        <p className="text-sub text-sm mt-1">Fill in the details and HireIQ's AI will run an adaptive interview for every candidate.</p>
      </div>

      {apiError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
        </div>
      )}

      {/* ── 1. Basic information ─────────────────────────────────────────── */}
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

          {/* Openings */}
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

      {/* ── 2. Location & work arrangement ──────────────────────────────── */}
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

      {/* ── 3. Compensation ─────────────────────────────────────────────── */}
      <Card title="Compensation" subtitle="Disclosing salary increases qualified applicant rates by up to 30%.">
        {/* Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSalaryDisclosed((v) => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors ${salaryDisclosed ? "bg-ink" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${salaryDisclosed ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <span className="text-sm text-ink font-medium">
            {salaryDisclosed ? "Salary range disclosed to candidates" : "Don't disclose salary (hiring managers only)"}
          </span>
        </div>

        {salaryDisclosed && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Min Salary</label>
                <input
                  type="number" min={0} value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 60000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ink">Max Salary</label>
                <input
                  type="number" min={0} value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 90000"
                  className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
                />
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

      {/* ── 4. Job description & skills ─────────────────────────────────── */}
      <Card title="Job Description & Skills">
        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink">Description <span className="text-danger">*</span></span>
            <span className={`text-[13px] font-medium tabular-nums ${wc >= 100 ? "text-success" : "text-muted"}`}>{wc} / 100 words min</span>
          </div>
          <textarea
            value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={9}
            placeholder="Describe the role in detail , responsibilities, day-to-day work, what success looks like, and team context. The AI uses this to run a natural, relevant interview. Aim for 150+ words."
            className={`w-full bg-white border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink ${errors.desc ? "border-danger" : "border-border"}`}
          />
          {errors.desc && <p className="text-[13px] text-danger mt-1">{errors.desc}</p>}
        </div>

        {/* Skills */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Required Skills
            <span className="ml-2 text-[12px] font-normal text-muted">optional , press Enter or comma to add each skill</span>
          </label>
          <SkillsInput skills={skills} onChange={setSkills} />
          {skills.length > 0 && (
            <p className="text-[12px] text-muted">{skills.length} skill{skills.length !== 1 ? "s" : ""} added , the AI will probe these during the interview.</p>
          )}
        </div>
      </Card>

      {/* ── 5. Interview settings ────────────────────────────────────────── */}
      <Card title="Interview Settings">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">Depth of interview</label>
            <span className="text-sm font-semibold text-ink tabular-nums">{questionCount} questions</span>
          </div>
          <input type="range" min={5} max={15} value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-[13px] text-muted">
            <span>5 , Quick screen</span><span>15 , In-depth</span>
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
          <p className="text-[13px] text-muted">
            {focusAreas.length} area{focusAreas.length !== 1 ? "s" : ""} selected , the AI will probe these during the conversation.
          </p>
        </div>
      </Card>

      {/* ── 6. Candidate requirements ────────────────────────────────────── */}
      <Card title="Candidate Requirements" subtitle="Choose what candidates must provide. The AI will request these naturally during the conversation.">
        {/* Presets */}
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
                {preset.type === "file"
                  ? <FileText className="w-3.5 h-3.5 text-muted shrink-0" />
                  : <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />}
                <span className={`text-[13px] flex-1 ${active ? "text-ink font-medium" : "text-sub"}`}>
                  {preset.label}
                </span>
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

        {/* Custom requirements */}
        {customReqs.length > 0 && (
          <div className="space-y-2 pt-1">
            {customReqs.map((req) => (
              <div key={req.id} className="flex flex-col bg-white border border-ink rounded-[4px] px-3 py-2.5 gap-2">
                {/* Label input — full width on all screens */}
                <input
                  value={req.label}
                  onChange={(e) => updateCustomReq(req.id, { label: e.target.value })}
                  placeholder="e.g. Writing sample"
                  className="w-full text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
                />
                {/* Controls row — type selector + required toggle + delete, never overflows */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={req.type}
                    onChange={(e) => updateCustomReq(req.id, { type: e.target.value as "file" | "link" })}
                    className="text-[12px] text-sub bg-[var(--bg)] border border-border rounded-[4px] px-2 py-1 outline-none cursor-pointer shrink-0"
                  >
                    <option value="file">File upload</option>
                    <option value="link">Link</option>
                  </select>
                  <RequiredToggle
                    required={req.required}
                    onChange={(v) => updateCustomReq(req.id, { required: v })}
                  />
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

      <Button className="w-full" size="lg" onClick={handlePublish} isLoading={isPublishing} loadingText="Publishing…">
        Publish Job →
      </Button>
    </div>
  );
}
