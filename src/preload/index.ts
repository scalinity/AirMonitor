import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getHistory: (since: number) => ipcRenderer.invoke('sensor:get-history', since),
  getSettings: () => ipcRenderer.invoke('sensor:get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('sensor:save-settings', settings),
  setContinuous: (enabled: boolean) => ipcRenderer.invoke('sensor:set-continuous', enabled),
  onSensorData: (callback: (reading: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, reading: unknown) => callback(reading)
    ipcRenderer.on('sensor:data', handler)
    return () => { ipcRenderer.removeListener('sensor:data', handler) }
  },
  onConnectionStatus: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('sensor:status', handler)
    return () => { ipcRenderer.removeListener('sensor:status', handler) }
  },
  onContinuousMode: (callback: (enabled: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled)
    ipcRenderer.on('sensor:continuous', handler)
    return () => { ipcRenderer.removeListener('sensor:continuous', handler) }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  console.error('Context isolation is disabled — refusing to expose APIs')
}
