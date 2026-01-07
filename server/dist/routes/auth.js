"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthRoutes = void 0;
const zod_1 = require("zod");
const fortnox_1 = require("../auth/fortnox");
const supabase_1 = require("../db/supabase");
const client_1 = require("../fortnox/client");
const whitelist_1 = require("../db/whitelist");
const crypto_1 = __importDefault(require("crypto"));
const session_1 = require("../auth/session");
const registerAuthRoutes = (app) => {
    app.get("/api/auth/fortnox/start", async (req, reply) => {
        const q = zod_1.z.object({ state: zod_1.z.string().optional() }).parse(req.query);
        let incoming = {};
        try {
            incoming = q.state ? JSON.parse(q.state) : {};
        }
        catch {
            incoming = {};
        }
        const ephemeralUserId = incoming.userId ?? crypto_1.default.randomUUID();
        const ephemeralCompanyId = incoming.companyId ?? crypto_1.default.randomUUID();
        const state = JSON.stringify({ userId: ephemeralUserId, companyId: ephemeralCompanyId });
        const scopes = ["bookkeeping", "companyinformation", "costcenter", "profile", "settings"];
        const url = (0, fortnox_1.buildAuthorizeUrl)(state, scopes);
        req.log.info({ authorizeUrl: url, scopes, state: { userId: ephemeralUserId, companyId: ephemeralCompanyId }, redirectUri: process.env.FORTNOX_REDIRECT_URI }, "Fortnox authorize redirect");
        return reply.redirect(url);
    });
    app.get("/api/auth/fortnox/callback", async (req, reply) => {
        const q = zod_1.z.object({ code: zod_1.z.string(), state: zod_1.z.string() }).parse(req.query);
        req.log.info({ code: q.code, state: q.state, redirectUri: process.env.FORTNOX_REDIRECT_URI }, "Fortnox callback received");
        try {
            // 1) Token exchange
            const tokens = await (0, fortnox_1.exchangeCodeForTokens)(q.code);
            const encrypted = (0, fortnox_1.encryptTokenPair)(tokens.access_token, tokens.refresh_token);
            const bearer = `Bearer ${tokens.access_token}`;
            // 2) Profile & company (Fortnox)
            req.log.info({ step: "fetch_me_start" }, "Calling Fortnox /3/me");
            const meResp = await (0, client_1.getMe)(bearer);
            const me = meResp?.MeInformation ?? meResp?.Me ?? meResp ?? null;
            req.log.info({ step: "fetch_me_done", meId: me?.Id ?? null, meEmail: me?.Email ?? null, meName: me?.Name ?? null, meLocale: me?.Locale ?? null, keys: me ? Object.keys(me) : [] }, "Fortnox /3/me response");
            req.log.info({ step: "fetch_company_start" }, "Calling Fortnox /3/companyinformation");
            const ciResp = await (0, client_1.getCompanyInformation)(bearer);
            const ci = ciResp?.CompanyInformation ?? ciResp?.Company ?? ciResp ?? null;
            req.log.info({ step: "fetch_company_done", companyName: ci?.CompanyName ?? null, dbNumber: ci?.DatabaseNumber ?? null }, "Fortnox /3/companyinformation response");
            const fortnoxUserId = me?.Id;
            const dbNum = ci?.DatabaseNumber;
            // 2.5) Kontrollera whitelist - blockera om inte tillåtet
            if (dbNum !== undefined && dbNum !== null) {
                const hasAccess = await (0, whitelist_1.canAccessCompany)(dbNum);
                if (!hasAccess) {
                    req.log.warn({ dbNumber: dbNum, companyName: ci?.CompanyName }, "Company access denied - not in whitelist and not existing");
                    const web = process.env.WEB_ORIGIN ?? "http://localhost:5173";
                    return reply.redirect(`${web}?error=company_not_allowed&message=${encodeURIComponent("Företaget har inte behörighet till denna applikation")}`);
                }
            }
            else {
                req.log.error({ companyInfo: ci }, "DatabaseNumber missing from Fortnox response");
                const web = process.env.WEB_ORIGIN ?? "http://localhost:5173";
                return reply.redirect(`${web}?error=missing_database_number&message=${encodeURIComponent("Kunde inte hämta företagsinformation från Fortnox")}`);
            }
            // 3) Upsert user (prefer external_id; fallback by email to avoid duplicates)
            let userId;
            {
                const tryExternal = fortnoxUserId ? await supabase_1.supabaseAdmin
                    .from("app_user")
                    .select("id")
                    .eq("external_id", fortnoxUserId)
                    .maybeSingle() : { data: null };
                if (tryExternal.data?.id) {
                    userId = tryExternal.data.id;
                    await supabase_1.supabaseAdmin.from("app_user").update({
                        email: me?.Email ?? null,
                        name: me?.Name ?? null,
                        locale: me?.Locale ?? null,
                        external_id: fortnoxUserId ?? null,
                    }).eq("id", userId);
                }
                else if (me?.Email) {
                    const tryEmail = await supabase_1.supabaseAdmin
                        .from("app_user")
                        .select("id, external_id")
                        .eq("email", me.Email)
                        .maybeSingle();
                    if (tryEmail.data?.id) {
                        userId = tryEmail.data.id;
                        await supabase_1.supabaseAdmin.from("app_user").update({
                            name: me?.Name ?? null,
                            locale: me?.Locale ?? null,
                            external_id: tryEmail.data.external_id ?? (fortnoxUserId ?? null),
                        }).eq("id", userId);
                    }
                    else {
                        const { data: inserted, error } = await supabase_1.supabaseAdmin
                            .from("app_user")
                            .insert({
                            email: me.Email,
                            name: me?.Name ?? null,
                            locale: me?.Locale ?? null,
                            external_id: fortnoxUserId ?? null,
                        })
                            .select("id")
                            .single();
                        if (error)
                            throw error;
                        userId = inserted.id;
                    }
                }
                else {
                    const { data: inserted, error } = await supabase_1.supabaseAdmin
                        .from("app_user")
                        .insert({
                        email: null,
                        name: me?.Name ?? null,
                        locale: me?.Locale ?? null,
                        external_id: fortnoxUserId ?? null,
                    })
                        .select("id")
                        .single();
                    if (error)
                        throw error;
                    userId = inserted.id;
                }
            }
            // 4) Upsert company by external_db_number
            let companyId;
            {
                const { data: existing } = await supabase_1.supabaseAdmin
                    .from("company")
                    .select("id")
                    .eq("external_db_number", dbNum ?? -1)
                    .maybeSingle();
                if (existing?.id) {
                    companyId = existing.id;
                    await supabase_1.supabaseAdmin.from("company").update({
                        name: ci?.CompanyName ?? null,
                        org_number: ci?.OrganizationNumber ?? null,
                    }).eq("id", companyId);
                }
                else {
                    const { data: inserted, error } = await supabase_1.supabaseAdmin
                        .from("company")
                        .insert({
                        name: ci?.CompanyName ?? null,
                        org_number: ci?.OrganizationNumber ?? null,
                        external_db_number: dbNum ?? null,
                    })
                        .select("id")
                        .single();
                    if (error)
                        throw error;
                    companyId = inserted.id;
                }
            }
            // 5) Link & tokens
            await supabase_1.supabaseAdmin.from("user_company").upsert({ user_id: userId, company_id: companyId });
            // Tokens är nu företagsbaserade - uppdatera token för företaget (behåll user_id för spårning)
            // external_db_number sparas redan i company-tabellen (rad 126)
            await supabase_1.supabaseAdmin.from("fortnox_token").upsert({
                user_id: userId, // Behåll user_id för spårning av vem som loggat in senast
                company_id: companyId,
                access_token_enc: JSON.stringify(encrypted.access),
                refresh_token_enc: JSON.stringify(encrypted.refresh),
                scope: tokens.scope ?? null,
                expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: "company_id" });
            // 6) Session cookie
            const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
            const session = (0, session_1.sign)({ type: "user", uid: userId, cid: companyId, iat: Math.floor(Date.now() / 1000) }, secret);
            reply.header('Set-Cookie', `sid=${session}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=${60 * 60 * 24 * 7}`);
            const web = process.env.WEB_ORIGIN ?? "http://localhost:5173";
            return reply.redirect(web);
        }
        catch (err) {
            req.log.error({ err }, "Auth callback failed");
            return reply.code(500).send({ ok: false, error: "auth_callback_failed", message: String(err?.message ?? err) });
        }
    });
};
exports.registerAuthRoutes = registerAuthRoutes;
