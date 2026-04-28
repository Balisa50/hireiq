import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | HireIQ",
  description: "How HireIQ collects, uses, stores, and protects your personal data.",
};

const EFFECTIVE_DATE   = "1 May 2025";
const CONTACT_EMAIL    = "privacy@hireiq.app";
const COMPANY_NAME     = "HireIQ Ltd";
const COMPANY_ADDRESS  = "71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom";

function Section({ id, title, children }: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-base font-bold text-ink border-b border-border pb-2">{title}</h2>
      <div className="text-sm text-sub leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="text-muted mt-1 shrink-0 text-xs">▸</span>
      <span>{children}</span>
    </li>
  );
}

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-[4px] border border-border">
      <table className="w-full text-sm">
        <thead className="bg-[var(--bg)]">
          <tr>
            {["Data Type", "Purpose", "Retention"].map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c], i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[var(--bg)]"}>
              <td className="px-4 py-2.5 font-medium text-ink align-top">{a}</td>
              <td className="px-4 py-2.5 text-sub align-top">{b}</td>
              <td className="px-4 py-2.5 text-sub align-top">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[4px] bg-ink flex items-center justify-center">
              <span className="text-white text-xs font-black">H</span>
            </div>
            <span className="text-ink font-bold text-sm">HireIQ</span>
          </Link>
          <Link href="/terms" className="text-xs text-sub hover:text-ink transition-colors">
            Terms of Service →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-10">
        {/* Title block */}
        <div className="space-y-2 pb-6 border-b border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Legal</p>
          <h1 className="text-3xl font-bold text-ink">Privacy Policy</h1>
          <p className="text-sm text-sub">
            Effective date: {EFFECTIVE_DATE} · {COMPANY_NAME} · {COMPANY_ADDRESS}
          </p>
          <p className="text-sm text-sub leading-relaxed pt-1">
            This Privacy Policy explains how {COMPANY_NAME} ("<strong className="text-ink">HireIQ</strong>",
            "<strong className="text-ink">we</strong>", "<strong className="text-ink">us</strong>") collects, uses,
            stores, and discloses personal data when you use our platform at{" "}
            <a href="https://hireiq.app" className="underline hover:text-ink">hireiq.app</a> (the
            "<strong className="text-ink">Service</strong>"). By using the Service, you agree to the practices
            described in this Policy.
          </p>
        </div>

        <Section id="who-we-are" title="1. Who We Are">
          <p>
            {COMPANY_NAME} operates HireIQ, an AI-powered candidate intelligence platform that helps
            employers conduct structured screening interviews, evaluate applicants, and make hiring
            decisions. The Service is used by two distinct groups: <strong className="text-ink">employers</strong>{" "}
            (companies that post jobs and review candidates) and <strong className="text-ink">candidates</strong>{" "}
            (individuals who apply to those jobs).
          </p>
          <p>
            For the purposes of applicable data protection law, {COMPANY_NAME} acts as a{" "}
            <strong className="text-ink">data controller</strong> in respect of employer account data and as
            a <strong className="text-ink">data processor</strong> on behalf of employers in respect of
            candidate data. Employers are responsible for their own compliance obligations as data
            controllers for candidate data.
          </p>
        </Section>

        <Section id="data-collected" title="2. Data We Collect">
          <p className="font-medium text-ink text-sm">2.1 Employer Account Data</p>
          <p>When a company creates an account, we collect:</p>
          <ul className="space-y-1.5 pl-1">
            <Li>Company name, email address, and password (hashed, never stored in plaintext)</Li>
            <Li>Company profile details: industry, size, website URL, logo URL</Li>
            <Li>Billing contact information if you upgrade to a paid plan</Li>
            <Li>IP address, browser type, and session data for security and abuse prevention</Li>
            <Li>Platform usage data: pages visited, features used, timestamps of actions</Li>
          </ul>

          <p className="font-medium text-ink text-sm pt-2">2.2 Candidate Data</p>
          <p>
            When candidates apply to jobs posted on HireIQ, we collect data on behalf of the
            hiring employer. This may include:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>Full name, email address, phone number, and other contact details</Li>
            <Li>Date of birth, nationality, current location (if requested by the employer)</Li>
            <Li>Employment history, education history, and professional background</Li>
            <Li>Uploaded documents: CV/résumé, cover letter, certificates, portfolio files</Li>
            <Li>Profile links: LinkedIn, GitHub, Dribbble, personal website</Li>
            <Li>
              AI interview transcript — the complete verbatim record of the candidate's responses
              to AI-generated screening questions
            </Li>
            <Li>
              Derived assessments: overall score, per-dimension score breakdown, hiring
              recommendation, red flags analysis, and engagement metrics
            </Li>
            <Li>
              Voluntary diversity data (ethnicity, gender identity, disability status, veteran
              status) — only if the employer has enabled this and only where permitted by law
            </Li>
          </ul>

          <p className="font-medium text-ink text-sm pt-2">2.3 Technical and Usage Data</p>
          <ul className="space-y-1.5 pl-1">
            <Li>Authentication tokens and session identifiers</Li>
            <Li>Server access logs (IP address, request timestamps, HTTP status codes)</Li>
            <Li>Error logs for debugging and platform stability</Li>
          </ul>
        </Section>

        <Section id="how-we-use" title="3. How We Use Your Data">
          <Table rows={[
            ["Employer account data", "Authenticate your account, deliver the platform, send notifications, and provide support", "For the life of the account, plus 90 days after deletion"],
            ["Candidate interview data", "Power the AI interview, generate scores and reports, deliver results to the hiring employer", "As configured by the employer (default 365 days from completion)"],
            ["Uploaded documents", "Display to the hiring employer, extract text for AI analysis", "Same retention period as interview data"],
            ["Voluntary DEI data", "Provide aggregate diversity reporting to the employer; never used in scoring", "Same retention period as interview data"],
            ["Usage analytics", "Improve the platform, detect abuse, inform product decisions", "24 months, then aggregated/anonymised"],
            ["Security/access logs", "Detect and investigate security incidents", "90 days"],
          ]} />
          <p className="pt-1">
            We do <strong className="text-ink">not</strong> sell personal data to third parties. We do
            not use candidate data to train our own AI models without explicit consent.
          </p>
        </Section>

        <Section id="ai-processing" title="4. AI Processing of Candidate Data">
          <p>
            HireIQ uses AI language models (currently Groq-hosted LLaMA 3) to conduct candidate
            screening conversations and generate assessment reports. When a candidate interacts
            with the platform:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              Their responses are transmitted to Groq's API for real-time inference. Groq's data
              processing terms apply. Groq does not train models on API payloads.
            </Li>
            <Li>
              AI-generated scores, recommendations, and red-flag analyses are stored in our
              database and made available to the hiring employer only.
            </Li>
            <Li>
              Candidates may be flagged if the system detects patterns consistent with
              AI-generated responses. This forms part of the Red Flags Report visible to
              the employer.
            </Li>
            <Li>
              No automated hiring decision is made solely by the AI. All final hiring decisions
              remain with the employer.
            </Li>
          </ul>
        </Section>

        <Section id="data-storage" title="5. Data Storage and Security">
          <p>
            All data is stored on Supabase-managed PostgreSQL databases hosted in the European
            Union (eu-central-1 region). Uploaded files are stored in Supabase Storage (same
            region). We implement the following security measures:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>All data in transit is encrypted using TLS 1.2 or higher</Li>
            <Li>All data at rest is encrypted using AES-256</Li>
            <Li>Access to production databases is restricted by role and IP allowlist</Li>
            <Li>Passwords are hashed using bcrypt via Supabase Auth — plaintext passwords are never stored</Li>
            <Li>Authentication tokens are short-lived JWTs; refresh tokens are stored securely</Li>
            <Li>Row-level security policies enforce company-level data isolation</Li>
          </ul>
          <p>
            Despite these measures, no system is perfectly secure. We will notify affected parties
            of material data breaches in accordance with applicable law.
          </p>
        </Section>

        <Section id="data-sharing" title="6. Third-Party Data Sharing">
          <p>We share data only in the following limited circumstances:</p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Supabase</strong> (database, authentication, file
              storage) — EU-hosted, GDPR-compliant
            </Li>
            <Li>
              <strong className="text-ink">Groq</strong> (AI inference API) — candidate responses
              are sent for real-time processing; Groq does not retain inputs after inference
            </Li>
            <Li>
              <strong className="text-ink">Render</strong> (backend hosting) — receives encrypted
              traffic to our API; no direct database access
            </Li>
            <Li>
              <strong className="text-ink">Vercel</strong> (frontend hosting) — serves the web
              application; does not receive personal data beyond anonymised request logs
            </Li>
            <Li>
              <strong className="text-ink">Legal and regulatory bodies</strong> — when required
              by law, court order, or to protect our legal rights
            </Li>
          </ul>
          <p>
            We do not share personal data with advertisers, data brokers, or other employers on
            the platform.
          </p>
        </Section>

        <Section id="retention" title="7. Data Retention">
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Employer accounts:</strong> Data is retained for the
              life of the account. After account deletion, data is purged within 90 days.
            </Li>
            <Li>
              <strong className="text-ink">Candidate data:</strong> Retained for the period
              configured by the employer (default: 365 days from application completion). At the
              end of this period, data is automatically deleted from our systems.
            </Li>
            <Li>
              <strong className="text-ink">Uploaded files:</strong> Retained for the same period
              as the interview record. When the interview is deleted, associated files are removed
              from storage.
            </Li>
            <Li>
              <strong className="text-ink">AI assessments:</strong> Retained as part of the
              interview record; deleted when the interview record is deleted.
            </Li>
            <Li>
              <strong className="text-ink">Anonymised analytics:</strong> May be retained
              indefinitely in aggregated form.
            </Li>
          </ul>
        </Section>

        <Section id="candidate-rights" title="8. Candidate Rights">
          <p>
            Depending on your jurisdiction, you may have the following rights regarding your
            personal data:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Right of access:</strong> Request a copy of the data
              held about you
            </Li>
            <Li>
              <strong className="text-ink">Right to rectification:</strong> Request correction of
              inaccurate data
            </Li>
            <Li>
              <strong className="text-ink">Right to erasure:</strong> Request deletion of your
              data, subject to the employer's legal obligations
            </Li>
            <Li>
              <strong className="text-ink">Right to restriction:</strong> Request that processing
              be limited in certain circumstances
            </Li>
            <Li>
              <strong className="text-ink">Right to data portability:</strong> Receive your data
              in a structured, machine-readable format
            </Li>
            <Li>
              <strong className="text-ink">Right to object:</strong> Object to processing based
              on legitimate interests
            </Li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">{CONTACT_EMAIL}</a>.
            We will respond within 30 days. Note that because HireIQ acts as a processor for
            candidate data on behalf of employers, some requests may need to be directed to the
            hiring company.
          </p>
        </Section>

        <Section id="cookies" title="9. Cookies and Tracking">
          <p>
            HireIQ uses minimal cookies and browser storage. Specifically:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Authentication tokens:</strong> Stored in localStorage
              to maintain your login session. These are essential for the platform to function.
            </Li>
            <Li>
              <strong className="text-ink">No third-party tracking cookies:</strong> We do not
              use advertising pixels, cross-site tracking, or behavioural analytics.
            </Li>
            <Li>
              <strong className="text-ink">Vercel Analytics (optional):</strong> Anonymised
              page-view data may be collected. No personal data is transmitted.
            </Li>
          </ul>
        </Section>

        <Section id="children" title="10. Children's Data">
          <p>
            The HireIQ platform is intended for use by adults aged 18 and over. We do not
            knowingly collect personal data from individuals under 18. If you believe a minor
            has submitted data through the platform, contact us immediately at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">{CONTACT_EMAIL}</a>{" "}
            and we will delete it promptly.
          </p>
        </Section>

        <Section id="changes" title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Material changes will be
            communicated by posting a notice on the platform or sending an email to registered
            account holders at least 14 days before the change takes effect. Your continued use
            of the Service after that date constitutes acceptance of the revised Policy.
          </p>
        </Section>

        <Section id="contact" title="12. Contact Us">
          <p>
            For privacy-related questions, data subject requests, or to report a concern:
          </p>
          <div className="bg-white border border-border rounded-[4px] p-4 text-sm text-sub space-y-1">
            <p className="font-semibold text-ink">{COMPANY_NAME}</p>
            <p>{COMPANY_ADDRESS}</p>
            <p>
              Email:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-border pt-8 flex items-center justify-between text-xs text-muted">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/" className="hover:text-ink transition-colors">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
