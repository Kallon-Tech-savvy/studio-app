// A small, genuinely-3D decorative visual for empty/entrance states.
//
// This is plain CSS (perspective + preserve-3d + rotateX/Y/Z), not an
// image or a 3D-engine scene — there's no client photography to show on
// a fresh install, and pulling in a model/engine for a photo-delivery
// app (which already ships large real photos) would cost far more than
// it's worth. A few warm, tilted "print" cards floating in real depth
// read as intentional and on-brand for a darkroom/film app without any
// added weight. It sits still for anyone with prefers-reduced-motion on
// (see the global override in index.css).
//
// `size` scales the whole scene down for tighter spots (e.g. an inline
// empty-state row) vs. the full entrance hero.
export function PhotoStack3D({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return (
    <div className={`photo-stack-3d photo-stack-3d--${size}`} aria-hidden="true">
      <div className="photo-stack-3d__scene">
        <div className="photo-stack-3d__card photo-stack-3d__card--3" />
        <div className="photo-stack-3d__card photo-stack-3d__card--2" />
        <div className="photo-stack-3d__card photo-stack-3d__card--1" />
      </div>
    </div>
  )
}
