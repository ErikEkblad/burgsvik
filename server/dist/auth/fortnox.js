"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptTokenPair = exports.encryptTokenPair = exports.refreshTokensWithClientCredentials = exports.refreshTokens = exports.exchangeCodeForTokens = exports.buildAuthorizeUrl = void 0;
const undici_1 = require("undici");
const env_1 = require("../env");
const crypto_1 = require("./crypto");
const buildAuthorizeUrl = (state, scopes) => {
    const params = new URLSearchParams({
        client_id: env_1.env.FORTNOX_CLIENT_ID,
        redirect_uri: env_1.env.FORTNOX_REDIRECT_URI,
        response_type: "code",
        scope: scopes.join(" "),
        state,
        access_type: "offline",
        account_type: "service",
    });
    return `https://apps.fortnox.se/oauth-v1/auth?${params.toString()}`;
};
exports.buildAuthorizeUrl = buildAuthorizeUrl;
const exchangeCodeForTokens = async (code) => {
    const form = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env_1.env.FORTNOX_REDIRECT_URI,
    });
    const basic = Buffer.from(`${env_1.env.FORTNOX_CLIENT_ID}:${env_1.env.FORTNOX_CLIENT_SECRET}`).toString("base64");
    const res = await (0, undici_1.request)("https://apps.fortnox.se/oauth-v1/token", {
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
    return (await res.body.json());
};
exports.exchangeCodeForTokens = exchangeCodeForTokens;
const refreshTokens = async (refreshToken) => {
    const form = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });
    const basic = Buffer.from(`${env_1.env.FORTNOX_CLIENT_ID}:${env_1.env.FORTNOX_CLIENT_SECRET}`).toString("base64");
    const res = await (0, undici_1.request)("https://apps.fortnox.se/oauth-v1/token", {
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
    return (await res.body.json());
};
exports.refreshTokens = refreshTokens;
const refreshTokensWithClientCredentials = async (tenantId) => {
    const basic = Buffer.from(`${env_1.env.FORTNOX_CLIENT_ID}:${env_1.env.FORTNOX_CLIENT_SECRET}`).toString("base64");
    const res = await (0, undici_1.request)("https://apps.fortnox.se/oauth-v1/token", {
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
    return (await res.body.json());
};
exports.refreshTokensWithClientCredentials = refreshTokensWithClientCredentials;
const encryptTokenPair = (accessToken, refreshToken) => ({
    access: (0, crypto_1.encryptString)(accessToken),
    refresh: refreshToken ? (0, crypto_1.encryptString)(refreshToken) : null,
});
exports.encryptTokenPair = encryptTokenPair;
const decryptTokenPair = (encAccess, encRefresh) => ({
    access: (0, crypto_1.decryptString)(encAccess),
    refresh: encRefresh ? (0, crypto_1.decryptString)(encRefresh) : null,
});
exports.decryptTokenPair = decryptTokenPair;
