import type { NextAction } from '../domain/gallery/nextAction'

interface NextActionCardProps {
  action: NextAction
  onAction?: () => void
  actionLabel?: string
  compact?: boolean
}

export function NextActionCard({ action, onAction, actionLabel, compact = false }: NextActionCardProps) {
  return (
    <div className={`next-action-card ${compact ? 'next-action-card--compact' : ''}`}>
      <div className="next-action-card__meta">Next action</div>
      <h4>{action.label}</h4>
      <p>{action.reason}</p>
      {onAction && (
        <button type="button" className="admin-button admin-button--primary" onClick={onAction}>
          {actionLabel ?? action.label}
        </button>
      )}
    </div>
  )
}
