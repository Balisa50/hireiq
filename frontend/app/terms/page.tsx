import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | HireIQ",
  description: "HireIQ terms of service. Your rights and obligations when using the platform.",
};

const EFFECTIVE_DATE  = "1 April 2025";
const CONTACT_EMAIL   = "legal@hireiq.app";
const COMPANY_NAME    = "HireIQ Ltd";
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

export default function TermsPage() {
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
            href="/privacy"
            className="text-xs text-[var(--text-muted)] hover:text-white transition-colors"
          >
            Privacy Policy →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        {/* Title */}
        <div className="mb-12">
          <h1 className="text-3xl font-extrabold text-white mb-3">Terms of Service</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Effective date: <strong className="text-[var(--text)]">{EFFECTIVE_DATE}</strong>
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-3">
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using the HireIQ
            platform (the &ldquo;Service&rdquo;) operated by {COMPANY_NAME} (&ldquo;HireIQ&rdquo;,
            &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;).
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-3">
            By creating an account or using the Service, you agree to be bound by these Terms. If you
            are entering into these Terms on behalf of a company or other legal entity, you represent
            that you have the authority to bind that entity. If you do not agree to these Terms, do
            not use the Service.
          </p>
        </div>

        <div className="space-y-12">
          <Section id="definitions" title="1. Definitions">
            <ul className="space-y-1">
              <Li>
                <strong className="text-white">&ldquo;Customer&rdquo;</strong> means a company or
                individual who creates a HireIQ account to manage hiring processes.
              </Li>
              <Li>
                <strong className="text-white">&ldquo;Candidate&rdquo;</strong> means an individual
                who completes an AI interview via a HireIQ interview link.
              </Li>
              <Li>
                <strong className="text-white">&ldquo;Content&rdquo;</strong> means job descriptions,
                questions, answers, reports, and any other material uploaded to or generated through
                the Service.
              </Li>
              <Li>
                <strong className="text-white">&ldquo;AI Features&rdquo;</strong> means the
                artificial intelligence capabilities of the Service including question generation,
                adaptive follow-up questioning, and candidate scoring.
              </Li>
              <Li>
                <strong className="text-white">&ldquo;Subscription&rdquo;</strong> means a paid plan
                that grants access to extended features of the Service.
              </Li>
            </ul>
          </Section>

          <Section id="account" title="2. Account Registration and Security">
            <p>
              To use the Service as a Customer, you must create an account using a valid business
              email address. You must provide accurate, complete, and up-to-date information. You
              are responsible for maintaining the confidentiality of your account credentials and
              for all activity that occurs under your account.
            </p>
            <p>
              You must notify us immediately at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-400 hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              upon becoming aware of any unauthorised use of your account. HireIQ is not liable for
              any loss or damage arising from your failure to keep credentials secure.
            </p>
            <p>
              You may not share account credentials with third parties outside your organisation. Each
              individual at your organisation who uses the Service should have their own credentials
              where multi-user access is supported under your plan.
            </p>
          </Section>

          <Section id="acceptable-use" title="3. Acceptable Use">
            <p>You agree to use the Service only for lawful purposes. You must not:</p>
            <ul className="space-y-1">
              <Li>
                Use the Service to discriminate against candidates on the basis of race, sex, age,
                disability, national origin, religion, sexual orientation, gender identity, or any
                other characteristic protected by applicable law.
              </Li>
              <Li>
                Use AI-generated scores or recommendations as the sole basis for an employment
                decision without human review.
              </Li>
              <Li>
                Upload job descriptions or interview questions that contain illegal content,
                harassing language, or content designed to deceive candidates about the nature of
                the role or company.
              </Li>
              <Li>
                Attempt to reverse engineer, copy, reproduce, or create derivative works from the
                HireIQ AI models, scoring algorithms, or any proprietary component of the Service.
              </Li>
              <Li>
                Use the Service to conduct interviews for roles that do not exist or as a mechanism
                to collect personal data for purposes unrelated to genuine hiring.
              </Li>
              <Li>
                Attempt to circumvent rate limits, access controls, or security mechanisms of the
                Service.
              </Li>
              <Li>
                Impersonate any person or entity, or falsely claim affiliation with any company,
                when using the Service.
              </Li>
              <Li>
                Use the Service to harvest, scrape, or compile candidate personal data for any
                purpose other than evaluating candidates for the specific role advertised.
              </Li>
            </ul>
            <p>
              HireIQ reserves the right to suspend or terminate accounts that violate these
              acceptable use requirements, with or without prior notice, at our sole discretion.
            </p>
          </Section>

          <Section id="employment-law" title="4. Employment Law Compliance">
            <p>
              You acknowledge that you are solely responsible for ensuring your use of HireIQ
              complies with all applicable employment, labour, anti-discrimination, and data
              protection laws in your jurisdiction. This includes, but is not limited to:
            </p>
            <ul className="space-y-1">
              <Li>UK Equality Act 2010</Li>
              <Li>US Equal Employment Opportunity (EEO) laws (Title VII, ADA, ADEA, etc.)</Li>
              <Li>EU Equal Treatment Directives</Li>
              <Li>EU AI Act obligations where applicable to high-risk AI systems used in employment</Li>
              <Li>GDPR / UK GDPR data subject rights obligations</Li>
            </ul>
            <p>
              HireIQ provides tools to assist hiring processes. We are not an employment agency,
              we do not make hiring decisions, and we do not guarantee that use of the Service will
              result in legally compliant hiring practices. You should seek independent legal advice
              regarding your compliance obligations.
            </p>
          </Section>

          <Section id="candidate-obligations" title="5. Candidate Obligations">
            <p>
              Candidates who complete HireIQ interviews agree to:
            </p>
            <ul className="space-y-1">
              <Li>Provide honest and genuine answers to all interview questions.</Li>
              <Li>
                Not use AI tools, automated systems, or third parties to generate or assist with
                interview answers without disclosure. Misrepresentation may be grounds for
                disqualification.
              </Li>
              <Li>
                Acknowledge that their interview transcript and AI assessment will be visible to the
                hiring company that issued the interview link.
              </Li>
            </ul>
          </Section>

          <Section id="intellectual-property" title="6. Intellectual Property">
            <p>
              HireIQ and its licensors own all intellectual property rights in the Service,
              including the platform, AI models, algorithms, scoring methodology, software, and
              design. Nothing in these Terms transfers any ownership rights to you.
            </p>
            <p>
              <strong className="text-white">Customer Content:</strong> You retain ownership of the
              job descriptions, questions, and other content you upload to the Service. You grant
              HireIQ a limited, non-exclusive, royalty-free licence to use that content solely to
              operate and provide the Service.
            </p>
            <p>
              <strong className="text-white">Candidate Content:</strong> Interview transcripts and
              answers provided by candidates are owned by the candidate. The hiring company (Customer)
              receives a licence to use that content for the sole purpose of evaluating the candidate
              for the advertised role.
            </p>
            <p>
              <strong className="text-white">AI Outputs:</strong> AI-generated interview questions,
              follow-up questions, and candidate assessment reports are owned by HireIQ but are
              licensed to you for use within the Service during your subscription period.
            </p>
          </Section>

          <Section id="payment" title="7. Billing and Payment">
            <p>
              Paid Subscriptions are billed monthly or annually in advance. All fees are
              non-refundable except where required by law or as expressly stated in these Terms.
            </p>
            <p>
              Prices may change with 30 days&apos; written notice. Continued use after a price change
              constitutes acceptance of the new pricing.
            </p>
            <p>
              If payment fails, we will attempt to re-process the charge. If payment is not received
              within 7 days, we reserve the right to downgrade or suspend your account until payment
              is made.
            </p>
            <p>
              You may cancel your Subscription at any time. Cancellation takes effect at the end of
              the current billing period. You will retain access to paid features until that date.
            </p>
          </Section>

          <Section id="ai-limitations" title="8. AI Features, Limitations and Disclaimers">
            <p>
              HireIQ&apos;s AI Features are designed to assist human decision-making. You acknowledge
              that:
            </p>
            <ul className="space-y-1">
              <Li>
                AI-generated questions and assessments may contain errors, biases, or inaccuracies.
                They should not be treated as definitive evaluations of a candidate&apos;s suitability.
              </Li>
              <Li>
                AI scores and recommendations are advisory only. No employment decision should be
                made solely on the basis of an AI-generated score.
              </Li>
              <Li>
                AI language models may occasionally generate content that is factually incorrect,
                inconsistent, or culturally insensitive. You are responsible for reviewing AI outputs
                before acting on them.
              </Li>
              <Li>
                HireIQ does not guarantee that AI assessments are free from bias. Customers are
                encouraged to monitor outcomes for disparate impact and adjust focus areas
                accordingly.
              </Li>
            </ul>
          </Section>

          <Section id="service-availability" title="9. Service Availability and Changes">
            <p>
              We strive to maintain high availability of the Service but do not guarantee uninterrupted
              or error-free access. Scheduled maintenance will be communicated where practicable.
            </p>
            <p>
              HireIQ reserves the right to modify, suspend, or discontinue any part of the Service at
              any time. Where a material change affects paid Customers adversely, we will provide at
              least 30 days&apos; notice and offer a pro-rated refund for the affected period.
            </p>
          </Section>

          <Section id="limitation-of-liability" title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, HireIQ shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages arising out of or in
              connection with your use of the Service, including lost profits, lost data, or business
              interruption, even if HireIQ has been advised of the possibility of such damages.
            </p>
            <p>
              HireIQ&apos;s total cumulative liability to you for any claims arising under these Terms
              shall not exceed the greater of (a) the fees you paid to HireIQ in the 12 months
              preceding the claim, or (b) £100 GBP.
            </p>
            <p>
              Nothing in these Terms limits liability for fraud, death, or personal injury caused
              by negligence, or any other liability that cannot be excluded by applicable law.
            </p>
          </Section>

          <Section id="indemnification" title="11. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless HireIQ and its officers, directors,
              employees, and agents from any claims, damages, losses, or expenses (including
              reasonable legal fees) arising from: (a) your use of the Service in violation of
              these Terms; (b) your violation of any applicable law; (c) any claim by a candidate
              arising from your use of AI assessments in an employment decision; or (d) your
              infringement of any third-party intellectual property right.
            </p>
          </Section>

          <Section id="termination" title="12. Termination">
            <p>
              Either party may terminate these Terms at any time. You may terminate by deleting your
              account. HireIQ may terminate for breach of these Terms, non-payment, or if required
              by law.
            </p>
            <p>
              Upon termination: (a) your right to access the Service immediately ceases; (b) we will
              retain your data for 90 days in case of accidental deletion, then permanently delete it
              unless required by law to retain it longer; (c) any accrued obligations survive
              termination.
            </p>
          </Section>

          <Section id="governing-law" title="13. Governing Law and Disputes">
            <p>
              These Terms are governed by the laws of England and Wales. Any dispute arising out of
              or in connection with these Terms shall be subject to the exclusive jurisdiction of
              the courts of England and Wales, except where mandatory consumer protection laws in
              your jurisdiction provide otherwise.
            </p>
            <p>
              Before commencing legal proceedings, both parties agree to attempt good-faith
              resolution by contacting us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-400 hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section id="general" title="14. General Provisions">
            <ul className="space-y-1">
              <Li>
                <strong className="text-white">Entire Agreement:</strong> These Terms, together with
                our Privacy Policy, constitute the entire agreement between you and HireIQ regarding
                the Service and supersede all prior agreements.
              </Li>
              <Li>
                <strong className="text-white">Severability:</strong> If any provision is found
                unenforceable, the remaining provisions continue in full force.
              </Li>
              <Li>
                <strong className="text-white">Waiver:</strong> Failure to enforce any right under
                these Terms is not a waiver of that right.
              </Li>
              <Li>
                <strong className="text-white">Assignment:</strong> You may not assign your rights
                or obligations under these Terms without our prior written consent. HireIQ may
                assign these Terms in connection with a merger, acquisition, or sale of assets.
              </Li>
              <Li>
                <strong className="text-white">Changes:</strong> We may update these Terms from time
                to time. Material changes will be notified by email 30 days in advance. Continued
                use after the effective date constitutes acceptance.
              </Li>
            </ul>
          </Section>

          <Section id="contact" title="15. Contact">
            <p>
              For legal enquiries or questions about these Terms:
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
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        </div>
      </main>
    </div>
  );
}
