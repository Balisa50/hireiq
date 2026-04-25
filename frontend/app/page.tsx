import React from "react";
import Link from "next/link";
import {
  Zap, BarChart3, Clock, Shield, ChevronRight,
  CheckCircle2, Users, FileText, Brain, Star,
  ArrowRight, MessageSquare, TrendingUp, Award,
} from "lucide-react";

// ── NAV ─────────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[var(--bg)]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="text-white text-sm font-black">H</span>
          </div>
          <span className="text-white font-bold text-base tracking-tight">HireIQ</span>
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "Features", href: "#features" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "Pricing", href: "#pricing" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-sm text-[var(--text-muted)] hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-[var(--text-muted)] hover:text-white transition-colors hidden sm:block"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
          >
            Get Started <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── HERO ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center py-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/8 px-4 py-1.5 text-xs font-semibold text-brand-400 mb-8">
          <Zap className="w-3 h-3" />
          Powered by Groq · LLaMA 3.3 70B
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6">
          Stop Reading{" "}
          <span className="relative">
            <span className="text-brand-400">Applications.</span>
          </span>
          <br />
          Start Hiring People.
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-[var(--text-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
          HireIQ conducts intelligent AI interviews with every candidate
          and delivers ranked, scored summaries to your hiring team —
          so you only talk to people worth your time.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors shadow-xl shadow-brand-500/25"
          >
            Start Hiring Free <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 border border-[var(--border)] text-[var(--text-muted)] hover:text-white hover:border-white/20 font-semibold px-8 py-4 rounded-xl text-base transition-colors"
          >
            See How It Works
          </a>
        </div>

        {/* Social proof */}
        <p className="text-xs text-[var(--text-dim)] mt-8">
          No credit card required · Setup in under 5 minutes · Cancel anytime
        </p>

        {/* Hero card preview */}
        <div className="mt-16 relative max-w-3xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg)] z-10 pointer-events-none" />
          <div className="glass rounded-2xl border border-white/8 p-6 text-left">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[var(--border)]">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Interview in Progress</p>
                <p className="text-xs text-[var(--text-muted)]">Senior Product Designer · Priya Sharma</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full border border-green-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl bg-brand-500/6 border border-brand-500/15 px-4 py-3">
                <p className="text-xs font-semibold text-brand-400 mb-1">Question 3 of 8</p>
                <p className="text-sm text-white">
                  Walk me through a time when you had to advocate for a design decision that faced
                  significant pushback from engineering or business stakeholders.
                </p>
              </div>
              <div className="rounded-xl bg-white/3 border border-[var(--border)] px-4 py-3">
                <p className="text-xs font-semibold text-[var(--text-dim)] mb-1">Priya&apos;s answer</p>
                <p className="text-sm text-[var(--text-muted)]">
                  At my previous role at Fintech X, I proposed a simplified onboarding flow that
                  removed three steps our engineers felt were &quot;essential&quot;. I ran a guerrilla
                  usability study with 8 users in 48 hours and showed a 40% drop-off at exactly
                  those steps...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── LOGOS ────────────────────────────────────────────────────────────────────

function TrustBar() {
  const companies = [
    "Techwave", "Nimbus AI", "Orbit Labs", "Stackr", "Velo Systems", "Quantix",
  ];
  return (
    <section className="py-14 border-y border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-widest mb-8 font-semibold">
          Trusted by fast-growing teams
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {companies.map((name) => (
            <span key={name} className="text-[var(--text-dim)] font-semibold text-sm opacity-50">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FEATURES ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    title: "Adaptive AI Interviews",
    description:
      "Our AI asks probing follow-ups based on each answer, just like your best interviewer would. No two sessions are identical.",
    color: "text-brand-400",
    bg: "bg-brand-500/10 border-brand-500/20",
  },
  {
    icon: BarChart3,
    title: "Instant Scored Reports",
    description:
      "Every completed interview generates an executive summary, score breakdown by skill, key strengths, areas of concern, and a hiring recommendation.",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
  },
  {
    icon: Clock,
    title: "Save 80% of Screen Time",
    description:
      "Stop spending your day reading CVs and phone-screening warm bodies. HireIQ pre-qualifies everyone so you meet only the top tier.",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    icon: Shield,
    title: "Bias-Reduced Screening",
    description:
      "Candidates are evaluated on answers, not names, schools, or photos. Consistent criteria applied to every single applicant.",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
  {
    icon: FileText,
    title: "PDF Reports in One Click",
    description:
      "Download a beautifully formatted candidate report to share with your team or add to your ATS — no extra work.",
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
  },
  {
    icon: TrendingUp,
    title: "Zero Setup Required",
    description:
      "Post a job, paste the interview link on your careers page or job board, and HireIQ takes care of every candidate that applies.",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
  },
];

function Features() {
  return (
    <section id="features" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Everything you need to hire faster
          </h2>
          <p className="text-[var(--text-muted)] text-lg max-w-xl mx-auto">
            Built for founders, HR teams, and hiring managers who are drowning in applicants.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, description, color, bg }) => (
            <div key={title} className="glass rounded-2xl p-6 hover:border-white/12 transition-colors">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">{title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── HOW IT WORKS ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: "01",
    title: "Post a Job",
    description:
      "Paste your job description. HireIQ's AI generates a tailored set of interview questions focused on the skills that actually matter for the role.",
    icon: FileText,
  },
  {
    number: "02",
    title: "Share the Interview Link",
    description:
      "Every job gets a unique, shareable link. Post it on LinkedIn, your careers page, or email it directly. Candidates click and start immediately — no scheduling, no account creation.",
    icon: Users,
  },
  {
    number: "03",
    title: "AI Interviews Every Applicant",
    description:
      "Candidates answer questions via text at their own pace. The AI listens, asks adaptive follow-ups, and keeps the conversation honest and professional.",
    icon: MessageSquare,
  },
  {
    number: "04",
    title: "Review Ranked Reports",
    description:
      "Log in to see every candidate ranked by score. Click any name to see their full AI analysis: strengths, concerns, recommended human follow-up questions, and a PDF report.",
    icon: Award,
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            From job post to shortlist in hours
          </h2>
          <p className="text-[var(--text-muted)] text-lg max-w-xl mx-auto">
            Four steps. No integration required. Works with any job board.
          </p>
        </div>

        <div className="space-y-6">
          {STEPS.map(({ number, title, description, icon: Icon }, i) => (
            <div
              key={number}
              className="glass rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-6"
            >
              <div className="flex items-center gap-4 sm:flex-col sm:items-center shrink-0">
                <span className="text-3xl font-black text-white/10 font-mono leading-none">
                  {number}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block w-px h-8 bg-white/8 mt-2" />
                )}
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── TESTIMONIALS ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "We had 200 applicants for a senior engineer role. HireIQ interviewed all of them over a weekend. Monday morning I had a ranked list and only needed to talk to 6 people. We hired in 2 weeks instead of 2 months.",
    name: "Sarah Chen",
    role: "CTO, Nimbus AI",
    score: 5,
  },
  {
    quote:
      "The AI follow-up questions are genuinely impressive. It picks up on vague answers and pushes back — something most human interviewers don't even do at the screening stage.",
    name: "Marcus Obi",
    role: "Head of Talent, Orbit Labs",
    score: 5,
  },
  {
    quote:
      "As a 3-person startup, we can't afford to spend 40 hours a week on recruiting. HireIQ acts like a full-time recruiter. The score reports alone save us hours of debate.",
    name: "Layla Al-Rashid",
    role: "Founder, Stackr",
    score: 5,
  },
];

function Testimonials() {
  return (
    <section className="py-24 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Hiring teams love it
          </h2>
          <p className="text-[var(--text-muted)] text-lg">Real results from real teams.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map(({ quote, name, role, score }) => (
            <div key={name} className="glass rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex gap-0.5">
                {Array.from({ length: score }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-sm text-[var(--text)] leading-relaxed flex-1">
                &ldquo;{quote}&rdquo;
              </p>
              <div>
                <p className="text-sm font-semibold text-white">{name}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{role}</p>
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
    sub: "Forever",
    description: "Perfect for small teams just getting started.",
    features: [
      "2 active jobs",
      "Up to 50 interviews / month",
      "AI scoring & reports",
      "PDF report downloads",
      "Email notifications",
    ],
    cta: "Get Started Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$79",
    sub: "/ month",
    description: "For teams hiring consistently at scale.",
    features: [
      "Unlimited active jobs",
      "Unlimited interviews",
      "Priority AI scoring",
      "Branded interview page",
      "Custom intro message",
      "Candidate CSV export",
      "Priority support",
    ],
    cta: "Start Free Trial",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    sub: "",
    description: "For large teams with custom compliance needs.",
    features: [
      "Everything in Growth",
      "SSO / SAML",
      "Dedicated account manager",
      "Custom data retention",
      "SLA guarantee",
      "GDPR DPA",
    ],
    cta: "Contact Sales",
    href: "mailto:sales@hireiq.app",
    highlighted: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-[var(--text-muted)] text-lg max-w-lg mx-auto">
            Start free. Scale as you grow. No surprise fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PLANS.map(({ name, price, sub, description, features, cta, href, highlighted }) => (
            <div
              key={name}
              className={`rounded-2xl p-6 flex flex-col ${
                highlighted
                  ? "bg-brand-500/10 border-2 border-brand-500/40 shadow-xl shadow-brand-500/10"
                  : "glass"
              }`}
            >
              {highlighted && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-300 bg-brand-500/15 px-2.5 py-1 rounded-full border border-brand-500/25 w-fit mb-4">
                  ★ MOST POPULAR
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{name}</h3>
              <div className="flex items-baseline gap-1 mt-2 mb-1">
                <span className="text-3xl font-extrabold text-white">{price}</span>
                {sub && <span className="text-sm text-[var(--text-muted)]">{sub}</span>}
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-6">{description}</p>

              <ul className="space-y-2.5 flex-1 mb-8">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[var(--text)]">
                    <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={href}
                className={`text-center py-3 px-5 rounded-xl text-sm font-semibold transition-colors ${
                  highlighted
                    ? "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20"
                    : "border border-[var(--border)] text-[var(--text)] hover:border-white/20 hover:text-white"
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

// ── CTA BANNER ────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="py-24 border-t border-white/5">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div
          className="rounded-3xl p-12"
          style={{
            background:
              "radial-gradient(ellipse 100% 100% at 50% 0%, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.03) 100%)",
            border: "1px solid rgba(59,130,246,0.15)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Your next great hire is already applying.
          </h2>
          <p className="text-[var(--text-muted)] text-lg mb-8">
            Let HireIQ find them for you while you focus on building your company.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors shadow-xl shadow-brand-500/25"
          >
            Start Hiring Free <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-[var(--text-dim)] mt-4">
            No credit card · No setup fee · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}

// ── FOOTER ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white text-xs font-black">H</span>
            </div>
            <span className="text-white font-bold text-sm">HireIQ</span>
          </Link>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--text-muted)]">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>

          {/* Copyright */}
          <p className="text-xs text-[var(--text-dim)]">
            © {new Date().getFullYear()} HireIQ. All rights reserved.
          </p>
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
      <TrustBar />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <CtaBanner />
      <Footer />
    </>
  );
}
