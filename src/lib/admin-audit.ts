/**
 * Admin audit logging utility.
 *
 * logAdminAction lives in admin-guard.ts alongside the auth helpers.
 * This module re-exports it so callers can import from either location,
 * and adds any future audit-specific helpers.
 */
export { logAdminAction } from './admin-guard';
