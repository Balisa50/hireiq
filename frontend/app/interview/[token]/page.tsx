"use client";

/**
 * HireIQ Candidate Interview
 * Screens: loading → welcome → active → review → complete → error
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Edit3 } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import type { JobPublicInfo, TranscriptEntry } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Screen = "loading" | "welcome" | "active" | "review" | "complete" | "error";

const MIN_ANSWER_CHARS    = 50;
const AUTO_SAVE_INTERVAL  = 10_000;
const RESUME_KEY          = "hireiq_interview_state";

interface LocalState {
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

function saveLocal(s: LocalState) {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function loadLocal(token: string): LocalState | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalState;
    if (s.link_token !== token) return null;
    if (Date.now() - s.saved_at > 86_400_000) return null;
    return s;
  } catch { return null; }
}
function clearLocal() {
  try { localStorage.removeItem(RESUME_KEY); } catch { /* noop */ }
}

// ── BRAND MARK ────────────────────────────────────────────────────────────────
function BrandMark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen]         = useState<Screen>("loading");
  const [jobInfo, setJobInfo]        = useState<JobPublicInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Welcome form
  const [candidateName, setCandidateName]   = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [formErrors, setFormErrors]         = useState<Record<string, string>>({});

  // Interview state
  const [interviewId, setInterviewId]             = useState("");
  const [jobId, setJobId]                         = useState("");
  const [transcript, setTranscript]               = useState<TranscriptEntry[]>([]);
  const [currentQuestion, setCurrentQuestion]     = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer]         = useState("");

  // UI state
  const [isStarting, setIsStarting]     = useState(false);
  const [isNextLoading, setIsNextLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiError, setAiError]           = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue]       = useState("");

  const autoSaveRef      = useRef<NodeJS.Timeout | null>(null);
  const lastSavedAnswer  = useRef("");

  useEffect(() => {
    interviewAPI.getJobInfo(token)
      .then((info) => { setJobInfo(info); setJobId(info.id); setScreen("welcome"); })
      .catch((err: Error) => {
        const msg = err.message.toLowerCase();
        setErrorMessage(
          msg.includes("expired") || msg.includes("longer active")
            ? "This interview link has expired. Please contact the company for a new link."
            : msg.includes("not found")
            ? "Interview link not found. Please check the link and try again."
            : "Something went wrong loading the interview. Please refresh.",
        );
        setScreen("error");
      });
  }, [token]);

  useEffect(() => {
    if (screen !== "active" || !interviewId) return;
    autoSaveRef.current = setInterval(async () => {
      if (currentAnswer.trim() && currentAnswer !== lastSavedAnswer.current) {
        lastSavedAnswer.current = currentAnswer;
        try {
          await interviewAPI.saveAnswer(interviewId, currentQuestionIndex, currentQuestion, currentAnswer);
          saveLocal({ interview_id: interviewId, job_id: jobId, candidate_name: candidateName,
            candidate_email: candidateEmail, transcript, current_question: currentQuestion,
            current_question_index: currentQuestionIndex, link_token: token, saved_at: Date.now() });
        } catch { /* non-fatal */ }
      }
    }, AUTO_SAVE_INTERVAL);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [screen, interviewId, currentAnswer, currentQuestion, currentQuestionIndex, transcript, jobId, candidateName, candidateEmail, token]);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!candidateName.trim() || candidateName.trim().length < 2) errors.name = "Please enter your full name.";
    if (!candidateEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) errors.email = "Please enter a valid email address.";
    if (!consentChecked) errors.consent = "You must confirm your consent to proceed.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [candidateName, candidateEmail, consentChecked]);

  const handleBeginInterview = useCallback(async () => {
    if (!validateForm() || !jobInfo) return;
    setIsStarting(true);
    setAiError("");
    try {
      const localState = loadLocal(token);
      const result = await interviewAPI.startInterview(token, candidateName.trim(), candidateEmail.trim());
      setInterviewId(result.interview_id);

      if (result.resumed && (localState || result.transcript.length > 0)) {
        const savedTranscript = localState?.transcript ?? result.transcript;
        const savedQuestion   = localState?.current_question ?? "";
        const savedIndex      = localState?.current_question_index ?? savedTranscript.length;
        setTranscript(savedTranscript);
        setCurrentQuestionIndex(savedIndex);
        if (savedQuestion) {
          setCurrentQuestion(savedQuestion);
        } else {
          const nextQ = await interviewAPI.getNextQuestion(result.interview_id, jobId, savedTranscript, savedTranscript[savedTranscript.length - 1]?.answer ?? "");
          setCurrentQuestion(nextQ);
        }
      } else {
        const firstQuestion = (jobInfo as JobPublicInfo & { questions?: Array<{ question: string }> }).questions?.[0]?.question ??
          `Welcome, ${candidateName.trim().split(" ")[0]}! To start, could you tell me a bit about your background and what drew you to apply for this ${jobInfo.title} position?`;
        setCurrentQuestion(firstQuestion);
        setCurrentQuestionIndex(0);
      }
      setScreen("active");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      if (msg.toLowerCase().includes("already submitted")) {
        setErrorMessage("You have already submitted your interview for this position.");
        setScreen("error");
      } else {
        setAiError("Something went wrong starting your interview. Please refresh and try again.");
      }
    } finally {
      setIsStarting(false);
    }
  }, [validateForm, jobInfo, token, candidateName, candidateEmail, jobId]);

  const handleNextQuestion = useCallback(async () => {
    if (currentAnswer.trim().length < MIN_ANSWER_CHARS) return;
    setIsNextLoading(true);
    setAiError("");

    const entry: TranscriptEntry = { question_index: currentQuestionIndex, question: currentQuestion, answer: currentAnswer.trim(), timestamp: new Date().toISOString() };
    const updated = [...transcript, entry];
    setTranscript(updated);

    try {
      await interviewAPI.saveAnswer(interviewId, currentQuestionIndex, currentQuestion, currentAnswer.trim());
      lastSavedAnswer.current = currentAnswer.trim();
    } catch { /* non-fatal */ }

    const total   = jobInfo?.question_count ?? 8;
    const nextIdx = currentQuestionIndex + 1;

    if (nextIdx >= total) { setCurrentAnswer(""); setScreen("review"); setIsNextLoading(false); return; }

    try {
      const nextQ = await interviewAPI.getNextQuestion(interviewId, jobId, updated, currentAnswer.trim());
      setCurrentQuestion(nextQ);
      setCurrentQuestionIndex(nextIdx);
      setCurrentAnswer("");
      saveLocal({ interview_id: interviewId, job_id: jobId, candidate_name: candidateName, candidate_email: candidateEmail, transcript: updated, current_question: nextQ, current_question_index: nextIdx, link_token: token, saved_at: Date.now() });
    } catch {
      setAiError("We're having trouble generating your next question. Please refresh and try again.");
    } finally {
      setIsNextLoading(false);
    }
  }, [currentAnswer, currentQuestionIndex, currentQuestion, transcript, interviewId, jobId, jobInfo, candidateName, candidateEmail, token]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setAiError("");
    try { await interviewAPI.submitInterview(interviewId, transcript); clearLocal(); setScreen("complete"); }
    catch { setAiError("Something went wrong submitting your interview. Please try again."); }
    finally { setIsSubmitting(false); }
  }, [interviewId, transcript]);

  const total     = jobInfo?.question_count ?? 8;
  const firstName = candidateName.trim().split(" ")[0] ?? "there";

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (screen === "error") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold text-ink mb-2">Unable to load interview</h1>
          <p className="text-sub text-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-border border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────────
  if (screen === "complete") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center animate-slide-up">
          <div className="w-16 h-16 rounded-full border border-border bg-white flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-success" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold text-ink mb-3">Thank you, {firstName}.</h1>
          <p className="text-sub leading-relaxed">
            Your interview has been submitted to{" "}
            <span className="text-ink font-medium">{jobInfo?.company_name}</span>&apos;s hiring team.
            You&apos;ll hear from them directly if you&apos;re selected to move forward.
          </p>
        </div>
      </div>
    );
  }

  // ── REVIEW ─────────────────────────────────────────────────────────────────
  if (screen === "review") {
    return (
      <div className="min-h-screen bg-canvas">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <p className="text-[13px] text-sub">{jobInfo?.company_name}</p>
          <p className="text-sm font-medium text-ink">Review your answers</p>
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <BrandMark className="w-4 h-4" />
            HireIQ
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-ink">Almost there, {firstName}.</h1>
            <p className="text-sub text-sm mt-1">Review your answers before submitting. You can edit any response.</p>
          </div>

          {aiError && (
            <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{aiError}</div>
          )}

          <div className="bg-white border border-border rounded-[4px] px-4 py-3">
            <p className="text-sm font-medium text-ink">{candidateName}</p>
            <p className="text-[13px] text-sub">{candidateEmail}</p>
          </div>

          <div className="space-y-4">
            {transcript.map((entry, idx) => (
              <div key={idx} className="bg-white border border-border rounded-[4px] p-5">
                <p
                  className="text-sm text-ink font-medium mb-3 leading-relaxed"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {idx + 1}. {entry.question}
                </p>
                {editingIndex === idx ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={5}
                      className="w-full bg-canvas border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none resize-none focus:border-ink transition-colors"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => {
                        if (editValue.trim().length >= MIN_ANSWER_CHARS) {
                          setTranscript((prev) => prev.map((e, i) => i === idx ? { ...e, answer: editValue.trim() } : e));
                        }
                        setEditingIndex(null);
                      }}>Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingIndex(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-sub leading-relaxed flex-1">{entry.answer}</p>
                    <button
                      onClick={() => { setEditingIndex(idx); setEditValue(entry.answer); }}
                      className="p-1.5 rounded-[4px] text-muted hover:text-ink hover:bg-canvas transition-colors shrink-0"
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
              if (confirm("Once submitted, your answers cannot be changed. Are you ready?")) handleSubmit();
            }}
          >
            <CheckCircle2 className="w-4 h-4" /> Submit interview
          </Button>
        </div>

        <footer className="text-center text-[13px] text-muted py-6 border-t border-border mt-8">
          <span className="inline-flex items-center gap-1.5">
            <BrandMark className="w-3.5 h-3.5" /> Powered by HireIQ
          </span>
        </footer>
      </div>
    );
  }

  // ── ACTIVE INTERVIEW ───────────────────────────────────────────────────────
  if (screen === "active") {
    const charCount   = currentAnswer.length;
    const canProceed  = charCount >= MIN_ANSWER_CHARS && !isNextLoading;
    const progressPct = Math.round((currentQuestionIndex / total) * 100);

    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        {/* Thin progress bar */}
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-border z-50">
          <div className="h-full bg-ink transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <p className="text-[13px] text-sub truncate max-w-[120px] sm:max-w-none">{jobInfo?.company_name}</p>
          <p className="text-[13px] text-sub">Question {currentQuestionIndex + 1} of {total}</p>
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <BrandMark className="w-4 h-4" />
            <span className="hidden sm:inline">HireIQ</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full">
          {aiError && (
            <div className="w-full mb-6 rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
              {aiError}
            </div>
          )}

          <div className="w-full space-y-6 animate-slide-up">
            {/* Question */}
            <div>
              <p className="text-[13px] text-muted mb-4 uppercase tracking-widest">
                Question {currentQuestionIndex + 1}
              </p>
              <p
                className="text-2xl sm:text-3xl text-ink leading-snug"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {currentQuestion}
              </p>
            </div>

            {/* Answer */}
            <div className="space-y-3">
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                rows={8}
                placeholder="Take your time. Answer as you would in a real conversation."
                className="w-full bg-white border border-border rounded-[4px] px-4 py-4 text-ink text-sm leading-relaxed outline-none resize-none placeholder:text-muted focus:border-ink transition-colors"
                disabled={isNextLoading}
              />
              <div className="flex items-center justify-between">
                <span className={`text-[13px] transition-colors ${
                  charCount === 0 ? "text-transparent" : charCount >= MIN_ANSWER_CHARS ? "text-success" : "text-muted"
                }`}>
                  {charCount > 0 && charCount < MIN_ANSWER_CHARS
                    ? `${MIN_ANSWER_CHARS - charCount} more characters needed`
                    : charCount >= MIN_ANSWER_CHARS
                    ? `${charCount} characters`
                    : "."}
                </span>
                <Button
                  size="md"
                  disabled={!canProceed}
                  isLoading={isNextLoading}
                  loadingText={currentQuestionIndex + 1 >= total ? "Finishing..." : "Next..."}
                  onClick={handleNextQuestion}
                >
                  {currentQuestionIndex + 1 >= total ? "Review answers" : "Next question"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center text-[13px] text-muted py-4 border-t border-border">
          <span className="inline-flex items-center gap-1.5">
            <BrandMark className="w-3.5 h-3.5" /> Powered by HireIQ
          </span>
        </footer>
      </div>
    );
  }

  // ── WELCOME ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 animate-slide-up">
        {/* Header */}
        <div className="text-center">
          {jobInfo?.company_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={jobInfo.company_logo_url} alt={`${jobInfo.company_name} logo`} className="h-10 mx-auto mb-6 object-contain" />
          )}
          <h1
            className="text-2xl font-bold text-ink leading-tight mb-3"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {jobInfo?.title}
          </h1>
          <p className="text-sm text-sub font-medium">{jobInfo?.company_name}</p>
          <p className="text-sm text-sub mt-3 leading-relaxed">
            {jobInfo?.custom_intro_message ??
              `Welcome to your interview. Answer each question as you would in a real conversation — honestly and with as much detail as you can. There are ${jobInfo?.question_count ?? 8} questions.`}
          </p>
        </div>

        {aiError && (
          <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{aiError}</div>
        )}

        <div className="bg-white border border-border rounded-[4px] p-6 space-y-4">
          <Input
            label="Full name"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Jane Smith"
            error={formErrors.name}
            required
            autoFocus
          />
          <Input
            label="Email address"
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
                className="mt-0.5 w-4 h-4 accent-black shrink-0"
              />
              <span className="text-[13px] text-sub leading-relaxed">
                I confirm my answers are my own and I consent to them being reviewed by{" "}
                <span className="text-ink">{jobInfo?.company_name}</span>&apos;s hiring team.
              </span>
            </label>
            {formErrors.consent && (
              <p className="text-[13px] text-danger mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {formErrors.consent}
              </p>
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
            Begin interview
          </Button>
        </div>

        <p className="text-center text-[13px] text-muted">
          Your responses will be reviewed by the hiring team at {jobInfo?.company_name}.
        </p>
      </div>

      <footer className="mt-12 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <BrandMark className="w-3.5 h-3.5" /> Powered by HireIQ
        </span>
      </footer>
    </div>
  );
}
