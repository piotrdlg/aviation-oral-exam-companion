import Link from 'next/link';

/**
 * HeyDPE brand identity — FLIGHT DECK (W6B.3 P2).
 *
 * BrandMark: an attitude-indicator (artificial horizon) monogram — the single
 * most iconic checkride instrument. Cyan sky over amber earth, banked a few
 * degrees so it reads as a live instrument, with the amber aircraft-reference
 * "wings" locked at center. Built from the design tokens so it adapts to every
 * theme, and legible down to 16px.
 */
export function BrandMark({
  size = 22,
  className = '',
  title = 'HeyDPE',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id="adi-face">
          <circle cx="16" cy="16" r="12" />
        </clipPath>
        <linearGradient id="adi-sky" x1="16" y1="2" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-c-cyan)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--color-c-cyan-dim)" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="adi-earth" x1="16" y1="16" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-c-amber)" stopOpacity="0.92" />
          <stop offset="1" stopColor="var(--color-c-amber-dim)" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      {/* instrument face, banked ~8° */}
      <g clipPath="url(#adi-face)">
        <g transform="rotate(-8 16 16)">
          <rect x="-6" y="-6" width="44" height="22.5" fill="url(#adi-sky)" />
          <rect x="-6" y="16.5" width="44" height="44" fill="url(#adi-earth)" />
          {/* horizon line */}
          <rect x="-6" y="15.6" width="44" height="0.9" fill="var(--color-c-bg)" opacity="0.55" />
          {/* pitch ladder ticks */}
          <rect x="11.5" y="10.5" width="9" height="0.7" fill="#fff" opacity="0.35" />
          <rect x="13" y="21" width="6" height="0.7" fill="var(--color-c-bg)" opacity="0.3" />
        </g>
      </g>

      {/* bezel ring */}
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--color-c-border-hi)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="13.4" fill="none" stroke="var(--color-c-bg)" strokeWidth="1.4" opacity="0.7" />

      {/* aircraft-reference wings (fixed, level) — dark backing so the amber
          stays crisp over both the cyan sky and the amber earth */}
      <g stroke="var(--color-c-bg)" strokeWidth="3.4" strokeLinecap="round" opacity="0.85">
        <line x1="7.5" y1="16" x2="12.5" y2="16" />
        <line x1="19.5" y1="16" x2="24.5" y2="16" />
      </g>
      <g stroke="var(--color-c-amber)" strokeWidth="1.9" strokeLinecap="round">
        <line x1="7.5" y1="16" x2="12.5" y2="16" />
        <line x1="19.5" y1="16" x2="24.5" y2="16" />
      </g>
      <circle cx="16" cy="16" r="2.1" fill="var(--color-c-bg)" opacity="0.85" />
      <circle cx="16" cy="16" r="1.35" fill="var(--color-c-amber)" />
      {/* bank pointer */}
      <path d="M16 3.0 L14.3 6.1 L17.7 6.1 Z" fill="var(--color-c-amber)" stroke="var(--color-c-bg)" strokeWidth="0.5" />
    </svg>
  );
}

type LogoSize = 'sm' | 'md' | 'lg';

const SIZES: Record<LogoSize, { mark: number; text: string; gap: string }> = {
  sm: { mark: 18, text: 'text-sm', gap: 'gap-2' },
  md: { mark: 22, text: 'text-base', gap: 'gap-2.5' },
  lg: { mark: 38, text: 'text-2xl', gap: 'gap-3' },
};

/**
 * Logo: BrandMark + the two-tone "HeyDPE" wordmark ("Hey" in reading ink,
 * "DPE" in command amber — the conversational front, the instrument back).
 * Wraps in a link to `href` unless `href={null}`.
 */
export function Logo({
  size = 'md',
  href = '/',
  glow = false,
  className = '',
}: {
  size?: LogoSize;
  href?: string | null;
  glow?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const inner = (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <BrandMark size={s.mark} />
      <span className={`font-mono font-bold tracking-tight ${s.text} leading-none`}>
        <span className="text-c-text">Hey</span>
        <span className={`text-c-amber ${glow ? 'glow-a' : ''}`}>DPE</span>
      </span>
    </span>
  );
  if (href === null) return inner;
  return (
    <Link href={href} aria-label="HeyDPE home" className="inline-flex items-center rounded-md">
      {inner}
    </Link>
  );
}

export default Logo;
