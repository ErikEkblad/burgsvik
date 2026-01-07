import React from 'react'

export type BookingStatus = 
  | { type: 'loading' }
  | { type: 'success'; voucherSeries: string; voucherNumber: number }
  | { type: 'error'; message: string; fortnoxMessage?: string; details?: any }

type BookingModalProps = {
  status: BookingStatus | null
  onClose: () => void
}

export const BookingModal: React.FC<BookingModalProps> = ({ status, onClose }) => {
  if (!status) return null

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status?.type !== 'loading') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [status, onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && status.type !== 'loading') {
      onClose()
    }
  }

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          maxWidth: 500,
          width: '100%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          position: 'relative'
        }}
      >
        {status.type !== 'loading' && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
              lineHeight: 1,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f1f5f9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            ×
          </button>
        )}

        {status.type === 'loading' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '4px solid #e5e7eb',
                borderTop: '4px solid #0ea5e9',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
              }}
            />
            <div style={{ fontSize: 16, fontWeight: 500, color: '#334155' }}>
              Verifikatet skapas
            </div>
          </div>
        )}

        {status.type === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#e6ffed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <div style={{ fontSize: 32, color: '#22c55e' }}>✓</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
              Verifikatet skapades
            </div>
            <div style={{ fontSize: 16, color: '#64748b', marginBottom: 24 }}>
              Verifikationsnummer: <strong style={{ color: '#0b1f33' }}>
                {status.voucherSeries}-{status.voucherNumber}
              </strong>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#0ea5e9',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Stäng
            </button>
          </div>
        )}

        {status.type === 'error' && (
          <div style={{ padding: '8px 0' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#fff1f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <div style={{ fontSize: 32, color: '#ef4444' }}>✕</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#334155', marginBottom: 12, textAlign: 'center' }}>
              Fel vid bokföring
            </div>
            <div
              style={{
                background: '#fff1f0',
                border: '1px solid #ffa39e',
                borderRadius: 6,
                padding: 12,
                marginBottom: 16
              }}
            >
              {status.message && (
                <div style={{ color: '#cf1322', marginBottom: status.fortnoxMessage ? 8 : 0 }}>
                  {status.message}
                </div>
              )}
              {status.fortnoxMessage && (
                <div style={{ color: '#cf1322', fontSize: 14, marginTop: status.message ? 8 : 0 }}>
                  <strong>Fortnox:</strong> {status.fortnoxMessage}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Stäng
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

