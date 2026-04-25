import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: {
    default: "HireIQ — AI-Powered Hiring Platform",
    template: "%s | HireIQ",
  },
  description:
    "HireIQ conducts intelligent AI interviews with every candidate and delivers ranked, scored summaries to your hiring team. Stop reading applications — start hiring people.",
  keywords: ["AI hiring", "recruitment AI", "candidate screening", "interview automation"],
  openGraph: {
    title: "HireIQ — AI-Powered Hiring Platform",
    description:
      "Intelligent AI interviews. Ranked candidates. Faster hiring.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
