/**
 * Darkroom — A suite of 3D visual primitives for the photography studio UI
 *
 * This module exports low-level, stateless, performant 3D components using pure CSS.
 * Each component:
 * - Has zero application state dependency (no galleries, uploads, sessions, etc.)
 * - Uses CSS transforms instead of animation libraries or canvas
 * - Supports prefers-reduced-motion via CSS
 * - Is HMR-stable (editing geometry doesn't remount parent state)
 * - Is rendered as a standalone presentational object
 *
 * Architecture principles:
 * 1. Separation of concerns: visual primitives don't know about business logic
 * 2. Performance: CSS over JS, semantic depth, will-change hints
 * 3. Developer experience: instant visual feedback via Vite HMR
 * 4. Accessibility: role/aria-label support, WCAG 2.1 Level AA
 *
 * Typical usage:
 *
 *   import { UndevelopedRoll, FoggedFrame, DarkroomObject } from '@/components/darkroom'
 *
 *   // Simple usage - just render the object
 *   <UndevelopedRoll />
 *
 *   // With styling
 *   <UndevelopedRoll className="my-custom-size" />
 *
 *   // Using the low-level primitive for custom geometry
 *   <DarkroomObject className="darkroom-custom" depth={800} tilt={{ x: 15, y: -10 }}>
 *     <CustomGeometry />
 *   </DarkroomObject>
 */

export { DarkroomObject } from './DarkroomObject'
export { FoggedFrame } from './FoggedFrame'
export { UndevelopedRoll } from './UndevelopedRoll'
export { EmptySleeve } from './EmptySleeve'
export { WaxSeal } from './WaxSeal'
export { ApertureMark } from './ApertureMark'

export type { DarkroomObjectState, DarkroomObjectSize, DarkroomObjectType, DarkroomCommonProps } from './types'
