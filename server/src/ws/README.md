# WebSocket-klient för Fortnox

Denna modul implementerar WebSocket-anslutning till Fortnox för att lyssna på verifikationer och automatiskt skapa omvända verifikationer.

## Struktur

- `client.ts` - Huvudklient med WebSocket-anslutning och protokollhantering
- `handlers.ts` - Event-hantering för voucher-created events
- `db.ts` - Databashelpers för offset och idempotens
- `mapping.ts` - Mapping mellan Fortnox tenantId och company_id

## Protokoll

WebSocket-protokollet följer Fortnox specifikation:

1. Anslut till `wss://ws.fortnox.se/topics-v1`
2. Skicka `add-tenants-v1` med `clientSecret` och `accessTokens`
3. Skicka `add-topics-v1` med `topics: ["vouchers"]` (och eventuellt `offsets`)
4. Skicka `subscribe-v1` för att starta subscriptionen och börja ta emot events

## Idempotens

Systemet använder `event_dedupe`-tabellen för att undvika dubbletter. Varje event kontrolleras mot kombinationen `(company_id, topic, event_offset)` innan hantering.

## Offset-hantering

Senaste offset sparas i `ws_offset`-tabellen per company och topic. Vid återanslutning skickas offset med i `add-topics-v1` för att återuppta från rätt position (fungerar upp till 14 dagar bakåt).

## Tenant-mapping

WebSocket-events innehåller `tenantId` från Fortnox, men applikationen behöver `company_id`. Mapping sker via:
- `add-tenants-v1` response som innehåller `tenantIds`
- In-memory cache för snabb lookup
- Eventuell matchning via `external_db_number` i company-tabellen

## Verifikationsvändning

När en verifikation skapas i serie R (eller annan konfigurerad trigger-serie):
1. Event tas emot via WebSocket
2. Originalverifikationen hämtas via REST API
3. Omvänd verifikation skapas med:
   - Serie ändrad till target-serie (t.ex. Q)
   - Debet/kredit ombytta på varje rad
   - Datum enligt `auto_reverse_date_mode`:
     - `FIRST_DAY_NEXT_MONTH`: Första dagen i nästa månad
     - `DATE_IN_COMMENT`: Extraherat från kommentar om möjligt

## API

- `startVoucherWs(sessions)` - Starta WebSocket för sessions
- `addCurrentTenantToWs(uid, cid)` - Lägg till aktuell tenant
- `getWsStatus()` - Hämta status
- `getWsDebug()` - Hämta debug-information
- `stopWs()` - Stoppa WebSocket

