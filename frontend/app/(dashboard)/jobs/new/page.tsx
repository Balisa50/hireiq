"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2, Grip, Trash2, Copy, Check,
  AlertCircle, CheckCircle2, Loader2,
} from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { GeneratedQuestion } from "@/lib/types";
import { FOCUS_AREAS, EMPLOYMENT_TYPES } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Step = "form" | "questions" | "published";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">
      {children}
    </h2>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function NewJobPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");

  // Form state
  const [title, setTitle]               = useState("");
  const [department, setDepartment]     = useState("");
  const [location, setLocation]         = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [jobDescription, setJobDescription] = useState("");
  const [questionCount, setQuestionCount]   = useState(8);
  const [focusAreas, setFocusAreas] = useState<string[]>([
    "Technical Skills", "Problem Solving", "Communication",
  ]);

  // Question state
  const [questions, setQuestions]           = useState<GeneratedQuestion[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [apiError, setApiError]         = useState("");
  const [publishedLinkToken, setPublishedLinkToken] = useState("");
  const [linkCopied, setLinkCopied]     = useState(false);

  const wc = wordCount(jobDescription);

  const toggleFocusArea = useCallback((area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }, []);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim())      newErrors.title      = "Job title is required.";
    if (!department.trim()) newErrors.department = "Department is required.";
    if (!location.trim())   newErrors.location   = "Location is required.";
    if (wc < 100)           newErrors.jobDescription = `Minimum 100 words. You have ${wc}.`;
    if (focusAreas.length === 0) newErrors.focusAreas = "Select at least one focus area.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [title, department, location, wc, focusAreas]);

  const handleGenerateQuestions = useCallback(async () => {
    if (!validateForm()) return;
    setIsGenerating(true);
    setApiError("");
    try {
      const result = await jobsAPI.generateQuestions({
        title, department, location,
        employment_type: employmentType,
        job_description: jobDescription,
        question_count: questionCount,
        focus_areas: focusAreas,
      });
      setQuestions(result.questions);
      setStep("questions");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to generate questions.");
    } finally {
      setIsGenerating(false);
    }
  }, [validateForm, title, department, location, employmentType, jobDescription, questionCount, focusAreas]);

  const handlePublishJob = useCallback(async () => {
    if (questions.length === 0) return;
    setIsPublishing(true);
    setApiError("");
    try {
      const job = await jobsAPI.publishJob({
        title, department, location,
        employment_type: employmentType,
        job_description: jobDescription,
        question_count: questionCount,
        focus_areas: focusAreas,
        questions,
      });
      setPublishedLinkToken(job.interview_link_token);
      setStep("published");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to publish job.");
    } finally {
      setIsPublishing(false);
    }
  }, [questions, title, department, location, employmentType, jobDescription, questionCount, focusAreas]);

  const copyInterviewLink = useCallback(async () => {
    const link = jobsAPI.buildInterviewLink(publishedLinkToken);
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [publishedLinkToken]);

  const updateQuestion = useCallback((id: string, text: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, question: text } : q)));
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  // ── PUBLISHED ──────────────────────────────────────────────────────────────
  if (step === "published") {
    const interviewLink = jobsAPI.buildInterviewLink(publishedLinkToken);
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <div className="w-12 h-12 rounded-[4px] bg-[var(--bg)] border border-border flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">Job published</h1>
          <p className="text-sub text-sm mb-7">
            Share this link with candidates. Every click opens a personalised AI interview.
          </p>

          <div className="bg-[var(--bg)] border border-border rounded-[4px] px-4 py-3 mb-4 font-mono text-[13px] text-ink break-all text-left select-all">
            {interviewLink}
          </div>

          <Button
            className="w-full mb-3"
            onClick={copyInterviewLink}
            variant={linkCopied ? "secondary" : "primary"}
          >
            {linkCopied ? (
              <><Check className="w-4 h-4 text-success" /> Copied!</>
            ) : (
              <><Copy className="w-4 h-4" /> Copy Interview Link</>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/jobs")}
          >
            View All Jobs
          </Button>
        </div>
      </div>
    );
  }

  // ── QUESTIONS REVIEW ───────────────────────────────────────────────────────
  if (step === "questions") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Review questions</h1>
          <p className="text-sub text-sm mt-1">
            {questions.length} questions generated. Edit or remove any before publishing.
          </p>
        </div>

        {apiError && (
          <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {apiError}
          </div>
        )}

        <div className="space-y-2">
          {questions.map((q, index) => (
            <div
              key={q.id}
              className="bg-white border border-border rounded-[4px] p-4 hover:border-sub transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <Grip className="w-4 h-4 text-muted cursor-grab" />
                  <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[11px] font-medium text-sub">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  {editingQuestion === q.id ? (
                    <textarea
                      value={q.question}
                      onChange={(e) => updateQuestion(q.id, e.target.value)}
                      onBlur={() => setEditingQuestion(null)}
                      autoFocus
                      rows={3}
                      className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none resize-none focus:border-ink transition-colors"
                    />
                  ) : (
                    <p
                      className="text-sm text-ink cursor-text hover:text-ink-2 transition-colors leading-relaxed"
                      onClick={() => setEditingQuestion(q.id)}
                    >
                      {q.question}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] font-medium text-muted bg-[var(--bg)] border border-border px-2 py-0.5 rounded-[4px]">
                      {q.type}
                    </span>
                    <span className="text-[11px] text-muted">{q.focus_area}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteQuestion(q.id)}
                  className="p-1.5 rounded-[4px] text-muted hover:text-danger hover:bg-red-50 transition-colors shrink-0"
                  title="Remove question"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setStep("form")}
            className="text-sm text-sub hover:text-ink transition-colors"
          >
            ← Edit job details
          </button>
          <Button
            className="ml-auto"
            size="lg"
            onClick={handlePublishJob}
            isLoading={isPublishing}
            loadingText="Publishing..."
          >
            Publish Job & Get Link
          </Button>
        </div>
      </div>
    );
  }

  // ── JOB FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create a job</h1>
        <p className="text-sub text-sm mt-1">
          Fill in the details and HireIQ will craft intelligent interview questions.
        </p>
      </div>

      {apiError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {apiError}
        </div>
      )}

      {/* ── Basic info ── */}
      <div className="bg-white border border-border rounded-[4px] p-6 space-y-5">
        <SectionTitle>Basic information</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Data Analyst"
            error={errors.title}
            required
          />
          <Input
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            error={errors.department}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Remote / New York, NY"
            error={errors.location}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">
              Employment Type
            </label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
            >
              {EMPLOYMENT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Job description ── */}
      <div className="bg-white border border-border rounded-[4px] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Job description</SectionTitle>
          <span className={`text-[13px] font-medium ${wc >= 100 ? "text-success" : "text-muted"}`}>
            {wc}/100 words
          </span>
        </div>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={9}
          placeholder="Describe the role in detail — responsibilities, requirements, and what success looks like. The AI uses this to craft relevant, tailored questions. Aim for 150+ words for best results."
          className={`w-full bg-white border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink ${
            errors.jobDescription ? "border-danger" : "border-border"
          }`}
        />
        {errors.jobDescription && (
          <p className="text-[13px] text-danger">{errors.jobDescription}</p>
        )}
      </div>

      {/* ── Interview settings ── */}
      <div className="bg-white border border-border rounded-[4px] p-6 space-y-6">
        <SectionTitle>Interview settings</SectionTitle>

        {/* Question count slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              Number of questions
            </label>
            <span className="text-sm font-semibold text-ink tabular-nums">{questionCount}</span>
          </div>
          <input
            type="range"
            min={5}
            max={15}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[13px] text-muted">
            <span>5 — Quick screen</span>
            <span>15 — In-depth</span>
          </div>
        </div>

        {/* Focus areas */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">
            Focus areas
          </label>
          {errors.focusAreas && (
            <p className="text-[13px] text-danger">{errors.focusAreas}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const selected = focusAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border ${
                    selected
                      ? "bg-ink text-white border-ink"
                      : "bg-white text-sub border-border hover:border-ink hover:text-ink"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerateQuestions}
        isLoading={isGenerating}
        loadingText="Analysing role and crafting questions…"
      >
        <Wand2 className="w-4 h-4" />
        Generate Interview Questions
      </Button>
    </div>
  );
}
