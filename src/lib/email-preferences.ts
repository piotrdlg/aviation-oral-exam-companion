import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailCategory, EmailPreference } from '@/types/database';
import { REQUIRED_EMAIL_CATEGORIES } from '@/types/database';

/**
 * Default enabled state for each email category when no preference row exists.
 */
const CATEGORY_DEFAULTS: Record<EmailCategory, boolean> = {
  account_security: true,
  billing_transactional: true,
  support_transactional: true,
  learning_digest: true,
  motivation_nudges: true,
  product_updates: true,
  marketing: false,
};

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  account_security: 'Account & Security',
  billing_transactional: 'Billing & Payments',
  support_transactional: 'Support Tickets',
  learning_digest: 'Daily Learning Digest',
  motivation_nudges: 'Practice Reminders',
  product_updates: 'Product Updates',
  marketing: 'Marketing & Promotions',
};

export const EMAIL_CATEGORY_DESCRIPTIONS: Record<EmailCategory, string> = {
  account_security: 'Password resets, email verification, login alerts',
  billing_transactional: 'Subscription confirmations, payment receipts, trial reminders',
  support_transactional: 'Ticket confirmations and replies',
  learning_digest: 'Morning summary of weak areas and study recommendations',
  motivation_nudges: 'Friendly reminders when you haven\'t practiced recently',
  product_updates: 'New features, improvements, and tips',
  marketing: 'Special offers and promotions',
};

/**
 * Get all email preferences for a user.
 * Returns a full set (all categories) with defaults applied for missing rows.
 */
export async function getUserEmailPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<EmailCategory, boolean>> {
  const { data, error } = await supabase
    .from('email_preferences')
    .select('category, enabled')
    .eq('user_id', userId);

  if (error) {
    console.error('[email-preferences] Failed to fetch preferences:', error);
    // Return defaults on error
    return { ...CATEGORY_DEFAULTS };
  }

  const result = { ...CATEGORY_DEFAULTS };
  for (const row of (data || []) as Pick<EmailPreference, 'category' | 'enabled'>[]) {
    result[row.category] = row.enabled;
  }

  // Required categories are always enabled regardless of user preference
  for (const cat of REQUIRED_EMAIL_CATEGORIES) {
    result[cat] = true;
  }

  return result;
}

/**
 * Check if a specific email category is enabled for a user.
 * Required categories always return true.
 */
export async function isEmailCategoryEnabled(
  supabase: SupabaseClient,
  userId: string,
  category: EmailCategory,
): Promise<boolean> {
  if (REQUIRED_EMAIL_CATEGORIES.includes(category)) {
    return true;
  }

  const { data, error } = await supabase
    .from('email_preferences')
    .select('enabled')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();

  if (error) {
    console.error('[email-preferences] Failed to check category:', error);
    return CATEGORY_DEFAULTS[category];
  }

  return data ? data.enabled : CATEGORY_DEFAULTS[category];
}

/**
 * Update a single email preference for a user.
 * Required categories cannot be disabled.
 */
export async function updateEmailPreference(
  supabase: SupabaseClient,
  userId: string,
  category: EmailCategory,
  enabled: boolean,
  source: 'user_settings' | 'unsubscribe_link' | 'admin' = 'user_settings',
): Promise<{ success: boolean; error?: string }> {
  // Prevent disabling required categories
  if (!enabled && REQUIRED_EMAIL_CATEGORIES.includes(category)) {
    return { success: false, error: `Cannot disable required category: ${category}` };
  }

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      {
        user_id: userId,
        category,
        enabled,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category' },
    );

  if (error) {
    console.error('[email-preferences] Failed to update preference:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Initialize default preferences for a user (idempotent).
 * Called on first visit to preference page or on signup.
 */
export async function initializeUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('init_email_preferences', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[email-preferences] Failed to initialize preferences:', error);
  }
}
