import {
  useState,
  useMemo,
} from 'react'

import type {
  Client,
  Gallery,
} from '../types'

import {
  adminApi,
} from '../services/adminApi'

import {
  selectFinancialSummary,
  formatCurrency,
  formatPercent,
} from '../domain/finance'

import { useAdminNotice, describeError } from './AdminNotice'

import {
  ClientCreateForm,
  type ClientFormState,
} from './ClientCreateForm'

import {
  ClientDirectory,
} from './ClientDirectory'

interface ClientsViewProps {
  accessToken: string

  clients: Client[]
  galleries: Gallery[]

  galleriesByClientId: Map<
    string,
    Gallery[]
  >

  loadClients: () => Promise<void>
  loadGalleries: () => Promise<void>
  loadLogs: () => Promise<void>
}

const initialForm: ClientFormState = {
  name: '',
  email: '',
  phone: '',
  notes: '',
  total_amount: 0,
  amount_paid: 0,
}

export function ClientsView({
  accessToken,
  clients,
  galleries,
  galleriesByClientId,
  loadClients,
  loadGalleries,
  loadLogs,
}: ClientsViewProps) {
  const [
    form,
    setForm,
  ] = useState(initialForm)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const notify = useAdminNotice()

  const financialSummary = useMemo(() => {
    return selectFinancialSummary(clients)
  }, [clients])

  function updateForm(
    updates: Partial<ClientFormState>,
  ) {
    setForm(current => ({
      ...current,
      ...updates,
    }))
  }

  async function createClient(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (creating) return
    setCreating(true)

    try {
      await adminApi.clients.create(
        accessToken,
        form,
      )

      setForm(initialForm)

      await loadClients()
      await loadLogs()
      notify(`${form.name} added.`, 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't add that client — please try again."), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function updateClient(
    clientId: string,
    updates: Partial<Client>,
  ) {
    try {
      await adminApi.clients.update(
        accessToken,
        clientId,
        updates,
      )

      await loadClients()
      await loadGalleries()
      await loadLogs()
      notify('Client details updated.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't update client — please try again."), 'error')
      throw error
    }
  }

  async function recordPayment(
    clientId: string,
    paymentAmount: number,
  ) {
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const newAmountPaid = Number(client.amount_paid ?? 0) + Number(paymentAmount)

    try {
      await adminApi.clients.update(
        accessToken,
        clientId,
        { amount_paid: newAmountPaid },
      )

      await loadClients()
      await loadGalleries()
      await loadLogs()
      notify(`Payment of ${formatCurrency(paymentAmount)} recorded for ${client.name}.`, 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't record payment — please try again."), 'error')
      throw error
    }
  }

  async function deleteClient(
    clientId: string,
  ) {
    setDeletingId(clientId)

    try {
      await adminApi.clients.delete(
        accessToken,
        clientId,
      )

      await loadClients()
      await loadGalleries()
      await loadLogs()
      notify('Client deleted.', 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't delete that client — please try again."), 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="admin-view">
      <div className="section-headline">
        <div>
          <h3 className="section-heading">
            Client & Financial Accounts
          </h3>
          <p className="section-sub">
            Track package pricing, retainer deposits, balance payments, and client contact info.
          </p>
        </div>
      </div>

      {/* Financial Summary KPI Banner */}
      {clients.length > 0 && (
        <div className="financial-summary-banner">
          <div className="financial-summary-banner__metric">
            <span className="metric-label">Booked Revenue</span>
            <strong className="metric-value">{formatCurrency(financialSummary.totalRevenue)}</strong>
            <span className="metric-sub">{clients.length} total clients</span>
          </div>

          <div className="financial-summary-banner__metric">
            <span className="metric-label">Collected</span>
            <strong className="metric-value metric-value--positive">{formatCurrency(financialSummary.totalReceived)}</strong>
            <span className="metric-sub">{formatPercent(financialSummary.collectionRate)} collection rate</span>
          </div>

          <div className="financial-summary-banner__metric">
            <span className="metric-label">Outstanding Receivables</span>
            <strong className="metric-value metric-value--danger">{formatCurrency(financialSummary.totalOutstanding)}</strong>
            <span className="metric-sub">{financialSummary.unpaidCount + financialSummary.partialCount} pending accounts</span>
          </div>

          <div className="financial-summary-banner__metric">
            <span className="metric-label">Average Package Value</span>
            <strong className="metric-value">{formatCurrency(financialSummary.averageClientValue)}</strong>
            <span className="metric-sub">{financialSummary.paidCount} fully paid</span>
          </div>
        </div>
      )}

      <div className="clients-layout">
        <ClientCreateForm
          form={form}
          creating={creating}
          onChange={updateForm}
          onSubmit={createClient}
        />

        <div>
          <ClientDirectory
            clients={clients}
            galleriesByClientId={
              galleriesByClientId
            }
            deletingId={deletingId}
            onDelete={
              deleteClient
            }
            onUpdateClient={
              updateClient
            }
            onRecordPayment={
              recordPayment
            }
          />
        </div>
      </div>
    </div>
  )
}