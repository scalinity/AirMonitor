import { useState, useEffect, useCallback } from 'react'
import { Settings } from '../../shared/types'

interface UseSettingsResult {
  settings: Settings | null
  updateSettings: (settings: Settings) => Promise<void>
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings).catch((err) => {
      console.error('Failed to load settings:', err)
    })
  }, [])

  const updateSettings = useCallback(async (newSettings: Settings) => {
    await window.api.saveSettings(newSettings)
    setSettings(newSettings)
  }, [])

  return { settings, updateSettings }
}
