import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { JetBrains_Mono, IBM_Plex_Sans } from "next/font/google";
import { GoogleTagManager } from '@next/third-parties/google';
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
  title: "HeyDPE — AI Checkride Oral Exam Simulator",
  description: "Practice your FAA checkride oral exam with an AI examiner that follows ACS standards. Supports Private Pilot, Commercial Pilot, and Instrument Rating.",
  verification: {
    google: 'Ou3CWjTH5f5r4r3OJZJEVQjCqBszKJuc_alUAIPimGM',
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
        {children}
      </body>
    </html>
  );
}
