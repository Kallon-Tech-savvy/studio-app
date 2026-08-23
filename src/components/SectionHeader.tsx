import type {
  PropsWithChildren,
  ReactNode,
} from 'react'

interface SectionHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function SectionHeader({
  title,
  description,
  action,
}: PropsWithChildren<SectionHeaderProps>) {
  return (
    <header className="admin-section-header">
      <div>
        <h3>{title}</h3>

        {description && (
          <p>{description}</p>
        )}
      </div>

      {action}
    </header>
  )
}