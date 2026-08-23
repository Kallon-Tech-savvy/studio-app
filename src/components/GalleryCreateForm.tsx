import type {
  FormEvent,
} from 'react'

import type {
  Client,
} from '../types'

export interface GalleryFormState {
  title: string
  description: string
  is_public: boolean
  client_id: string
  downloads_enabled: boolean
  selection_enabled: boolean
  watermark_enabled: boolean
  expiration_date: string
  event_date: string
}

interface GalleryCreateFormProps {
  form: GalleryFormState
  clients: Client[]
  creating: boolean
  onChange: (
    updates: Partial<GalleryFormState>,
  ) => void
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void
}

export function GalleryCreateForm({
  form,
  clients,
  creating,
  onChange,
  onSubmit,
}: GalleryCreateFormProps) {
  return (
    <div>
      <h3>New Photographic Shoot</h3>

      <form
        onSubmit={onSubmit}
        className="field-stack"
      >
        <div className="field">
          <label htmlFor="gallery-title">
            Shoot Title
          </label>

          <input
            id="gallery-title"
            value={form.title}
            onChange={event =>
              onChange({
                title: event.target.value,
              })
            }
            placeholder="e.g. mararet sesay Engagement"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="gallery-description">
            Description / Notes
          </label>

          <input
            id="gallery-description"
            value={form.description}
            onChange={event =>
              onChange({
                description:
                  event.target.value,
              })
            }
            placeholder="Brief notes about styling or shoot"
          />
        </div>

        <div className="field">
          <label htmlFor="gallery-client">
            Assign Client Profile
          </label>

          <select
            id="gallery-client"
            value={form.client_id}
            onChange={event =>
              onChange({
                client_id:
                  event.target.value,
              })
            }
          >
            <option value="">
              Do not assign client…
            </option>

            {clients.map(client => (
              <option
                key={client.id}
                value={client.id}
              >
                {client.name}
                {client.email
                  ? ` (${client.email})`
                  : ''}
              </option>
            ))}
          </select>

          {clients.length === 0 && (
            <p className="field-hint">
              No clients yet — you can create one from the Clients tab, or assign one to this gallery later.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="gallery-date">
            Event Shoot Date
          </label>

          <input
            id="gallery-date"
            type="date"
            value={form.event_date}
            onChange={event =>
              onChange({
                event_date:
                  event.target.value,
              })
            }
          />
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={event =>
              onChange({
                is_public:
                  event.target.checked,
              })
            }
          />

          Make this gallery public when it is published
        </label>
        <p className="field-hint">
          Public galleries appear in the main gallery list for anyone to browse once published.
          Leave this unchecked to keep it reachable only by the private link.
        </p>

        <button
          type="submit"
          className="admin-button admin-button--primary"
          disabled={creating}
        >
          {creating ? 'Creating…' : 'Create Gallery'}
        </button>
      </form>
    </div>
  )
}