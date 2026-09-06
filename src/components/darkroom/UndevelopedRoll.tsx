/**
 * UndevelopedRoll - A 3D film roll illustration for in-progress state
 *
 * Shows four frames of loosely coiled film, grading from undeveloped (grey)
 * to developed (brass) as they fan toward foreground. Communicates "processing"
 * without using words, in the client gallery's near-black/brass palette.
 *
 * Uses pure CSS (perspective + preserve-3d + rotateX/Y/Z), no image assets.
 * For prefers-reduced-motion users, animation halts via CSS rule.
 *
 * Identical behavior to previous Undevelopedroll.tsx but restructured
 * for architectural cleanliness: moved into darkroom/ namespace,
 * decoupled from page-specific context, and prepared for HMR stability.
 */

interface UndevelopedRollProps {
  /**
   * Optional CSS classes (prefixed darkroom- by convention).
   * Applied to the .darkroom-roll container.
   */
  className?: string
  /**
   * Optional aria-label for screenreaders (e.g., "Gallery is processing").
   * Default is "Processing".
   */
  ariaLabel?: string
}

export function UndevelopedRoll({ className = '', ariaLabel = 'Processing' }: UndevelopedRollProps) {
  return (
    <div className={`darkroom-roll ${className}`.trim()} aria-hidden="true" role="img" aria-label={ariaLabel}>
      <div className="darkroom-roll__scene">
        <span className="darkroom-roll__frame darkroom-roll__frame--1" />
        <span className="darkroom-roll__frame darkroom-roll__frame--2" />
        <span className="darkroom-roll__frame darkroom-roll__frame--3" />
        <span className="darkroom-roll__frame darkroom-roll__frame--4" />
      </div>
    </div>
  )
}
