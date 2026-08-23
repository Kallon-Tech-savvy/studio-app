interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="admin-empty-state">
      <strong>{title}</strong>

      {description && (
        <p>{description}</p>
      )}
    </div>
  )
}