/**
 * ApertureMark - A camera aperture blade visualization
 *
 * Renders overlapping aperture blades (petals) that suggest mechanical focus.
 * Used for visual hierarchy, loading states, or as a decorative glyph.
 *
 * Pure CSS geometry, no animation by default.
 */

interface ApertureMarkProps {
  /**
   * Number of aperture blades to render (typically 6-12).
   * @default 8
   */
  blades?: number
  /**
   * Optional CSS classes (prefixed darkroom- by convention).
   */
  className?: string
  /**
   * Aperture diameter in pixels.
   * @default 48
   */
  diameter?: number
  /**
   * Optional aria-label for screenreaders.
   */
  ariaLabel?: string
}

export function ApertureMark({
  blades = 8,
  className = '',
  diameter = 48,
  ariaLabel,
}: ApertureMarkProps) {
  return (
    <div
      className={`darkroom-aperture ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      style={{
        '--darkroom-aperture-diameter': `${diameter}px`,
        '--darkroom-aperture-blades': blades,
      } as React.CSSProperties}
    >
      {Array.from({ length: blades }).map((_, i) => (
        <div
          key={i}
          className="darkroom-aperture__blade"
          style={{
            '--darkroom-blade-index': i,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
