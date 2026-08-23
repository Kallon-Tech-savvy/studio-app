import type {
  Log,
} from '../types'

interface LogsViewProps {
  logs: Log[]
}

export function LogsView({
  logs,
}: LogsViewProps) {
  return (
    <div className="admin-view">
      <h3 className="section-heading">
        Operational Security Audit Logs
      </h3>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>
                Operational Details
              </th>
              <th>Executed At</th>
            </tr>
          </thead>

          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="admin-table__empty"
                >
                  Audit logs empty.
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <strong>
                      {log.action}
                    </strong>
                  </td>

                  <td>
                    {log.details}
                  </td>

                  <td>
                    {new Date(
                      log.created_at,
                    ).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}