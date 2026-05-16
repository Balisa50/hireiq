import type { Metadata } from "next";
import "./globals.css";
import ConditionalAuthProvider from "@/components/ConditionalAuthProvider";
import { Toaster } from "react-hot-toast";

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
        <ConditionalAuthProvider>{children}</ConditionalAuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "#0f172a", color: "#f1f5f9", border: "1px solid #1e293b" },
            success: { iconTheme: { primary: "#10b981", secondary: "#0f172a" } },
            error: { iconTheme: { primary: "#f43f5e", secondary: "#0f172a" } },
          }}
        />
      </body>
    </html>
  );
}
