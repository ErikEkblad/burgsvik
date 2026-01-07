# Deploy till Azure App Services

> **Status**: Instruktion för framtida deployment. Vissa steg måste genomföras före deployment.
>
> **Förberedelser som behövs:**
> - [ ] Uppdatera root `package.json` med `engines` och `build`/`start` scripts
> - [ ] Installera `@fastify/static` i server
> - [ ] Lägga till static file serving i `app.ts` för produktion
> - [ ] Skapa `.github/workflows/deploy.yml`
> - [ ] Skapa `.gitignore` (om den inte finns)

## Översikt

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT-FLÖDE                           │
│                                                                 │
│   GitHub Repo          Azure App Service        Supabase       │
│   ┌─────────┐          ┌─────────────┐         ┌─────────┐    │
│   │  Kod    │ ──push──►│  Node.js    │ ──────► │   DB    │    │
│   │  backup │          │  Server     │         │         │    │
│   └─────────┘          └─────────────┘         └─────────┘    │
│        │                      │                               │
│        └──── CI/CD ───────────┘                               │
│              (GitHub Actions)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Del 1: GitHub Repository

### 1.1 Skapa .gitignore

Se till att känsliga filer inte pushas:

**Fil:** `.gitignore`

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.next/

# Environment files
.env
.env.local
.env.*.local
*.env

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# Test coverage
coverage/

# Temporary files
tmp/
temp/
```

### 1.2 Skapa GitHub repo

```bash
# 1. Gå till projektmappen
cd C:\Users\ErikEkblad\OneDrive - Fyrtech AB\Dokument\SDK2\SDK\Burgsvik

# 2. Initiera git (om inte redan gjort)
git init

# 3. Lägg till alla filer
git add .

# 4. Första commit
git commit -m "Initial commit - Burgsvik app"

# 5. Skapa repo på GitHub (via GitHub CLI eller webbgränssnittet)
# Via GitHub CLI:
gh repo create Burgsvik --private --source=. --push

# ELLER via webbgränssnittet:
# - Gå till github.com/new
# - Skapa "Burgsvik" (private)
# - Följ instruktionerna för "push an existing repository"
```

### 1.3 Push till GitHub

```bash
# Om du skapade repo via webbgränssnittet:
git remote add origin https://github.com/DITT-USERNAME/Burgsvik.git
git branch -M main
git push -u origin main
```

---

## Del 2: Förbered för Azure

### 2.1 Din projektstruktur

Du har ett npm workspaces monorepo:

```
Burgsvik/
├── server/
│   ├── package.json      # Server dependencies
│   ├── tsconfig.json
│   └── src/
│       └── app.ts        # Entry point
├── web/                   # Frontend (Vite + React)
│   ├── package.json
│   └── src/
├── package.json          # Root med workspaces: ["server", "web"]
└── .gitignore
```

### 2.2 Uppdatera root package.json

Lägg till `engines` och build-scripts för Azure:

**Fil:** `package.json` (i root) - uppdatera till:

```json
{
  "name": "burgsvik",
  "private": true,
  "workspaces": ["server", "web"],
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "dev": "concurrently -n server,web -c blue,magenta \"npm:dev -w server\" \"npm:dev -w web\"",
    "build:web": "npm run build -w web",
    "build:server": "npm run build -w server",
    "build": "npm run build:web && npm run build:server",
    "start": "npm run start -w server"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

### 2.3 Server package.json (redan OK)

Din `server/package.json` har redan rätt scripts:
- `build`: `tsc`
- `start`: `node dist/app.js`

### 2.4 Lägg till @types/ws

Servern behöver `@types/ws` för TypeScript-kompilering:

```bash
cd server
npm install @types/ws --save-dev
```

### 2.5 Servera frontend från backend

För enkel deployment, låt backend servera frontend-filerna.

**Fil:** `server/src/app.ts`

Lägg till i slutet av filen (efter övriga routes):

```typescript
import path from 'path';
import fastifyStatic from '@fastify/static';

// ... efter övriga routes men FÖRE app.listen()

// Servera frontend build i produktion
if (process.env.NODE_ENV === 'production') {
  // Servera statiska filer från web/dist
  app.register(fastifyStatic, {
    root: path.join(__dirname, '../../web/dist'),
    prefix: '/',
  });

  // SPA fallback - alla okända routes går till index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}
```

Installera `@fastify/static`:

```bash
cd server
npm install @fastify/static
```

---

## Del 3: Azure App Service Setup

### 3.1 Skapa App Service via Azure Portal

1. Gå till [Azure Portal](https://portal.azure.com)
2. Sök "App Services" → "Create"
3. Fyll i:

| Fält | Värde |
|------|-------|
| Subscription | Din subscription |
| Resource Group | Skapa ny eller välj befintlig |
| Name | `burgsvik` (blir burgsvik.azurewebsites.net) |
| Publish | Code |
| Runtime stack | Node 18 LTS eller 20 LTS |
| Operating System | Linux (rekommenderas) |
| Region | Sweden Central / West Europe |
| Pricing plan | B1 (Basic) eller högre för produktion |

4. Klicka "Review + Create" → "Create"

### 3.2 Konfigurera miljövariabler

I Azure Portal → Din App Service → "Configuration" → "Application settings":

Lägg till dessa:

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `FORTNOX_CLIENT_ID` | (din client id) |
| `FORTNOX_CLIENT_SECRET` | (din client secret) |
| `FORTNOX_REDIRECT_URI` | `https://burgsvik.azurewebsites.net/api/auth/fortnox/callback` |
| `SUPABASE_URL` | (din supabase url) |
| `SUPABASE_SERVICE_KEY` | (din service key) |
| `SESSION_SECRET` | (generera minst 32 tecken) |
| `WEB_ORIGIN` | `https://burgsvik.azurewebsites.net` |
| `ENCRYPTION_KEY` | (din encryption key för tokens) |

**Generera säker SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Konfigurera startup command

I Azure Portal → Din App Service → "Configuration" → "General settings":

| Fält | Värde |
|------|-------|
| Startup Command | `cd server && npm start` |

---

## Del 4: GitHub Actions CI/CD

### 4.1 Hämta publish profile

1. Azure Portal → Din App Service
2. Klicka "Download publish profile"
3. Spara innehållet

### 4.2 Lägg till secret i GitHub

1. GitHub → Ditt repo → Settings → Secrets and variables → Actions
2. Klicka "New repository secret"
3. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
4. Value: Klistra in hela innehållet från publish profile

### 4.3 Skapa GitHub Actions workflow

**Fil:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to Azure

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: burgsvik
  NODE_VERSION: '20.x'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: |
            package-lock.json
            server/package-lock.json
            web/package-lock.json

      - name: Install all dependencies (workspaces)
        run: npm ci

      - name: Build web (frontend)
        run: npm run build:web
        env:
          VITE_API_URL: ''

      - name: Build server
        run: npm run build:server

      - name: Clean up before deploy
        run: |
          # Ta bort dev-dependencies och onödiga filer
          rm -rf web/node_modules
          rm -rf server/node_modules/.cache
          rm -rf .git

      - name: Install production dependencies
        run: |
          cd server
          npm ci --omit=dev

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ env.AZURE_WEBAPP_NAME }}
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

---

## Del 5: Uppdatera Fortnox-appen

### 5.1 Lägg till produktions-redirect URI

I Fortnox Developer Portal:

1. Gå till din app
2. Lägg till Redirect URI: `https://burgsvik.azurewebsites.net/api/auth/fortnox/callback`
3. Spara

---

## Del 6: Verifiera deployment

### 6.1 Kontrollera build

```bash
# Push till GitHub
git add .
git commit -m "Setup Azure deployment"
git push

# Kolla GitHub Actions
# Gå till GitHub → Actions → Se att workflow körs
```

### 6.2 Kontrollera loggar i Azure

```bash
# Via Azure CLI
az webapp log tail --name burgsvik --resource-group DITT-RESOURCE-GROUP

# Eller i Azure Portal:
# App Service → Monitoring → Log stream
```

### 6.3 Testa endpoints

```bash
# Health check
curl https://burgsvik.azurewebsites.net/api/health

# OAuth start
# Gå till: https://burgsvik.azurewebsites.net/api/auth/fortnox/start
```

---

## Felsökning

### Problem: "Application Error"

1. Kolla loggar i Azure Portal → Log stream
2. Verifiera att alla miljövariabler är satta
3. Kontrollera att `PORT` är `8080` (Azure standard)

### Problem: "Cannot find module"

1. Kontrollera att `postinstall` kör build
2. Verifiera att `dist/` skapas korrekt
3. Kolla startup command

### Problem: OAuth redirect misslyckas

1. Verifiera `FORTNOX_REDIRECT_URI` i Azure matchar Fortnox Developer Portal
2. Kontrollera `WEB_ORIGIN` är satt korrekt

### Problem: WebSocket startar inte

1. Kontrollera att alla företag har `external_db_number` i databasen
2. Verifiera token i `fortnox_token`-tabellen

---

## Sammanfattning: Checklista

### GitHub Setup
- [ ] `.gitignore` skapad
- [ ] Repo skapat på GitHub
- [ ] Kod pushad till `main`

### Azure Setup
- [ ] App Service skapad (Node 18+, Linux)
- [ ] Miljövariabler konfigurerade
- [ ] Startup command satt

### CI/CD Setup
- [ ] Publish profile nedladdad
- [ ] `AZURE_WEBAPP_PUBLISH_PROFILE` secret tillagd i GitHub
- [ ] `.github/workflows/deploy.yml` skapad

### Fortnox Setup
- [ ] Produktions-redirect URI tillagd

### Verifiering
- [ ] GitHub Actions kör utan fel
- [ ] App svarar på `/api/health`
- [ ] OAuth-flöde fungerar
- [ ] WebSocket ansluter

---

## Kostnadsuppskattning

| Tjänst | Plan | Kostnad/månad |
|--------|------|---------------|
| Azure App Service | B1 Basic | ~$13 |
| Azure App Service | S1 Standard | ~$70 |
| Supabase | Free | $0 |
| Supabase | Pro | $25 |
| GitHub | Free (private repos) | $0 |

**Rekommendation för start:** Azure B1 + Supabase Free ≈ $13/månad
