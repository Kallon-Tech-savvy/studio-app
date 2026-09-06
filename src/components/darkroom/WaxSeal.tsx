/**
 * WaxSeal - A decorative seal impression (wax or embossed effect)
 *
 * Used for authentication, validation, or archival-style emphasis.
 * Rendered with concentric circles and subtle shadow depth.
 *
 * Purely presentational — no state, no logic.
 */

interface WaxSealProps {
  /**
   * Optional CSS classes (prefixed darkroom- by convention).
   */
  className?: string
  /**
   * Seal diameter in pixels (applied via CSS variable).
   * Can be overridden by CSS classes.
   * @default 64
   */
  diameter?: number
  /**
   * Optional aria-label for screenreaders.
   */
  ariaLabel?: string
}

export function WaxSeal({ className = '', diameter = 64, ariaLabel }: WaxSealProps) {
  return (
    <div
      className={`darkroom-wax-seal ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      style={{
        '--darkroom-seal-diameter': `${diameter}px`,
      } as React.CSSProperties}
    >
      <div className="darkroom-wax-seal__outer" />
      <div className="darkroom-wax-seal__middle" />
      <div className="darkroom-wax-seal__inner" />
    </div>
  )
}
