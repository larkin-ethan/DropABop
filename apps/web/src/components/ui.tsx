// Basic building blocks in the mockup's style: Card, Button, Avatar, AlbumArt, ProgressBar, Logo.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`card-glow rounded-[var(--radius-card)] border border-line bg-surface p-5 ${className}`}
    >
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-ink hover:brightness-110',
  secondary: 'border border-blue/60 text-blue hover:bg-blue/10',
  ghost: 'text-muted hover:text-ink hover:bg-surface-raised',
};

/** Button look for things that aren't <button>s, e.g. a router <Link> that should look like a button. */
export function buttonClassName(variant: ButtonVariant = 'primary', extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${BUTTON_STYLES[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type="button" className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}

/** Initials avatar with the user's color (D18). */
export function Avatar({
  name,
  color,
  image,
  size = 'md',
}: {
  name: string;
  color: string;
  /** Profile picture (a small data URL); falls back to initials on the colour. */
  image?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-12 text-base' };
  if (image) {
    return (
      <img
        src={image}
        alt=""
        title={name}
        className={`shrink-0 rounded-full object-cover ring-2 ring-bg ${sizes[size]}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-bg ${sizes[size]}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </span>
  );
}

/**
 * Album artwork. Shows the image when there is one, otherwise a gradient tile with a note,
 * so the layout never jumps or shows a broken image.
 */
export function AlbumArt({
  url,
  hue = 200,
  size = 'md',
}: {
  url?: string | null;
  hue?: number;
  size?: 'md' | 'lg';
}) {
  const sizes = { md: 'size-14', lg: 'size-20' };
  if (url) {
    return (
      <img src={url} alt="" className={`${sizes[size]} shrink-0 rounded-lg object-cover`} loading="lazy" />
    );
  }
  return (
    <span
      className={`${sizes[size]} inline-flex shrink-0 items-center justify-center rounded-lg text-white/80`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 45%), hsl(${(hue + 70) % 360} 75% 35%))` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
        <path d="M9 18V6l11-2v12a3 3 0 1 1-2-2.8V7.3l-7 1.3V18a3 3 0 1 1-2-2.8" />
      </svg>
    </span>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-raised"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue to-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The brand mark (the note from the Drop a Bop app icon, public/logo-mark.png) with the name beside it. "Bop" uses
 * the icon's cyan-to-magenta gradient. `compact` shows only the mark.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo-mark.png" alt={compact ? 'Drop a Bop' : ''} className="size-10 shrink-0 rounded-xl" />
      {!compact && (
        <span className="text-lg font-extrabold tracking-tight">
          Drop a{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            Bop
          </span>
        </span>
      )}
    </div>
  );
}

/** The full app icon with the name, for big spots (welcome page, sign-in). */
export function BigLogo({ className = 'w-44' }: { className?: string }) {
  return <img src="/logo.webp" alt="Drop a Bop" className={`mx-auto drop-shadow-2xl ${className}`} />;
}
