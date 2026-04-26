"use client";

/**
 * HireIQ Candidate Interview — 6 screens
 * loading → welcome → active → review → complete → error
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Edit3 } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import type { JobPublicInfo, TranscriptEntry } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Screen = "loading" | "welcome" | "active" | "review" | "complete" | "error";

const MIN_CHARS       = 50;
const AUTO_SAVE_MS    = 10_000;
const RESUME_KEY      = "hireiq_iv_state";

interface LocalState {
  interview_id: string; job_id: string;
  candidate_name: string; candidate_email: string;
  transcript: TranscriptEntry[];
  current_question: string; current_question_index: number;
  link_token: string; saved_at: number;
}
function saveLocal(s: LocalState) { try { localStorage.setItem(RESUME_KEY, JSON.stringify(s)); } catch { /* noop */ } }
function loadLocal(token: string): LocalState | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalState;
    if (s.link_token !== token || Date.now() - s.saved_at > 86_400_000) return null;
    return s;
  } catch { return null; }
}
function clearLocal() { try { localStorage.removeItem(RESUME_KEY); } catch { /* noop */ } }

// ── Brand mark ────────────────────────────────────────────────────────────────
function Mark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12">
      {children}
    </div>
  );
}

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen]     = useState<Screen>("loading");
  const [jobInfo, setJobInfo]   = useState<JobPublicInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Welcome form
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [consent, setConsent]   = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Interview state
  const [interviewId, setInterviewId]     = useState("");
  const [jobId, setJobId]                 = useState("");
  const [transcript, setTranscript]       = useState<TranscriptEntry[]>([]);
  const [question, setQuestion]           = useState("");
  const [qIndex, setQIndex]               = useState(0);
  const [answer, setAnswer]               = useState("");
  const [totalQ, setTotalQ]               = useState(0);

  // UI state
  const [isStarting, setIsStarting]     = useState(false);
  const [isNext, setIsNext]             = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiError, setAiError]           = useState("");
  const [editingIdx, setEditingIdx]     = useState<number | null>(null);
  const [editValue, setEditValue]       = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const autoSaveRef     = useRef<NodeJS.Timeout | null>(null);
  const lastSaved       = useRef("");
  const charCount       = answer.length;
  const canNext         = charCount >= MIN_CHARS;
  const progress        = totalQ > 0 ? ((qIndex) / totalQ) * 100 : 0;

  // Load job info
  useEffect(() => {
    interviewAPI.getJobInfo(token)
      .then((info) => { setJobInfo(info); setJobId(info.id); setTotalQ(info.question_count); setScreen("welcome"); })
      .catch((err: Error) => {
        const m = err.message.toLowerCase();
        setErrorMsg(
          m.includes("expired") || m.includes("longer active") ? "This interview link has expired. Please contact the company for a new link."
          : m.includes("not found") ? "This interview link is not valid. Please check the link and try again."
          : "Something went wrong loading the interview. Please refresh.",
        );
        setScreen("error");
      });
  }, [token]);

  // Auto-save
  useEffect(() => {
    if (screen !== "active" || !interviewId) return;
    autoSaveRef.current = setInterval(async () => {
      if (answer.trim() && answer !== lastSaved.current) {
        lastSaved.current = answer;
        try {
          await interviewAPI.saveAnswer(interviewId, qIndex, question, answer);
          saveLocal({ interview_id: interviewId, job_id: jobId, candidate_name: name, candidate_email: email, transcript, current_question: question, current_question_index: qIndex, link_token: token, saved_at: Date.now() });
        } catch { /* non-fatal */ }
      }
    }, AUTO_SAVE_MS);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [screen, interviewId, answer, question, qIndex, transcript, jobId, name, email, token]);

  const validateForm = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Please enter your full name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!consent) e.consent = "You must give your consent to proceed.";
    setFormErrors(e);
    return !Object.keys(e).length;
  }, [name, email, consent]);

  const handleBegin = useCallback(async () => {
    if (!validateForm() || !jobInfo) return;
    setIsStarting(true);
    try {
      const resumed = loadLocal(token);
      if (resumed) {
        setInterviewId(resumed.interview_id);
        setJobId(resumed.job_id);
        setTranscript(resumed.transcript);
        setQuestion(resumed.current_question);
        setQIndex(resumed.current_question_index);
        setAnswer("");
        setScreen("active");
        return;
      }
      const r = await interviewAPI.startInterview(token, name.trim(), email.trim().toLowerCase());
      setInterviewId(r.interview_id);
      if (r.transcript?.length) {
        setTranscript(r.transcript);
        setQIndex(r.transcript.length);
      }
      const first = r.transcript?.length
        ? await interviewAPI.getNextQuestion(r.interview_id, jobId, r.transcript, "")
        : await interviewAPI.getNextQuestion(r.interview_id, jobId, [], "");
      setQuestion(first);
      setScreen("active");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to start interview.");
    } finally { setIsStarting(false); }
  }, [validateForm, jobInfo, token, name, email, jobId]);

  const handleNext = useCallback(async () => {
    if (!canNext) return;
    setIsNext(true); setAiError("");
    const entry: TranscriptEntry = { question_index: qIndex, question, answer, timestamp: new Date().toISOString() };
    const newTranscript = [...transcript, entry];
    try {
      await interviewAPI.saveAnswer(interviewId, qIndex, question, answer);
      const isLast = totalQ > 0 && newTranscript.length >= totalQ;
      if (isLast) {
        setTranscript(newTranscript);
        setAnswer("");
        setScreen("review");
      } else {
        const next = await interviewAPI.getNextQuestion(interviewId, jobId, newTranscript, answer);
        setTranscript(newTranscript);
        setQIndex(qIndex + 1);
        setQuestion(next);
        setAnswer("");
        lastSaved.current = "";
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setIsNext(false); }
  }, [canNext, qIndex, question, answer, transcript, interviewId, jobId, totalQ]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true); setShowSubmitModal(false);
    try {
      await interviewAPI.submitInterview(interviewId, transcript);
      clearLocal();
      setScreen("complete");
    } catch { setAiError("Submission failed. Please try again."); }
    finally { setIsSubmitting(false); }
  }, [interviewId, transcript]);

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col">
        <div className="h-0.5 bg-border w-full">
          <div className="h-full bg-ink animate-pulse w-1/3" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Mark className="w-7 h-7 text-muted" />
          <p className="text-[13px] text-muted">Setting up your interview…</p>
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (screen === "error") {
    return (
      <Shell>
        <Mark className="w-6 h-6 text-muted mb-6" />
        <div className="bg-white border border-border rounded-[4px] p-8 max-w-sm w-full text-center">
          <p className="text-sm text-sub leading-relaxed">{errorMsg}</p>
        </div>
      </Shell>
    );
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────────
  if (screen === "complete") {
    const firstName = name.split(" ")[0];
    return (
      <Shell>
        <div className="max-w-sm w-full text-center space-y-4">
          <svg className="w-12 h-12 mx-auto text-ink" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="24" r="22" />
            <polyline points="14 24 21 31 34 17" />
          </svg>
          <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Thank you, {firstName}.
          </h1>
          <p className="text-sub text-sm leading-relaxed">
            Your interview has been submitted to <strong>{jobInfo?.company_name}</strong>. They&apos;ll be in touch if you&apos;re selected to move forward.
          </p>
          <p className="text-[11px] text-muted pt-4">Secured by HireIQ</p>
        </div>
      </Shell>
    );
  }

  // ── WELCOME ────────────────────────────────────────────────────────────────
  if (screen === "welcome") {
    return (
      <Shell>
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <p className="text-base font-semibold text-ink">{jobInfo?.company_name}</p>
            <p className="text-[13px] text-sub mt-1">{jobInfo?.title}</p>
          </div>

          <div className="bg-white border border-border rounded-[4px] p-6 space-y-5">
            {jobInfo?.custom_intro_message && (
              <div className="border-l-2 border-ink pl-4 py-1">
                <p className="text-sm text-sub leading-relaxed">{jobInfo.custom_intro_message}</p>
              </div>
            )}
            <p className="text-sm text-sub leading-relaxed">
              This interview is conducted by HireIQ. Answer each question as you would in a real conversation — honestly, specifically, and with as much detail as you can.
              {jobInfo?.question_count ? ` There are ${jobInfo.question_count} questions.` : ""}
            </p>

            {aiError && <p className="text-sm text-danger">{aiError}</p>}

            <div className="space-y-4">
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" error={formErrors.name} required autoComplete="name" />
              <Input label="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" error={formErrors.email} required autoComplete="email" type="email" />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-ink cursor-pointer shrink-0" />
              <span className="text-[13px] text-sub leading-relaxed">
                I confirm my answers are my own and I consent to them being reviewed by <strong>{jobInfo?.company_name}</strong>&apos;s hiring team.
              </span>
            </label>
            {formErrors.consent && <p className="text-[13px] text-danger">{formErrors.consent}</p>}

            <Button className="w-full" size="lg" onClick={handleBegin} isLoading={isStarting} loadingText="Starting interview…"
              disabled={!name.trim() || !email.trim() || !consent}>
              Begin Interview →
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── REVIEW ─────────────────────────────────────────────────────────────────
  if (screen === "review") {
    return (
      <div className="min-h-screen bg-[var(--bg)] px-4 py-12">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">Almost done — review your answers</h1>
            <p className="text-[13px] text-sub mt-1">Edit any answer before submitting.</p>
          </div>

          <div className="bg-white border border-border rounded-[4px] p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">{name}</p>
              <p className="text-[13px] text-muted">{email}</p>
            </div>
          </div>

          {aiError && <p className="text-sm text-danger text-center">{aiError}</p>}

          <div className="space-y-3">
            {transcript.map((entry, i) => (
              <div key={i} className="bg-white border border-border rounded-[4px] p-5">
                <p className="text-sm font-semibold text-ink mb-2">{entry.question}</p>
                {editingIdx === i ? (
                  <div>
                    <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={4} autoFocus
                      className="w-full bg-[var(--bg)] border border-ink rounded-[4px] px-3 py-2 text-sm text-ink outline-none resize-none" />
                    <button onClick={() => {
                      setTranscript((p) => p.map((e, idx) => idx === i ? { ...e, answer: editValue } : e));
                      setEditingIdx(null);
                    }} className="mt-2 text-[13px] text-ink font-medium underline underline-offset-2">Save</button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-sub leading-relaxed flex-1">{entry.answer}</p>
                    <button onClick={() => { setEditingIdx(i); setEditValue(entry.answer); }}
                      className="shrink-0 text-muted hover:text-ink transition-colors">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button className="w-full" size="lg" onClick={() => setShowSubmitModal(true)} isLoading={isSubmitting} loadingText="Submitting…">
            Submit Interview →
          </Button>
        </div>

        {/* Confirmation modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm px-4">
            <div className="bg-white border border-border rounded-[4px] p-8 max-w-sm w-full shadow-pop">
              <h2 className="text-base font-semibold text-ink mb-2">Ready to submit?</h2>
              <p className="text-sm text-sub mb-6">Once submitted your answers cannot be changed. Are you sure you&apos;re ready?</p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={handleSubmit}>Submit</Button>
                <Button variant="secondary" onClick={() => setShowSubmitModal(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border bg-[var(--bg)]">
        {/* Progress bar */}
        <div className="h-0.5 bg-border">
          <div className="h-full bg-ink transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="max-w-[640px] mx-auto px-4 h-11 flex items-center justify-between">
          <span className="text-[12px] text-muted">{jobInfo?.company_name}</span>
          <span className="text-[12px] text-muted">Question {qIndex + 1}{totalQ > 0 ? ` of ${totalQ}` : ""}</span>
          <Mark className="w-4 h-4 text-muted" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-[600px] w-full space-y-6">
          {/* Question */}
          <p className="text-[22px] text-ink leading-[1.6]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {question}
          </p>

          {aiError && <p className="text-sm text-danger">{aiError}</p>}

          {/* Answer textarea */}
          <div className="relative">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={7}
              placeholder="Type your answer here."
              className="w-full bg-white border border-border rounded-none px-5 py-4 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            />
            {charCount > 0 && (
              <span className="absolute bottom-3 right-4 text-[12px] text-muted">{charCount}</span>
            )}
          </div>

          {/* Next button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleNext}
              isLoading={isNext}
              loadingText="Thinking…"
              disabled={!canNext}
              className={`transition-all duration-200 ${!canNext ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Next Question →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
