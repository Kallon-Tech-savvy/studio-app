// A small, genuinely-3D illustration for the "still processing" (draft)
// lock state — four frames of a loosely coiled film strip, grading from
// flat grey (undeveloped) to brass (developed) as they fan toward the
// foreground. The point is to say "this is in progress" rather than
// "broken" or "locked", without using either word.
//
// Same technique as the admin app's PhotoStack3D — plain CSS
// (perspective + preserve-3d + rotateX/Y/Z), no image asset and no 3D
// engine — but in this app's own near-black/brass palette rather than
// admin's warm cream tones, since the two surfaces are deliberately
// different registers of the same product. It sits still for anyone
// with prefers-reduced-motion on (see client-gallery.css).
export function UndevelopedRoll() {
  return (
    <div className="pg-roll-3d" aria-hidden="true">
      <div className="pg-roll-3d__scene">
        <span className="pg-roll-3d__frame pg-roll-3d__frame--1" />
        <span className="pg-roll-3d__frame pg-roll-3d__frame--2" />
        <span className="pg-roll-3d__frame pg-roll-3d__frame--3" />
        <span className="pg-roll-3d__frame pg-roll-3d__frame--4" />
      </div>
    </div>
  )
}