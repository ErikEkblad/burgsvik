import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom'
import React from 'react'
import AutoReverse from './settings/AutoReverse'
import { BackofficeLogin } from './pages/BackofficeLogin'
import { BackofficeDashboard } from './pages/BackofficeDashboard'
import { BookingModal, type BookingStatus } from './components/BookingModal'
import './style.css'

// Connect-sidan tas bort – inloggning sker direkt från startsidan

const SidebarLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <NavLink
    to={to}
    style={({ isActive }) => ({
      display: 'block',
      padding: '10px 12px',
      textDecoration: 'none',
      color: isActive ? '#0b1f33' : '#334155',
      background: isActive ? '#e6f4ff' : 'transparent',
      borderRadius: 6,
      marginBottom: 6
    })}
  >
    {children}
  </NavLink>
)

const SidebarLayout: React.FC = () => {
  const api = (import.meta.env.VITE_API_BASE_URL || '')
  const [me, setMe] = React.useState<any>(null)
  
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${api}/api/me`, { credentials: 'include' })
        if (res.status === 401) { setMe(null); setLoading(false); return }
        const json = await res.json()
        setMe(json)
        
      } catch {
        setMe(null)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [api])

  const handleLogout = async () => {
    await fetch(`${api}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Laddar…</div>
  }

  if (!me?.ok) {
    // Kolla om det finns felmeddelande i URL
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    const message = params.get('message')
    const hasError = error === 'company_not_allowed' || error === 'missing_database_number'

    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <div
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #0b1f33 0%, #1e3a8a 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: 0.5 }}>Burgsvik</div>
        </div>
        <div
          style={{
            flex: 1,
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px'
          }}
        >
          {hasError && message && (
            <div style={{
              background: '#fff1f0',
              border: '1px solid #ffa39e',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              maxWidth: '400px',
              width: '100%'
            }}>
              <div style={{ color: '#cf1322', fontWeight: 600, marginBottom: '8px' }}>Åtkomst nekad</div>
              <div style={{ color: '#434343', fontSize: '14px' }}>{decodeURIComponent(message)}</div>
            </div>
          )}
          <button
            onClick={() => {
              // Rensa URL-parametrar innan redirect
              window.history.replaceState({}, '', window.location.pathname)
              const state = encodeURIComponent(JSON.stringify({}))
              const base = import.meta.env.VITE_API_BASE_URL || ''
              window.location.href = `${base}/api/auth/fortnox/start?state=${state}`
            }}
            style={{ padding: '12px 18px', borderRadius: 8, border: '1px solid #d0d7de', background: '#0ea5e9', color: '#fff', fontSize: 16, boxShadow: '0 4px 10px rgba(0,0,0,0.08)', cursor: 'pointer' }}
          >
            Logga in
          </button>
        </div>
      </div>
    )
  }

  const companyName = me?.company?.name || me?.company?.id || 'Företag'
  const userLine = me?.user?.name || me?.user?.email || me?.user?.external_id || me?.user?.id

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ 
        width: 260, 
        padding: 16, 
        borderRight: '1px solid #eee', 
        background: '#fafafa', 
        display: 'flex', 
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        maxHeight: '95vh',
        overflowY: 'auto'
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{companyName}</div>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>{userLine}</div>
        
        <div style={{ flex: 1, minHeight: 0 }}>
          <SidebarLink to="/txt">TXT till Verifikat</SidebarLink>
          <SidebarLink to="/vandning">Automatisk vändning</SidebarLink>
        </div>
        <button onClick={handleLogout} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d0d7de', background: '#ef4444', color: '#fff', marginTop: 'auto', flexShrink: 0 }}>Logga ut</button>
      </aside>
      <main style={{ flex: 1, padding: 20, overflow: 'auto', background: '#f6f8fa' }}>
        <Outlet />
      </main>
    </div>
  )
}

const TxtToVoucher: React.FC = () => {
  const api = (import.meta.env.VITE_API_BASE_URL || '')
  const [content, setContent] = React.useState('')
  const [series, setSeries] = React.useState('A')
  const [date, setDate] = React.useState(new Date().toISOString().slice(0,10))
  const [desc, setDesc] = React.useState('')
  const [preview, setPreview] = React.useState<any>(null)
  const [userEditedDate, setUserEditedDate] = React.useState(false)
  const [userEditedDesc, setUserEditedDesc] = React.useState(false)
  const [bookingStatus, setBookingStatus] = React.useState<BookingStatus | null>(null)

  const doPreview = async () => {
    if (!content || content.trim().length === 0) { setPreview(null); return }
    const res = await fetch(`${api}/api/vouchers/txt/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ voucherSeries: series, transactionDate: date, description: desc, content })
    })
    const json = await res.json()
    if (json.inferredDate && !userEditedDate) setDate(json.inferredDate)
    if (json.inferredDescription && !userEditedDesc) setDesc(json.inferredDescription)
    setPreview(json)
  }

  React.useEffect(() => {
    const t = setTimeout(() => { doPreview() }, 400)
    return () => clearTimeout(t)
  }, [content])

  const doBook = async () => {
    setBookingStatus({ type: 'loading' })
    try {
      const res = await fetch(`${api}/api/vouchers/txt/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ voucherSeries: series, transactionDate: date, description: desc, content })
      })
      const json = await res.json()
      
      if (json.ok && json.voucher?.Voucher) {
        setBookingStatus({
          type: 'success',
          voucherSeries: json.voucher.Voucher.VoucherSeries || series,
          voucherNumber: json.voucher.Voucher.VoucherNumber || 0
        })
      } else {
        setBookingStatus({
          type: 'error',
          message: json.message || 'Okänt fel vid bokföring',
          fortnoxMessage: json.details?.ErrorInformation?.message,
          details: json.details
        })
      }
    } catch (err: any) {
      setBookingStatus({
        type: 'error',
        message: err.message || 'Nätverksfel vid bokföring',
        details: err
      })
    }
  }

  const sumD = preview?.rows?.reduce((s: number, r: any) => s + (r.debit || 0), 0) ?? 0
  const sumC = preview?.rows?.reduce((s: number, r: any) => s + (r.credit || 0), 0) ?? 0
  const isBalanced = preview?.rows && Math.abs(sumD - sumC) < 0.0001

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <BookingModal status={bookingStatus} onClose={() => setBookingStatus(null)} />
      
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ 
          margin: 0, 
          marginBottom: 8,
          fontSize: 32,
          fontWeight: 700,
          color: '#0b1f33',
          letterSpacing: '-0.02em'
        }}>
          TXT till Verifikat
        </h1>
        <p style={{ 
          margin: 0,
          fontSize: 16,
          color: '#64748b',
          fontWeight: 400
        }}>
          Konvertera textfiler till verifikationer i Fortnox
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Input Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
          padding: 24,
          position: 'sticky',
          top: 20
        }}>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ 
              margin: 0,
              marginBottom: 20,
              fontSize: 18,
              fontWeight: 600,
              color: '#0b1f33'
            }}>
              Verifikationsinställningar
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#334155'
                }}>
                  Verifikationsserie
                </label>
                <input 
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 14,
                    color: '#0b1f33',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  value={series} 
                  onChange={e => setSeries(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0ea5e9'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#334155'
                }}>
                  Transaktionsdatum
                </label>
                <input 
                  type="date"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 14,
                    color: '#0b1f33',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  value={date} 
                  onChange={e => { setDate(e.target.value); setUserEditedDate(true) }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0ea5e9'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#334155'
                }}>
                  Beskrivning
                </label>
                <input 
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 14,
                    color: '#0b1f33',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  value={desc} 
                  onChange={e => { setDesc(e.target.value); setUserEditedDesc(true) }}
                  placeholder="Beskrivning av verifikationen"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0ea5e9'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#334155'
                }}>
                  TXT-innehåll
                </label>
                <textarea 
                  style={{
                    width: '100%',
                    minHeight: 280,
                    padding: '12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 13,
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                    color: '#0b1f33',
                    resize: 'vertical',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                    lineHeight: 1.6
                  }}
                  value={content} 
                  onChange={e => setContent(e.target.value)}
                  placeholder="Klistra in eller skriv TXT-innehåll här..."
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0ea5e9'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>
          </div>
          
          {!isBalanced && preview?.rows && (
            <div style={{
              marginTop: 20,
              padding: '12px 16px',
              background: '#fff1f0',
              border: '1px solid #ffccc7',
              borderRadius: 8,
              color: '#cf1322',
              fontSize: 14,
              fontWeight: 500
            }}>
              ⚠️ Obalans: Debet {sumD.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} ≠ Kredit {sumC.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* Preview Card */}
        <div>
          {preview && preview.rows ? (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
              padding: 24,
              overflow: 'hidden'
            }}>
              {/* Header med status och knapp */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
                paddingBottom: 20,
                borderBottom: '2px solid #f1f5f9'
              }}>
                <div>
                  <h3 style={{ 
                    margin: 0,
                    marginBottom: 8,
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#0b1f33'
                  }}>
                    Förhandsvisning
                  </h3>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: isBalanced ? '#f0fdf4' : '#fff1f0',
                    border: isBalanced ? '1px solid #86efac' : '1px solid #fca5a5',
                    fontSize: 13,
                    fontWeight: 500,
                    color: isBalanced ? '#166534' : '#991b1b'
                  }}>
                    {isBalanced ? (
                      <>
                        <span style={{ fontSize: 16 }}>✓</span>
                        <span>Balans OK</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 16 }}>✕</span>
                        <span>Obalans: {Math.abs(sumD - sumC).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}</span>
                      </>
                    )}
                  </div>
                </div>
                
                {isBalanced && preview?.rows ? (
                  <button 
                    onClick={doBook}
                    style={{ 
                      padding: '12px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(34, 197, 94, 0.3), 0 2px 4px -1px rgba(34, 197, 94, 0.2)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(34, 197, 94, 0.4), 0 4px 6px -2px rgba(34, 197, 94, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(34, 197, 94, 0.3), 0 2px 4px -1px rgba(34, 197, 94, 0.2)'
                    }}
                  >
                    <span>Bokför verifikat</span>
                    <span style={{ fontSize: 16 }}>→</span>
                  </button>
                ) : (
                  <button 
                    disabled
                    style={{ 
                      padding: '12px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#f1f5f9',
                      color: '#94a3b8',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'not-allowed'
                    }}
                  >
                    Bokför verifikat
                  </button>
                )}
              </div>

              {/* Tabell */}
              <div style={{ overflowX: 'auto', borderRadius: 8 }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '14px 16px' }}>Kostnadsställe</th>
                      <th style={{ padding: '14px 16px' }}>Konto</th>
                      <th className="cell-right" style={{ padding: '14px 16px' }}>Debet</th>
                      <th className="cell-right" style={{ padding: '14px 16px' }}>Kredit</th>
                      <th style={{ padding: '14px 16px' }}>Beskrivning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ padding: '12px 16px', color: r.costCenter ? '#0b1f33' : '#94a3b8' }}>
                          {r.costCenter || '-'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0b1f33' }}>
                          {r.account}
                        </td>
                        <td className="cell-right" style={{ 
                          padding: '12px 16px',
                          fontWeight: r.debit > 0 ? 600 : 400,
                          color: r.debit > 0 ? '#0b1f33' : '#94a3b8',
                          fontFamily: 'ui-monospace, monospace'
                        }}>
                          {r.debit > 0 ? r.debit.toLocaleString('sv-SE', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="cell-right" style={{ 
                          padding: '12px 16px',
                          fontWeight: r.credit > 0 ? 600 : 400,
                          color: r.credit > 0 ? '#0b1f33' : '#94a3b8',
                          fontFamily: 'ui-monospace, monospace'
                        }}>
                          {r.credit > 0 ? r.credit.toLocaleString('sv-SE', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', color: r.description ? '#0b1f33' : '#94a3b8' }}>
                          {r.description || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ 
                        padding: '16px',
                        fontWeight: 700,
                        fontSize: 15,
                        color: '#0b1f33',
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0'
                      }}>
                        Summa
                      </td>
                      <td className="cell-right" style={{ 
                        padding: '16px',
                        fontWeight: 700,
                        fontSize: 15,
                        color: '#0b1f33',
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0',
                        fontFamily: 'ui-monospace, monospace'
                      }}>
                        {sumD.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="cell-right" style={{ 
                        padding: '16px',
                        fontWeight: 700,
                        fontSize: 15,
                        color: '#0b1f33',
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0',
                        fontFamily: 'ui-monospace, monospace'
                      }}>
                        {sumC.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ 
                        padding: '16px',
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0'
                      }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div style={{
              background: '#ffffff',
              border: '2px dashed #cbd5e1',
              borderRadius: 12,
              padding: 64,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📄</div>
              <div style={{ 
                fontSize: 16, 
                color: '#64748b',
                fontWeight: 500,
                marginBottom: 4
              }}>
                Ingen förhandsvisning
              </div>
              <div style={{ 
                fontSize: 14, 
                color: '#94a3b8'
              }}>
                Skriv eller klistra in TXT-innehåll för att se förhandsvisning
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<SidebarLayout />}>
        <Route path="/" element={<TxtToVoucher />} />
        <Route path="/txt" element={<TxtToVoucher />} />
        <Route path="/vandning" element={<AutoReverse />} />
      </Route>
      {/* Backoffice routes - separata från SidebarLayout */}
      <Route path="/backoffice/login" element={<BackofficeLogin />} />
      <Route path="/backoffice" element={<BackofficeDashboard />} />
    </Routes>
  </BrowserRouter>
)

const root = createRoot(document.getElementById('app')!)
root.render(<App />)


