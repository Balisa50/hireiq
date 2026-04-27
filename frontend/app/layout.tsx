import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: {
    default: "HireIQ",
    template: "%s | HireIQ",
  },
  description:
    "Every candidate gets a smart AI application. You get a ranked shortlist. You only meet the people worth your time.",
  keywords: ["AI hiring", "recruitment", "candidate screening", "smart application"],
  openGraph: {
    title: "HireIQ",
    description: "Smart applications. Ranked candidates. Faster hiring.",
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
