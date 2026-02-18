import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Get Started Free — HeyDPE",
  alternates: { canonical: 'https://heydpe.com/signup' },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
