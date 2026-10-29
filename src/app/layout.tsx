import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Fx from "@/components/fx/Fx";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif used sparingly for display moments (hero, big numbers' captions).
const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quibillix — AI-Powered Bill Verification & Dispute Agent",
  description:
    "Find overcharges in medical, hospital, telecom and utility bills and get a ready-to-send dispute letter. Powered by NVIDIA Nemotron on Nebius Token Factory.",
};

export const viewport: Viewport = { themeColor: "#080C18", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Fx />
        {children}
      </body>
    </html>
  );
}
