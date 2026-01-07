# Backoffice: Admin-inloggning

## Översikt

Ett separat backoffice med användarnamn/lösenord för admin-åtkomst, oberoende av Fortnox OAuth.

```
┌─────────────────────────────────────────────────────────────────┐
│                      TVÅ INLOGGNINGSVÄGAR                       │
│                                                                 │
│   Vanliga användare:              Admins:                       │
│   ┌─────────────┐                ┌─────────────┐               │
│   │ Fortnox     │                │ Backoffice  │               │
│   │ OAuth       │                │ Login       │               │
│   └──────┬──────┘                └──────┬──────┘               │
│          │                              │                       │
│          ▼                              ▼                       │
│   Session: { type: 'user' }      Session: { type: 'admin' }    │
│   - cid: company-uuid            - Ser alla företag            │
│   - Ser endast sitt företag      - Full debug-åtkomst          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Miljövariabler

Enklaste lösningen: statisk admin via miljövariabler.

**Fil:** `.env`

```bash
# Backoffice admin credentials
BACKOFFICE_USER=admin
BACKOFFICE_PASSWORD_HASH=$2b$10$... # bcrypt hash

# Generera hash med: npx bcrypt-cli hash "ditt-lösenord"
# Eller i Node: await bcrypt.hash("ditt-lösenord", 10)
```

---

### 2. Backend: Auth-routes

**Fil:** `server/src/routes/backoffice.ts`

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { sign } from "../auth/session";

const BACKOFFICE_USER = process.env.BACKOFFICE_USER;
const BACKOFFICE_PASSWORD_HASH = process.env.BACKOFFICE_PASSWORD_HASH;

export const registerBackofficeRoutes = (app: FastifyInstance) => {

  // Login endpoint
  app.post("/api/backoffice/login", async (req, reply) => {
    // Validera att backoffice är konfigurerat
    if (!BACKOFFICE_USER || !BACKOFFICE_PASSWORD_HASH) {
      return reply.code(503).send({
        ok: false,
        error: "backoffice_not_configured"
      });
    }

    // Validera input
    const body = z.object({
      username: z.string(),
      password: z.string(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.code(400).send({ ok: false, error: "invalid_input" });
    }

    const { username, password } = body.data;

    // Verifiera credentials
    if (username !== BACKOFFICE_USER) {
      // Kör bcrypt ändå för att undvika timing attacks
      await bcrypt.compare(password, BACKOFFICE_PASSWORD_HASH);
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    const passwordValid = await bcrypt.compare(password, BACKOFFICE_PASSWORD_HASH);
    if (!passwordValid) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    // Skapa admin-session
    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const session = sign(
      {
        type: "admin",
        username,
        iat: Math.floor(Date.now() / 1000)
      },
      secret
    );

    reply.header(
      "Set-Cookie",
      `sid=${session}; HttpOnly; Path=/; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }; Max-Age=${60 * 60 * 8}` // 8 timmar
    );

    return reply.send({ ok: true, username });
  });

  // Logout endpoint
  app.post("/api/backoffice/logout", async (req, reply) => {
    reply.header(
      "Set-Cookie",
      `sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    );
    return reply.send({ ok: true });
  });

  // Verifiera session
  app.get("/api/backoffice/me", async (req, reply) => {
    const session = (req as any).session;

    if (!session || session.type !== "admin") {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }

    return reply.send({
      ok: true,
      admin: true,
      username: session.username
    });
  });
};
```

---

### 3. Uppdatera session-middleware

**Fil:** `server/src/middleware/session.ts`

Session-typen behöver stödja både user och admin:

```typescript
export type Session =
  | { type: "user"; uid: string; cid: string; iat: number }
  | { type: "admin"; username: string; iat: number };

// Hjälpfunktioner
export const isAdmin = (session: Session | undefined): session is { type: "admin"; username: string; iat: number } => {
  return session?.type === "admin";
};

export const isUser = (session: Session | undefined): session is { type: "user"; uid: string; cid: string; iat: number } => {
  return session?.type === "user";
};
```

---

### 4. Uppdatera auth-check för skyddade endpoints

**Fil:** `server/src/routes/index.ts`

```typescript
import { isAdmin, isUser, Session } from "../middleware/session";

type AuthResult =
  | { type: "admin" }
  | { type: "user"; cid: string }
  | { type: "none" };

const checkAuth = (req: FastifyRequest): AuthResult => {
  const session = (req as any).session as Session | undefined;

  if (isAdmin(session)) {
    return { type: "admin" };
  }

  if (isUser(session)) {
    return { type: "user", cid: session.cid };
  }

  return { type: "none" };
};

// Användning i endpoints
app.get("/api/ws/status", async (req, reply) => {
  const auth = checkAuth(req);

  if (auth.type === "none") {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  const status = getWsStatus();
  const debug = getWsDebug();

  // Admin får allt
  if (auth.type === "admin") {
    return reply.send({ ok: true, status, debug, admin: true });
  }

  // User får filtrerat
  const filteredDebug = filterDebugForCompany(debug, auth.cid);
  return reply.send({ ok: true, status, debug: filteredDebug });
});
```

---

### 5. Frontend: Login-sida

**Fil:** `client/src/pages/BackofficeLogin.tsx`

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export const BackofficeLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/backoffice/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error === "invalid_credentials"
            ? "Felaktigt användarnamn eller lösenord"
            : "Något gick fel"
        );
        return;
      }

      // Redirect till admin-dashboard
      navigate("/backoffice");
    } catch (err) {
      setError("Kunde inte ansluta till servern");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Backoffice Login
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Användarnamn
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Lösenord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>
      </div>
    </div>
  );
};
```

---

### 6. Frontend: Admin-dashboard

**Fil:** `client/src/pages/BackofficeDashboard.tsx`

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const BackofficeDashboard = () => {
  const [wsStatus, setWsStatus] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Verifiera att vi är admin
    fetch("/api/backoffice/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/backoffice/login");
        return res.json();
      })
      .catch(() => navigate("/backoffice/login"));

    // Hämta data
    Promise.all([
      fetch("/api/ws/status", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/companies", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([ws, comp]) => {
        setWsStatus(ws);
        setCompanies(comp.companies || []);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = async () => {
    await fetch("/api/backoffice/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/backoffice/login");
  };

  if (loading) return <div>Laddar...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Backoffice</h1>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-900"
          >
            Logga ut
          </button>
        </div>

        {/* WebSocket Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">WebSocket Status</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <div className={`font-medium ${
                wsStatus?.status?.connected ? "text-green-600" : "text-red-600"
              }`}>
                {wsStatus?.status?.connected ? "Ansluten" : "Frånkopplad"}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Anslutna företag</div>
              <div className="font-medium">
                {wsStatus?.debug?.companies?.length || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Mottagna meddelanden</div>
              <div className="font-medium">
                {wsStatus?.debug?.receivedMessages?.length || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Företagslista */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Företag</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm">
                <th className="pb-2">Namn</th>
                <th className="pb-2">Org.nr</th>
                <th className="pb-2">Tenant ID</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2">{c.org_number}</td>
                  <td className="py-2 font-mono text-sm">
                    {c.external_db_number}
                  </td>
                  <td className="py-2">
                    {wsStatus?.debug?.companies?.includes(c.id) ? (
                      <span className="text-green-600">Ansluten</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Event Log */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Senaste händelser</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {wsStatus?.debug?.eventLog?.slice(-50).reverse().map((e: any, i: number) => (
              <div key={i} className="text-sm font-mono bg-gray-50 p-2 rounded">
                <span className="text-gray-500">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>{" "}
                <span className="text-blue-600">{e.event}</span>
                {e.data && (
                  <span className="text-gray-600">
                    {" "}- {JSON.stringify(e.data).slice(0, 100)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

### 7. Routing

**Fil:** `client/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BackofficeLogin } from "./pages/BackofficeLogin";
import { BackofficeDashboard } from "./pages/BackofficeDashboard";
// ... andra imports

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Vanliga routes */}
        <Route path="/" element={<Home />} />
        <Route path="/vandning" element={<Vandning />} />

        {/* Backoffice routes */}
        <Route path="/backoffice/login" element={<BackofficeLogin />} />
        <Route path="/backoffice" element={<BackofficeDashboard />} />
      </Routes>
    </BrowserRouter>
  );
};
```

---

### 8. Admin-endpoint för alla företag

**Fil:** `server/src/routes/index.ts`

```typescript
// Lista alla företag (endast admin)
app.get("/api/companies", async (req, reply) => {
  const auth = checkAuth(req);

  if (auth.type !== "admin") {
    return reply.code(403).send({ ok: false, error: "admin_required" });
  }

  const { data, error } = await supabaseAdmin
    .from("company")
    .select("id, name, org_number, external_db_number, created_at")
    .order("name");

  if (error) throw error;

  return reply.send({ ok: true, companies: data });
});

// Lista alla reversals (endast admin)
app.get("/api/reversals/all", async (req, reply) => {
  const auth = checkAuth(req);

  if (auth.type !== "admin") {
    return reply.code(403).send({ ok: false, error: "admin_required" });
  }

  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .select(`
      id, action, payload_json, created_at,
      company:company_id(name)
    `)
    .in("action", ["reversal_created", "reversal_failed", "reversal_skipped"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return reply.send({ ok: true, reversals: data });
});
```

---

## Registrera routes

**Fil:** `server/src/app.ts`

```typescript
import { registerBackofficeRoutes } from "./routes/backoffice";

// ... efter andra routes
registerBackofficeRoutes(app);
```

---

## Säkerhet

### Checklist

- [ ] `BACKOFFICE_PASSWORD_HASH` är bcrypt-hashad (minst 10 rounds)
- [ ] Lösenordet är starkt (minst 16 tecken, slumpmässigt)
- [ ] `SESSION_SECRET` är satt i produktion
- [ ] HTTPS används i produktion
- [ ] Rate limiting på login-endpoint (valfritt men rekommenderat)

### Generera säkert lösenord och hash

```bash
# Generera slumpmässigt lösenord (Node.js)
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"

# Generera bcrypt hash
npx bcrypt-cli hash "ditt-lösenord-här"
```

---

## Sammanfattning: Implementationssteg

1. [ ] Lägg till `bcrypt` dependency: `npm install bcrypt @types/bcrypt`
2. [ ] Skapa `server/src/routes/backoffice.ts`
3. [ ] Uppdatera session-typer i middleware
4. [ ] Uppdatera `checkAuth()` i routes
5. [ ] Lägg till admin-endpoints (`/api/companies`, `/api/reversals/all`)
6. [ ] Skapa frontend-sidor (Login, Dashboard)
7. [ ] Lägg till routes i App.tsx
8. [ ] Sätt miljövariabler (`BACKOFFICE_USER`, `BACKOFFICE_PASSWORD_HASH`)
9. [ ] Testa login-flödet

---

## Framtida förbättringar

| Förbättring | Beskrivning |
|-------------|-------------|
| Flera admins | `backoffice_user`-tabell istället för miljövariabler |
| 2FA | TOTP med authenticator-app |
| Audit log | Logga admin-inloggningar och åtgärder |
| Rate limiting | Skydda mot brute force |
| IP-whitelist | Begränsa backoffice till specifika IP-adresser |
