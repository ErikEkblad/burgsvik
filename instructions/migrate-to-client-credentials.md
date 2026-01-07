# Migrering: Från Refresh Tokens till Client Credentials

## Översikt

Denna instruktion beskriver hur du migrerar Burgsvik från OAuth2 med refresh tokens till Client Credentials-flödet för Fortnox API.

### Varför Client Credentials?

- **Enklare:** Slipper hantera och rotera refresh tokens
- **Säkrare:** Ingen långlivad refresh token att lagra
- **Pålitligare:** Begär ny access token direkt när den gamla går ut

### Viktigt att förstå

Client Credentials ersätter **inte** första autentiseringen. Du måste fortfarande:
1. Låta användaren autentisera sig via OAuth2 första gången
2. Spara `TenantId` (DatabaseNumber) som du får från Fortnox

Skillnaden är att du aldrig behöver spara eller använda refresh tokens efteråt.

---

## Nuvarande implementation

| Komponent | Fil |
|-----------|-----|
| OAuth-flöde | `server/src/auth/fortnox.ts` |
| Token-lagring | `server/src/db/tokens.ts` |
| Databas-schema | `server/db/schema.sql` |
| Auth-routes | `server/src/routes/auth.ts` |
| WebSocket-refresh | `server/src/ws/client.ts` |
| Kryptering | `server/src/auth/crypto.ts` |

---

## Steg 1: Databasschema

### Nuvarande schema (`server/db/schema.sql`, rad 28-38)

```sql
create table if not exists fortnox_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  company_id uuid not null references company(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text not null,
  scope text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (company_id)
);
```

### Ändring

Lägg till `tenant_id` och gör `refresh_token_enc` nullable:

```sql
create table if not exists fortnox_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  company_id uuid not null references company(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,              -- Nullable (bakåtkompatibilitet)
  tenant_id text,                      -- NY: Fortnox DatabaseNumber
  scope text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (company_id)
);
```

### Ny migration

Skapa `server/db/migrations/009_add_tenant_id.sql`:

```sql
-- Lägg till tenant_id kolumn för Client Credentials
ALTER TABLE fortnox_token ADD COLUMN IF NOT EXISTS tenant_id text;

-- Gör refresh_token_enc nullable
ALTER TABLE fortnox_token ALTER COLUMN refresh_token_enc DROP NOT NULL;
```

---

## Steg 2: OAuth-flödet (Authorization URL)

### Nuvarande (`server/src/auth/fortnox.ts`, rad 7-18)

```typescript
export const buildAuthorizeUrl = (state: string, scopes: string[]) => {
  const params = new URLSearchParams({
    client_id: env.FORTNOX_CLIENT_ID,
    redirect_uri: env.FORTNOX_REDIRECT_URI,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    access_type: "offline",
  });
  return `https://apps.fortnox.se/oauth-v1/auth?${params.toString()}`;
};
```

### Ändring

Lägg till `account_type: "service"`:

```typescript
export const buildAuthorizeUrl = (state: string, scopes: string[]) => {
  const params = new URLSearchParams({
    client_id: env.FORTNOX_CLIENT_ID,
    redirect_uri: env.FORTNOX_REDIRECT_URI,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    access_type: "offline",
    account_type: "service",  // KRÄVS för Client Credentials!
  });
  return `https://apps.fortnox.se/oauth-v1/auth?${params.toString()}`;
};
```

**OBS:** Utan `account_type=service` kommer Client Credentials **inte** fungera!

---

## Steg 3: Ny refresh-funktion med Client Credentials

### Nuvarande (`server/src/auth/fortnox.ts`, rad 48-68)

```typescript
export const refreshTokens = async (refreshToken: string): Promise<TokenResponse> => {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${env.FORTNOX_CLIENT_ID}:${env.FORTNOX_CLIENT_SECRET}`).toString("base64");
  const res = await request("https://apps.fortnox.se/oauth-v1/token", {
    method: "POST",
    body: form.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json",
    },
  });
  // ...
};
```

### Lägg till ny funktion

Behåll gamla funktionen för bakåtkompatibilitet, lägg till:

```typescript
export const refreshTokensWithClientCredentials = async (
  tenantId: string
): Promise<Omit<TokenResponse, 'refresh_token'>> => {
  const basic = Buffer.from(
    `${env.FORTNOX_CLIENT_ID}:${env.FORTNOX_CLIENT_SECRET}`
  ).toString("base64");

  const res = await request("https://apps.fortnox.se/oauth-v1/token", {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json",
      "TenantId": tenantId,  // KRITISKT: Måste vara med!
    },
  });

  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    throw new Error(`Fortnox client credentials refresh failed: ${res.statusCode} body=${bodyText}`);
  }

  return (await res.body.json()) as Omit<TokenResponse, 'refresh_token'>;
};
```

---

## Steg 4: Spara TenantId vid första anslutning

### Nuvarande (`server/src/routes/auth.ts`, runt rad 60-80)

Callback-routen hämtar `CompanyInformation` men sparar inte `DatabaseNumber`:

```typescript
const companyResponse = await getCompanyInformation(bearer);
const ci = companyResponse?.CompanyInformation ?? {};
```

### Ändring

Extrahera `DatabaseNumber`:

```typescript
const companyResponse = await getCompanyInformation(bearer);
const ci = companyResponse?.CompanyInformation ?? {};
const tenantId = ci.DatabaseNumber;  // LÄGG TILL
```

Vid upsert (rad 137-145), lägg till `tenant_id`:

```typescript
await supabaseAdmin.from("fortnox_token").upsert({
  user_id: userId,
  company_id: companyId,
  access_token_enc: JSON.stringify(encrypted.access),
  refresh_token_enc: JSON.stringify(encrypted.refresh),
  tenant_id: tenantId,  // LÄGG TILL
  scope: tokens.scope ?? null,
  expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  updated_at: new Date().toISOString(),
}, { onConflict: "company_id" });
```

---

## Steg 5: Uppdatera token-typer

### Nuvarande (`server/src/db/tokens.ts`)

```typescript
type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null
};
```

### Ändring

```typescript
type TokenPair = {
  accessToken: string;
  refreshToken: string | null;  // Nullable nu
  tenantId: string | null;      // NY
  expiresAt: Date;
  scope: string | null
};
```

---

## Steg 6: Uppdatera `getTokensForCompany`

### Nuvarande (`server/src/db/tokens.ts`, rad 22-37)

```typescript
export const getTokensForCompany = async (companyId: string): Promise<TokenPair | null> => {
  const { data, error } = await supabaseAdmin
    .from("fortnox_token")
    .select("access_token_enc, refresh_token_enc, expires_at, scope")
    .eq("company_id", companyId)
    .maybeSingle();
  // ...
};
```

### Ändring

Lägg till `tenant_id` i select och return:

```typescript
export const getTokensForCompany = async (companyId: string): Promise<TokenPair | null> => {
  const { data, error } = await supabaseAdmin
    .from("fortnox_token")
    .select("access_token_enc, refresh_token_enc, tenant_id, expires_at, scope")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;

  const decrypted = decryptTokenPair(
    JSON.parse(data.access_token_enc),
    data.refresh_token_enc ? JSON.parse(data.refresh_token_enc) : null
  );

  return {
    accessToken: decrypted.access,
    refreshToken: decrypted.refresh,
    tenantId: data.tenant_id,  // LÄGG TILL
    expiresAt: new Date(data.expires_at),
    scope: data.scope,
  };
};
```

---

## Steg 7: Uppdatera `getFreshTokensForCompany`

### Nuvarande (`server/src/db/tokens.ts`, rad 49-85)

```typescript
if (remainingSec <= 600) {
  const refreshed = await refreshTokens(current.refreshToken);
  // ...
}
```

### Ändring

Använd Client Credentials om `tenantId` finns:

```typescript
if (remainingSec <= 600) {
  let refreshed: TokenResponse | Omit<TokenResponse, 'refresh_token'>;

  if (current.tenantId) {
    // Ny metod: Client Credentials
    refreshed = await refreshTokensWithClientCredentials(current.tenantId);
  } else if (current.refreshToken) {
    // Fallback: Gamla metoden för befintliga kopplingar
    refreshed = await refreshTokens(current.refreshToken);
  } else {
    throw new Error("No tenant_id or refresh_token available for refresh");
  }

  const enc = encryptTokenPair(
    refreshed.access_token,
    'refresh_token' in refreshed ? refreshed.refresh_token : null
  );

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabaseAdmin.from("fortnox_token").upsert({
    user_id: existing?.user_id || null,
    company_id: companyId,
    access_token_enc: JSON.stringify(enc.access),
    refresh_token_enc: enc.refresh ? JSON.stringify(enc.refresh) : null,
    tenant_id: current.tenantId,
    scope: refreshed.scope ?? null,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });

  return {
    accessToken: refreshed.access_token,
    refreshToken: 'refresh_token' in refreshed ? refreshed.refresh_token : null,
    tenantId: current.tenantId,
    expiresAt: new Date(newExpiresAt),
    scope: refreshed.scope ?? null,
  };
}
```

---

## Steg 8: Uppdatera krypteringsfunktionen

### Nuvarande (`server/src/auth/crypto.ts`)

```typescript
export const encryptTokenPair = (access: string, refresh: string) => ({
  access: encryptString(access),
  refresh: encryptString(refresh),
});
```

### Ändring

Hantera nullable refresh:

```typescript
export const encryptTokenPair = (access: string, refresh: string | null) => ({
  access: encryptString(access),
  refresh: refresh ? encryptString(refresh) : null,
});

export const decryptTokenPair = (
  access: EncryptedValue,
  refresh: EncryptedValue | null
) => ({
  access: decryptString(access),
  refresh: refresh ? decryptString(refresh) : null,
});
```

---

## Steg 9: Uppdatera `forceRefreshTokensForCompany`

### Nuvarande (`server/src/db/tokens.ts`, rad 119-148)

Samma logik som steg 7 - använd Client Credentials om `tenantId` finns.

---

## Migreringsstrategi för befintliga användare

Befintliga användare har `refresh_token` men saknar `tenant_id`.

### Alternativ A: Gradvis migrering (rekommenderat)

1. Behåll stöd för gamla refresh tokens (fallback i steg 7)
2. När användare återansluter via OAuth, sparas `tenant_id` automatiskt
3. `getFreshTokensForCompany` väljer automatiskt rätt metod baserat på vad som finns

### Alternativ B: Engångsmigrering via script

Skapa ett script som för varje befintlig koppling:

```typescript
async function migrateToClientCredentials() {
  const { data: tokens } = await supabaseAdmin
    .from("fortnox_token")
    .select("company_id, refresh_token_enc")
    .is("tenant_id", null);

  for (const token of tokens ?? []) {
    // 1. Dekryptera refresh token
    const refreshToken = decryptString(JSON.parse(token.refresh_token_enc));

    // 2. Hämta ny access token
    const refreshed = await refreshTokens(refreshToken);

    // 3. Hämta company information för DatabaseNumber
    const companyInfo = await getCompanyInformation(`Bearer ${refreshed.access_token}`);
    const tenantId = companyInfo.CompanyInformation.DatabaseNumber;

    // 4. Spara tenant_id
    await supabaseAdmin
      .from("fortnox_token")
      .update({ tenant_id: tenantId })
      .eq("company_id", token.company_id);
  }
}
```

---

## Sammanfattning av filändringar

| Fil | Ändring |
|-----|---------|
| `server/db/schema.sql` | Lägg till `tenant_id`, gör `refresh_token_enc` nullable |
| `server/db/migrations/009_add_tenant_id.sql` | Ny migration |
| `server/src/auth/fortnox.ts` | Lägg till `account_type: "service"` + ny `refreshTokensWithClientCredentials()` |
| `server/src/auth/crypto.ts` | Hantera nullable refresh i `encryptTokenPair`/`decryptTokenPair` |
| `server/src/routes/auth.ts` | Spara `tenant_id` från `DatabaseNumber` |
| `server/src/db/tokens.ts` | Uppdatera typer, `getTokensForCompany`, `getFreshTokensForCompany`, `forceRefreshTokensForCompany` |

---

## Jämförelse: Gamla vs nya metoden

| Aspekt | Refresh Token | Client Credentials |
|--------|---------------|-------------------|
| Första auth | OAuth2 med code | OAuth2 med code + `account_type=service` |
| Spara vid auth | access_token, refresh_token | access_token, tenant_id |
| Förnya token | POST med refresh_token | POST med TenantId header |
| Request body | `grant_type=refresh_token&refresh_token=xxx` | `grant_type=client_credentials` |
| Speciell header | - | `TenantId: {database_number}` |
