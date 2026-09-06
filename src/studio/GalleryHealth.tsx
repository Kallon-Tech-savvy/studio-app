import type { GalleryHealthItem } from '../domain/gallery/health'

interface GalleryHealthProps {
  items: GalleryHealthItem[]
}

export function GalleryHealth({ items }: GalleryHealthProps) {
  return (
    <div className="gallery-health" aria-label="Gallery health">
      {items.map(item => (
        <div key={item.label} className={`gallery-health__item gallery-health__item--${item.tone}`}>
          <span className="gallery-health__dot" aria-hidden="true" />
          <div>
            <strong>{item.label}</strong>
            <div>{item.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
