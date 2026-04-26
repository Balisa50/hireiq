"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wand2, Grip, Trash2, Copy, Check, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { GeneratedQuestion } from "@/lib/types";
import { FOCUS_AREAS, EMPLOYMENT_TYPES } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Step = "form" | "questions" | "published";

function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

// ── Progress indicator ────────────────────────────────────────────────────────
function Progress({ step }: { step: Step }) {
  const steps: [Step, string][] = [["form", "Job Details"], ["questions", "Review Questions"], ["published", "Published"]];
  const idx = steps.findIndex(([s]) => s === step);
  return (
    <p className="text-[13px] text-muted mb-6">
      Step {idx + 1} of 3 — <span className="text-ink font-medium">{steps[idx][1]}</span>
    </p>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}

export default function NewJobPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");

  const [title, setTitle]               = useState("");
  const [department, setDepartment]     = useState("");
  const [location, setLocation]         = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [jobDescription, setJobDescription] = useState("");
  const [questionCount, setQuestionCount]   = useState(8);
  const [focusAreas, setFocusAreas] = useState<string[]>(["Technical Skills", "Problem Solving", "Communication"]);

  const [questions, setQuestions]             = useState<GeneratedQuestion[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [isGenerating, setIsGenerating]       = useState(false);
  const [isPublishing, setIsPublishing]       = useState(false);
  const [errors, setErrors]                   = useState<Record<string, string>>({});
  const [apiError, setApiError]               = useState("");
  const [publishedToken, setPublishedToken]   = useState("");
  const [linkCopied, setLinkCopied]           = useState(false);

  const wc = wordCount(jobDescription);

  const toggleFocusArea = useCallback((area: string) => {
    setFocusAreas((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
  }, []);

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim())      e.title      = "Job title is required.";
    if (!department.trim()) e.department = "Department is required.";
    if (!location.trim())   e.location   = "Location is required.";
    if (wc < 100)           e.desc       = `Minimum 100 words. You have ${wc}.`;
    if (!focusAreas.length) e.focus      = "Select at least one focus area.";
    setErrors(e);
    return !Object.keys(e).length;
  }, [title, department, location, wc, focusAreas]);

  const handleGenerate = useCallback(async () => {
    if (!validate()) return;
    setIsGenerating(true); setApiError("");
    try {
      const r = await jobsAPI.generateQuestions({ title, department, location, employment_type: employmentType, job_description: jobDescription, question_count: questionCount, focus_areas: focusAreas });
      setQuestions(r.questions);
      setStep("questions");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to generate questions.");
    } finally { setIsGenerating(false); }
  }, [validate, title, department, location, employmentType, jobDescription, questionCount, focusAreas]);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true); setApiError("");
    try {
      const job = await jobsAPI.publishJob({ title, department, location, employment_type: employmentType, job_description: jobDescription, question_count: questionCount, focus_areas: focusAreas, questions });
      setPublishedToken(job.interview_link_token);
      setStep("published");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to publish job.");
    } finally { setIsPublishing(false); }
  }, [title, department, location, employmentType, jobDescription, questionCount, focusAreas, questions]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(jobsAPI.buildInterviewLink(publishedToken));
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  }, [publishedToken]);

  const updateQ  = useCallback((id: string, text: string) => setQuestions((p) => p.map((q) => q.id === id ? { ...q, question: text } : q)), []);
  const deleteQ  = useCallback((id: string) => setQuestions((p) => p.filter((q) => q.id !== id)), []);
  const addBlank = useCallback(() => {
    const blank: GeneratedQuestion = { id: `custom-${Date.now()}`, question: "", type: "Open", focus_area: "General", what_it_reveals: "" };
    setQuestions((p) => [...p, blank]);
    setEditingQuestion(blank.id);
  }, []);

  // ── PUBLISHED ──────────────────────────────────────────────────────────────
  if (step === "published") {
    const link = jobsAPI.buildInterviewLink(publishedToken);
    return (
      <div className="max-w-lg mx-auto py-12">
        <Progress step="published" />
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <div className="w-12 h-12 rounded-[4px] bg-green-50 border border-success/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">Your job is live.</h1>
          <p className="text-sub text-sm mb-7 leading-relaxed">
            Share this link on LinkedIn, your careers page, or email it directly.
            Candidates click and start their interview immediately — no account needed.
          </p>

          <div className="flex items-center gap-2 mb-4">
            <input
              readOnly
              value={link}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 font-mono text-[13px] text-ink bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 outline-none cursor-pointer"
            />
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-6 text-[13px] mt-4">
            <Link href={`/jobs`} className="text-sub hover:text-ink transition-colors">View this job</Link>
            <button onClick={() => { setStep("form"); setTitle(""); setDepartment(""); setLocation(""); setJobDescription(""); setQuestions([]); setPublishedToken(""); }} className="text-sub hover:text-ink transition-colors">Post another job</button>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONS ──────────────────────────────────────────────────────────────
  if (step === "questions") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Progress step="questions" />
        <div>
          <h1 className="text-xl font-semibold text-ink">Review questions</h1>
          <p className="text-sub text-sm mt-1">{questions.length} questions generated. Edit or remove any before publishing.</p>
        </div>

        {apiError && (
          <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
          </div>
        )}

        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="bg-white border border-border rounded-[4px] p-4 group hover:border-sub transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Grip className="w-4 h-4 text-muted cursor-grab" />
                </div>
                <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[11px] text-muted font-medium shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  {editingQuestion === q.id ? (
                    <textarea value={q.question} onChange={(e) => updateQ(q.id, e.target.value)} onBlur={() => setEditingQuestion(null)}
                      autoFocus rows={3} className="w-full bg-[var(--bg)] border border-ink rounded-[4px] px-3 py-2 text-sm text-ink outline-none resize-none" />
                  ) : (
                    <p className="text-sm text-ink cursor-text hover:text-ink-2 leading-relaxed" onClick={() => setEditingQuestion(q.id)}>
                      {q.question || <span className="text-muted italic">Click to edit…</span>}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted bg-[var(--bg)] border border-border px-1.5 py-0.5 rounded-[4px]">{q.type}</span>
                    <span className="text-[11px] text-muted">{q.focus_area}</span>
                  </div>
                </div>
                <button onClick={() => deleteQ(q.id)} className="p-1.5 text-muted hover:text-danger hover:bg-red-50 rounded-[4px] transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addBlank} className="text-[13px] text-sub hover:text-ink transition-colors flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add a question
        </button>

        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setStep("form")} className="text-[13px] text-muted hover:text-sub transition-colors">
            ← Back to job details
          </button>
          <Button size="lg" onClick={handlePublish} isLoading={isPublishing} loadingText="Publishing…">
            Publish Job →
          </Button>
        </div>
      </div>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Progress step="form" />
      <div>
        <h1 className="text-xl font-semibold text-ink">Create a job</h1>
        <p className="text-sub text-sm mt-1">Fill in the details and HireIQ will craft tailored interview questions.</p>
      </div>

      {apiError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{apiError}
        </div>
      )}

      <Card title="Basic information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input label="Job Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Data Analyst" error={errors.title} required />
          <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" error={errors.department} required />
          <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Remote / New York, NY" error={errors.location} required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Employment Type</label>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer">
              {EMPLOYMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card title="Job description">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink">Description <span className="text-danger">*</span></span>
            <span className={`text-[13px] font-medium tabular-nums ${wc >= 100 ? "text-success" : "text-muted"}`}>{wc} / 100 words minimum</span>
          </div>
          <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={9}
            placeholder="Describe the role in detail — responsibilities, requirements, and what success looks like. The AI uses this to craft relevant, tailored questions. Aim for 150+ words for best results."
            className={`w-full bg-white border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink ${errors.desc ? "border-danger" : "border-border"}`} />
          {errors.desc && <p className="text-[13px] text-danger mt-1">{errors.desc}</p>}
        </div>
      </Card>

      <Card title="Interview settings">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">Number of questions</label>
            <span className="text-sm font-semibold text-ink tabular-nums">{questionCount}</span>
          </div>
          <input type="range" min={5} max={15} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-[13px] text-muted"><span>5 — Quick screen</span><span>15 — In-depth</span></div>
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
          <p className="text-[13px] text-muted">{focusAreas.length} area{focusAreas.length !== 1 ? "s" : ""} selected</p>
        </div>
      </Card>

      <Button className="w-full" size="lg" onClick={handleGenerate} isLoading={isGenerating} loadingText="Generating questions…">
        <Wand2 className="w-4 h-4" /> Generate Interview Questions →
      </Button>
    </div>
  );
}
