import React from 'react'
import { ConnectionStatus } from '../../shared/types'

interface HeaderProps {
  connectionStatus: ConnectionStatus
  continuous: boolean
  onContinuousToggle: () => void
  onSettingsClick: () => void
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting'
}

export default function Header({ connectionStatus, continuous, onContinuousToggle, onSettingsClick }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>AirMonitor</h1>
        <div className={`status-dot ${connectionStatus}`} title={STATUS_LABELS[connectionStatus]}>
          <span className="sr-only">{STATUS_LABELS[connectionStatus]}</span>
        </div>
      </div>
      <div className="header-right">
        <button
          className={`continuous-btn ${continuous ? 'active' : ''}`}
          onClick={onContinuousToggle}
          aria-label={continuous ? 'Stop continuous readings' : 'Start continuous readings'}
          title={continuous ? 'Stop continuous readings' : 'Start continuous readings'}
        >
          {continuous ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
          <span className="continuous-label">{continuous ? 'Live' : 'Start'}</span>
        </button>
        <button className="settings-btn" onClick={onSettingsClick} aria-label="Open settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </header>
  )
}
