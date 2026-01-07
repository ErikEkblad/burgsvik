## Scripts
- dev: tsx watch src/app.ts (lyssnar på port 3002 som standard)
- build: tsc
- start: node dist/app.js

### Start och portar
- Servern använder `PORT` från `.env`. Default är `3002`.
- Startar på `0.0.0.0:PORT`.
- Enkel instans‑låsning används via temp‑katalogen. Om en instans redan kör: ny start avslutas direkt.
- Vid `EADDRINUSE` (port upptagen) loggas fel och processen stängs ned kontrollerat.

## Databas
SQL-schema i db/schema.sql och seed i db/seed.sql. Kör dem i Supabase.

## TXT → Verifikat

- POST `/api/vouchers/txt/preview` `{ voucherSeries, transactionDate?, description?, content }` – Returnerar tolkade rader och Fortnox‑payload (förhandsvisning).
- POST `/api/vouchers/txt/book` `{ voucherSeries, transactionDate?, description?, content }` – Skapar verifikat i Fortnox.

Radbeskrivning: Varje verifikatrad får fältet `Description`. Om en rad saknar egen beskrivning från `content` används verifikatets övergripande `description`.

## WebSocket (Automatisk vändning)

WebSocket-klienten lyssnar på verifikationer från Fortnox och skapar automatiskt omvända verifikationer enligt konfigurerade inställningar.

- GET `/api/ws/status` – Returnerar `{ connected, tenants, topicsAdded }` samt `debug`.
- POST `/api/ws/add-current` – Lägger till aktuell tenant i WS och startar prenumeration om
  och endast om inställningen `auto_reverse_active` är `true` för användare/företag i sessionen.
  Om inaktiv returneras `skipped: true` och WS stoppas.

- PUT `/api/settings` – När `auto_reverse_active` sätts till `false` stoppas WS på servern.

### WebSocket-protokoll

Klienten följer Fortnox WebSocket-specifikation:
1. Ansluter till `wss://ws.fortnox.se/topics-v1`
2. Skickar `add-tenants-v1` med `clientSecret` och `accessTokens`
3. Skickar `add-topics-v1` med `topics: ["vouchers"]` (och eventuellt `offsets` för återanslutning)
4. Skickar `start-v1` för att starta strömmen

### Automatisk vändning

När en verifikation skapas i trigger-serie (t.ex. R):
1. Event tas emot via WebSocket
2. Originalverifikationen hämtas via REST API
3. Omvänd verifikation skapas med:
   - Serie ändrad till target-serie (t.ex. Q)
   - Debet/kredit ombytta på varje rad
   - Datum enligt `auto_reverse_date_mode`

### Idempotens och offset-hantering

- Varje event kontrolleras mot `event_dedupe`-tabellen för att undvika dubbletter
- Senaste offset sparas i `ws_offset`-tabellen per company och topic
- Vid återanslutning skickas offset med för att återuppta från rätt position (fungerar upp till 14 dagar bakåt)

Flöde:
1) Servern slår upp räkenskapsår via `GET /3/financialyears?date=YYYY-MM-DD`.
2) Tar `Id` från träffen.
3) Anropar SIE med `GET /3/sie/{type}?financialYear={Id}` med Accept som hanterar stream.