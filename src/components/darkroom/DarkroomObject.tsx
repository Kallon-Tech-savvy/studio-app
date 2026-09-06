/**
 * DarkroomObject - Low-level 3D primitive using CSS perspective/transforms
 *
 * This is the foundation for all darkroom visual elements. It handles only:
 * - 3D perspective setup
 * - Tilting/rotation transforms
 * - Semantic depth styling
 *
 * It does NOT handle:
 * - Application state (galleries, uploads, sessions, API)
 * - Animation state (prefers-reduced-motion is handled by consumers)
 * - Content generation (children render the actual geometry)
 *
 * This separation ensures:
 * - HMR stability (changing geometry doesn't remount parent state)
 * - Reusability (same primitive works for all darkroom objects)
 * - Performance (CSS transforms, no JS animation loops)
 */

interface TiltAngles {
  x?: number // rotateX in degrees
  y?: number // rotateY in degrees
  z?: number // rotateZ in degrees
}

interface DarkroomObjectProps {
  children: React.ReactNode
  /**
   * CSS class for styling. Use darkroom-* prefix by convention.
   * Selector applies to the outer .darkroom-object container.
   */
  className?: string
  /**
   * Z-axis perspective depth in pixels. Controls how pronounced
   * the 3D effect feels. Smaller = more extreme perspective.
   */
  depth?: number
  /**
   * 3D rotation angles. Applied in order: rotateX, rotateY, rotateZ.
   */
  tilt?: TiltAngles
  /**
   * Additional inline styles (applied to container, after CSS).
   * Use sparingly — prefer CSS classes.
   */
  style?: React.CSSProperties
}

/**
 * Renders a 3D container with perspective and optional tilt.
 * Children are rendered with preserve-3d so nested transforms work correctly.
 */
export function DarkroomObject({
  children,
  className = '',
  depth = 1000,
  tilt = {},
  style = {},
}: DarkroomObjectProps) {
  const { x = 0, y = 0, z = 0 } = tilt

  const transform = [
    `perspective(${depth}px)`,
    x !== 0 && `rotateX(${x}deg)`,
    y !== 0 && `rotateY(${y}deg)`,
    z !== 0 && `rotateZ(${z}deg)`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`darkroom-object ${className}`.trim()}
      style={{
        perspective: `${depth}px`,
        ...style,
      }}
    >
      <div
        className="darkroom-object__inner"
        style={{
          transform,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </div>
    </div>
  )
}
