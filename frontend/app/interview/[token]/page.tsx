"use client";

/**
 * HireIQ Candidate Interview Flow
 * Three screens rendered on this single route:
 *   welcome  → Interview intake (name, email, consent)
 *   active   → Live adaptive AI interview
 *   review   → Review and edit answers before submitting
 *   complete → Success screen after submission
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Zap, CheckCircle2, AlertCircle, ChevronRight, Edit3 } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import type { JobPublicInfo, TranscriptEntry } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Screen = "loading" | "welcome" | "active" | "review" | "complete" | "error";

const MIN_ANSWER_CHARS = 50;
const AUTO_SAVE_INTERVAL_MS = 10_000;
const RESUME_STORAGE_KEY = "hireiq_interview_state";

interface LocalInterviewState {
  interview_id: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  transcript: TranscriptEntry[];
  current_question: string;
  current_question_index: number;
  link_token: string;
  saved_at: number;
}

function saveLocalState(state: LocalInterviewState): void {
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable — not fatal
  }
}

function loadLocalState(linkToken: string): LocalInterviewState | null {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as LocalInterviewState;
    if (state.link_token !== linkToken) return null;
    // Only resume within 24 hours
    if (Date.now() - state.saved_at > 24 * 60 * 60 * 1000) return null;
    return state;
  } catch {
    return null;
  }
}

function clearLocalState(): void {
  try {
    localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen] = useState<Screen>("loading");
  const [jobInfo, setJobInfo] = useState<JobPublicInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Welcome form
  const [candidateName, setCandidateName]   = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [formErrors, setFormErrors]         = useState<Record<string, string>>({});

  // Interview state
  const [interviewId, setInterviewId]       = useState("");
  const [jobId, setJobId]                   = useState("");
  const [transcript, setTranscript]         = useState<TranscriptEntry[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer]   = useState("");

  // UI state
  const [isStarting, setIsStarting]         = useState(false);
  const [isNextLoading, setIsNextLoading]   = useState(false);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [aiError, setAiError]               = useState("");
  const [editingIndex, setEditingIndex]     = useState<number | null>(null);
  const [editValue, setEditValue]           = useState("");

  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedAnswerRef = useRef("");

  // Load job info on mount
  useEffect(() => {
    interviewAPI.getJobInfo(token)
      .then((info) => {
        setJobInfo(info);
        setJobId(info.id);
        setScreen("welcome");
      })
      .catch((error: Error) => {
        const msg = error.message.toLowerCase();
        if (msg.includes("expired") || msg.includes("longer active")) {
          setErrorMessage("This interview link has expired. Please contact the company for a new link.");
        } else if (msg.includes("not found")) {
          setErrorMessage("Interview link not found. Please check the link and try again.");
        } else {
          setErrorMessage("Something went wrong loading the interview. Please refresh.");
        }
        setScreen("error");
      });
  }, [token]);

  // Auto-save current answer every 10 seconds
  useEffect(() => {
    if (screen !== "active" || !interviewId) return;

    autoSaveRef.current = setInterval(async () => {
      if (currentAnswer.trim() && currentAnswer !== lastSavedAnswerRef.current) {
        lastSavedAnswerRef.current = currentAnswer;
        try {
          await interviewAPI.saveAnswer(
            interviewId,
            currentQuestionIndex,
            currentQuestion,
            currentAnswer,
          );
          saveLocalState({
            interview_id: interviewId,
            job_id: jobId,
            candidate_name: candidateName,
            candidate_email: candidateEmail,
            transcript,
            current_question: currentQuestion,
            current_question_index: currentQuestionIndex,
            link_token: token,
            saved_at: Date.now(),
          });
        } catch {
          // Auto-save failure is non-fatal; local state handles backup
        }
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [
    screen, interviewId, currentAnswer, currentQuestion,
    currentQuestionIndex, transcript, jobId,
    candidateName, candidateEmail, token,
  ]);

  const validateWelcomeForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!candidateName.trim() || candidateName.trim().length < 2) {
      errors.name = "Please enter your full name.";
    }
    if (!candidateEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!consentChecked) {
      errors.consent = "You must confirm your consent to proceed.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [candidateName, candidateEmail, consentChecked]);

  const handleBeginInterview = useCallback(async () => {
    if (!validateWelcomeForm() || !jobInfo) return;
    setIsStarting(true);
    setAiError("");

    try {
      // Check for local resume state first
      const localState = loadLocalState(token);

      const result = await interviewAPI.startInterview(
        token,
        candidateName.trim(),
        candidateEmail.trim(),
      );

      setInterviewId(result.interview_id);

      if (result.resumed && (localState || result.transcript.length > 0)) {
        // Restore in-progress session
        const savedTranscript = localState?.transcript ?? result.transcript;
        const savedQuestion = localState?.current_question ?? "";
        const savedIndex = localState?.current_question_index ?? savedTranscript.length;

        setTranscript(savedTranscript);
        setCurrentQuestionIndex(savedIndex);

        if (savedQuestion) {
          setCurrentQuestion(savedQuestion);
        } else {
          // Need to generate next question based on existing transcript
          const nextQ = await interviewAPI.getNextQuestion(
            result.interview_id,
            jobId,
            savedTranscript,
            savedTranscript[savedTranscript.length - 1]?.answer ?? "",
          );
          setCurrentQuestion(nextQ);
        }
      } else {
        // New session — use first question from job
        const firstQuestion = (jobInfo as JobPublicInfo & { questions?: Array<{ question: string }> })
          .questions?.[0]?.question ??
          `Welcome, ${candidateName.trim().split(" ")[0]}! I'm looking forward to learning about you today. To start, could you tell me a bit about your background and what drew you to apply for this ${jobInfo.title} position?`;

        setCurrentQuestion(firstQuestion);
        setCurrentQuestionIndex(0);
      }

      setScreen("active");
    } catch (error: unknown) {
      const msg = (error as Error).message ?? "";
      if (msg.toLowerCase().includes("already submitted")) {
        setErrorMessage("You have already submitted your interview for this position.");
        setScreen("error");
      } else {
        setAiError(
          "Something went wrong starting your interview. Please refresh the page and try again.",
        );
      }
    } finally {
      setIsStarting(false);
    }
  }, [validateWelcomeForm, jobInfo, token, candidateName, candidateEmail, jobId]);

  const handleNextQuestion = useCallback(async () => {
    if (currentAnswer.trim().length < MIN_ANSWER_CHARS) return;

    setIsNextLoading(true);
    setAiError("");

    const completedEntry: TranscriptEntry = {
      question_index: currentQuestionIndex,
      question: currentQuestion,
      answer: currentAnswer.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedTranscript = [...transcript, completedEntry];
    setTranscript(updatedTranscript);

    // Save to backend
    try {
      await interviewAPI.saveAnswer(
        interviewId,
        currentQuestionIndex,
        currentQuestion,
        currentAnswer.trim(),
      );
      lastSavedAnswerRef.current = currentAnswer.trim();
    } catch {
      // Non-fatal — localStorage backup exists
    }

    const totalQuestions = jobInfo?.question_count ?? 8;
    const nextIndex = currentQuestionIndex + 1;

    if (nextIndex >= totalQuestions) {
      // All questions answered — go to review
      setCurrentAnswer("");
      setScreen("review");
      setIsNextLoading(false);
      return;
    }

    // Generate adaptive next question
    try {
      const nextQ = await interviewAPI.getNextQuestion(
        interviewId,
        jobId,
        updatedTranscript,
        currentAnswer.trim(),
      );

      setCurrentQuestion(nextQ);
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer("");

      // Update local backup
      saveLocalState({
        interview_id: interviewId,
        job_id: jobId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        transcript: updatedTranscript,
        current_question: nextQ,
        current_question_index: nextIndex,
        link_token: token,
        saved_at: Date.now(),
      });
    } catch (error: unknown) {
      setAiError(
        "We're having trouble generating your next question. Please refresh and try again.",
      );
    } finally {
      setIsNextLoading(false);
    }
  }, [
    currentAnswer, currentQuestionIndex, currentQuestion, transcript,
    interviewId, jobId, jobInfo, candidateName, candidateEmail, token,
  ]);

  const handleSubmitInterview = useCallback(async () => {
    setIsSubmitting(true);
    setAiError("");
    try {
      await interviewAPI.submitInterview(interviewId, transcript);
      clearLocalState();
      setScreen("complete");
    } catch {
      setAiError("Something went wrong submitting your interview. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [interviewId, transcript]);

  const totalQuestions = jobInfo?.question_count ?? 8;
  const firstName = candidateName.trim().split(" ")[0] ?? "there";

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (screen === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Unable to Load Interview</h1>
          <p className="text-[var(--text-muted)] text-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────────
  if (screen === "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Thank you, {firstName}!
          </h1>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Your interview has been submitted to{" "}
            <span className="text-white font-medium">{jobInfo?.company_name}</span>'s hiring team.
            You'll hear from them directly if you're selected to move forward.
          </p>
          <p className="text-sm text-[var(--text-dim)] mt-4">Good luck! 🍀</p>
        </div>
      </div>
    );
  }

  // ── REVIEW ─────────────────────────────────────────────────────────────────
  if (screen === "review") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 text-brand-400 font-bold">
            <Zap className="w-4 h-4" /> HireIQ
          </div>
          <p className="text-sm font-medium text-white">Review Your Answers</p>
          <p className="text-xs text-[var(--text-muted)]">{jobInfo?.company_name}</p>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-white">Almost there, {firstName}!</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Review your answers before submitting. You can edit any response below.
            </p>
          </div>

          {aiError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {aiError}
            </div>
          )}

          {/* Candidate info */}
          <div className="glass rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{candidateName}</p>
              <p className="text-xs text-[var(--text-muted)]">{candidateEmail}</p>
            </div>
          </div>

          {/* Q&A pairs */}
          <div className="space-y-4">
            {transcript.map((entry, index) => (
              <div key={index} className="glass rounded-2xl p-5">
                <p className="text-xs font-semibold text-brand-400 mb-2">
                  Q{index + 1}. {entry.question}
                </p>
                {editingIndex === index ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={5}
                      className="w-full bg-[var(--bg)] border border-brand-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none focus:border-brand-500"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (editValue.trim().length >= MIN_ANSWER_CHARS) {
                            setTranscript((prev) =>
                              prev.map((e, i) =>
                                i === index ? { ...e, answer: editValue.trim() } : e,
                              ),
                            );
                          }
                          setEditingIndex(null);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-[var(--text)] leading-relaxed flex-1">
                      {entry.answer}
                    </p>
                    <button
                      onClick={() => {
                        setEditingIndex(index);
                        setEditValue(entry.answer);
                      }}
                      className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-brand-400 hover:bg-brand-500/8 transition-colors shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
            loadingText="Submitting your interview..."
            onClick={() => {
              if (confirm("Once submitted, your answers cannot be changed. Are you ready to submit?")) {
                handleSubmitInterview();
              }
            }}
          >
            <CheckCircle2 className="w-5 h-5" />
            Submit Interview
          </Button>
        </div>
      </div>
    );
  }

  // ── ACTIVE INTERVIEW ───────────────────────────────────────────────────────
  if (screen === "active") {
    const charCount = currentAnswer.length;
    const canProceed = charCount >= MIN_ANSWER_CHARS && !isNextLoading;
    const progressPct = Math.round(
      ((currentQuestionIndex) / totalQuestions) * 100,
    );

    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        {/* Top bar */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[var(--border)]"
          style={{ background: "var(--bg-card)" }}
        >
          <div className="flex items-center gap-2 text-brand-400 font-bold text-sm">
            <Zap className="w-4 h-4" />
            HireIQ
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-[var(--text-muted)] font-medium">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </p>
            <div className="w-40 h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{jobInfo?.company_name}</p>
        </div>

        {/* Question + Answer */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full">
          {aiError && (
            <div className="w-full mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {aiError}
            </div>
          )}

          <div className="w-full space-y-6 animate-slide-up">
            <div className="glass rounded-2xl px-6 py-5">
              <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-3">
                Question {currentQuestionIndex + 1}
              </p>
              <p className="text-lg text-white leading-relaxed font-medium">
                {currentQuestion}
              </p>
            </div>

            <div className="space-y-2">
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                rows={8}
                placeholder="Type your answer here. Be specific and detailed — the more you share, the better we can represent you to the hiring team."
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--text)] text-sm leading-relaxed outline-none resize-none placeholder:text-[var(--text-dim)] focus:border-brand-500 transition-colors"
                disabled={isNextLoading}
              />
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs ${
                    charCount >= MIN_ANSWER_CHARS
                      ? "text-green-400"
                      : "text-[var(--text-dim)]"
                  }`}
                >
                  {charCount < MIN_ANSWER_CHARS
                    ? `${MIN_ANSWER_CHARS - charCount} more characters required`
                    : `${charCount} characters`}
                </span>
                <Button
                  size="md"
                  disabled={!canProceed}
                  isLoading={isNextLoading}
                  loadingText={
                    currentQuestionIndex + 1 >= totalQuestions
                      ? "Finishing…"
                      : "Next…"
                  }
                  onClick={handleNextQuestion}
                >
                  {currentQuestionIndex + 1 >= totalQuestions
                    ? "Review Answers"
                    : "Next Question"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── WELCOME ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 animate-slide-up">
        {/* Brand */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-brand-400 font-bold text-xl mb-6">
            <Zap className="w-5 h-5" />
            HireIQ
          </div>
          {jobInfo?.company_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={jobInfo.company_logo_url}
              alt={`${jobInfo.company_name} logo`}
              className="h-10 mx-auto mb-4 object-contain"
            />
          )}
          <h1 className="text-xl font-bold text-white">
            {jobInfo?.title} — {jobInfo?.company_name}
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-2 leading-relaxed">
            {jobInfo?.custom_intro_message ??
              `Welcome to your interview. Answer each question as you would in a real interview — honestly, specifically, and with as much detail as you can. There are ${jobInfo?.question_count ?? 8} questions. Take your time.`}
          </p>
        </div>

        {aiError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {aiError}
          </div>
        )}

        <div className="glass rounded-2xl p-6 space-y-5">
          <Input
            label="Full Name"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Jane Smith"
            error={formErrors.name}
            required
            autoFocus
          />
          <Input
            label="Email Address"
            type="email"
            value={candidateEmail}
            onChange={(e) => setCandidateEmail(e.target.value)}
            placeholder="jane@example.com"
            error={formErrors.email}
            required
          />

          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-500 shrink-0"
              />
              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                I confirm my answers are my own and I consent to them being reviewed by{" "}
                <span className="text-white">{jobInfo?.company_name}</span>'s hiring team.
              </span>
            </label>
            {formErrors.consent && (
              <p className="text-xs text-red-400 mt-1.5">⚠ {formErrors.consent}</p>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleBeginInterview}
            isLoading={isStarting}
            loadingText="Starting your interview..."
            disabled={!candidateName || !candidateEmail || !consentChecked}
          >
            Begin Interview →
          </Button>
        </div>

        <p className="text-center text-xs text-[var(--text-dim)]">
          This interview is conducted by HireIQ&apos;s AI system. Your responses will be shared
          with the hiring team at {jobInfo?.company_name}.
        </p>
      </div>
    </div>
  );
}
