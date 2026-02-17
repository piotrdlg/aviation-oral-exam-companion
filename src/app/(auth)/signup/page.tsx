import { redirect } from 'next/navigation';

/**
 * Legacy signup page — redirects to unified /login.
 * All auth (OAuth + email OTP) is handled on the login page.
 * Accounts are auto-created on first sign-in.
 */
export default function SignupPage() {
  redirect('/login');
}
