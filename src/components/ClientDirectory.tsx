import {
  TrashIcon,
} from './icon'

import type {
  Client,
  Gallery,
} from '../types'

import {
  calculateBalance,
  getPaymentStatus,
} from '../domain/finance'

interface ClientDirectoryProps {
  clients: Client[]
  galleriesByClientId: Map<
    string,
    Gallery[]
  >

  deletingId: string | null

  onDelete: (
    clientId: string,
  ) => void
}

export function ClientDirectory({
  clients,
  galleriesByClientId,
  deletingId,
  onDelete,
}: ClientDirectoryProps) {
  if (clients.length === 0) {
    return (
      <p className="empty-note">
        No clients yet — add your first one on the left.
      </p>
    )
  }

  return (
    <div className="client-directory">
      {clients.map(client => {
        const outstanding =
          calculateBalance(client)

        const paymentStatus =
          getPaymentStatus(client)

        const galleries =
          galleriesByClientId.get(
            client.id,
          ) ?? []

        return (
          <article
            key={client.id}
            className="client-card"
          >
            <button
              type="button"
              className="icon-button icon-button--danger client-card__delete"
              onClick={() =>
                onDelete(client.id)
              }
              disabled={deletingId === client.id}
              title={`Delete ${client.name}`}
              aria-label={`Delete ${client.name}`}
            >
              <TrashIcon />
            </button>

            <h4>
              {client.name}
            </h4>

            <div className="client-card__details">
              <span>
                Email:{' '}
                {client.email ||
                  'None'}
              </span>

              <span>
                Phone:{' '}
                {client.phone ||
                  'None'}
              </span>

              {client.notes && (
                <span>
                  Notes:{' '}
                  {client.notes}
                </span>
              )}
            </div>

            <div className="client-card__financials">
              <span
                className={`payment-status payment-status--${paymentStatus.toLowerCase()}`}
              >
                {paymentStatus}
              </span>

              <span>
                Owed:{' '}
                <strong>
                  NLe{' '}
                  {outstanding.toLocaleString()}
                </strong>{' '}
                / NLe{' '}
                {Number(
                  client.total_amount,
                ).toLocaleString()}
              </span>
            </div>

            <div className="client-card__footer">
              <span>
                Linked shoots:{' '}
                <strong>
                  {galleries.length}
                </strong>
              </span>

              <span>
                {galleries.length
                  ? galleries
                      .map(
                        gallery =>
                          gallery.status,
                      )
                      .join(', ')
                  : 'No linked gallery'}
              </span>
            </div>
          </article>
        )
      })}
    </div>
  )
}