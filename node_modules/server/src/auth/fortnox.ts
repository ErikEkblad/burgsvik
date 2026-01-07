import { request } from "undici";
import { env } from "../env";
import { encryptString, decryptString, EncryptedValue } from "./crypto";

export const buildAuthorizeUrl = (state: string, scopes: string[]) => {
  const params = new URLSearchParams({
    client_id: env.FORTNOX_CLIENT_ID,
    redirect_uri: env.FORTNOX_REDIRECT_URI,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    access_type: "offline",
    account_type: "service",
  });
  return `https://apps.fortnox.se/oauth-v1/auth?${params.toString()}`;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope?: string;
};

export const exchangeCodeForTokens = async (code: string): Promise<TokenResponse> => {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.FORTNOX_REDIRECT_URI,
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
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    throw new Error(`Fortnox token exchange failed: ${res.statusCode} body=${bodyText}`);
  }
  return (await res.body.json()) as TokenResponse;
};

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
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    throw new Error(`Fortnox refresh failed: ${res.statusCode} body=${bodyText}`);
  }
  return (await res.body.json()) as TokenResponse;
};

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
      "TenantId": tenantId,
    },
  });

  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    throw new Error(`Fortnox client credentials refresh failed: ${res.statusCode} body=${bodyText}`);
  }

  return (await res.body.json()) as Omit<TokenResponse, 'refresh_token'>;
};

export const encryptTokenPair = (accessToken: string, refreshToken: string | null) => ({
  access: encryptString(accessToken),
  refresh: refreshToken ? encryptString(refreshToken) : null,
});

export const decryptTokenPair = (encAccess: EncryptedValue, encRefresh: EncryptedValue | null) => ({
  access: decryptString(encAccess),
  refresh: encRefresh ? decryptString(encRefresh) : null,
});


