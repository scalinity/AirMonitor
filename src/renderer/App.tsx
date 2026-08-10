import { useState, useEffect, useCallback, CSSProperties } from 'react'
import Header from './components/Header'
import MetricsRow from './components/MetricsRow'
import TimeSeriesChart from './components/TimeSeriesChart'
import AirStatePanel from './components/AirStatePanel'
import AlertsPanel from './components/AlertsPanel'
import SettingsModal from './components/SettingsModal'
import { useSensorData } from './hooks/useSensorData'
import { useSettings } from './hooks/useSettings'
import { aqiToLevel, pm25ToAqi, LEVEL_RGB } from './utils/aqi'
import { combinedPm } from './utils/calibration'
import { ElectronAPI } from '../shared/types'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const { settings, updateSettings } = useSettings()
  const { latest, readings, connectionStatus, alerts, dismissAlert, now, staleSeconds } = useSensorData(settings)

  useEffect(() => {
    const remove = window.api.onContinuousMode((enabled) => setContinuous(enabled))
    return remove
  }, [])

  const handleContinuousToggle = useCallback(() => {
    window.api.setContinuous(!continuous)
  }, [continuous])

  // The app's ambient wash follows the current air state (combined-sensor basis)
  const tintLevel = latest ? aqiToLevel(pm25ToAqi(combinedPm('pm25', latest))) : 'good'
  const appStyle = { '--state-tint': `rgba(${LEVEL_RGB[tintLevel]}, 0.06)` } as CSSProperties

  return (
    <div className="app" style={appStyle}>
      <Header
        connectionStatus={connectionStatus}
        staleSeconds={staleSeconds}
        continuous={continuous}
        onContinuousToggle={handleContinuousToggle}
        onSettingsClick={() => setShowSettings(true)}
      />
      <main className="dashboard">
        <MetricsRow reading={latest} readings={readings} />
        <div className="charts-row">
          <div className="chart-container">
            <TimeSeriesChart readings={readings} />
          </div>
          <AirStatePanel latest={latest} readings={readings} staleSeconds={staleSeconds} now={now} />
        </div>
        {/* <AlertsPanel alerts={alerts} onDismiss={dismissAlert} /> */}
      </main>
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onSave={async (s) => {
            await updateSettings(s)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
