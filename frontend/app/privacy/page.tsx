import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | HireIQ",
  description: "How HireIQ collects, uses, and protects your personal data.",
};

const EFFECTIVE_DATE = "1 April 2025";
const CONTACT_EMAIL  = "privacy@hireiq.app";
const COMPANY_NAME   = "HireIQ Ltd";
const COMPANY_ADDRESS = "71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom";

function Section({ id, title, children }: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="text-sm text-[var(--text-muted)] leading-7 space-y-4">{children}</div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-brand-400 mt-1.5 shrink-0">•</span>
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      {/* Minimal nav */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white text-xs font-black">H</span>
            </div>
            <span className="text-white font-bold text-sm">HireIQ</span>
          </Link>
          <Link
            href="/terms"
            className="text-xs text-[var(--text-muted)] hover:text-white transition-colors"
          >
            Terms of Service →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        {/* Title */}
        <div className="mb-12">
          <h1 className="text-3xl font-extrabold text-white mb-3">Privacy Policy</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Effective date: <strong className="text-[var(--text)]">{EFFECTIVE_DATE}</strong>
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-3">
            {COMPANY_NAME} (&ldquo;HireIQ&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or
            &ldquo;us&rdquo;) is committed to protecting the personal data of both the companies
            that use our platform (&ldquo;Customers&rdquo;) and the individuals who complete
            AI-powered interviews through our platform (&ldquo;Candidates&rdquo;). This Privacy
            Policy explains what personal data we collect, why we collect it, how we use and
            share it, and what rights you have over it.
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-3">
            If you are located in the European Economic Area (EEA), the United Kingdom (UK), or
            Switzerland, HireIQ is the data controller for your personal data and this policy
            reflects compliance with the UK GDPR and EU GDPR.
          </p>
        </div>

        <div className="space-y-12">
          <Section id="information-we-collect" title="1. Information We Collect">
            <p>
              We collect personal data in two main contexts: (a) from companies registering and
              using the HireIQ platform; and (b) from candidates completing AI interviews.
            </p>

            <div>
              <p className="font-semibold text-white mb-2">1.1 Company Account Data</p>
              <p>When a company creates a HireIQ account, we collect:</p>
              <ul className="space-y-1 mt-2">
                <Li>Business email address and password (hashed — never stored in plain text)</Li>
                <Li>Company name, industry, company size, and website URL</Li>
                <Li>Billing information (processed and stored by our payment provider; we do not store raw card numbers)</Li>
                <Li>Usage data: jobs created, interview settings, platform interactions</Li>
                <Li>Log data: IP address, browser type, pages visited, timestamps</Li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-white mb-2">1.2 Candidate Data</p>
              <p>
                When an individual completes an AI interview via HireIQ, we collect:
              </p>
              <ul className="space-y-1 mt-2">
                <Li>Full name and email address (provided by the candidate before the interview begins)</Li>
                <Li>Interview transcript: all questions asked and all answers provided</Li>
                <Li>AI-generated assessment data: overall score, skill scores, executive summary, key strengths, areas of concern, hiring recommendation</Li>
                <Li>Metadata: interview start time, completion time, duration, session token</Li>
                <Li>Technical data: IP address (for fraud prevention), browser user agent</Li>
              </ul>
              <p className="mt-3">
                Candidates are <strong className="text-white">not required to create an account</strong>.
                They interact with HireIQ solely through a single-use interview link provided by
                the hiring company.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white mb-2">1.3 Data We Do Not Collect</p>
              <p>HireIQ does not collect, and explicitly prohibits, the collection or use of:</p>
              <ul className="space-y-1 mt-2">
                <Li>Video or audio recordings of candidates</Li>
                <Li>Facial recognition or biometric data</Li>
                <Li>Information about race, ethnicity, religion, sexual orientation, or disability — unless a candidate voluntarily discloses such information in a free-text answer</Li>
                <Li>Candidate social media profiles or third-party background check data</Li>
              </ul>
            </div>
          </Section>

          <Section id="legal-basis" title="2. Legal Basis for Processing (GDPR / UK GDPR)">
            <p>
              For users in the EEA and UK, we rely on the following lawful bases for processing
              personal data:
            </p>
            <ul className="space-y-1 mt-2">
              <Li>
                <strong className="text-white">Contract performance:</strong> processing company
                account data and delivering the HireIQ service to Customers.
              </Li>
              <Li>
                <strong className="text-white">Legitimate interests:</strong> fraud prevention,
                platform security, product improvement, and sending relevant product updates to
                existing Customers (where not overridden by the individual&apos;s interests or rights).
              </Li>
              <Li>
                <strong className="text-white">Consent:</strong> for marketing communications to
                prospective customers and optional cookies. Consent may be withdrawn at any time.
              </Li>
              <Li>
                <strong className="text-white">Legal obligation:</strong> where we are required to
                retain or disclose data under applicable law.
              </Li>
            </ul>
            <p>
              Candidate data is processed by HireIQ on behalf of the hiring company (our Customer),
              who acts as data controller for that data. HireIQ acts as a data processor. We process
              candidate data solely to deliver the interview service contracted by the Customer and
              for no other purpose.
            </p>
          </Section>

          <Section id="how-we-use" title="3. How We Use Your Information">
            <p>We use the data we collect to:</p>
            <ul className="space-y-1">
              <Li>Create and manage company accounts</Li>
              <Li>Generate AI-powered interview questions tailored to each job posting</Li>
              <Li>Conduct and record candidate interviews</Li>
              <Li>Produce AI-generated candidate scoring and assessment reports</Li>
              <Li>Generate PDF candidate reports for download by the hiring company</Li>
              <Li>Send email notifications to companies when a candidate completes an interview (where opted in)</Li>
              <Li>Detect and prevent fraud, abuse, and security threats</Li>
              <Li>Improve the accuracy and quality of our AI models (using only anonymised, aggregated data)</Li>
              <Li>Communicate with Customers about their account, billing, and service updates</Li>
              <Li>Comply with legal obligations</Li>
            </ul>
            <p>
              We do not use candidate interview data to train our AI models without express
              Customer consent. We do not sell personal data to third parties under any circumstances.
            </p>
          </Section>

          <Section id="ai-processing" title="4. AI Processing and Automated Decision-Making">
            <p>
              HireIQ uses artificial intelligence (specifically large language models provided by
              Groq, Inc.) to generate interview questions, produce adaptive follow-up questions
              during interviews, and score candidates at the end of each interview.
            </p>
            <p>
              The AI-generated score and hiring recommendation are <strong className="text-white">
              advisory only</strong>. They are tools to assist human hiring managers, not automated
              decisions with legal or similarly significant effect on candidates. No offer of
              employment or rejection decision is made by HireIQ or its AI — all final decisions
              rest with the hiring company.
            </p>
            <p>
              Under GDPR Article 22, candidates have the right not to be subject to solely
              automated decisions with significant effects. Because HireIQ&apos;s outputs are reviewed
              by human hiring managers before any employment decision is made, Article 22 automated
              decision-making protections are not triggered. However, we respect the spirit of this
              principle and encourage Customers to use AI scores as one signal among many.
            </p>
            <p>
              Candidate data sent to Groq for AI inference is governed by Groq&apos;s data processing
              agreement. Groq does not train on user data submitted via API. Interview data is
              transmitted to Groq solely to generate the interview assessment and is not retained
              by Groq beyond that request.
            </p>
          </Section>

          <Section id="data-sharing" title="5. How We Share Your Information">
            <p>
              We do not sell, rent, or trade personal data. We share data only in the following
              limited circumstances:
            </p>
            <ul className="space-y-1">
              <Li>
                <strong className="text-white">Service providers (data processors):</strong> Supabase
                (database and authentication infrastructure), Groq (AI inference), our email
                notification provider, and our payment processor. All processors are bound by
                data processing agreements and are prohibited from using data for any purpose
                other than delivering the service.
              </Li>
              <Li>
                <strong className="text-white">Hiring companies:</strong> Candidate interview
                transcripts, scores, and AI reports are visible to the hiring company that
                published the job posting. Candidates consent to this by starting an interview.
              </Li>
              <Li>
                <strong className="text-white">Legal requirements:</strong> We may disclose data
                if required by law, court order, or to protect the rights, property, or safety of
                HireIQ, our users, or the public.
              </Li>
              <Li>
                <strong className="text-white">Business transfers:</strong> In the event of a
                merger, acquisition, or sale of all or part of our assets, personal data may be
                transferred as part of that transaction. We will provide notice before data
                becomes subject to a different privacy policy.
              </Li>
            </ul>
          </Section>

          <Section id="data-retention" title="6. Data Retention">
            <p>
              We retain personal data only as long as necessary for the purposes described in this
              policy or as required by law.
            </p>
            <ul className="space-y-1">
              <Li>
                <strong className="text-white">Company account data:</strong> retained for the
                duration of the account plus 90 days after account deletion, to allow recovery
                in case of accidental deletion.
              </Li>
              <Li>
                <strong className="text-white">Candidate interview data:</strong> retained for 24
                months from the date of interview, or until the hiring company deletes the
                record, whichever is sooner. Customers may request earlier deletion.
              </Li>
              <Li>
                <strong className="text-white">Log and analytics data:</strong> retained for 12
                months, then automatically purged.
              </Li>
              <Li>
                <strong className="text-white">Billing records:</strong> retained for 7 years to
                comply with financial regulations.
              </Li>
            </ul>
          </Section>

          <Section id="security" title="7. Data Security">
            <p>
              We implement appropriate technical and organisational measures to protect personal
              data against unauthorised access, alteration, disclosure, or destruction. These
              include:
            </p>
            <ul className="space-y-1">
              <Li>TLS encryption for all data in transit</Li>
              <Li>AES-256 encryption for data at rest</Li>
              <Li>Row-level security (RLS) ensuring each company can only access its own data</Li>
              <Li>Cryptographically random, unguessable interview link tokens</Li>
              <Li>Access controls limiting employee access to personal data on a need-to-know basis</Li>
              <Li>Regular security reviews and dependency audits</Li>
            </ul>
            <p>
              No method of transmission or storage is 100% secure. In the event of a personal data
              breach, we will notify affected parties and relevant supervisory authorities in
              accordance with applicable law (within 72 hours under GDPR where required).
            </p>
          </Section>

          <Section id="your-rights" title="8. Your Rights">
            <p>
              Depending on your location, you may have the following rights over your personal data:
            </p>
            <ul className="space-y-1">
              <Li>
                <strong className="text-white">Right of access:</strong> request a copy of the
                personal data we hold about you.
              </Li>
              <Li>
                <strong className="text-white">Right to rectification:</strong> request correction
                of inaccurate personal data.
              </Li>
              <Li>
                <strong className="text-white">Right to erasure (&ldquo;right to be forgotten&rdquo;):</strong>{" "}
                request deletion of your personal data, subject to legal retention requirements.
              </Li>
              <Li>
                <strong className="text-white">Right to restrict processing:</strong> request that
                we limit how we use your data in certain circumstances.
              </Li>
              <Li>
                <strong className="text-white">Right to data portability:</strong> receive your
                personal data in a structured, machine-readable format.
              </Li>
              <Li>
                <strong className="text-white">Right to object:</strong> object to processing based
                on legitimate interests, including profiling.
              </Li>
              <Li>
                <strong className="text-white">Rights related to automated decision-making:</strong>{" "}
                as described in Section 4.
              </Li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand-400 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond within 30 days. We may need to verify your identity before processing
              the request.
            </p>
            <p>
              If you believe your rights have been violated, you have the right to lodge a complaint
              with your local supervisory authority. In the UK, this is the Information
              Commissioner&apos;s Office (ICO). In the EU, contact your national data protection authority.
            </p>
          </Section>

          <Section id="cookies" title="9. Cookies and Tracking">
            <p>
              HireIQ uses strictly necessary cookies required for the platform to function
              (authentication session tokens). We do not use advertising or cross-site tracking
              cookies.
            </p>
            <p>
              We use minimal analytics to understand aggregate platform usage (e.g. page views,
              feature adoption). This data is not linked to individual identities and is not shared
              with third-party advertising networks.
            </p>
          </Section>

          <Section id="international-transfers" title="10. International Data Transfers">
            <p>
              HireIQ is incorporated in the United Kingdom. Our infrastructure providers (Supabase,
              Groq) may process data in the United States. Where data is transferred outside the
              UK or EEA, we ensure appropriate safeguards are in place, including Standard
              Contractual Clauses (SCCs) approved by the relevant supervisory authority.
            </p>
          </Section>

          <Section id="children" title="11. Children's Privacy">
            <p>
              HireIQ is not directed at individuals under the age of 16. We do not knowingly collect
              personal data from children. If we become aware that we have collected personal data
              from a child under 16 without appropriate consent, we will delete it promptly. If you
              believe a child has submitted data to HireIQ, please contact us immediately.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we
              will notify registered Customers by email and update the effective date at the top of
              this page. Continued use of HireIQ after changes take effect constitutes acceptance
              of the revised policy.
            </p>
          </Section>

          <Section id="contact" title="13. Contact Us">
            <p>
              For any questions about this Privacy Policy, to exercise your data rights, or to
              report a data protection concern, please contact our Privacy team:
            </p>
            <div className="glass rounded-xl p-5 mt-2">
              <p className="text-white font-semibold">{COMPANY_NAME}</p>
              <p>{COMPANY_ADDRESS}</p>
              <p className="mt-2">
                Email:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-400 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </Section>
        </div>

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-[var(--border)] flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:text-white transition-colors">← Back to HireIQ</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
