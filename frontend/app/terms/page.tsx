import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | HireIQ",
  description: "HireIQ terms of service, your rights and obligations when using the platform.",
};

const EFFECTIVE_DATE  = "1 May 2025";
const CONTACT_EMAIL   = "legal@hireiq.app";
const COMPANY_NAME    = "HireIQ Ltd";
const COMPANY_ADDRESS = "71, 75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom";

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

export default function TermsPage() {
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
          <Link href="/privacy" className="text-xs text-sub hover:text-ink transition-colors">
            Privacy Policy →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-10">
        {/* Title block */}
        <div className="space-y-2 pb-6 border-b border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Legal</p>
          <h1 className="text-3xl font-bold text-ink">Terms of Service</h1>
          <p className="text-sm text-sub">
            Effective date: {EFFECTIVE_DATE} · {COMPANY_NAME} · {COMPANY_ADDRESS}
          </p>
          <p className="text-sm text-sub leading-relaxed pt-1">
            These Terms of Service ("<strong className="text-ink">Terms</strong>") govern your use of the
            HireIQ platform at{" "}
            <a href="https://hireiq.app" className="underline hover:text-ink">hireiq.app</a> (the{" "}
            "<strong className="text-ink">Service</strong>") operated by {COMPANY_NAME} ("
            <strong className="text-ink">HireIQ</strong>", "<strong className="text-ink">we</strong>",
            "<strong className="text-ink">us</strong>"). By creating an account or using the Service, you
            agree to be bound by these Terms. If you are acting on behalf of a company, you represent that
            you have authority to bind that entity. If you disagree with these Terms, do not use the Service.
          </p>
        </div>

        <Section id="what-we-provide" title="1. What HireIQ Provides">
          <p>
            HireIQ is an AI-powered candidate intelligence platform that enables employers to:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>Create and publish job listings with structured screening criteria</Li>
            <Li>Conduct automated AI-driven screening interviews with candidates</Li>
            <Li>Generate structured assessment reports covering fit score, red flags, engagement metrics,
              and hiring recommendations</Li>
            <Li>Collect and manage candidate documents, profile links, and application data</Li>
            <Li>Review, compare, and shortlist applicants from a centralised dashboard</Li>
          </ul>
          <p>
            HireIQ provides software tools to assist human hiring decisions. We are{" "}
            <strong className="text-ink">not</strong> an employment agency, recruitment consultancy, or
            labour marketplace. We do not make hiring decisions on your behalf, and we do not guarantee
            any particular outcome from your use of the Service.
          </p>
          <p>
            The Service depends on third-party infrastructure including Supabase (database and storage),
            Groq (AI inference), Render (backend hosting), and Vercel (frontend hosting). We will notify
            you of material changes to our infrastructure that affect the Service.
          </p>
        </Section>

        <Section id="account" title="2. Account Registration and Security">
          <p>
            To use the Service as an employer, you must register an account with a valid business email
            address and provide accurate, complete, and current information. You agree to keep this
            information up to date.
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>You are responsible for maintaining the confidentiality of your login credentials.</Li>
            <Li>
              You are responsible for all activity that occurs under your account, whether or not
              authorised by you.
            </Li>
            <Li>
              You must notify us immediately at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">{CONTACT_EMAIL}</a>{" "}
              upon becoming aware of any unauthorised account access.
            </Li>
            <Li>
              You may not share login credentials with individuals outside your organisation, or use
              a single account on behalf of multiple unrelated organisations.
            </Li>
          </ul>
          <p>
            HireIQ is not liable for any loss or damage arising from your failure to keep credentials
            secure.
          </p>
        </Section>

        <Section id="company-responsibilities" title="3. Company Responsibilities">
          <p>
            As the employer using HireIQ to screen candidates, you are responsible for:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Legal compliance:</strong> Ensuring your use of HireIQ
              complies with all applicable employment, anti-discrimination, data protection, and AI
              governance laws in your jurisdiction, including but not limited to the UK Equality Act
              2010, US EEO laws (Title VII, ADA, ADEA), EU Equal Treatment Directives, UK GDPR, GDPR,
              and the EU AI Act where applicable to high-risk AI in employment decisions.
            </Li>
            <Li>
              <strong className="text-ink">Human oversight:</strong> Ensuring that AI-generated scores,
              recommendations, and red-flag analyses are reviewed by a qualified human before any
              employment decision is made. AI outputs are advisory only.
            </Li>
            <Li>
              <strong className="text-ink">Candidate transparency:</strong> Informing candidates, before
              they complete an interview, that their responses will be assessed by an AI system and
              shared with your hiring team.
            </Li>
            <Li>
              <strong className="text-ink">Accuracy of job postings:</strong> Ensuring job descriptions,
              screening questions, and eligibility criteria are accurate, lawful, and relevant to the
              genuine requirements of the role.
            </Li>
            <Li>
              <strong className="text-ink">Data retention obligations:</strong> Configuring appropriate
              data retention periods for candidate data within the platform, consistent with your legal
              obligations as a data controller.
            </Li>
            <Li>
              <strong className="text-ink">Candidate rights:</strong> Responding to data subject requests
              (access, rectification, erasure) from candidates where HireIQ acts as a processor on your
              behalf.
            </Li>
          </ul>
          <p>
            You should seek independent legal advice regarding your compliance obligations. HireIQ is
            not responsible for ensuring that your specific use of the Service is legally compliant in
            your jurisdiction.
          </p>
        </Section>

        <Section id="prohibited-uses" title="4. Prohibited Uses">
          <p>You must not use the Service to:</p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              Discriminate against candidates on the basis of race, colour, sex, age, disability,
              national origin, religion, sexual orientation, gender identity, pregnancy, or any other
              characteristic protected by applicable law.
            </Li>
            <Li>
              Make employment decisions solely on the basis of an AI-generated score or recommendation
              without human review.
            </Li>
            <Li>
              Post fictitious job listings or use the platform to collect personal data for purposes
              unrelated to genuine hiring.
            </Li>
            <Li>
              Upload job descriptions, screening questions, or content that is unlawful, harassing,
              defamatory, or designed to deceive candidates about the nature of the role or company.
            </Li>
            <Li>
              Reverse engineer, decompile, copy, or create derivative works from HireIQ's AI models,
              scoring algorithms, software, or any proprietary component of the Service.
            </Li>
            <Li>
              Attempt to bypass rate limits, authentication controls, row-level security policies,
              or any other security mechanism of the Service.
            </Li>
            <Li>
              Harvest or compile candidate personal data from the platform for purposes other than
              evaluating candidates for the specific advertised role.
            </Li>
            <Li>
              Resell, sublicense, or white-label the Service or any part of it without express written
              permission from HireIQ.
            </Li>
            <Li>
              Use the Service in a manner that causes disruption, overloads our infrastructure, or
              interferes with other users' access.
            </Li>
          </ul>
          <p>
            HireIQ reserves the right to suspend or terminate accounts that violate these requirements,
            with or without prior notice, at our sole discretion.
          </p>
        </Section>

        <Section id="candidate-obligations" title="5. Candidate Obligations">
          <p>Candidates who complete HireIQ interviews agree to:</p>
          <ul className="space-y-1.5 pl-1">
            <Li>Provide honest, genuine, and complete responses to all interview questions.</Li>
            <Li>
              Not use AI tools, automated systems, or third parties to generate or significantly
              assist with interview answers without explicit disclosure. The platform actively monitors
              for AI-generated content and flags suspicious patterns in the assessment report.
            </Li>
            <Li>
              Acknowledge that their interview transcript and AI assessment report will be shared with
              the employer who issued the interview link, and will be retained for the period configured
              by that employer.
            </Li>
            <Li>
              Not attempt to manipulate, game, or reverse-engineer the AI scoring system.
            </Li>
          </ul>
          <p>
            Misrepresentation during an interview may constitute grounds for disqualification from the
            role and potentially from future applications through the same employer.
          </p>
        </Section>

        <Section id="intellectual-property" title="6. Intellectual Property">
          <p>
            HireIQ and its licensors retain all intellectual property rights in the Service, including
            the platform, AI models, scoring methodology, algorithms, software, UI design, and branding.
            Nothing in these Terms transfers ownership rights to you.
          </p>
          <p>
            <strong className="text-ink">Your content:</strong> You retain ownership of job descriptions,
            custom questions, and other content you upload. You grant HireIQ a limited, non-exclusive,
            royalty-free licence to use that content solely to operate and provide the Service to you.
          </p>
          <p>
            <strong className="text-ink">Candidate content:</strong> Interview transcripts and responses
            provided by candidates are owned by the candidate. The hiring employer receives a licence to
            use that content solely for evaluating the candidate for the advertised role.
          </p>
          <p>
            <strong className="text-ink">AI-generated outputs:</strong> AI-generated interview questions,
            follow-up prompts, and assessment reports are owned by HireIQ and licensed to you for use
            within the Service during your active subscription period.
          </p>
          <p>
            We do <strong className="text-ink">not</strong> use your content or candidate data to train
            AI models without explicit consent.
          </p>
        </Section>

        <Section id="payment" title="7. Billing and Payment">
          <p>
            The Starter plan is provided free of charge with no credit card required. Paid plans
            ("<strong className="text-ink">Subscriptions</strong>") are billed monthly or annually in
            advance. All fees are non-refundable except where required by law.
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>Prices may change with 30 days' written notice. Continued use after a price change
              constitutes acceptance of the new pricing.</Li>
            <Li>If payment fails, we will attempt to re-process the charge. Accounts more than 7 days
              overdue may be downgraded or suspended until payment is received.</Li>
            <Li>You may cancel your Subscription at any time. Cancellation takes effect at the end of
              the current billing period, and access to paid features continues until that date.</Li>
            <Li>For questions about invoices or billing, contact{" "}
              <a href="mailto:support@hireiq.app" className="underline hover:text-ink">support@hireiq.app</a>.
            </Li>
          </ul>
        </Section>

        <Section id="ai-disclaimers" title="8. AI Features and Limitations">
          <p>
            HireIQ's AI features are designed to augment human decision-making. You acknowledge that:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              AI-generated questions, assessments, and recommendations may contain errors, biases, or
              inaccuracies. They should not be treated as definitive evaluations of a candidate's
              suitability for any role.
            </Li>
            <Li>
              No employment decision should be made solely on the basis of an AI-generated score or
              recommendation. A qualified human must review all AI outputs before acting on them.
            </Li>
            <Li>
              AI language models may occasionally produce content that is factually incorrect,
              inconsistent, or contextually inappropriate. You are responsible for reviewing AI outputs
              before sharing them with candidates or acting on them.
            </Li>
            <Li>
              HireIQ does not guarantee that AI assessments are free from bias. Employers are
              encouraged to monitor hiring outcomes for disparate impact and adjust screening criteria
              accordingly.
            </Li>
            <Li>
              AI detection (screening for AI-generated candidate responses) is always active and forms
              part of the Red Flags Report. The presence of a flag is not conclusive evidence of
              misconduct and should be reviewed in context.
            </Li>
          </ul>
        </Section>

        <Section id="service-availability" title="9. Service Availability and Changes">
          <p>
            We aim to maintain high availability of the Service but do not guarantee uninterrupted or
            error-free access. The Service depends on third-party infrastructure and AI providers that
            are outside our direct control.
          </p>
          <p>
            HireIQ reserves the right to modify, update, or discontinue any feature of the Service at
            any time. For material changes that adversely affect paid Customers, we will provide at
            least 30 days' notice and offer a pro-rated refund for affected periods where applicable.
          </p>
          <p>
            Scheduled maintenance windows will be communicated in advance where practicable. Emergency
            maintenance may occur without prior notice.
          </p>
        </Section>

        <Section id="limitation-of-liability" title="10. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, HireIQ shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use
            of the Service, including but not limited to lost profits, lost data, reputational harm,
            business interruption, or hiring outcomes, even if HireIQ has been advised of the
            possibility of such damages.
          </p>
          <p>
            HireIQ is not liable for:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>Employment decisions made by you on the basis of AI outputs</Li>
            <Li>Discrimination claims arising from your use of the Service</Li>
            <Li>Data breaches caused by your failure to maintain account security</Li>
            <Li>Losses caused by third-party service outages (Supabase, Groq, Render, Vercel)</Li>
            <Li>Inaccuracies in AI-generated interview questions or assessment reports</Li>
          </ul>
          <p>
            HireIQ's total cumulative liability for claims arising under these Terms shall not exceed
            the greater of (a) the fees you paid to HireIQ in the 12 months preceding the claim, or
            (b) £100 GBP.
          </p>
          <p>
            Nothing in these Terms limits liability for fraud, death, or personal injury caused by
            negligence, or any other liability that cannot be excluded under applicable law.
          </p>
        </Section>

        <Section id="indemnification" title="11. Indemnification">
          <p>
            You agree to indemnify, defend, and hold harmless HireIQ and its officers, directors,
            employees, and agents from any claims, damages, losses, or expenses (including reasonable
            legal fees) arising from:
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>Your use of the Service in violation of these Terms</Li>
            <Li>Your violation of any applicable employment, data protection, or AI governance law</Li>
            <Li>Any claim by a candidate arising from your use of AI assessments in an employment
              decision, including discrimination claims</Li>
            <Li>Your infringement of any third-party intellectual property right</Li>
            <Li>Content you upload to the Service that is unlawful, inaccurate, or misleading</Li>
          </ul>
        </Section>

        <Section id="termination" title="12. Termination">
          <p>
            Either party may terminate these Terms at any time.
          </p>
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">By you:</strong> Delete your account from Settings → Danger
              Zone, or email{" "}
              <a href="mailto:support@hireiq.app" className="underline hover:text-ink">support@hireiq.app</a>{" "}
              with your deletion request.
            </Li>
            <Li>
              <strong className="text-ink">By HireIQ:</strong> We may terminate your account
              immediately for material breach of these Terms, non-payment of fees, fraudulent use of
              the Service, or if required by law. We will provide notice where practicable.
            </Li>
          </ul>
          <p>
            Upon termination: (a) your right to access the Service ceases immediately; (b) your data
            will be retained for 90 days for recovery purposes, then permanently deleted unless we are
            required by law to retain it longer; (c) provisions that by their nature should survive
            termination (including liability limitations, indemnification, and governing law) will
            continue in effect.
          </p>
          <p>
            For Subscribers, termination by HireIQ without cause entitles you to a pro-rated refund
            of prepaid fees for the unused portion of your billing period.
          </p>
        </Section>

        <Section id="governing-law" title="13. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of England and Wales.
            Any dispute arising out of or in connection with these Terms shall be subject to the
            exclusive jurisdiction of the courts of England and Wales, except where mandatory consumer
            protection laws in your local jurisdiction provide otherwise.
          </p>
          <p>
            Before commencing legal proceedings, both parties agree to attempt good-faith resolution
            of disputes by contacting us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section id="general" title="14. General Provisions">
          <ul className="space-y-1.5 pl-1">
            <Li>
              <strong className="text-ink">Entire agreement:</strong> These Terms, together with our
              Privacy Policy, constitute the entire agreement between you and HireIQ regarding the
              Service and supersede all prior agreements.
            </Li>
            <Li>
              <strong className="text-ink">Severability:</strong> If any provision is found
              unenforceable, the remaining provisions continue in full force and effect.
            </Li>
            <Li>
              <strong className="text-ink">Waiver:</strong> Failure to enforce any right under
              these Terms does not constitute a waiver of that right.
            </Li>
            <Li>
              <strong className="text-ink">Assignment:</strong> You may not assign your rights or
              obligations under these Terms without our prior written consent. HireIQ may assign these
              Terms in connection with a merger, acquisition, or sale of assets without your consent.
            </Li>
            <Li>
              <strong className="text-ink">Updates:</strong> We may update these Terms from time to
              time. Material changes will be communicated by email and by posting a notice on the
              platform at least 14 days before the change takes effect. Continued use after the
              effective date constitutes acceptance of the revised Terms.
            </Li>
          </ul>
        </Section>

        <Section id="contact" title="15. Contact">
          <p>For legal enquiries or questions about these Terms:</p>
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
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <Link href="/" className="hover:text-ink transition-colors">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
