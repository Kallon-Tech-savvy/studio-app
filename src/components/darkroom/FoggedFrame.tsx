/**
 * FoggedFrame - A single fogged film frame illustration
 *
 * Used to communicate error or loading states where clarity isn't available.
 * Rendered as a static, centered frame with light diffusion effect.
 * No animation or state — purely presentational.
 */

interface FoggedFrameProps {
  /**
   * Additional CSS classes (prefixed darkroom- by convention).
   * Applied to the container.
   */
  className?: string
  /**
   * Optional aria-label for screenreaders (e.g., "Gallery loading").
   * Default is "Loading".
   */
  ariaLabel?: string
}

export function FoggedFrame({ className = '', ariaLabel = 'Loading' }: FoggedFrameProps) {
  return (
    <div className={`darkroom-fogged-frame ${className}`.trim()} role="status" aria-label={ariaLabel}>
      <div className="darkroom-fogged-frame__glass">
        <div className="darkroom-fogged-frame__diffusion" />
      </div>
    </div>
  )
}
