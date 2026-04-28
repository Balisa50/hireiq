"use client";

import React, { useState } from "react";
import { ExternalLink, Check } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  logoChar: string;
  logoColor: string;
  comingSoon: boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Get notified in your Slack channels when candidates apply or complete interviews.",
    category: "Notifications",
    logoChar: "S",
    logoColor: "#4A154B",
    comingSoon: true,
  },
  {
    id: "google_workspace",
    name: "Google Workspace",
    description: "Sync candidate reports to Google Drive and schedule follow-up calls in Google Calendar.",
    category: "Productivity",
    logoChar: "G",
    logoColor: "#4285F4",
    comingSoon: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Post hiring updates and candidate summaries directly to your Teams channels.",
    category: "Notifications",
    logoChar: "T",
    logoColor: "#6264A7",
    comingSoon: true,
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect HireIQ to 6,000+ apps. Trigger workflows on new applications or status changes.",
    category: "Automation",
    logoChar: "Z",
    logoColor: "#FF4A00",
    comingSoon: true,
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    description: "Push scored candidates and reports directly into your Greenhouse ATS pipeline.",
    category: "ATS",
    logoChar: "G",
    logoColor: "#1B8242",
    comingSoon: true,
  },
  {
    id: "lever",
    name: "Lever",
    description: "Sync HireIQ interview results to Lever opportunities and advance candidates automatically.",
    category: "ATS",
    logoChar: "L",
    logoColor: "#00B0F0",
    comingSoon: true,
  },
];

const CATEGORY_ORDER = ["Notifications", "Productivity", "Automation", "ATS"];

function IntegrationCard({ integration }: { integration: Integration }) {
  const [notified, setNotified] = useState(false);

  const handleNotify = () => {
    const subject = encodeURIComponent(`Interested in HireIQ ${integration.name} integration`);
    const body = encodeURIComponent(
      `Hi HireIQ team,\n\nI'm interested in the ${integration.name} integration. Please notify me when it's available.\n\nThank you.`
    );
    window.open(`mailto:support@hireiq.app?subject=${subject}&body=${body}`);
    setNotified(true);
  };

  return (
    <div className="bg-white border border-border rounded-[4px] p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-[4px] flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: integration.logoColor }}
        >
          {integration.logoChar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-ink">{integration.name}</h3>
            <span className="text-[10px] font-semibold text-muted bg-[var(--bg)] border border-border px-1.5 py-0.5 rounded-[2px] uppercase tracking-wider">
              Coming soon
            </span>
          </div>
          <p className="text-[12px] text-muted mt-0.5">{integration.category}</p>
        </div>
      </div>
      <p className="text-[13px] text-sub leading-relaxed flex-1">{integration.description}</p>
      <button
        onClick={handleNotify}
        className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-[4px] text-sm font-medium transition-all border ${
          notified
            ? "border-success/30 bg-green-50 text-success"
            : "border-border bg-[var(--bg)] text-sub hover:text-ink hover:border-ink"
        }`}
      >
        {notified ? (
          <><Check className="w-3.5 h-3.5" /> Notified</>
        ) : (
          "Notify me when available"
        )}
      </button>
    </div>
  );
}

export default function IntegrationsPage() {
  const grouped = CATEGORY_ORDER.reduce<Record<string, Integration[]>>((acc, cat) => {
    acc[cat] = INTEGRATIONS.filter((i) => i.category === cat);
    return acc;
  }, {});

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Integrations</h1>
        <p className="text-sub text-sm mt-1">Connect HireIQ with your existing tools and workflows.</p>
      </div>

      <div className="rounded-[4px] bg-[var(--bg)] border border-border px-5 py-4">
        <p className="text-sm text-sub leading-relaxed">
          Integrations are under active development. Click{" "}
          <span className="font-medium text-ink">"Notify me"</span> on any integration to receive an email
          when it launches.{" "}
          <a
            href="mailto:support@hireiq.app?subject=Integration request"
            className="underline hover:text-ink transition-colors"
          >
            Request an integration →
          </a>
        </p>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category];
        if (!items?.length) return null;
        return (
          <div key={category} className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{category}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((integration) => (
                <IntegrationCard key={integration.id} integration={integration} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
