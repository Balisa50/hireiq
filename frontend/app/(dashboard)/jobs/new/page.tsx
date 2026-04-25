"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2, Grip, Trash2, Copy, Check, ChevronLeft,
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

export default function NewJobPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");

  // Form state
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [jobDescription, setJobDescription] = useState("");
  const [questionCount, setQuestionCount] = useState(8);
  const [focusAreas, setFocusAreas] = useState<string[]>([
    "Technical Skills", "Problem Solving", "Communication",
  ]);

  // Question state
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [publishedLinkToken, setPublishedLinkToken] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const wc = wordCount(jobDescription);

  const toggleFocusArea = useCallback((area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }, []);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "Job title is required.";
    if (!department.trim()) newErrors.department = "Department is required.";
    if (!location.trim()) newErrors.location = "Location is required.";
    if (wc < 100) newErrors.jobDescription = `Minimum 100 words required. Currently: ${wc} words.`;
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
        title,
        department,
        location,
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
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, question: text } : q)),
    );
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  // ── PUBLISHED ──────────────────────────────────────────────────────────────
  if (step === "published") {
    const interviewLink = jobsAPI.buildInterviewLink(publishedLinkToken);
    return (
      <div className="max-w-xl mx-auto py-12 animate-slide-up">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Job Published!</h1>
          <p className="text-[var(--text-muted)] text-sm mb-8">
            Share this link with candidates. Every click opens a personalised AI interview.
          </p>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 mb-4 font-mono text-sm text-brand-400 break-all text-left">
            {interviewLink}
          </div>

          <Button
            className="w-full mb-3"
            onClick={copyInterviewLink}
            variant={linkCopied ? "secondary" : "primary"}
          >
            {linkCopied ? (
              <><Check className="w-4 h-4 text-green-400" /> Link Copied!</>
            ) : (
              <><Copy className="w-4 h-4" /> Copy Interview Link</>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/jobs")}
          >
            View All Jobs →
          </Button>
        </div>
      </div>
    );
  }

  // ── QUESTIONS REVIEW ───────────────────────────────────────────────────────
  if (step === "questions") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep("form")}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Review Interview Questions</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Edit, reorder, or delete questions before publishing.
            </p>
          </div>
        </div>

        {apiError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {apiError}
          </div>
        )}

        <div className="space-y-3">
          {questions.map((q, index) => (
            <div key={q.id} className="glass rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <Grip className="w-4 h-4 text-[var(--text-dim)] cursor-grab" />
                  <span className="w-6 h-6 rounded-full bg-brand-500/15 text-brand-400 text-xs font-bold flex items-center justify-center">
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
                      className="w-full bg-[var(--bg)] border border-brand-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none focus:border-brand-500"
                    />
                  ) : (
                    <p
                      className="text-sm text-white cursor-text hover:text-brand-300 transition-colors leading-relaxed"
                      onClick={() => setEditingQuestion(q.id)}
                    >
                      {q.question}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] font-medium text-[var(--text-dim)] bg-white/5 px-2 py-0.5 rounded-full">
                      {q.type}
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)]">
                      {q.focus_area}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteQuestion(q.id)}
                  className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/8 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handlePublishJob}
          isLoading={isPublishing}
          loadingText="Publishing job..."
        >
          <CheckCircle2 className="w-5 h-5" />
          Publish Job & Get Interview Link
        </Button>
      </div>
    );
  }

  // ── JOB FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Job</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Fill in the job details and HireIQ will generate intelligent interview questions.
        </p>
      </div>

      {apiError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {apiError}
        </div>
      )}

      <div className="glass rounded-2xl p-6 space-y-5">
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
            <label className="block text-sm font-medium text-[var(--text-muted)]">
              Employment Type
            </label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[var(--text)] text-sm outline-none focus:border-brand-500 transition-colors"
            >
              {EMPLOYMENT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Job description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Job Description <span className="text-red-400">*</span>
            </label>
            <span
              className={`text-xs font-medium ${
                wc >= 100 ? "text-green-400" : "text-[var(--text-dim)]"
              }`}
            >
              {wc} / 100 words minimum
            </span>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            placeholder="Paste your full job description here. The more detail you provide, the better the AI-generated questions will be. Include responsibilities, requirements, and what success looks like in this role."
            className={`w-full bg-[var(--bg-elevated)] border rounded-xl px-4 py-3 text-[var(--text)] text-sm outline-none resize-none placeholder:text-[var(--text-dim)] transition-colors focus:border-brand-500 ${
              errors.jobDescription ? "border-red-500/50" : "border-[var(--border)]"
            }`}
          />
          {errors.jobDescription && (
            <p className="text-xs text-red-400">⚠ {errors.jobDescription}</p>
          )}
        </div>

        {/* Question count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Number of Interview Questions
            </label>
            <span className="text-sm font-bold text-brand-400">{questionCount}</span>
          </div>
          <input
            type="range"
            min={5}
            max={15}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-[var(--text-dim)]">
            <span>5 (Quick)</span>
            <span>15 (In-depth)</span>
          </div>
        </div>

        {/* Focus areas */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-muted)]">
            Interview Focus Areas
          </label>
          {errors.focusAreas && (
            <p className="text-xs text-red-400">⚠ {errors.focusAreas}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FOCUS_AREAS.map((area) => {
              const selected = focusAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all border ${
                    selected
                      ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-white/15 hover:text-[var(--text)]"
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
        loadingText="Analysing job and crafting questions..."
      >
        <Wand2 className="w-5 h-5" />
        Generate Interview Questions
      </Button>
    </div>
  );
}
