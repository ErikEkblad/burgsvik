# Instruktion: Lyssna på verifikationer via Fortnox WebSockets

## Syfte

Applikationen ska lyssna på verifikationer som skapas i serie R och automatiskt skapa en speglad verifikation i serie Q (debet/kredit ombytta).

## WebSocket-endpoint

```
wss://ws.fortnox.se/topics-v1
```

## Kommandon att skicka efter anslutning

Skicka dessa tre kommandon i ordning:

### 1. Registrera tenant

```json
{
  "command": "add-tenants-v1",
  "clientSecret": "<client secret>",
  "accessTokens": ["Bearer <access token>"]
}
```

### 2. Prenumerera på vouchers-topic

```json
{
  "command": "add-topics-v1",
  "topics": ["vouchers"]
}
```

### 3. Starta subscriptionen

```json
{
  "command": "subscribe-v1"
}
```

**OBS:** Enligt Fortnox officiell dokumentation ska `subscribe-v1` användas för att starta subscriptionen och börja ta emot events. Detta kommando startar strömmen av events från de topics du har prenumererat på.

## Event-format

När en verifikation skapas får ni ett event som ser ut så här:

```json
{
  "topic": "vouchers",
  "type": "voucher-created-v1",
  "tenantId": 12345,
  "year": 2025,
  "series": "R",
  "id": "123",
  "offset": "xDy7J",
  "timestamp": "2025-01-15T10:30:00+01:00"
}
```

## Affärslogik vid event

1. Filtrera på `type === "voucher-created-v1"` och `series === "R"`
2. Hämta originalverifikationen via REST API (använd `year`, `series` och `id` från eventet)
3. Skapa omvänd verifikation i serie Q där varje konteringsrad har debet/kredit ombytta

## Viktigt att tänka på

### Idempotens

Fortnox använder "at-least-once delivery" vilket betyder att duplicerade events kan förekomma. Implementera en mekanism för att hålla koll på redan hanterade verifikationer (t.ex. spara `offset` eller en kombination av `year`/`series`/`id`).

### Offset-hantering vid återanslutning

Spara senaste mottagna `offset`. Vid återanslutning kan ni skicka med offset i `add-topics-v1` för att återuppta från rätt position:

```json
{
  "command": "add-topics-v1",
  "topics": ["vouchers"],
  "offsets": {
    "vouchers": "xDy7J"
  }
}
```

Detta fungerar upp till 14 dagar bakåt.

### En anslutning per applikation

Fortnox kräver att ni samlar alla kunder i samma WebSocket-anslutning – skapa inte en anslutning per kund.

## Övriga voucher-events (för referens)

| Event | Beskrivning |
|-------|-------------|
| `voucher-created-v1` | Verifikation skapad |
| `voucher-updated-v1` | Verifikation uppdaterad |
| `voucher-deleted-v1` | Verifikation borttagen |

## Dokumentation

Officiell dokumentation: https://www.fortnox.se/developer/guides-and-good-to-know/websockets
