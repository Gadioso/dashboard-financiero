type VirafiBrandProps = {
  className?: string;
  compact?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
  tagline?: string;
  ariaLabel?: string;
};

export function VirafiMark({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 52 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 36.5 20.8 9.2c1.7-3.4 6.6-3.3 8.1.2l9.9 23.8c1.5 3.7 6.5 4.5 9.1 1.4"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VirafiBrand({
  className = '',
  compact = false,
  inverse = false,
  showTagline = false,
  tagline = 'Tu CFO personal, todos los días.',
  ariaLabel = 'Virafi, tu dinero con claridad y rumbo',
}: VirafiBrandProps) {
  const ink = inverse ? 'text-[var(--brand-cream)]' : 'text-[var(--brand-ink)]';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Virafi">
        <VirafiMark className={`size-8 ${inverse ? 'text-[var(--brand-cream)]' : 'text-[var(--brand-violet)]'}`} />
        <span className={`font-brand text-[1.55rem] font-medium italic leading-none ${ink}`}>Virafi</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col ${className}`} aria-label={ariaLabel}>
      <span className="inline-flex items-center gap-3">
        <VirafiMark className={`size-10 ${inverse ? 'text-[var(--brand-cream)]' : 'text-[var(--brand-violet)]'}`} />
        <span className={`font-brand text-[2rem] font-medium italic leading-none ${ink}`}>Virafi</span>
      </span>
      {showTagline && (
        <span className={`mt-2 font-brand text-sm italic ${inverse ? 'text-white/65' : 'text-[var(--brand-muted)]'}`}>
          {tagline}
        </span>
      )}
    </span>
  );
}
