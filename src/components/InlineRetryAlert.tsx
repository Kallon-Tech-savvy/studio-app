interface InlineRetryAlertProps {
  message: string
  onRetry?: () => void
  onDismiss: () => void
}

/**
 * Non-blocking inline alert for optimistic rollback scenarios.
 *
 * Renders inside the affected section — not in a portal — so it
 * appears directly next to the operation that failed. Both actions
 * meet the 44px touch target minimum.
 */
export function InlineRetryAlert({ message, onRetry, onDismiss }: InlineRetryAlertProps) {
  return (
    <div className="inline-retry-alert" role="alert">
      <span className="inline-retry-alert__message">{message}</span>
      <div className="inline-retry-alert__actions">
        {onRetry && (
          <button
            type="button"
            className="inline-retry-alert__btn inline-retry-alert__btn--retry"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="inline-retry-alert__btn inline-retry-alert__btn--dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          <DismissIcon />
        </button>
      </div>
    </div>
  )
}

function DismissIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
