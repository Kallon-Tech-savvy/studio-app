/**
 * Semantic state types for darkroom objects
 * These represent the states objects can be in without tying them to page-specific logic
 */

/**
 * Discrete state indicating what a darkroom object is communicating
 */
export type DarkroomObjectState =
  | 'loading' // Processing/waiting state
  | 'error' // Something went wrong
  | 'empty' // No content available
  | 'locked' // Requires authentication/payment
  | 'ready' // Normal, interactive state
  | 'success' // Positive completion
  | 'disabled' // Not available

/**
 * Rough size guidance for rendering objects at appropriate scales
 */
export type DarkroomObjectSize = 'small' | 'medium' | 'large'

/**
 * Contextual type hints for what type of object this is.
 * Used for semantic CSS class generation and accessibility labels.
 */
export type DarkroomObjectType =
  | 'frame' // Single film frame
  | 'roll' // Film roll (multiple frames)
  | 'sleeve' // Protective sleeve
  | 'seal' // Wax seal or stamp
  | 'aperture' // Lens aperture

/**
 * Props common to all darkroom visual primitives
 */
export interface DarkroomCommonProps {
  className?: string
  ariaLabel?: string
}
