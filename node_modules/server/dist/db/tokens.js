"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceRefreshTokensFor = exports.forceRefreshTokensForCompany = exports.getAnyFreshTokenForCompany = exports.getFreshTokensFor = exports.getFreshTokensForCompany = exports.getTokensFor = exports.getTokensForCompany = void 0;
const supabase_1 = require("./supabase");
const zod_1 = require("zod");
const crypto_1 = require("../auth/crypto");
const fortnox_1 = require("../auth/fortnox");
const rowSchema = zod_1.z.object({
    access_token_enc: zod_1.z.string(),
    refresh_token_enc: zod_1.z.string().nullable().optional(),
    expires_at: zod_1.z.string(),
    scope: zod_1.z.string().nullable().optional(),
});
/**
 * Hämta token för ett företag (företagsbaserat, inte användar-företagsbaserat)
 */
const getTokensForCompany = async (companyId) => {
    const { data, error } = await supabase_1.supabaseAdmin
        .from("fortnox_token")
        .select("access_token_enc, refresh_token_enc, expires_at, scope")
        .eq("company_id", companyId)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        return null;
    // Hämta external_db_number från company-tabellen
    const { data: company, error: companyError } = await supabase_1.supabaseAdmin
        .from("company")
        .select("external_db_number")
        .eq("id", companyId)
        .maybeSingle();
    if (companyError)
        throw companyError;
    const row = rowSchema.parse(data);
    const accessJson = JSON.parse(row.access_token_enc);
    const refreshJson = row.refresh_token_enc ? JSON.parse(row.refresh_token_enc) : null;
    const accessToken = (0, crypto_1.decryptString)(accessJson);
    const refreshToken = refreshJson ? (0, crypto_1.decryptString)(refreshJson) : null;
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
exports.getTokensForCompany = getTokensForCompany;
/**
 * @deprecated Använd getTokensForCompany istället. Behålls för backward compatibility.
 */
const getTokensFor = async (userId, companyId) => {
    return (0, exports.getTokensForCompany)(companyId);
};
exports.getTokensFor = getTokensFor;
/**
 * Hämta färska tokens för ett företag (uppdaterar automatiskt om de är nära att gå ut)
 */
const getFreshTokensForCompany = async (companyId) => {
    const current = await (0, exports.getTokensForCompany)(companyId);
    if (!current)
        return null;
    const now = Date.now();
    const expiresMs = current.expiresAt.getTime();
    const remainingSec = Math.floor((expiresMs - now) / 1000);
    // Refresh om ≤ 10 minuter kvar (≈ äldre än 50 min av 60)
    if (remainingSec <= 600) {
        if (!current.tenantId) {
            throw new Error("No external_db_number available in company table for token refresh. Please reconnect via OAuth.");
        }
        const refreshed = await (0, fortnox_1.refreshTokensWithClientCredentials)(current.tenantId);
        const enc = (0, fortnox_1.encryptTokenPair)(refreshed.access_token, null);
        const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        // Hämta user_id från befintlig token för att behålla spårning
        const { data: existing } = await supabase_1.supabaseAdmin
            .from("fortnox_token")
            .select("user_id")
            .eq("company_id", companyId)
            .maybeSingle();
        await supabase_1.supabaseAdmin.from("fortnox_token").upsert({
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
exports.getFreshTokensForCompany = getFreshTokensForCompany;
/**
 * @deprecated Använd getFreshTokensForCompany istället. Behålls för backward compatibility.
 */
const getFreshTokensFor = async (userId, companyId) => {
    return (0, exports.getFreshTokensForCompany)(companyId);
};
exports.getFreshTokensFor = getFreshTokensFor;
/**
 * Hämta färska token för ett företag (företagsbaserat)
 * Returnerar även user_id för spårning
 */
const getAnyFreshTokenForCompany = async (companyId) => {
    try {
        const token = await (0, exports.getFreshTokensForCompany)(companyId);
        if (!token)
            return null;
        // Hämta user_id från token-raden
        const { data } = await supabase_1.supabaseAdmin
            .from('fortnox_token')
            .select('user_id')
            .eq('company_id', companyId)
            .maybeSingle();
        return { userId: data?.user_id || '', token };
    }
    catch (error) {
        return null;
    }
};
exports.getAnyFreshTokenForCompany = getAnyFreshTokenForCompany;
/**
 * Tvinga refresh av tokens för ett företag
 */
const forceRefreshTokensForCompany = async (companyId) => {
    const current = await (0, exports.getTokensForCompany)(companyId);
    if (!current)
        return null;
    if (!current.tenantId) {
        throw new Error("No external_db_number available in company table for token refresh. Please reconnect via OAuth.");
    }
    const refreshed = await (0, fortnox_1.refreshTokensWithClientCredentials)(current.tenantId);
    const enc = (0, fortnox_1.encryptTokenPair)(refreshed.access_token, null);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    // Hämta user_id från befintlig token för att behålla spårning
    const { data: existing } = await supabase_1.supabaseAdmin
        .from("fortnox_token")
        .select("user_id")
        .eq("company_id", companyId)
        .maybeSingle();
    await supabase_1.supabaseAdmin.from('fortnox_token').upsert({
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
exports.forceRefreshTokensForCompany = forceRefreshTokensForCompany;
/**
 * @deprecated Använd forceRefreshTokensForCompany istället. Behålls för backward compatibility.
 */
const forceRefreshTokensFor = async (userId, companyId) => {
    return (0, exports.forceRefreshTokensForCompany)(companyId);
};
exports.forceRefreshTokensFor = forceRefreshTokensFor;
