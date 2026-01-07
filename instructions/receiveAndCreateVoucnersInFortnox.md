# Fortnox API: Hämta och skapa verifikationer

## Viktigt om verifikationsnycklar

En verifikation i Fortnox identifieras unikt av **tre värden**:

| Nyckel | Beskrivning | Exempel |
|--------|-------------|---------|
| `VoucherSeries` | Verifikationsserie | `"R"` |
| `VoucherNumber` | Verifikationsnummer | `123` |
| `financialyear` | Räkenskapsårets ID | `2` |

**OBS:** `financialyear` är inte årtal (t.ex. 2025), utan ett internt ID som Fortnox tilldelar varje räkenskapsår. Hämta rätt ID via `/3/financialyears`.

---

## Hämta en specifik verifikation

### Endpoint

```
GET /3/vouchers/{VoucherSeries}/{VoucherNumber}?financialyear={financialyear}
```

### Exempel

För att hämta verifikation R-123 i räkenskapsår med ID 2:

```
GET https://api.fortnox.se/3/vouchers/R/123?financialyear=2
```

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Svarsformat

```json
{
  "Voucher": {
    "VoucherSeries": "R",
    "VoucherNumber": 123,
    "Year": 2,
    "TransactionDate": "2025-01-15",
    "Description": "Beskrivning av verifikationen",
    "VoucherRows": [
      {
        "Account": 1930,
        "Debit": 1000.00,
        "Credit": 0.00
      },
      {
        "Account": 3000,
        "Debit": 0.00,
        "Credit": 1000.00
      }
    ]
  }
}
```

---

## Skapa en ny verifikation

### Endpoint

```
POST /3/vouchers?financialyear={financialyear}
```

### Exempel

För att skapa en verifikation i serie Q:

```
POST https://api.fortnox.se/3/vouchers?financialyear=2
```

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Request body

```json
{
  "Voucher": {
    "VoucherSeries": "Q",
    "TransactionDate": "2025-01-15",
    "Description": "Omvänd kontering av R-123",
    "VoucherRows": [
      {
        "Account": 1930,
        "Debit": 0.00,
        "Credit": 1000.00
      },
      {
        "Account": 3000,
        "Debit": 1000.00,
        "Credit": 0.00
      }
    ]
  }
}
```

### Svarsformat

Vid lyckad skapning (HTTP 201) returneras den skapade verifikationen med tilldelat `VoucherNumber`.

---

## Flöde för att skapa omvänd verifikation

### 1. Ta emot WebSocket-event

```json
{
  "type": "voucher-created-v1",
  "series": "R",
  "id": "123",
  "year": 2
}
```

### 2. Hämta originalverifikationen

```
GET https://api.fortnox.se/3/vouchers/R/123?financialyear=2
```

### 3. Bygg omvänd verifikation

För varje rad i `VoucherRows`: byt plats på `Debit` och `Credit`.

### 4. Skapa ny verifikation i serie Q

```
POST https://api.fortnox.se/3/vouchers?financialyear=2
```

Med body där `VoucherSeries` är `"Q"` och raderna har omvända belopp.

---

## Vanliga fel

| Problem | Orsak | Lösning |
|---------|-------|---------|
| 404 Not Found | Fel serie, nummer eller financialyear | Verifiera alla tre parametrar |
| 400 Bad Request | Felaktigt request body-format | Kontrollera att `Voucher`-objektet är korrekt strukturerat |
| Fel räkenskapsår | Använder årtal istället för ID | Hämta rätt `financialyear`-ID via `/3/financialyears` |

---

## Referens

Fortnox API-dokumentation: https://apps.fortnox.se/apidocs
