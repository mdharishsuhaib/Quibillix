import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// One grotesk for the whole product (UI UX Pro Max fintech pairing); the mono is only for
// IDs, billing codes and the printed bill itself.
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono", // taste-skill-ignore: IDs, codes and the printed bill only
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quibillix: Bill Verification & Dispute Agent",
  description:
    "Every charge questioned. Every dispute supported. Quibillix finds overcharges in medical, hospital, telecom and utility bills and drafts a ready-to-send dispute letter. Powered by NVIDIA Nemotron on Nebius Token Factory.",
};

export const viewport: Viewport = { themeColor: "#E9ECE4", colorScheme: "light dark" };

// Light is the default on every new visit. If the user picked dark earlier in this tab session,
// apply it before first paint (no flash on reload). The old permanent setting is cleared.
const THEME_BOOT = `try{localStorage.removeItem("quibillix-theme");if(sessionStorage.getItem("quibillix-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
