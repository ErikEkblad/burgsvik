import { supabaseAdmin } from "./supabase";
import { z } from "zod";
import { decryptString } from "../auth/crypto";
import { encryptTokenPair, refreshTokensWithClientCredentials } from "../auth/fortnox";

const rowSchema = z.object({
  access_token_enc: z.string(),
  refresh_token_enc: z.string().nullable().optional(),
  expires_at: z.string(),
  scope: z.string().nullable().optional(),
});

export type TokenPair = {
  accessToken: string;
  refreshToken: string | null;
  tenantId: string | null;
  expiresAt: Date;
  scope?: string | null;
};

/**
 * Hämta token för ett företag (företagsbaserat, inte användar-företagsbaserat)
 */
export const getTokensForCompany = async (companyId: string): Promise<TokenPair | null> => {
  const { data, error } = await supabaseAdmin
    .from("fortnox_token")
    .select("access_token_enc, refresh_token_enc, expires_at, scope")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  
  // Hämta external_db_number från company-tabellen
  const { data: company, error: companyError } = await supabaseAdmin
    .from("company")
    .select("external_db_number")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  
  const row = rowSchema.parse(data);
  const accessJson = JSON.parse(row.access_token_enc);
  const refreshJson = row.refresh_token_enc ? JSON.parse(row.refresh_token_enc) : null;
  const accessToken = decryptString(accessJson);
  const refreshToken = refreshJson ? decryptString(refreshJson) : null;
  
  // Konvertera external_db_number (bigint) till string för tenantId
  const tenantId = company?.external_db_number ? String(company.external_db_number) : null;
  
  return {
    accessToken,
    refreshToken,
    tenantId,
    expiresAt: new Date(row.expires_at),
    scope: row.scope ?? null,
  };
};

/**
 * @deprecated Använd getTokensForCompany istället. Behålls för backward compatibility.
 */
export const getTokensFor = async (userId: string, companyId: string): Promise<TokenPair | null> => {
  return getTokensForCompany(companyId);
};

/**
 * Hämta färska tokens för ett företag (uppdaterar automatiskt om de är nära att gå ut)
 */
export const getFreshTokensForCompany = async (companyId: string): Promise<TokenPair | null> => {
  const current = await getTokensForCompany(companyId);
  if (!current) return null;
  const now = Date.now();
  const expiresMs = current.expiresAt.getTime();
  const remainingSec = Math.floor((expiresMs - now) / 1000);
  // Refresh om ≤ 10 minuter kvar (≈ äldre än 50 min av 60)
  if (remainingSec <= 600) {
    if (!current.tenantId) {
      throw new Error("No external_db_number available in company table for token refresh. Please reconnect via OAuth.");
    }

    const refreshed = await refreshTokensWithClientCredentials(current.tenantId);
    const enc = encryptTokenPair(refreshed.access_token, null);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    
    // Hämta user_id från befintlig token för att behålla spårning
    const { data: existing } = await supabaseAdmin
      .from("fortnox_token")
      .select("user_id")
      .eq("company_id", companyId)
      .maybeSingle();
    
    await supabaseAdmin.from("fortnox_token").upsert({
      user_id: existing?.user_id || null,
      company_id: companyId,
      access_token_enc: JSON.stringify(enc.access),
      refresh_token_enc: null,
      scope: refreshed.scope ?? null,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });
    return {
      accessToken: refreshed.access_token,
      refreshToken: null,
      tenantId: current.tenantId,
      expiresAt: new Date(newExpiresAt),
      scope: refreshed.scope ?? null,
    };
  }
  return current;
};

/**
 * @deprecated Använd getFreshTokensForCompany istället. Behålls för backward compatibility.
 */
export const getFreshTokensFor = async (userId: string, companyId: string): Promise<TokenPair | null> => {
  return getFreshTokensForCompany(companyId);
};

/**
 * Hämta färska token för ett företag (företagsbaserat)
 * Returnerar även user_id för spårning
 */
export const getAnyFreshTokenForCompany = async (companyId: string): Promise<{ userId: string; token: TokenPair } | null> => {
  try {
    const token = await getFreshTokensForCompany(companyId);
    if (!token) return null;
    
    // Hämta user_id från token-raden
    const { data } = await supabaseAdmin
      .from('fortnox_token')
      .select('user_id')
      .eq('company_id', companyId)
      .maybeSingle();
    
    return { userId: data?.user_id || '', token };
  } catch (error) {
    return null;
  }
};

/**
 * Tvinga refresh av tokens för ett företag
 */
export const forceRefreshTokensForCompany = async (companyId: string): Promise<TokenPair | null> => {
  const current = await getTokensForCompany(companyId);
  if (!current) return null;
  if (!current.tenantId) {
    throw new Error("No external_db_number available in company table for token refresh. Please reconnect via OAuth.");
  }

  const refreshed = await refreshTokensWithClientCredentials(current.tenantId);
  const enc = encryptTokenPair(refreshed.access_token, null);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  
  // Hämta user_id från befintlig token för att behålla spårning
  const { data: existing } = await supabaseAdmin
    .from("fortnox_token")
    .select("user_id")
    .eq("company_id", companyId)
    .maybeSingle();
  
  await supabaseAdmin.from('fortnox_token').upsert({
    user_id: existing?.user_id || null,
    company_id: companyId,
    access_token_enc: JSON.stringify(enc.access),
    refresh_token_enc: null,
    scope: refreshed.scope ?? null,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  return {
    accessToken: refreshed.access_token,
    refreshToken: null,
    tenantId: current.tenantId,
    expiresAt: new Date(newExpiresAt),
    scope: refreshed.scope ?? null,
  };
};

/**
 * @deprecated Använd forceRefreshTokensForCompany istället. Behålls för backward compatibility.
 */
export const forceRefreshTokensFor = async (userId: string, companyId: string): Promise<TokenPair | null> => {
  return forceRefreshTokensForCompany(companyId);
};


