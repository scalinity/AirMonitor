import React from 'react'
import { Alert } from '../../shared/types'

interface AlertsPanelProps {
  alerts: Alert[]
  onDismiss: (id: string) => void
}

export default function AlertsPanel({ alerts, onDismiss }: AlertsPanelProps) {
  if (alerts.length === 0) return null

  return (
    <div className="alerts-panel" role="log" aria-label="Alerts">
      {alerts.slice(0, 5).map(alert => (
        <div key={alert.id} className={`alert-toast level-${alert.level}`} role="alert">
          <span className="alert-message">
            <strong>{alert.metric}</strong> is {alert.value.toFixed(1)} (threshold: {alert.threshold})
          </span>
          <button
            className="alert-dismiss"
            onClick={() => onDismiss(alert.id)}
            aria-label={`Dismiss ${alert.metric} alert`}
          >
            {'\u00d7'}
          </button>
        </div>
      ))}
    </div>
  )
}
