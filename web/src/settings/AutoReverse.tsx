import React from 'react'

const field: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #d0d7de', borderRadius: 6, outline: 'none'
}

const AutoReverse: React.FC = () => {
  const api = (import.meta.env.VITE_API_BASE_URL || '')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [active, setActive] = React.useState(false)
  const [triggerSeries, setTriggerSeries] = React.useState('')
  const [targetSeries, setTargetSeries] = React.useState('')
  const [dateMode, setDateMode] = React.useState<'FIRST_DAY_NEXT_MONTH' | 'DATE_IN_COMMENT'>('FIRST_DAY_NEXT_MONTH')
  const [wsStatus, setWsStatus] = React.useState<{ connected: boolean; tenants: number; topicsAdded: boolean } | null>(null)
  const [wsDebug, setWsDebug] = React.useState<any>(null)
  const [wsChecking, setWsChecking] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [newEvent, setNewEvent] = React.useState(false)
  const [lastTotalEvents, setLastTotalEvents] = React.useState<number>(0)
  const [events, setEvents] = React.useState<Array<{ t: number; topic?: string; type?: string; id?: string | number | null; year?: number | null; series?: string | null }>>(() => {
    try {
      const raw = localStorage.getItem('burgsvik.ws.events')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  const [initial, setInitial] = React.useState<null | {
    active: boolean
    triggerSeries: string
    targetSeries: string
    dateMode: 'FIRST_DAY_NEXT_MONTH' | 'DATE_IN_COMMENT'
  }>(null)
  const [showDebug, setShowDebug] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [errors, setErrors] = React.useState<{ trigger?: string; target?: string }>({})
  const [reversals, setReversals] = React.useState<Array<{
    id: string
    status: 'success' | 'failed'
    source_series: string
    source_number: number
    target_series?: string
    target_number?: number
    financial_year: number
    error_message?: string
    created_at: string
  }>>([])
  const [loadingReversals, setLoadingReversals] = React.useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${api}/api/settings`, { credentials: 'include' })
      const json = await res.json()
      if (json?.ok && json.settings) {
        setActive(Boolean(json.settings.auto_reverse_active))
        setTriggerSeries(String(json.settings.auto_reverse_trigger_series || ''))
        setTargetSeries(String(json.settings.auto_reverse_target_series || ''))
        setDateMode((json.settings.auto_reverse_date_mode === 'DATE_IN_COMMENT') ? 'DATE_IN_COMMENT' : 'FIRST_DAY_NEXT_MONTH')
        setInitial({
          active: Boolean(json.settings.auto_reverse_active),
          triggerSeries: String(json.settings.auto_reverse_trigger_series || ''),
          targetSeries: String(json.settings.auto_reverse_target_series || ''),
          dateMode: (json.settings.auto_reverse_date_mode === 'DATE_IN_COMMENT') ? 'DATE_IN_COMMENT' : 'FIRST_DAY_NEXT_MONTH'
        })
      }
    } catch (e: any) {
      setError('Kunde inte hämta inställningar')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  // Testa/uppdatera WS-status beroende på active
  React.useEffect(() => {
    const run = async () => {
      setWsChecking(true)
      try {
        if (active) {
          const addRes = await fetch(`${api}/api/ws/add-current`, { method: 'POST', credentials: 'include' })
          const addJson = await addRes.json()
          if (addJson?.skipped) {
            console.warn('WebSocket skipped - auto_reverse_active is false')
          }
        }
        const res = await fetch(`${api}/api/ws/status`, { credentials: 'include' })
        const json = await res.json()
        if (json?.ok) {
          setWsStatus(json.status as any)
          setWsDebug(json.debug)
          // Logga status för debugging
          if (json.debug) {
            console.log('WebSocket status:', {
              connected: json.status?.connected,
              tenants: json.status?.tenants,
              topicsAdded: json.status?.topicsAdded,
              streamStarted: json.debug?.streamStarted,
              tenantsRegistered: json.debug?.tenantsRegistered,
              totalMessages: json.debug?.totalMessages,
              totalEvents: json.debug?.totalEvents,
            })
          }
        }
      } catch (err) {
        console.error('Error checking WebSocket status:', err)
        setWsStatus({ connected: false, tenants: 0, topicsAdded: false })
      } finally {
        setWsChecking(false)
      }
    }
    // Kör först när initiala inställningar laddats
    if (!loading) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, active])

  // Poll WS-status var 5:e sekund för att upptäcka inkommande events
  React.useEffect(() => {
    if (loading) return
    let cancelled = false
    let timeoutId: any
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${api}/api/ws/status`, { credentials: 'include' })
        const json = await res.json()
        if (cancelled) return
        if (json?.ok) {
          setWsStatus(json.status as any)
          setWsDebug(json.debug)
          const total = Number(json?.debug?.totalEvents ?? 0)
          if (total > lastTotalEvents) {
            setLastTotalEvents(total)
            const ev = json?.debug?.lastEvent || null
            if (ev) {
              const newList = [{ t: Date.now(), topic: ev.topic, type: ev.type, id: ev.id, year: ev.year, series: ev.series }, ...events].slice(0, 50)
              setEvents(newList)
              try { localStorage.setItem('burgsvik.ws.events', JSON.stringify(newList)) } catch {}
            }
            setNewEvent(true)
            timeoutId = setTimeout(() => setNewEvent(false), 3000)
          }
        }
      } catch {}
    }
    const id = setInterval(fetchStatus, 5000)
    fetchStatus()
    return () => { cancelled = true; clearInterval(id); if (timeoutId) clearTimeout(timeoutId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lastTotalEvents, events])

  const clearEvents = () => {
    setEvents([])
    try { localStorage.removeItem('burgsvik.ws.events') } catch {}
  }

  // Hjälpfunktion för relativ tid
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return 'just nu'
    if (diffMin === 1) return '1 minut sedan'
    if (diffMin < 60) return `${diffMin} minuter sedan`
    if (diffHour === 1) return '1 timme sedan'
    if (diffHour < 24) return `${diffHour} timmar sedan`
    if (diffDay === 1) return 'igår'
    if (diffDay < 7) return `${diffDay} dagar sedan`

    return date.toLocaleDateString('sv-SE')
  }

  // Toast-funktion
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Validering
  const validate = (): boolean => {
    const newErrors: typeof errors = {}

    if (active && !triggerSeries?.trim()) {
      newErrors.trigger = 'Trigger-serie krävs när funktionen är aktiv'
    }
    if (active && !targetSeries?.trim()) {
      newErrors.target = 'Mål-serie krävs när funktionen är aktiv'
    }
    if (triggerSeries && targetSeries && triggerSeries.toUpperCase() === targetSeries.toUpperCase()) {
      newErrors.target = 'Mål-serie kan inte vara samma som trigger-serie'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Hämta vändningshistorik
  const fetchReversals = async () => {
    try {
      setLoadingReversals(true)
      const res = await fetch(`${api}/api/reversals`, { credentials: 'include' })
      const json = await res.json()
      if (json.ok) setReversals(json.reversals || [])
    } catch (e) {
      console.error('Failed to fetch reversals', e)
    } finally {
      setLoadingReversals(false)
    }
  }

  React.useEffect(() => {
    if (!loading) fetchReversals()
  }, [loading])

  // Uppdatera historiken efter nya events
  React.useEffect(() => {
    if (wsDebug?.lastEventAt) {
      fetchReversals()
    }
  }, [wsDebug?.lastEventAt])

  const dirty = React.useMemo(() => {
    if (!initial) return false
    return (
      initial.active !== active ||
      initial.triggerSeries !== triggerSeries ||
      initial.targetSeries !== targetSeries ||
      initial.dateMode !== dateMode
    )
  }, [initial, active, triggerSeries, targetSeries, dateMode])

  const resetToInitial = () => {
    if (!initial) return
    setActive(initial.active)
    setTriggerSeries(initial.triggerSeries)
    setTargetSeries(initial.targetSeries)
    setDateMode(initial.dateMode)
  }

  const save = async () => {
    setError(null)
    if (!validate()) {
      showToast('Vänligen korrigera felen innan du sparar', 'error')
      return
    }
    try {
      setSaving(true)
      const res = await fetch(`${api}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          auto_reverse_active: active,
          auto_reverse_trigger_series: triggerSeries || null,
          auto_reverse_target_series: targetSeries || null,
          auto_reverse_date_mode: dateMode,
        })
      })
      const json = await res.json()
      if (!json?.ok) {
        setError(json?.message || 'Kunde inte spara')
        showToast('Kunde inte spara inställningar', 'error')
        return
      }
      // Uppdatera state istället för reload
      setInitial({
        active: Boolean(json.settings.auto_reverse_active),
        triggerSeries: String(json.settings.auto_reverse_trigger_series || ''),
        targetSeries: String(json.settings.auto_reverse_target_series || ''),
        dateMode: (json.settings.auto_reverse_date_mode === 'DATE_IN_COMMENT') ? 'DATE_IN_COMMENT' : 'FIRST_DAY_NEXT_MONTH'
      })
      showToast('Inställningar sparade', 'success')
    } catch (e: any) {
      setError('Kunde inte spara inställningar')
      showToast('Kunde inte spara inställningar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const ekgCss = `
  @keyframes ekg {
    0% { transform: translateX(0); }
    100% { transform: translateX(-100%); }
  }
  .ekg-container { position: relative; height: 24px; overflow: hidden; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; }
  .ekg-line { position: absolute; left: 0; top: 50%; width: 200%; height: 2px; background:
    linear-gradient(90deg, transparent 0%, #10b981 10%, transparent 20%, #10b981 30%, transparent 40%, #10b981 50%, transparent 60%, #10b981 70%, transparent 80%, #10b981 90%, transparent 100%);
    animation: ekg 1.2s linear infinite; transform: translateY(-50%);
  }
  .ekg-line.paused { animation-play-state: paused; opacity: 0.4; background:
    linear-gradient(90deg, transparent 0%, #ef4444 50%, transparent 100%);
  }
  `

  const uiCss = `
  .card { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
  .card-header { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; }
  .card-body { padding: 14px; }
  .row { display: grid; gap: 10px; }
  .label { font-size: 13px; color: #334155; margin-bottom: 6px; font-weight: 500; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; border: 1px solid #e2e8f0; }
  .badge-green { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
  .badge-red { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
  .badge-gray { background: #f8fafc; color: #334155; }
  .badge-blue { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
  .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
  .switch input { display:none; }
  .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #e2e8f0; transition: .2s; border-radius: 9999px; border: 1px solid #cbd5e1; }
  .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  input:checked + .slider { background-color: #10b981; border-color: #10b981; }
  input:checked + .slider:before { transform: translateX(20px); }
  .seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .seg button { padding: 6px 8px; font-size: 13px; background: #fff; border: 0; border-right: 1px solid #e2e8f0; cursor: pointer; }
  .seg button:last-child { border-right: 0; }
  .seg button.active { background: #0ea5e9; color: #fff; }
  .actions { display: flex; gap: 8px; align-items: center; }
  .btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #d0d7de; cursor: pointer; font-weight: 600; }
  .btn-primary { background: #10b981; color: #fff; border-color: #10b981; }
  .btn-secondary { background: #fff; color: #334155; }
  .btn:disabled { opacity: .6; cursor: not-allowed; }
  `

  // FlowExplanation-komponent
  const FlowExplanation = () => {
    if (!active) {
      return (
        <div className="card" style={{ backgroundColor: '#f8fafc' }}>
          <div className="card-body" style={{ textAlign: 'center', color: '#64748b', padding: '32px' }}>
            <p style={{ margin: 0, fontSize: '16px' }}>
              Aktivera automatisk vändning för att komma igång
            </p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
              Funktionen skapar automatiskt omvända verifikat när nya verifikat registreras i en viss serie.
            </p>
          </div>
        </div>
      )
    }

    const datumText = dateMode === 'FIRST_DAY_NEXT_MONTH'
      ? 'första dagen i nästa månad'
      : 'datumet som anges i kommentaren på originalverifikationen (format: YYYY-MM-DD). Om inget datum anges, används första dagen i nästa månad'

    return (
      <div className="card">
        <div className="card-header">Så här fungerar det</div>
        <div className="card-body">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px 0',
            flexWrap: 'wrap'
          }}>
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#dbeafe',
              borderRadius: '8px',
              fontWeight: 600,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#1e40af', marginBottom: '4px' }}>Nytt verifikat i</div>
              <div style={{ fontSize: '18px' }}>Serie {triggerSeries || '?'}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '40px', height: '2px', backgroundColor: '#10b981' }} />
              <div style={{
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderLeft: '8px solid #10b981'
              }} />
            </div>

            <div style={{
              padding: '16px 24px',
              backgroundColor: '#ecfdf5',
              borderRadius: '8px',
              fontWeight: 600,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#065f46', marginBottom: '4px' }}>Automatiskt</div>
              <div style={{ fontSize: '18px' }}>Vändning skapas</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '40px', height: '2px', backgroundColor: '#10b981' }} />
              <div style={{
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderLeft: '8px solid #10b981'
              }} />
            </div>

            <div style={{
              padding: '16px 24px',
              backgroundColor: '#fef3c7',
              borderRadius: '8px',
              fontWeight: 600,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Skapas i</div>
              <div style={{ fontSize: '18px' }}>Serie {targetSeries || '?'}</div>
            </div>
          </div>

          <p style={{ textAlign: 'center', color: '#64748b', margin: 0, fontSize: '14px' }}>
            Vändningen bokförs med <strong>{datumText}</strong>.
            Alla belopp reverseras (debet blir kredit och vice versa).
          </p>
        </div>
      </div>
    )
  }

  // ReversalHistory-komponent
  const ReversalHistory = () => (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Senaste vändningar</span>
        <button
          onClick={fetchReversals}
          className="btn-secondary"
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          Uppdatera
        </button>
      </div>
      <div className="card-body" style={{ maxHeight: '350px', overflowY: 'auto' }}>
        {loadingReversals ? (
          <p style={{ color: '#64748b', textAlign: 'center' }}>Laddar...</p>
        ) : reversals.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            Inga vändningar ännu. När verifikat skapas i serie {triggerSeries || '?'} kommer de visas här.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reversals.map(r => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: r.status === 'success' ? '#ecfdf5' : '#fef2f2',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${r.status === 'success' ? '#10b981' : '#ef4444'}`
                }}
              >
                <span style={{ fontSize: '18px' }}>
                  {r.status === 'success' ? '✅' : '❌'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {r.source_series}-{r.source_number}
                    {r.status === 'success' && (
                      <span style={{ color: '#10b981' }}> → {r.target_series}-{r.target_number}</span>
                    )}
                  </div>
                  {r.status === 'failed' && r.error_message && (
                    <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '2px' }}>
                      {r.error_message}
                    </div>
                  )}
                </div>
                <span style={{ color: '#64748b', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  {formatTimeAgo(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Automatisk vändning</h2>
      {error && <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid #ffa39e', background: '#fff1f0', borderRadius: 6 }}>{error}</div>}
      {loading ? <div>Laddar…</div> : (
        <div style={{ display: 'grid', gap: 16, alignItems: 'start', maxWidth: 1200, width: '100%', overflow: 'hidden' }}>
          <style>{ekgCss}</style>
          <style>{uiCss}</style>

          {/* FlowExplanation - visuellt flöde */}
          <FlowExplanation />

          {/* Två-kolumns layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)',
            gap: '24px'
          }}>
            {/* Vänster kolumn: Inställningar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card">
                <div className="card-header">Inställningar</div>
                <div className="card-body">
                  <div className="row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="label">Aktiv</span>
                      <label className="switch">
                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                      <span style={{ fontSize: 13, color: '#475569' }}>{active ? 'På' : 'Av'}</span>
                    </div>
                    <div>
                      <div className="label">Serie som triggar vändning</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          aria-label="Trigger-serie"
                          placeholder="t.ex. R"
                          style={{
                            ...field,
                            width: 200,
                            borderColor: errors.trigger ? '#ef4444' : '#d0d7de'
                          }}
                          value={triggerSeries}
                          onChange={e => {
                            setTriggerSeries(e.target.value.toUpperCase())
                            setErrors(prev => ({ ...prev, trigger: undefined }))
                          }}
                        />
                        {errors.trigger && (
                          <span style={{ color: '#ef4444', fontSize: '12px' }}>{errors.trigger}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="label">Serie där vändning skapas</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          aria-label="Mål-serie"
                          placeholder="t.ex. Q"
                          style={{
                            ...field,
                            width: 200,
                            borderColor: errors.target ? '#ef4444' : '#d0d7de'
                          }}
                          value={targetSeries}
                          onChange={e => {
                            setTargetSeries(e.target.value.toUpperCase())
                            setErrors(prev => ({ ...prev, target: undefined }))
                          }}
                        />
                        {errors.target && (
                          <span style={{ color: '#ef4444', fontSize: '12px' }}>{errors.target}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="label">Datumangivelse</div>
                      <div className="seg" role="tablist" aria-label="Datumangivelse">
                        <button type="button" className={dateMode === 'FIRST_DAY_NEXT_MONTH' ? 'active' : ''} onClick={() => setDateMode('FIRST_DAY_NEXT_MONTH')} aria-selected={dateMode === 'FIRST_DAY_NEXT_MONTH'}>Första datum i nästa period</button>
                        <button type="button" className={dateMode === 'DATE_IN_COMMENT' ? 'active' : ''} onClick={() => setDateMode('DATE_IN_COMMENT')} aria-selected={dateMode === 'DATE_IN_COMMENT'}>Datum i kommentar</button>
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Sparar…' : 'Spara'}</button>
                      <button className="btn btn-secondary" onClick={resetToInitial} disabled={!dirty || saving}>Återställ</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Anslutningsstatus */}
              <div className="card">
                <div className="card-header">Anslutningsstatus</div>
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: wsDebug?.connected ? '#10b981' : '#ef4444'
                      }}
                    />
                    <span>{wsDebug?.connected ? 'Ansluten till Fortnox' : 'Ej ansluten'}</span>
                  </div>
                  {wsDebug?.connected && (
                    <>
                      <div style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
                        Lyssnar på: vouchers
                      </div>
                      {wsDebug?.lastEventAt && (
                        <div style={{ fontSize: '14px', color: '#64748b' }}>
                          Senaste event: {formatTimeAgo(wsDebug.lastEventAt)}
                        </div>
                      )}
                    </>
                  )}
                  {!wsDebug?.connected && (
                    <button
                      onClick={() => window.location.reload()}
                      className="btn-secondary"
                      style={{ marginTop: '8px' }}
                    >
                      Anslut igen
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Höger kolumn: Historik */}
            <ReversalHistory />
          </div>

          {/* Debug-sektion - gömd som standard */}
          <div className="card">
            <div
              className="card-header"
              onClick={() => setShowDebug(!showDebug)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Händelselogg (Debug)</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>{showDebug ? '▲ Dölj' : '▼ Visa'}</span>
            </div>
            {showDebug && (
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', overflow: 'hidden' }}>
                <div className="card" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                  <div className="card-header">Event-log (debug)</div>
                  <div className="card-body" style={{ maxWidth: '100%', overflow: 'hidden' }}>
              {wsDebug?.eventLog && Array.isArray(wsDebug.eventLog) && wsDebug.eventLog.length > 0 ? (
                <div style={{ display: 'grid', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                  {wsDebug.eventLog.slice().reverse().map((entry: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        border: '1px solid #e5e7eb',
                        backgroundColor:
                          entry.level === 'error'
                            ? '#fef2f2'
                            : entry.level === 'warn'
                            ? '#fffbeb'
                            : entry.level === 'success'
                            ? '#ecfdf5'
                            : '#f8fafc',
                        color:
                          entry.level === 'error'
                            ? '#991b1b'
                            : entry.level === 'warn'
                            ? '#92400e'
                            : entry.level === 'success'
                            ? '#065f46'
                            : '#475569',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                        <div style={{ fontWeight: 600, minWidth: 60 }}>
                          {entry.level === 'error' ? '❌' : entry.level === 'warn' ? '⚠️' : entry.level === 'success' ? '✅' : 'ℹ️'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, marginBottom: 2, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{entry.message}</div>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>
                            {new Date(entry.timestamp).toLocaleString()}
                          </div>
                          {entry.data && (
                            <div style={{ marginTop: 4, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>
                              {JSON.stringify(entry.data, null, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#475569', fontSize: 13 }}>Inga loggposter ännu.</div>
              )}
                  </div>
                </div>

                <div className="card" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                  <div className="card-header">Alla WebSocket-meddelanden ({wsDebug?.receivedMessages?.length ?? 0})</div>
                  <div className="card-body" style={{ maxWidth: '100%', overflow: 'hidden' }}>
              {wsDebug?.receivedMessages && Array.isArray(wsDebug.receivedMessages) && wsDebug.receivedMessages.length > 0 ? (
                <div style={{ display: 'grid', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                  {wsDebug.receivedMessages.slice().reverse().map((msg: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        border: '1px solid #e5e7eb',
                        backgroundColor: msg.topic === 'vouchers' ? '#eff6ff' : '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#475569' }}>
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          #{wsDebug.receivedMessages.length - i}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11, maxWidth: '100%', overflow: 'hidden' }}>
                        {msg.response && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Response:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.response}</span>
                          </>
                        )}
                        {msg.topic && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Topic:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.topic}</span>
                          </>
                        )}
                        {msg.type && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Type:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.type}</span>
                          </>
                        )}
                        {msg.tenantId && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>TenantId:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.tenantId}</span>
                          </>
                        )}
                        {msg.series && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Series:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.series}</span>
                          </>
                        )}
                        {msg.year && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Year:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.year}</span>
                          </>
                        )}
                        {msg.id && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>ID:</span>
                            <span style={{ color: '#475569', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.id}</span>
                          </>
                        )}
                        {msg.offset && (
                          <>
                            <span style={{ fontWeight: 600, color: '#64748b' }}>Offset:</span>
                            <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', overflowWrap: 'break-word' }}>{msg.offset}</span>
                          </>
                        )}
                      </div>
                      {msg.raw && msg.response === 'add-tenants-v1' && (
                        <div style={{ marginTop: 6, padding: '6px', background: '#f1f5f9', borderRadius: 4, fontSize: 10, maxWidth: '100%', overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>TenantIds:</div>
                          <div style={{ fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(msg.raw.tenantIds || {}, null, 2)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#475569', fontSize: 13 }}>Inga meddelanden ännu.</div>
              )}
                  </div>
                </div>

                <div className="card" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                  <div className="card-header">Senaste WS‑händelser (voucher-events)</div>
                  <div className="card-body" style={{ maxWidth: '100%', overflow: 'hidden' }}>
              <div className="actions" style={{ marginBottom: 8 }}>
                <button className="btn btn-secondary" onClick={clearEvents} disabled={events.length === 0}>Rensa</button>
              </div>
              {events.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13 }}>Inga händelser ännu.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {events.map((e, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, fontSize: 13, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
                      <div>{new Date(e.t).toLocaleString()}</div>
                      <div>{String(e.topic || '-')}</div>
                      <div>{String(e.type || '-')}</div>
                      <div>{String(e.series || '-')}</div>
                      <div style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{String(e.id || '-')}</div>
                    </div>
                  ))}
                </div>
              )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              padding: '12px 24px',
              borderRadius: '8px',
              backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000
            }}>
              {toast.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AutoReverse


