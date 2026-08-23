import {
  useState,
} from 'react'

import type {
  Client,
  Gallery,
} from '../types'

import {
  adminApi,
} from '../services/adminApi'

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

  async function deleteClient(
    clientId: string,
  ) {
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this client and unlink their shoots?',
      )
    ) {
      return
    }

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
      <div className="clients-layout">
        <ClientCreateForm
          form={form}
          creating={creating}
          onChange={updateForm}
          onSubmit={createClient}
        />

        <div>
          <h3>
            Client Accounts
          </h3>

          <ClientDirectory
            clients={clients}
            galleriesByClientId={
              galleriesByClientId
            }
            deletingId={deletingId}
            onDelete={
              deleteClient
            }
          />
        </div>
      </div>
    </div>
  )
}