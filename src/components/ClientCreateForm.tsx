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
    <div>
      <h3>
        Add a Client
      </h3>

      <form
        onSubmit={onSubmit}
        className="field-stack"
      >
        <div className="field">
          <label>Full Name</label>

          <input
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
          <label>Email</label>

          <input
            type="email"
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
          <label>Phone</label>

          <input
            value={form.phone}
            onChange={event =>
              onChange({
                phone:
                  event.target.value,
              })
            }
          />
        </div>

        <div className="field">
          <label>
            Notes
          </label>

          <textarea
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
          <label>
            Total Package Cost (NLe)
          </label>

          <input
            type="number"
            min="0"
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
          <label>
            Amount Already Paid (NLe)
          </label>

          <input
            type="number"
            min="0"
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

        <button
          type="submit"
          className="admin-button admin-button--primary"
          disabled={creating}
        >
          {creating ? 'Adding…' : 'Add Client'}
        </button>
      </form>
    </div>
  )
}