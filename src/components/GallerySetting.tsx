import type {
  FormEvent,
} from 'react'

import type {
  Client,
  Gallery,
  GalleryStatus,
} from '../types'

// What each workflow status actually means for the client on the other
// end of the link — the enum names alone (PROCESSING vs READY) don't
// make the practical difference obvious.
const STATUS_HINTS: Record<GalleryStatus, string> = {
  DRAFT: 'Client can preview photos only — no downloads or selecting favorites yet.',
  PROCESSING: 'Client can preview and select favorites, but downloads stay locked until Ready.',
  READY: 'Client can preview, select favorites, and download — once their balance is paid.',
  PUBLISHED: 'Same as Ready, and also listed in the public gallery feed if "public" is checked.',
  DISABLED: 'The client link stops working entirely until this changes.',
  ARCHIVED: 'The client link stops working entirely — use this once a shoot is fully wrapped up.',
}

interface GallerySettingsProps {
  gallery: Partial<Gallery>
  clients: Client[]
  disabled: boolean
  saving: boolean

  onChange: (
    updates: Partial<Gallery>,
  ) => void

  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void
}

export function GallerySettings({
  gallery,
  clients,
  disabled,
  saving,
  onChange,
  onSubmit,
}: GallerySettingsProps) {
  return (
    <fieldset
      disabled={disabled}
      className="gallery-settings"
    >
      <form
        onSubmit={onSubmit}
        className="gallery-settings-form"
      >
        <div className="field">
          <label>Gallery Title</label>

          <input
            value={gallery.title ?? ''}
            onChange={event =>
              onChange({
                title:
                  event.target.value,
              })
            }
          />
        </div>

        <div className="field">
          <label>Description</label>

          <input
            value={
              gallery.description ?? ''
            }
            onChange={event =>
              onChange({
                description:
                  event.target.value,
              })
            }
          />
        </div>

        <div className="field">
          <label>Workflow Status</label>

          <select
            value={
              gallery.status ??
              'DRAFT'
            }
            onChange={event =>
              onChange({
                status:
                  event.target.value as GalleryStatus,
              })
            }
          >
            <option value="DRAFT">
              Draft
            </option>

            <option value="PROCESSING">
              Processing
            </option>

            <option value="READY">
              Ready
            </option>

            <option value="PUBLISHED">
              Published
            </option>

            <option value="DISABLED">
              Disabled
            </option>

            <option value="ARCHIVED">
              Archived
            </option>
          </select>

          <p className="field-hint">
            {STATUS_HINTS[gallery.status ?? 'DRAFT']}
          </p>
        </div>

        <div className="field">
          <label>Assign Client</label>

          <select
            value={
              gallery.client_id ?? ''
            }
            onChange={event =>
              onChange({
                client_id:
                  event.target.value ||
                  null,
              })
            }
          >
            <option value="">
              No Client…
            </option>

            {clients.map(client => (
              <option
                key={client.id}
                value={client.id}
              >
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Watermark Settings</label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={
                gallery.watermark_enabled ??
                false
              }
              onChange={event =>
                onChange({
                  watermark_enabled:
                    event.target.checked,
                })
              }
            />

            Apply Watermark to Previews
          </label>
        </div>

        <div className="field">
          <label>Client Permissions</label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={
                gallery.downloads_enabled ??
                true
              }
              onChange={event =>
                onChange({
                  downloads_enabled:
                    event.target.checked,
                })
              }
            />

            Allow high-res downloads
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={
                gallery.selection_enabled ??
                true
              }
              onChange={event =>
                onChange({
                  selection_enabled:
                    event.target.checked,
                })
              }
            />

            Allow photo selection
          </label>
        </div>

        {!disabled && (
          <div className="form-actions">
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </fieldset>
  )
}