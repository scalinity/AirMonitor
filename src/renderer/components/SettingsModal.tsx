import React, { useState, useEffect, useRef } from 'react'
import { Settings } from '../../shared/types'

interface SettingsModalProps {
  settings: Settings
  onSave: (settings: Settings) => Promise<void>
  onClose: () => void
}

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [form, setForm] = useState<Settings>({ ...settings })
  const [saving, setSaving] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length > 0) focusable[0].focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modal) return
      const els = modal.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])'
      )
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" ref={modalRef}>
        <h2>Settings</h2>

        <div className="form-group">
          <label htmlFor="broker-url">MQTT Broker URL</label>
          <input
            id="broker-url"
            type="text"
            value={form.brokerUrl}
            onChange={(e) => setForm({ ...form, brokerUrl: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="mqtt-topic">MQTT Topic</label>
          <input
            id="mqtt-topic"
            type="text"
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="refresh-interval">Refresh Interval (seconds)</label>
          <input
            id="refresh-interval"
            type="number"
            min={1}
            max={60}
            value={form.refreshInterval}
            onChange={(e) => setForm({ ...form, refreshInterval: parseInt(e.target.value) || 5 })}
          />
        </div>

        <div className="form-group toggle-group">
          <label htmlFor="use-mock">Use Mock Data</label>
          <input
            id="use-mock"
            type="checkbox"
            className="toggle"
            checked={form.useMockData}
            onChange={(e) => setForm({ ...form, useMockData: e.target.checked })}
          />
        </div>

        <h3 style={{ fontSize: '14px', marginBottom: '12px', marginTop: '8px' }}>Alert Thresholds</h3>

        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="threshold-pm25">PM2.5 ({'\u00b5g/m\u00b3'})</label>
            <input
              id="threshold-pm25"
              type="number"
              min={0}
              value={form.thresholds.pm25}
              onChange={(e) => setForm({
                ...form,
                thresholds: { ...form.thresholds, pm25: parseFloat(e.target.value) || 0 }
              })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="threshold-pm10">PM10 ({'\u00b5g/m\u00b3'})</label>
            <input
              id="threshold-pm10"
              type="number"
              min={0}
              value={form.thresholds.pm10}
              onChange={(e) => setForm({
                ...form,
                thresholds: { ...form.thresholds, pm10: parseFloat(e.target.value) || 0 }
              })}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
