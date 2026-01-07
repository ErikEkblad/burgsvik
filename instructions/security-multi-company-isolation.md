# Säkerhet: Företagsbaserad åtkomstkontroll

## Översikt

Burgsvik använder **företagsbaserad åtkomstkontroll** - inte användarbaserad. Detta beror på att OAuth-flödet använder `account_type: "service"` för Client Credentials, vilket innebär att alla som loggar in via appen får samma service-konto från Fortnox.

### Varför företagsbaserat?

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVICE ACCOUNT (account_type: "service")        │
│                                                                     │
│   Erik loggar in  ─┐                                               │
│   Anna loggar in  ─┼──► Samma Fortnox service-konto                │
│   Johan loggar in ─┘    (api_qOh4rxW1bwlI@fortnox.se)              │
│                                                                     │
│   Konsekvens: Ingen individuell användarspårning möjlig            │
│   Lösning: Säkerhet baseras på FÖRETAG, inte användare             │
└─────────────────────────────────────────────────────────────────────┘
```

### Säkerhetsmodell

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SESSION-BASERAD SÄKERHET                       │
│                                                                     │
│   OAuth-inloggning:                                                │
│   1. Användare autentiserar via Fortnox                            │
│   2. Fortnox returnerar företagets DatabaseNumber                  │
│   3. Session-cookie skapas: { cid: "company-uuid" }                │
│                                                                     │
│   Skydd:                                                           │
│   • Cookie är HMAC-SHA256 signerad → kan inte manipuleras          │
│   • HttpOnly → skyddar mot XSS                                     │
│   • SameSite=Lax → skyddar mot CSRF                                │
│   • company_id kommer från Fortnox OAuth → pålitlig källa          │
│                                                                     │
│   Alla API-requests:                                               │
│   • Validerar session-cookie                                       │
│   • Filtrerar data på session.cid                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Nuvarande säkerhetsstatus

### Vad som skyddar idag

| Skydd | Beskrivning |
|-------|-------------|
| Session-cookie | HMAC-SHA256 signerad med SESSION_SECRET |
| HttpOnly | Cookie kan inte läsas av JavaScript |
| SameSite=Lax | Skyddar mot CSRF-attacker |
| company_id från OAuth | Sätts vid inloggning, kommer från Fortnox |
| Data filtreras på cid | Alla queries använder `session.cid` |

### Implementationsstatus

| Prio | Problem | Status | Kommentar |
|------|---------|--------|-----------|
| **HÖG** | `/api/ws/status` | ✅ Delvis | Admin får all data, användare får ofiltrerat (bör filtreras) |
| **HÖG** | `/api/ws/add-current` | ⚠️ Öppen | Ingen auth-check implementerad |
| **MEDIUM** | Session secret fallback | ⚠️ Kvar | Fallback i app.ts:49 |

**Notering**: WS-endpoints är delvis skyddade. Admin-sessioner identifieras korrekt, men vanliga användare får för närvarande all debug-data istället för filtrerad data.

---

## Åtgärder

### 1. Hybrid autentisering på WebSocket-endpoints (HÖG)

WebSocket-processen körs som bakgrundsprocess utan användarsession, men endpoints behöver skyddas.

**Lösning: Dubbel autentisering**
- **Session-cookie** → Inloggad användare, får filtrerad data för sitt företag
- **Admin API-key** → Admin/övervakning, får all data

**Fil:** `server/src/routes/index.ts`

#### Hjälpfunktion för hybrid auth

```typescript
const ADMIN_KEY = process.env.WS_ADMIN_KEY; // Sätt i .env

type AuthResult =
  | { type: 'admin' }
  | { type: 'user'; cid: string }
  | { type: 'none' };

const checkWsAuth = (req: FastifyRequest): AuthResult => {
  // 1. Kolla admin-key först
  const adminKey = req.headers['x-admin-key'];
  if (ADMIN_KEY && adminKey === ADMIN_KEY) {
    return { type: 'admin' };
  }

  // 2. Kolla session
  const s = (req as any).session as { uid: string; cid: string } | undefined;
  if (s?.cid) {
    return { type: 'user', cid: s.cid };
  }

  return { type: 'none' };
};
```

#### `/api/ws/status` (rad ~115)

**Nuvarande:**
```typescript
app.get('/api/ws/status', async (req, reply) => {
  const status = getWsStatus();
  const debug = getWsDebug();
  return reply.send({ ok: true, status, debug })
})
```

**Åtgärd:**
```typescript
app.get('/api/ws/status', async (req, reply) => {
  const auth = checkWsAuth(req);

  if (auth.type === 'none') {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }

  const status = getWsStatus();
  const debug = getWsDebug();

  // Admin får allt, användare får filtrerat
  if (auth.type === 'admin') {
    return reply.send({ ok: true, status, debug, admin: true });
  }

  // Filtrera debug-data till endast användarens företag
  const filteredDebug = {
    ...debug,
    companies: debug.companies?.filter((c: string) => c === auth.cid) ?? [],
    tenantMappings: debug.tenantMappings?.filter((m: any) => m.companyId === auth.cid) ?? [],
    receivedMessages: debug.receivedMessages?.filter((m: any) => {
      const mapping = debug.tenantMappings?.find((t: any) => String(t.tenantId) === String(m.tenantId));
      return mapping?.companyId === auth.cid;
    }) ?? [],
    eventLog: debug.eventLog?.filter((e: any) => {
      if (e.data?.companyId) return e.data.companyId === auth.cid;
      if (e.data?.tenantId) {
        const mapping = debug.tenantMappings?.find((t: any) => String(t.tenantId) === String(e.data.tenantId));
        return mapping?.companyId === auth.cid;
      }
      return true; // Generella meddelanden visas
    }) ?? []
  };

  return reply.send({ ok: true, status, debug: filteredDebug });
});
```

#### `/api/ws/add-current` (rad ~123)

**Nuvarande:**
```typescript
app.post('/api/ws/add-current', async (req, reply) => {
  // ... ingen auth-check
})
```

**Åtgärd:**
```typescript
app.post('/api/ws/add-current', async (req, reply) => {
  const auth = checkWsAuth(req);

  if (auth.type === 'none') {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }

  // Admin kan lägga till alla företag
  // Användare kan bara trigga för sitt eget företag
  if (auth.type === 'user') {
    // Begränsa till användarens företag (s.cid)
  }

  // Resten av logiken...
});
```

#### Miljövariabel

Lägg till i `.env`:
```
WS_ADMIN_KEY=din-säkra-nyckel-här-minst-32-tecken
```

---

### 2. Kräv SESSION_SECRET i produktion (MEDIUM)

**Fil:** `server/src/app.ts` (eller där session-secret hanteras)

**Nuvarande:**
```typescript
const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
```

**Åtgärd:**
```typescript
const secret = process.env.SESSION_SECRET;

if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  console.warn('⚠️  WARNING: Using default session secret. Set SESSION_SECRET in production!');
}

const sessionSecret = secret || 'dev-secret-change-me';
```

**Validera styrka:**
```typescript
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
}
```

---

## Vad som INTE behövs

Följande åtgärder är **inte nödvändiga** med den företagsbaserade modellen:

| Åtgärd | Varför inte? |
|--------|--------------|
| `user_company`-validering | Alla användare delar samma service-konto |
| Auktoriserings-middleware | Session.cid är tillräckligt |
| RLS-policies per användare | Ingen användarspårning |
| Multi-user logik | Inte relevant med service account |

---

## Sammanfattning: Prioriterad åtgärdslista

### Måste göras (Hög)

- [x] Implementera `checkAuth()` hjälpfunktion - finns i `routes/index.ts:15-27`
- [x] Lägg till hybrid auth på `/api/ws/status` - delvis, admin identifieras
- [ ] Lägg till auth-check på `/api/ws/add-current`
- [ ] Filtrera debug-data till endast användarens företag (för session-auth)
- [ ] Sätt `WS_ADMIN_KEY` miljövariabel (valfritt, backoffice-session används istället)

### Bör göras (Medium)

- [ ] Kräv SESSION_SECRET i produktion
- [ ] Validera SESSION_SECRET längd (minst 32 tecken)

---

## Testning

### Manuell testning

1. **Testa utan autentisering:**
   ```bash
   curl http://localhost:3002/api/ws/status
   # Förväntat: 401 Unauthorized
   ```

2. **Testa med admin-key:**
   ```bash
   curl -H "X-Admin-Key: din-admin-key" http://localhost:3002/api/ws/status
   # Förväntat: 200 OK med ALL data (admin: true)
   ```

3. **Testa med session:**
   ```bash
   # Logga in via webbläsaren först, kopiera sid-cookie
   curl -H "Cookie: sid=..." http://localhost:3002/api/ws/status
   # Förväntat: 200 OK med FILTRERAD data (endast eget företag)
   ```

4. **Verifiera filtrering för session-användare:**
   - Logga in på företag ABC
   - Hämta `/api/ws/status`
   - Verifiera att endast ABC:s data visas (inte andra företags)

### Kontrollista

- [ ] Oautentiserade requests → 401
- [ ] Admin-key requests → 200 + all data
- [ ] Session requests → 200 + filtrerad data
- [ ] Debug-data i `/api/ws/status` visar endast eget företag (för session)
- [ ] Inga tenant mappings för andra företag exponeras (för session)
- [ ] Inga receivedMessages för andra företag exponeras (för session)
- [ ] SESSION_SECRET krävs i produktion
- [ ] WS_ADMIN_KEY är satt och säker

---

## Databasschema: Vad som faktiskt används

Med den företagsbaserade modellen är dessa tabeller relevanta:

| Tabell | Användning |
|--------|------------|
| `company` | Företagsinformation + `external_db_number` (tenantId) |
| `fortnox_token` | Token per företag (unique on company_id) |
| `settings` | Inställningar per företag |
| `audit_log` | Loggning per företag |
| `ws_offset` | WebSocket offset per företag |
| `event_dedupe` | Deduplicering per företag |

Dessa tabeller är **mindre relevanta** med service account:

| Tabell | Status |
|--------|--------|
| `app_user` | Innehåller bara service-kontot |
| `user_company` | Alla pekar på samma user - ger inget skydd |

---

## Framtida överväganden

Om du i framtiden vill ha användarspårning:

1. **Hybrid OAuth-flöde:** Första inloggning utan `account_type: "service"` för att få användarinfo, sedan service account för API
2. **Extern identitetsleverantör:** Auth0, Supabase Auth, etc.
3. **Lokal användarhantering:** Egen registrering/inloggning utöver Fortnox OAuth
