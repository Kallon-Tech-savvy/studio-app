/**
 * EmptySleeve - Visual metaphor for an empty album or gallery
 *
 * Renders a flat film sleeve (protective sleeve for negatives) with
 * subtle shading to indicate emptiness. Used when an album or gallery
 * contains no photos yet.
 *
 * No animation, no state, no API knowledge.
 */

interface EmptySleeveProps {
  /**
   * Optional CSS classes (prefixed darkroom- by convention).
   */
  className?: string
  /**
   * Optional aria-label for screenreaders.
   */
  ariaLabel?: string
}

export function EmptySleeve({ className = '', ariaLabel = 'Empty' }: EmptySleeveProps) {
  return (
    <div className={`darkroom-empty-sleeve ${className}`.trim()} role="img" aria-label={ariaLabel}>
      <div className="darkroom-empty-sleeve__pouch">
        <div className="darkroom-empty-sleeve__fold" />
      </div>
    </div>
  )
}
