# Instruktioner

Dokumentation och instruktioner för Burgsvik-applikationen.

## Dokumentöversikt

| Fil | Beskrivning | Status |
|-----|-------------|--------|
| `purposeOfTheApp.md` | Applikationens syfte och huvudfunktioner | Aktuell |
| `websockets.md` | WebSocket-integration med Fortnox | Aktuell |
| `receiveAndCreateVoucnersInFortnox.md` | API-dokumentation för verifikationer | Aktuell |
| `migrate-to-client-credentials.md` | Migrering från Refresh Tokens till Client Credentials | Implementerad |
| `security-multi-company-isolation.md` | Säkerhetsmodell och företagsbaserad åtkomstkontroll | Delvis implementerad |
| `backoffice-admin-login.md` | Admin-inloggning med användarnamn/lösenord | Implementerad |
| `improve-vandning-page-ux.md` | UX-förbättringar för vändningssidan | Implementerad |
| `deploy-azure-app-services.md` | Deployment till Azure App Services | Planerad |

## Snabbstart

1. Se `purposeOfTheApp.md` för att förstå applikationens syfte
2. Se `websockets.md` för WebSocket-konfiguration
3. Se `security-multi-company-isolation.md` för säkerhetsmodellen

## Implementationsstatus

### Klart
- OAuth2 med Client Credentials
- Automatisk vändning av verifikat
- Backoffice admin-login
- UX-förbättringar för vändningssidan
- Audit-loggning av vändningar

### Kvarstår
- Deployment till Azure (se `deploy-azure-app-services.md`)
- Filtrering av debug-data för vanliga användare
- Auth-check på `/api/ws/add-current`
