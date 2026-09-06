import type {
  FormEvent,
} from 'react'

export interface ClientFormState {
  name: string
  email: string
  phone: string
  notes: string
  total_amount: number
  amount_paid: number
}

interface ClientCreateFormProps {
  form: ClientFormState
  creating: boolean

  onChange: (
    updates: Partial<ClientFormState>,
  ) => void

  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void
}

export function ClientCreateForm({
  form,
  creating,
  onChange,
  onSubmit,
}: ClientCreateFormProps) {
  return (
    <section className="client-create-panel" aria-labelledby="client-create-title">
      <div className="client-create-panel__header">
        <div>
          <h3 id="client-create-title">Add a Client</h3>
        </div>
        <span className="client-create-panel__signal" aria-hidden="true">●</span>
      </div>

      <p className="client-create-panel__intro">
        Create the contact record first. Gallery access and shoot details can be connected later.
      </p>

      <form
        onSubmit={onSubmit}
        className="field-stack client-create-form"
      >
        <div className="field client-create-form__identity">
          <label htmlFor="new-client-name">Full Name</label>

          <input
            id="new-client-name"
            autoComplete="name"
            value={form.name}
            onChange={event =>
              onChange({
                name: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="field">
          <label htmlFor="new-client-email">Email</label>

          <input
            id="new-client-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={event =>
              onChange({
                email:
                  event.target.value,
              })
            }
          />
          <p className="field-hint">
            Needed if you want to email them their gallery link directly from a gallery's page.
          </p>
        </div>

        <div className="field">
          <label htmlFor="new-client-phone">Phone</label>

          <input
            id="new-client-phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={event =>
              onChange({
                phone:
                  event.target.value,
              })
            }
          />
        </div>

        <div className="field client-create-form__notes">
          <label htmlFor="new-client-notes">Notes</label>

          <textarea
            id="new-client-notes"
            value={form.notes}
            onChange={event =>
              onChange({
                notes:
                  event.target.value,
              })
            }
            rows={3}
            placeholder="Anything the studio should remember about this client"
          />
        </div>

        <div className="field">
          <label htmlFor="new-client-total">Total Package Cost (NLe)</label>

          <input
            id="new-client-total"
            type="number"
            min="0"
            inputMode="decimal"
            value={
              form.total_amount || ''
            }
            onChange={event =>
              onChange({
                total_amount:
                  Number(
                    event.target.value,
                  ),
              })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="new-client-paid">Amount Already Paid (NLe)</label>

          <input
            id="new-client-paid"
            type="number"
            min="0"
            inputMode="decimal"
            value={
              form.amount_paid || ''
            }
            onChange={event =>
              onChange({
                amount_paid:
                  Number(
                    event.target.value,
                  ),
              })
            }
          />
        </div>

        <div className="client-create-form__footer">
          <span className="client-create-form__hint">Required fields are marked by the browser.</span>
          <button
            type="submit"
            className="admin-button admin-button--primary"
            disabled={creating}
          >
            {creating ? 'Adding…' : 'Add Client'}
          </button>
        </div>
      </form>
    </section>
  )
}