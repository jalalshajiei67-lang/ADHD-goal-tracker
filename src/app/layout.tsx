import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PriorityPulse",
  description: "One goal at a time. It checks in, so you don't have to remember.",
  appleWebApp: { capable: true, title: "PriorityPulse", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#14161a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: extensions like Dark Reader add attributes to <html> before React loads.
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
          {children}
        </main>
        <ServiceWorker />
      </body>
    </html>
  );
}
