import type { Theme } from '@/types/database';

export const THEMES: { id: Theme; label: string; desc: string; accent: string }[] = [
  { id: 'cockpit', label: 'Cockpit', desc: 'Amber instruments on dark panel', accent: '#f5a623' },
  { id: 'glass', label: 'Glass Cockpit', desc: 'Cool blue modern avionics', accent: '#3B82F6' },
  { id: 'sectional', label: 'Sectional', desc: 'Warm VFR chart tones', accent: '#9A4409' },
  { id: 'briefing', label: 'Briefing', desc: 'Cool pre-flight readout', accent: '#1A56A0' },
];

export function setTheme(theme: Theme): void {
  if (theme === 'cockpit') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // localStorage unavailable
  }
}

export function getTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr && ['cockpit', 'glass', 'sectional', 'briefing'].includes(attr)) {
    return attr as Theme;
  }
  try {
    const stored = localStorage.getItem('theme');
    if (stored && ['cockpit', 'glass', 'sectional', 'briefing'].includes(stored)) {
      return stored as Theme;
    }
  } catch {
    // localStorage unavailable
  }
  return 'cockpit';
}
