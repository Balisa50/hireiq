import React from "react";
import Link from "next/link";
import { MessageSquare, BarChart3, Clock, Shield, CheckCircle2 } from "lucide-react";

// ── BRAND MARK ────────────────────────────────────────────────────────────────

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

// ── NAVBAR ────────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-ink hover:text-ink-2 transition-colors shrink-0">
          <BrandMark className="w-5 h-5" />
          <span className="font-semibold text-sm tracking-tight">HireIQ</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {[
            { label: "Features",     href: "#features" },
            { label: "How it works", href: "#how-it-works" },
            { label: "Pricing",      href: "#pricing" },
          ].map(({ label, href }) => (
            <a key={label} href={href} className="text-sm text-sub hover:text-ink transition-colors">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-sub hover:text-ink transition-colors hidden sm:block">
            Log in
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── HERO ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-14 min-h-screen flex items-center bg-canvas">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h1
          className="text-5xl sm:text-6xl font-bold leading-[1.1] text-ink mb-6"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Stop reading forms.<br />
          Start meeting people.
        </h1>

        <p className="text-base text-sub max-w-xl mx-auto mb-10 leading-relaxed">
          Candidates apply through a real conversation instead of a static form. Your team gets a ranked shortlist. You only meet the people worth your time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center bg-ink text-white text-sm font-medium px-6 py-3 rounded-[4px] hover:bg-ink-2 transition-colors"
          >
            Get started
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center text-sm text-ink font-medium underline underline-offset-4 hover:text-ink-2 transition-colors"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

// ── HOW IT WORKS ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: "01",
    title: "Post a job",
    description: "Paste your job description. HireIQ generates a tailored set of questions, behavioural, technical, situational, calibrated to the role.",
  },
  {
    number: "02",
    title: "Share the link",
    description: "One link per job. Post it anywhere. Candidates start immediately.",
  },
  {
    number: "03",
    title: "AI talks to every applicant",
    description: "The AI listens, asks follow-ups on weak answers, and structures each person's application.",
  },
  {
    number: "04",
    title: "Review ranked reports",
    description: "Every completed application becomes a scored report. Open your dashboard to a shortlist.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 border-t border-border bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-bold text-ink"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            From job post to shortlist in hours
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {STEPS.map(({ number, title, description }) => (
            <div key={number} className="flex gap-5">
              <span className="text-4xl font-bold text-border leading-none shrink-0 font-serif select-none">
                {number}
              </span>
              <div>
                <h3 className="text-base font-semibold text-ink mb-2">{title}</h3>
                <p className="text-sm text-sub leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FEATURES ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Conversational applications",
    description: "The AI probes vague answers and follows threads that matter. Every application is structured, not skimmed.",
  },
  {
    icon: BarChart3,
    title: "Scored reports",
    description: "Strengths, concerns, skill breakdown, and a hiring recommendation, for every candidate.",
  },
  {
    icon: Clock,
    title: "No scheduling",
    description: "Candidates apply on their own time. Your team sees results, not calendar invites.",
  },
  {
    icon: Shield,
    title: "Consistent criteria",
    description: "Same questions, same standard, every time. Decisions stay on the work.",
  },
];

function Features() {
  return (
    <section id="features" className="py-24 border-t border-border bg-canvas">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-ink">
            Built for the whole pipeline
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-white border border-border rounded-[4px] p-6">
              <Icon className="w-5 h-5 text-ink mb-4" strokeWidth={1.5} />
              <h3 className="text-base font-semibold text-ink mb-2">{title}</h3>
              <p className="text-sm text-sub leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FEATURE DEEP DIVE ─────────────────────────────────────────────────────────

function MockQuestions() {
  const qs = [
    { n: 1, text: "Walk me through a system you've designed under significant scale constraints.", type: "Technical" },
    { n: 2, text: "Describe a time you had to push back on a stakeholder's requirements.", type: "Behavioural" },
    { n: 3, text: "How do you measure the success of an engineering team?", type: "Leadership" },
  ];
  return (
    <div className="bg-white border border-border rounded-[4px] p-4 space-y-2.5 shadow-sm select-none pointer-events-none">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Generated Questions</p>
        <span className="text-[11px] bg-[var(--bg)] border border-border text-sub px-2 py-0.5 rounded-[4px]">8 total</span>
      </div>
      {qs.map(({ n, text, type }) => (
        <div key={n} className="flex items-start gap-3 p-3 bg-[var(--bg)] rounded-[4px] border border-border">
          <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[10px] text-muted font-medium shrink-0 mt-0.5">{n}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-ink leading-snug line-clamp-2">{text}</p>
            <span className="inline-block mt-1.5 text-[10px] font-medium text-muted bg-white border border-border px-1.5 py-0.5 rounded-[4px]">{type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockInterview() {
  return (
    <div className="bg-white border border-border rounded-[4px] overflow-hidden shadow-sm select-none pointer-events-none">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-success" />
        <p className="text-[13px] font-medium text-ink">Senior Engineer, Application in progress</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex gap-3">
          <div className="w-6 h-6 rounded-full bg-ink flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" className="w-3.5 h-3.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <polyline points="9 11 12 14 15 8" />
            </svg>
          </div>
          <div className="bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 flex-1">
            <p className="text-[13px] text-ink leading-relaxed">
              You mentioned async processing earlier. How would you handle backpressure if your queue starts growing faster than workers can consume?
            </p>
          </div>
        </div>
        <div className="ml-9">
          <div className="bg-white border border-border rounded-[4px] px-3 py-2.5">
            <p className="text-[13px] text-sub leading-relaxed">
              I'd start by adding circuit breakers and exponential backoff on the producer side, then scale workers horizontally via the orchestrator. If the queue is persistent like Kafka, we can also tune the consumer group…
            </p>
          </div>
        </div>
        <div className="ml-9 flex items-center gap-2 text-[12px] text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
          Processing your response
        </div>
      </div>
    </div>
  );
}

function MockReport() {
  const rows = [
    { rank: 1, name: "Alex Winters",   role: "Senior Engineer", score: 91, status: "Shortlisted", statusColor: "text-success" },
    { rank: 2, name: "Priyanka Singh", role: "Senior Engineer", score: 84, status: "Shortlisted", statusColor: "text-success" },
    { rank: 3, name: "Marcus O'Brien", role: "Senior Engineer", score: 72, status: "Scored",      statusColor: "text-sub" },
    { rank: 4, name: "Yuki Tanaka",    role: "Senior Engineer", score: 61, status: "Scored",      statusColor: "text-sub" },
  ];
  return (
    <div className="bg-white border border-border rounded-[4px] overflow-hidden shadow-sm select-none pointer-events-none">
      <div className="px-5 py-3 border-b border-border bg-[var(--bg)] grid grid-cols-[24px_1fr_60px_80px] gap-3">
        {["#", "Candidate", "Score", "Status"].map((h) => (
          <span key={h} className="text-[10px] font-semibold text-muted uppercase tracking-wide">{h}</span>
        ))}
      </div>
      {rows.map(({ rank, name, role, score, status, statusColor }) => (
        <div key={rank} className="px-5 py-3 border-b border-border last:border-b-0 grid grid-cols-[24px_1fr_60px_80px] gap-3 items-center">
          <span className="text-[12px] text-muted font-medium">{rank}</span>
          <div>
            <p className="text-[13px] font-medium text-ink">{name}</p>
            <p className="text-[11px] text-muted">{role}</p>
          </div>
          <span className={`text-[13px] font-semibold ${score >= 80 ? "text-success" : score >= 65 ? "text-warn" : "text-danger"}`}>
            {score}
          </span>
          <span className={`text-[12px] font-medium ${statusColor}`}>{status}</span>
        </div>
      ))}
    </div>
  );
}

const DEEP_FEATURES = [
  {
    label:       "Question generation",
    title:       "Questions that actually test the role",
    description: "Paste your job description. HireIQ writes the application, behavioural, technical, and situational, calibrated to seniority. Edit or reorder before you publish.",
    bullets:     ["Calibrated to seniority", "Multiple question types", "Editable before publishing"],
    mock:        <MockQuestions />,
    reverse:     false,
  },
  {
    label:       "The conversation",
    title:       "An AI that listens and pushes back",
    description: "Candidates apply at their own pace. The AI follows up on vague answers, probes for depth, and structures their responses.",
    bullets:     ["Adaptive follow-ups", "Handles deflection and drift", "Consistent across every candidate"],
    mock:        <MockInterview />,
    reverse:     true,
  },
  {
    label:       "Ranked reports",
    title:       "Open your dashboard to a shortlist",
    description: "Every completed application becomes a structured report: score, skill breakdown, strengths, red flags, hiring recommendation. PDF export included.",
    bullets:     ["Objective scoring", "Per-skill breakdown", "PDF export"],
    mock:        <MockReport />,
    reverse:     false,
  },
];

function FeatureDeepDive() {
  return (
    <section id="feature-detail" className="py-24 border-t border-border bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="space-y-24">
          {DEEP_FEATURES.map(({ label, title, description, bullets, mock, reverse }) => (
            <div
              key={label}
              className={`grid grid-cols-1 md:grid-cols-2 gap-12 items-center ${reverse ? "md:[direction:rtl]" : ""}`}
            >
              <div className={reverse ? "[direction:ltr]" : ""}>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-4">
                  {label}
                </p>
                <h3
                  className="text-2xl font-bold text-ink mb-4 leading-snug"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {title}
                </h3>
                <p className="text-sub text-[15px] leading-relaxed mb-6">{description}</p>
                <ul className="space-y-2.5">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2.5 text-sm text-ink">
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={1.5} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`${reverse ? "[direction:ltr]" : ""} rounded-[4px] overflow-hidden`}>
                {mock}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── PRICING ───────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    sub: "",
    features: ["2 active jobs", "50 applications / month", "AI scoring and reports", "PDF exports"],
    cta: "Get started",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$1",
    sub: "/ month",
    features: ["Unlimited jobs", "Unlimited applications", "Branded application page", "Custom intro message", "CSV export", "Priority support"],
    cta: "Get started",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    sub: "",
    features: ["Everything in Growth", "SSO / SAML", "Dedicated account manager", "Custom data retention", "SLA", "GDPR DPA"],
    cta: "Contact sales",
    href: "mailto:sales@hireiq.app",
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 border-t border-border bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2
            className="text-3xl sm:text-4xl font-bold text-ink"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Pricing
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PLANS.map(({ name, price, sub, features, cta, href, highlight }) => (
            <div
              key={name}
              className={`rounded-[4px] p-6 flex flex-col ${
                highlight
                  ? "border-2 border-ink bg-white"
                  : "border border-border bg-white"
              }`}
            >
              <h3 className="text-base font-semibold text-ink">{name}</h3>
              <div className="flex items-baseline gap-1 mt-2 mb-6">
                <span className="text-3xl font-bold text-ink">{price}</span>
                {sub && <span className="text-sm text-sub">{sub}</span>}
              </div>

              <ul className="space-y-2.5 flex-1 mb-8">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-ink">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={1.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={href}
                className={`text-center py-2.5 px-5 rounded-[4px] text-sm font-medium transition-colors ${
                  highlight
                    ? "bg-ink text-white hover:bg-ink-2"
                    : "border border-border text-ink hover:border-ink"
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FOOTER ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border py-8 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-ink">
            <BrandMark className="w-4 h-4" />
            <span className="font-semibold text-sm">HireIQ</span>
          </Link>

          <div className="flex items-center gap-6 text-[13px] text-sub">
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <Link href="/terms"   className="hover:text-ink transition-colors">Terms</Link>
            <a href="mailto:hello@hireiq.app" className="hover:text-ink transition-colors">Contact</a>
          </div>

          <p className="text-[13px] text-muted">© {new Date().getFullYear()} HireIQ</p>
        </div>
      </div>
    </footer>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <HowItWorks />
      <FeatureDeepDive />
      <Features />
      <Pricing />
      <Footer />
    </>
  );
}
