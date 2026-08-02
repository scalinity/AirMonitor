import React from 'react'
import { ConnectionStatus } from '../../shared/types'
import { formatAge } from '../utils/format'

interface HeaderProps {
  connectionStatus: ConnectionStatus
  staleSeconds: number | null
  continuous: boolean
  onContinuousToggle: () => void
  onSettingsClick: () => void
}

type DotState = ConnectionStatus | 'stale'

const STATUS_LABELS: Record<DotState, string> = {
  connected: 'Receiving data',
  stale: 'Connected — no recent data',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting'
}

export default function Header({ connectionStatus, staleSeconds, continuous, onContinuousToggle, onSettingsClick }: HeaderProps) {
  // 3× the expected cadence: ~1s in continuous mode, ~120s duty-cycled
  const staleAfterS = continuous ? 15 : 360
  const fresh = staleSeconds != null && staleSeconds < staleAfterS

  // Fresh data wins over transport state — a reading that just arrived proves
  // the pipeline works even if the socket status is mid-flap
  const dotState: DotState = fresh
    ? 'connected'
    : connectionStatus === 'connected'
      ? 'stale'
      : connectionStatus

  return (
    <header className="header">
      <div className="header-left">
        <h1>AirMonitor</h1>
        <div className={`status-dot ${dotState}`} title={STATUS_LABELS[dotState]}>
          <span className="sr-only">{STATUS_LABELS[dotState]}</span>
        </div>
        {staleSeconds != null && (
          <span className="status-age" title="Time since the last reading">{formatAge(staleSeconds)}</span>
        )}
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
