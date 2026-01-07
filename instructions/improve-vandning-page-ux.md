# Förbättra UX för Vändningssidan

## Bakgrund

Sidan `/vandning` (Automatisk vändning) hanterar automatisk skapning av omvända verifikat i Fortnox. När ett verifikat skapas i en trigger-serie (t.ex. R), skapas automatiskt ett omvänt verifikat i en mål-serie (t.ex. Q).

### Nuvarande problem

1. **För tekniskt** - Debug-loggen dominerar och är svår att förstå för vanliga användare
2. **Ingen visuell förklaring** - Användaren ser inte hur flödet fungerar
3. **Ingen historik** - Man ser bara "live" events, inte vad som hänt tidigare
4. **Ingen feedback-loop** - Svårt att veta om det fungerar
5. **Page reload vid sparande** - Dålig UX, förlorar state

---

## Nuvarande implementation

| Fil | Syfte |
|-----|-------|
| `web/src/settings/AutoReverse.tsx` | Huvudkomponent för sidan |
| `server/src/routes/index.ts` | API-endpoints för settings och WS-status |
| `server/src/ws/handlers.ts` | Event-hantering och vändningslogik |
| `server/src/ws/client.ts` | WebSocket-anslutning till Fortnox |
| `server/db/schema.sql` | Databasschema (settings, audit_log) |

### Befintlig audit_log-tabell

Det finns redan en `audit_log`-tabell i schemat som kan användas för historik:

```sql
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  company_id uuid references company(id) on delete set null,
  action text not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);
```

**Denna tabell används inte idag** - vi ska använda den för att logga vändningar.

---

## Förslag: Ny sidstruktur

```
┌─────────────────────────────────────────────────────────────────────┐
│  AUTOMATISK VÄNDNING                                    [Status: På]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SÅ HÄR FUNGERAR DET                                        │   │
│  │                                                              │   │
│  │   [Serie R]  ───────>  [Vändning]  ───────>  [Serie Q]      │   │
│  │                                                              │   │
│  │   När ett verifikat skapas i serie R, skapas automatiskt    │   │
│  │   ett omvänt verifikat i serie Q med datum 2025-11-01       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐    │
│  │  INSTÄLLNINGAR       │  │  SENASTE VÄNDNINGAR              │    │
│  │                      │  │                                   │    │
│  │  Aktiv: [✓]         │  │  ✅ R-20 → Q-10  (idag 08:53)    │    │
│  │                      │  │  ✅ R-19 → Q-9   (igår 14:22)    │    │
│  │  Trigger-serie:      │  │  ✅ R-18 → Q-8   (igår 09:15)    │    │
│  │  [  R  ]            │  │  ❌ R-17 (misslyckades)          │    │
│  │                      │  │                                   │    │
│  │  Mål-serie:          │  │  Visa alla →                      │    │
│  │  [  Q  ]            │  │                                   │    │
│  │                      │  └──────────────────────────────────┘    │
│  │  Vändningsdatum:     │                                          │
│  │  ○ Första i nästa    │  ┌──────────────────────────────────┐    │
│  │    månad             │  │  ANSLUTNINGSSTATUS                │    │
│  │  ○ Behåll original   │  │                                   │    │
│  │                      │  │  ● Ansluten till Fortnox          │    │
│  │  [Spara ändringar]   │  │    Lyssnar på: vouchers           │    │
│  │                      │  │    Senaste event: 2 min sedan     │    │
│  └──────────────────────┘  └──────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  HÄNDELSELOGG (Debug)                             [Visa ▼]  │   │
│  │  (Expanderbar sektion - dold som standard)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementationsplan

### Fas 1: Snabba UX-förbättringar (låg komplexitet)

#### 1.1 Göm debug-loggen bakom accordion

**Fil:** `web/src/settings/AutoReverse.tsx`

Ändra så att debug-sektionerna (Event-log, WebSocket Messages, Voucher Events) är dolda som standard och kan expanderas via en knapp.

```tsx
const [showDebug, setShowDebug] = useState(false);

// I renderingen:
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
    <div className="card-body">
      {/* Befintlig debug-innehåll */}
    </div>
  )}
</div>
```

#### 1.2 Förenklad anslutningsstatus

Ersätt den detaljerade debug-statusen med en enkel indikator:

```tsx
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
      <button onClick={handleReconnect} className="btn-secondary" style={{ marginTop: '8px' }}>
        Anslut igen
      </button>
    )}
  </div>
</div>
```

#### 1.3 Toast-notifikation istället för page reload

**Lägg till enkel toast-komponent:**

```tsx
const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

const showToast = (message: string, type: 'success' | 'error') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3000);
};

// Vid sparande:
const handleSave = async () => {
  setSaving(true);
  try {
    const res = await fetch(`${base}/api/settings`, { /* ... */ });
    if (res.ok) {
      const json = await res.json();
      setSettings(json.settings); // Uppdatera state istället för reload
      setInitial(json.settings);
      showToast('Inställningar sparade', 'success');
    } else {
      showToast('Kunde inte spara inställningar', 'error');
    }
  } finally {
    setSaving(false);
  }
};

// Toast-rendering (längst ner i komponenten):
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
```

#### 1.4 Validering med felmeddelanden

```tsx
const [errors, setErrors] = useState<{ trigger?: string; target?: string }>({});

const validate = () => {
  const newErrors: typeof errors = {};

  if (active && !triggerSeries?.trim()) {
    newErrors.trigger = 'Trigger-serie krävs när funktionen är aktiv';
  }
  if (active && !targetSeries?.trim()) {
    newErrors.target = 'Mål-serie krävs när funktionen är aktiv';
  }
  if (triggerSeries && targetSeries && triggerSeries.toUpperCase() === targetSeries.toUpperCase()) {
    newErrors.target = 'Mål-serie kan inte vara samma som trigger-serie';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

// I input-fälten:
<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
  <label style={{ fontSize: '14px', fontWeight: 500 }}>Trigger-serie</label>
  <input
    value={triggerSeries}
    onChange={(e) => {
      setTriggerSeries(e.target.value.toUpperCase());
      setErrors(prev => ({ ...prev, trigger: undefined }));
    }}
    placeholder="t.ex. R"
    style={{
      borderColor: errors.trigger ? '#ef4444' : '#d0d7de',
      width: '100px'
    }}
  />
  {errors.trigger && (
    <span style={{ color: '#ef4444', fontSize: '12px' }}>{errors.trigger}</span>
  )}
</div>
```

---

### Fas 2: Visuell förklaring (medium komplexitet)

#### 2.1 "Så här fungerar det"-sektion

Lägg till en visuell komponent överst som dynamiskt visar flödet:

```tsx
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
    );
  }

  const datumText = dateMode === 'FIRST_DAY_NEXT_MONTH'
    ? 'första dagen i nästa månad'
    : 'samma datum som originalet';

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
          {/* Trigger-box */}
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

          {/* Pil */}
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

          {/* Vändning-box */}
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

          {/* Pil */}
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

          {/* Target-box */}
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
  );
};
```

---

### Fas 3: Historik med audit_log (medium komplexitet)

Vi använder den befintliga `audit_log`-tabellen för att logga vändningar.

#### 3.1 Action-typer för audit_log

Definiera följande actions:

| Action | Beskrivning |
|--------|-------------|
| `reversal_created` | Vändning skapad framgångsrikt |
| `reversal_failed` | Vändning misslyckades |
| `reversal_skipped` | Verifikat hoppades över (fel serie) |

#### 3.2 Logga vändningar i handlers.ts

**Fil:** `server/src/ws/handlers.ts`

Lägg till loggning efter lyckad/misslyckad vändning:

```typescript
import { supabaseAdmin } from '../db/supabase';

/**
 * Loggar vändningshändelser till audit_log.
 *
 * Retentionstider:
 * - reversal_created: behålls för alltid
 * - reversal_failed: behålls för alltid (viktig för felsökning)
 * - reversal_skipped: rensas automatiskt efter 24 timmar
 */
const logReversal = async (
  companyId: string,
  action: 'reversal_created' | 'reversal_failed' | 'reversal_skipped',
  payload: {
    source_series: string;
    source_number: number;
    target_series?: string;
    target_number?: number;
    financial_year: number;
    error_message?: string;
  }
) => {
  // 1. Logga händelsen
  await supabaseAdmin.from('audit_log').insert({
    company_id: companyId,
    user_id: null, // Automatisk process, ingen användare
    action,
    payload_json: payload
  });

  // 2. Rensa gamla reversal_skipped (äldre än 24 timmar)
  //    Körs slumpmässigt ~10% av gångerna för att inte belasta varje request
  if (Math.random() < 0.1) {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('audit_log')
      .delete()
      .eq('action', 'reversal_skipped')
      .lt('created_at', cutoff24h);
  }
};
```

**Användning i handlers.ts:**

```typescript
// Efter skapande av vänt verifikat (SUCCESS):
await logReversal(companyId, 'reversal_created', {
  source_series: series,
  source_number: voucherNumber,
  target_series: targetSeries,
  target_number: result.Voucher.VoucherNumber,
  financial_year: financialYear
});

// Vid fel (FAILED):
await logReversal(companyId, 'reversal_failed', {
  source_series: series,
  source_number: voucherNumber,
  financial_year: financialYear,
  error_message: error.message
});

// Vid skip - fel serie (SKIPPED - rensas efter 24h):
await logReversal(companyId, 'reversal_skipped', {
  source_series: series,
  source_number: voucherNumber,
  financial_year: financialYear,
  error_message: `Serie ${series} matchar inte trigger-serie ${triggerSeries}`
});
```

**Hur rensningen fungerar:**

| Action | Retention | Rensning |
|--------|-----------|----------|
| `reversal_created` | För alltid | Aldrig |
| `reversal_failed` | För alltid | Aldrig |
| `reversal_skipped` | 24 timmar | Automatiskt vid ~10% av loggningar |

Detta ger:
- Full historik över lyckade och misslyckade vändningar
- Temporär loggning av skippade verifikat för debugging
- Ingen manuell cleanup behövs

#### 3.3 Nytt API-endpoint för historik

**Fil:** `server/src/routes/index.ts`

```typescript
// Hämta vändningshistorik
app.get('/api/reversals', async (req, reply) => {
  const s = getSession(req);
  if (!s) return reply.code(401).send({ ok: false, error: 'unauthorized' });

  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('id, action, payload_json, created_at')
    .eq('company_id', s.cid)
    .in('action', ['reversal_created', 'reversal_failed'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return reply.code(500).send({ ok: false, error: error.message });

  // Transformera till mer användarvänligt format
  const reversals = (data ?? []).map(row => ({
    id: row.id,
    status: row.action === 'reversal_created' ? 'success' : 'failed',
    source_series: row.payload_json?.source_series,
    source_number: row.payload_json?.source_number,
    target_series: row.payload_json?.target_series,
    target_number: row.payload_json?.target_number,
    financial_year: row.payload_json?.financial_year,
    error_message: row.payload_json?.error_message,
    created_at: row.created_at
  }));

  return { ok: true, reversals };
});
```

#### 3.4 TypeScript-typer

**Fil:** `web/src/settings/AutoReverse.tsx` (eller separat types-fil)

```typescript
type Reversal = {
  id: string;
  status: 'success' | 'failed';
  source_series: string;
  source_number: number;
  target_series?: string;
  target_number?: number;
  financial_year: number;
  error_message?: string;
  created_at: string;
};
```

#### 3.5 Frontend-komponent för historik

```tsx
const [reversals, setReversals] = useState<Reversal[]>([]);
const [loadingReversals, setLoadingReversals] = useState(true);

// Hämta historik vid mount och efter nya events
const fetchReversals = async () => {
  try {
    const res = await fetch(`${base}/api/reversals`, { credentials: 'include' });
    const json = await res.json();
    if (json.ok) setReversals(json.reversals);
  } catch (e) {
    console.error('Failed to fetch reversals', e);
  } finally {
    setLoadingReversals(false);
  }
};

useEffect(() => {
  fetchReversals();
}, []);

// Uppdatera efter nya events (polling eller trigger)
useEffect(() => {
  if (wsDebug?.lastEventAt) {
    fetchReversals();
  }
}, [wsDebug?.lastEventAt]);

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
);
```

---

## Prioritering

| Prio | Uppgift | Komplexitet | Filer |
|------|---------|-------------|-------|
| 1 | Göm debug-loggen bakom accordion | Låg | `AutoReverse.tsx` |
| 2 | Förenklad anslutningsstatus | Låg | `AutoReverse.tsx` |
| 3 | Toast istället för page reload | Låg | `AutoReverse.tsx` |
| 4 | Validering med felmeddelanden | Låg | `AutoReverse.tsx` |
| 5 | "Så här fungerar det"-visualisering | Medium | `AutoReverse.tsx` |
| 6 | Logga vändningar till audit_log | Låg | `handlers.ts` |
| 7 | API-endpoint för historik | Låg | `routes/index.ts` |
| 8 | Historik-komponent i frontend | Medium | `AutoReverse.tsx` |

---

## Hjälpfunktioner

```typescript
// Formatera tid relativt (t.ex. "2 min sedan")
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just nu';
  if (diffMin === 1) return '1 minut sedan';
  if (diffMin < 60) return `${diffMin} minuter sedan`;
  if (diffHour === 1) return '1 timme sedan';
  if (diffHour < 24) return `${diffHour} timmar sedan`;
  if (diffDay === 1) return 'igår';
  if (diffDay < 7) return `${diffDay} dagar sedan`;

  // Fallback till datum
  return date.toLocaleDateString('sv-SE');
};
```

---

## Layout-förslag för hela sidan

```tsx
return (
  <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
    <h1 style={{ marginBottom: '24px' }}>Automatisk vändning</h1>

    {/* Flödesförklaring - alltid synlig */}
    <FlowExplanation />

    {/* Två-kolumns layout */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)',
      gap: '24px',
      marginTop: '24px'
    }}>
      {/* Vänster kolumn: Inställningar + Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <SettingsCard />
        <ConnectionStatus />
      </div>

      {/* Höger kolumn: Historik */}
      <ReversalHistory />
    </div>

    {/* Debug-sektion - gömd som standard */}
    <div style={{ marginTop: '24px' }}>
      <DebugSection />
    </div>

    {/* Toast */}
    {toast && <Toast message={toast.message} type={toast.type} />}
  </div>
);
```

---

## Testning

### Manuell testning

1. **Grundläggande flöde:**
   - Aktivera vändning med serie R → Q
   - Skapa verifikat i Fortnox serie R
   - Verifiera att vändning skapas och visas i historiken

2. **Felhantering:**
   - Testa med ogiltig/utgången token
   - Verifiera att fel loggas och visas korrekt

3. **UX:**
   - Debug-sektionen är dold som standard
   - Toast visas vid sparande (inget page reload)
   - Validering hindrar sparande utan serier
   - Historiken uppdateras automatiskt efter nya vändningar

### Kontrollista

- [ ] Flödesdiagrammet visar korrekta serier
- [ ] Inställningar sparas utan page reload
- [ ] Toast-notifikation visas vid sparande
- [ ] Validering fungerar (tomma fält, samma serie)
- [ ] Anslutningsstatus visar rätt tillstånd
- [ ] Historiken visar lyckade och misslyckade vändningar
- [ ] Debug-loggen kan expanderas/kollapsas
- [ ] Sidan fungerar responsivt på mindre skärmar
