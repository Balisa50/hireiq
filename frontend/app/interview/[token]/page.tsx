"use client";

/**
 * HireIQ Candidate Interview — 7 screens
 * loading → welcome → collect → active → review → complete → error
 *
 * "collect" appears between welcome and active only when the job has
 * Required items. Optional items are woven in by the AI mid-interview.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Edit3, FileText, Link2, Upload, AlertCircle, X } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import type { JobPublicInfo, TranscriptEntry, CandidateRequirement } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Screen = "loading" | "welcome" | "collect" | "active" | "review" | "complete" | "error";

const MIN_CHARS    = 50;
const AUTO_SAVE_MS = 10_000;
const RESUME_KEY   = "hireiq_iv_state";

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

// ── Collect item state ────────────────────────────────────────────────────────
interface CollectItemState {
  req: CandidateRequirement;
  status: "idle" | "uploading" | "complete" | "error";
  progress: number;
  fileName?: string;
  fileSize?: number;
  url?: string;       // for link items
  error?: string;
  attempts: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [consent, setConsent] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Interview state
  const [interviewId, setInterviewId] = useState("");
  const [jobId, setJobId]             = useState("");
  const [transcript, setTranscript]   = useState<TranscriptEntry[]>([]);
  const [question, setQuestion]       = useState("");
  const [qIndex, setQIndex]           = useState(0);
  const [answer, setAnswer]           = useState("");
  const [totalQ, setTotalQ]           = useState(0);

  // Document collection state
  const [collectItems, setCollectItems] = useState<CollectItemState[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // UI state
  const [isStarting, setIsStarting]     = useState(false);
  const [isNext, setIsNext]             = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiError, setAiError]           = useState("");
  const [editingIdx, setEditingIdx]     = useState<number | null>(null);
  const [editValue, setEditValue]       = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaved   = useRef("");
  const charCount   = answer.length;
  const canNext     = charCount >= MIN_CHARS;
  const progress    = totalQ > 0 ? ((qIndex) / totalQ) * 100 : 0;

  // Load job info
  useEffect(() => {
    interviewAPI.getJobInfo(token)
      .then((info) => {
        setJobInfo(info);
        setJobId(info.id);
        setTotalQ(info.question_count);
        setScreen("welcome");
      })
      .catch((err: Error) => {
        const m = err.message.toLowerCase();
        setErrorMsg(
          m.includes("expired") || m.includes("longer active")
            ? "This interview link has expired. Please contact the company for a new link."
            : m.includes("not found")
            ? "This interview link is not valid. Please check the link and try again."
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
    if (!name.trim() || name.trim().length < 2) e.name    = "Please enter your full name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!consent) e.consent = "You must give your consent to proceed.";
    setFormErrors(e);
    return !Object.keys(e).length;
  }, [name, email, consent]);

  // ── Start interview (welcome → collect or active) ─────────────────────────
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

      // Check if there are Required items to collect
      const requiredItems = (jobInfo.candidate_requirements ?? []).filter((req) => req.required);

      if (requiredItems.length > 0) {
        // Build initial collect state — mark already-submitted ones as complete
        const alreadySubmittedFiles = r.submitted_files ?? [];
        const alreadySubmittedLinks = r.submitted_links ?? [];

        const items: CollectItemState[] = requiredItems.map((req) => {
          if (req.type === "file") {
            const existing = alreadySubmittedFiles.find((f) => f.requirement_id === req.id);
            return existing
              ? { req, status: "complete", progress: 100, fileName: existing.file_name, fileSize: existing.file_size, attempts: 0 }
              : { req, status: "idle", progress: 0, attempts: 0 };
          } else {
            const existing = alreadySubmittedLinks.find((l) => l.requirement_id === req.id);
            return existing
              ? { req, status: "complete", progress: 100, url: existing.url, attempts: 0 }
              : { req, status: "idle", progress: 0, url: "", attempts: 0 };
          }
        });
        setCollectItems(items);
        setScreen("collect");
      } else {
        // No required items — go straight to interview
        await startFirstQuestion(r.interview_id, jobInfo.id, r.transcript ?? []);
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to start interview.");
    } finally { setIsStarting(false); }
  }, [validateForm, jobInfo, token, name, email]);

  const startFirstQuestion = useCallback(async (ivId: string, jId: string, existingTranscript: TranscriptEntry[]) => {
    const first = await interviewAPI.getNextQuestion(ivId, jId, existingTranscript, "");
    setQuestion(first);
    setScreen("active");
  }, []);

  // ── File upload handler ───────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (reqId: string, file: File) => {
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) {
      setCollectItems((p) => p.map((item) =>
        item.req.id === reqId
          ? { ...item, status: "error", error: "File exceeds 10 MB. Please choose a smaller file." }
          : item,
      ));
      return;
    }

    const ALLOWED_TYPES = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/png", "text/plain"];
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.endsWith(".txt") && !file.name.endsWith(".docx")) {
      setCollectItems((p) => p.map((item) =>
        item.req.id === reqId
          ? { ...item, status: "error", error: "Invalid file type. Use PDF, Word, JPEG, or PNG." }
          : item,
      ));
      return;
    }

    setCollectItems((p) => p.map((item) =>
      item.req.id === reqId ? { ...item, status: "uploading", progress: 0, error: undefined } : item,
    ));

    const req = collectItems.find((i) => i.req.id === reqId)?.req;
    if (!req) return;

    try {
      await interviewAPI.uploadFile(
        interviewId,
        req.id,
        req.label,
        req.preset_key ?? req.id,
        file,
        (pct) => setCollectItems((p) => p.map((item) =>
          item.req.id === reqId ? { ...item, progress: pct } : item,
        )),
      );
      setCollectItems((p) => p.map((item) =>
        item.req.id === reqId
          ? { ...item, status: "complete", progress: 100, fileName: file.name, fileSize: file.size }
          : item,
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setCollectItems((p) => p.map((item) =>
        item.req.id === reqId
          ? { ...item, status: "error", progress: 0, error: msg, attempts: (item.attempts ?? 0) + 1 }
          : item,
      ));
    }
  }, [interviewId, collectItems]);

  const handleLinkChange = useCallback((reqId: string, url: string) => {
    setCollectItems((p) => p.map((item) => item.req.id === reqId ? { ...item, url } : item));
  }, []);

  const handleLinkSubmit = useCallback(async (reqId: string) => {
    const item = collectItems.find((i) => i.req.id === reqId);
    if (!item) return;
    const url = (item.url ?? "").trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setCollectItems((p) => p.map((i) =>
        i.req.id === reqId ? { ...i, status: "error", error: "URL must start with http:// or https://" } : i,
      ));
      return;
    }
    setCollectItems((p) => p.map((i) =>
      i.req.id === reqId ? { ...i, status: "uploading", error: undefined } : i,
    ));
    try {
      await interviewAPI.submitLink(interviewId, item.req.id, item.req.label, url);
      setCollectItems((p) => p.map((i) =>
        i.req.id === reqId ? { ...i, status: "complete", progress: 100 } : i,
      ));
    } catch (e) {
      setCollectItems((p) => p.map((i) =>
        i.req.id === reqId ? { ...i, status: "error", error: e instanceof Error ? e.message : "Submission failed." } : i,
      ));
    }
  }, [interviewId, collectItems]);

  // All required items complete?
  const allCollected = collectItems.every((i) => i.status === "complete");

  const handleStartInterview = useCallback(async () => {
    if (!allCollected) return;
    setIsStarting(true);
    try {
      await startFirstQuestion(interviewId, jobId, transcript);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to start interview.");
    } finally { setIsStarting(false); }
  }, [allCollected, interviewId, jobId, transcript, startFirstQuestion]);

  // ── Active interview handlers ─────────────────────────────────────────────
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
    const requiredItems = (jobInfo?.candidate_requirements ?? []).filter((r) => r.required);
    const optionalItems = (jobInfo?.candidate_requirements ?? []).filter((r) => !r.required);
    const allItems = [...requiredItems, ...optionalItems];

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

            {/* Preview of required documents */}
            {allItems.length > 0 && (
              <div className="bg-[var(--bg)] rounded-[4px] px-4 py-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
                  You&apos;ll be asked to provide
                </p>
                {allItems.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[13px] text-sub">
                    {r.type === "file" ? <FileText className="w-3.5 h-3.5 shrink-0 text-muted" /> : <Link2 className="w-3.5 h-3.5 shrink-0 text-muted" />}
                    <span>{r.label}</span>
                    {r.required
                      ? <span className="ml-auto text-[11px] font-medium text-ink">Required</span>
                      : <span className="ml-auto text-[11px] text-muted">Optional</span>}
                  </div>
                ))}
              </div>
            )}

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

            <Button className="w-full" size="lg" onClick={handleBegin} isLoading={isStarting} loadingText="Starting…"
              disabled={!name.trim() || !email.trim() || !consent}>
              Begin Interview →
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── COLLECT (Before we begin) ──────────────────────────────────────────────
  if (screen === "collect") {
    return (
      <Shell>
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Before we begin
            </h1>
            <p className="text-[13px] text-sub mt-2">
              <strong>{jobInfo?.company_name}</strong> has asked for the following before your interview starts.
            </p>
          </div>

          <div className="bg-white border border-border rounded-[4px] p-6 space-y-5">
            {aiError && (
              <div className="rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-sm text-danger flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{aiError}
              </div>
            )}

            {collectItems.map((item) => (
              <div key={item.req.id} className="space-y-2">
                {/* Label row */}
                <div className="flex items-center gap-2">
                  {item.req.type === "file"
                    ? <FileText className="w-4 h-4 text-muted shrink-0" />
                    : <Link2 className="w-4 h-4 text-muted shrink-0" />}
                  <span className="text-sm font-medium text-ink">{item.req.label}</span>
                  <span className="ml-auto text-[11px] font-semibold text-ink bg-[var(--bg)] border border-border px-2 py-0.5 rounded-[4px]">Required</span>
                </div>

                {/* File upload UI */}
                {item.req.type === "file" && (
                  <>
                    <input
                      ref={(el) => { fileInputRefs.current[item.req.id] = el; }}
                      type="file"
                      accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelect(item.req.id, f);
                        e.target.value = "";
                      }}
                    />
                    {item.status === "idle" || item.status === "error" ? (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[item.req.id]?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleFileSelect(item.req.id, f);
                        }}
                        className="w-full border-2 border-dashed border-border rounded-[4px] px-4 py-5 text-center hover:border-ink transition-colors cursor-pointer group"
                      >
                        <Upload className="w-5 h-5 text-muted mx-auto mb-2 group-hover:text-ink transition-colors" />
                        <p className="text-[13px] text-sub group-hover:text-ink transition-colors">
                          Drop file here or <span className="underline underline-offset-2">browse</span>
                        </p>
                        <p className="text-[11px] text-muted mt-1">PDF, Word, JPEG, PNG — max 10 MB</p>
                        {item.status === "error" && (
                          <p className="text-[12px] text-danger mt-2 flex items-center justify-center gap-1">
                            <X className="w-3.5 h-3.5" />
                            {item.error}
                          </p>
                        )}
                        {item.attempts >= 3 && (
                          <p className="text-[12px] text-muted mt-2">
                            Having trouble? Make sure the file is under 10 MB and is a PDF, Word document, or image.
                          </p>
                        )}
                      </button>
                    ) : item.status === "uploading" ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[12px] text-sub">
                          <span className="truncate">{item.fileName}</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-ink rounded-full transition-all duration-150" style={{ width: `${item.progress}%` }} />
                        </div>
                      </div>
                    ) : (
                      /* complete */
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[item.req.id]?.click()}
                        className="w-full flex items-center gap-3 bg-green-50 border border-success/20 rounded-[4px] px-4 py-3 text-left hover:bg-green-100 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-ink truncate">{item.fileName}</p>
                          {item.fileSize && <p className="text-[11px] text-muted">{formatSize(item.fileSize)} — click to replace</p>}
                        </div>
                      </button>
                    )}
                  </>
                )}

                {/* Link input UI */}
                {item.req.type === "link" && (
                  <div className="flex gap-2">
                    {item.status === "complete" ? (
                      <div className="flex-1 flex items-center gap-2 bg-green-50 border border-success/20 rounded-[4px] px-3 py-2.5">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <span className="text-[13px] text-ink truncate flex-1">{item.url}</span>
                        <button
                          type="button"
                          onClick={() => setCollectItems((p) => p.map((i) => i.req.id === item.req.id ? { ...i, status: "idle" } : i))}
                          className="text-muted hover:text-ink transition-colors shrink-0 text-[12px] underline underline-offset-2"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="url"
                          value={item.url ?? ""}
                          onChange={(e) => handleLinkChange(item.req.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleLinkSubmit(item.req.id); }}
                          placeholder="https://"
                          className={`flex-1 bg-white border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${item.status === "error" ? "border-danger" : "border-border"}`}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleLinkSubmit(item.req.id)}
                          isLoading={item.status === "uploading"}
                          loadingText="…"
                        >
                          Add
                        </Button>
                      </>
                    )}
                    {item.status === "error" && (
                      <p className="text-[12px] text-danger mt-1">{item.error}</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            <Button
              className="w-full mt-2"
              size="lg"
              onClick={handleStartInterview}
              isLoading={isStarting}
              loadingText="Starting interview…"
              disabled={!allCollected}
            >
              Start Interview →
            </Button>
            {!allCollected && (
              <p className="text-[12px] text-center text-muted">Complete all required items above to continue.</p>
            )}
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
      <div className="border-b border-border bg-[var(--bg)]">
        <div className="h-0.5 bg-border">
          <div className="h-full bg-ink transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="max-w-[640px] mx-auto px-4 h-11 flex items-center justify-between">
          <span className="text-[12px] text-muted">{jobInfo?.company_name}</span>
          <span className="text-[12px] text-muted">Question {qIndex + 1}{totalQ > 0 ? ` of ${totalQ}` : ""}</span>
          <Mark className="w-4 h-4 text-muted" />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-[600px] w-full space-y-6">
          <p className="text-[22px] text-ink leading-[1.6]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {question}
          </p>

          {aiError && <p className="text-sm text-danger">{aiError}</p>}

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
