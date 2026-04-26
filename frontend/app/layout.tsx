import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: {
    default: "HireIQ — AI-Powered Hiring",
    template: "%s | HireIQ",
  },
  description:
    "HireIQ interviews every candidate with adaptive AI and delivers ranked, scored reports to your team. You only meet the people worth your time.",
  keywords: ["AI hiring", "recruitment AI", "candidate screening", "interview automation"],
  openGraph: {
    title: "HireIQ — AI-Powered Hiring",
    description: "Intelligent AI interviews. Ranked candidates. Faster hiring.",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
