import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { JetBrains_Mono, IBM_Plex_Sans } from "next/font/google";
import { GoogleTagManager } from '@next/third-parties/google';
import JsonLd from '@/components/JsonLd';
import PostHogProvider from '@/components/PostHogProvider';
import { CookieConsent } from '@/components/CookieConsent';
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://heydpe.com'),
  title: {
    default: "HeyDPE — AI Checkride Oral Exam Simulator",
    template: "%s | HeyDPE",
  },
  description: "Practice your FAA checkride oral exam with an AI examiner that actually listens. Voice-first, ACS-scored, PPL + CPL + IR. Free trial — no credit card.",
  openGraph: {
    title: "HeyDPE — Your DPE Is Ready When You Are",
    description: "The only checkride oral exam simulator with real-time voice. Speak your answers, get scored on every ACS element. Try 3 sessions free.",
    siteName: "HeyDPE",
    type: "website",
    locale: "en_US",
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'HeyDPE — AI Checkride Oral Exam Simulator' }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HeyDPE — Your DPE Is Ready When You Are",
    description: "Practice your checkride oral with an AI examiner who listens. Voice-first. ACS-scored. Free trial.",
    images: ['/og-image.png'],
  },
  keywords: ["checkride oral exam", "DPE practice", "checkride prep", "oral exam simulator", "FAA checkride", "private pilot oral", "instrument oral", "commercial pilot oral", "ACS practice", "mock oral exam", "checkride anxiety", "AI examiner"],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large' as const, 'max-snippet': -1 },
  },
  alternates: { canonical: 'https://heydpe.com' },
  verification: {
    google: 'Ou3CWjTH5f5r4r3OJZJEVQjCqBszKJuc_alUAIPimGM',
    other: {
      'msvalidate.01': 'CA4EEA33C3B3E7E6054CCC931D85F87A',
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value || 'cockpit';
  const dataTheme = theme === 'cockpit' ? undefined : theme;

  return (
    <html lang="en" className="dark" {...(dataTheme ? { 'data-theme': dataTheme } : {})}>
      <GoogleTagManager gtmId="GTM-WZ5DFFK6" />
      <body
        className={`${jetbrainsMono.variable} ${ibmPlexSans.variable} antialiased scanline bg-c-bg text-c-text`}
      >
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "HeyDPE",
          "legalName": "Imagine Flying LLC",
          "url": "https://heydpe.com",
          "description": "Voice-first AI checkride oral exam simulator",
          "email": "pd@imagineflying.com",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Jacksonville",
            "addressRegion": "FL",
            "addressCountry": "US"
          }
        }} />
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
