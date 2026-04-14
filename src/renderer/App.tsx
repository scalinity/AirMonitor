import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import MetricsRow from './components/MetricsRow'
import TimeSeriesChart from './components/TimeSeriesChart'
import AqiGauge from './components/AqiGauge'
import AlertsPanel from './components/AlertsPanel'
import SettingsModal from './components/SettingsModal'
import { useSensorData } from './hooks/useSensorData'
import { useSettings } from './hooks/useSettings'
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
  const { latest, readings, connectionStatus, alerts, dismissAlert } = useSensorData(settings)

  useEffect(() => {
    const remove = window.api.onContinuousMode((enabled) => setContinuous(enabled))
    return remove
  }, [])

  const handleContinuousToggle = useCallback(() => {
    window.api.setContinuous(!continuous)
  }, [continuous])

  return (
    <div className="app">
      <Header
        connectionStatus={connectionStatus}
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
          <div className="gauge-container">
            <AqiGauge aqi={latest?.aqi ?? 0} />
          </div>
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
