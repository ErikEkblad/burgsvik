import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildAuthorizeUrl, exchangeCodeForTokens, encryptTokenPair } from "../auth/fortnox";
import { supabaseAdmin } from "../db/supabase";
import { getMe, getCompanyInformation } from "../fortnox/client";
import { canAccessCompany } from "../db/whitelist";
import crypto from "crypto";
import { sign } from "../auth/session";
import { env } from "../env";

export const registerAuthRoutes = (app: FastifyInstance) => {
  app.get("/api/auth/fortnox/start", async (req, reply) => {
    const q = z.object({ state: z.string().optional() }).parse((req as any).query);
    let incoming: any = {};
    try { incoming = q.state ? JSON.parse(q.state) : {}; } catch { incoming = {}; }
    const ephemeralUserId = incoming.userId ?? crypto.randomUUID();
    const ephemeralCompanyId = incoming.companyId ?? crypto.randomUUID();
    const state = JSON.stringify({ userId: ephemeralUserId, companyId: ephemeralCompanyId });
    const scopes = ["bookkeeping", "companyinformation", "costcenter", "profile", "settings"];
    const url = buildAuthorizeUrl(state, scopes);
    req.log.info({ authorizeUrl: url, scopes, state: { userId: ephemeralUserId, companyId: ephemeralCompanyId }, redirectUri: process.env.FORTNOX_REDIRECT_URI }, "Fortnox authorize redirect");
    return reply.redirect(url);
  });

  app.get("/api/auth/fortnox/callback", async (req, reply) => {
    const q = z.object({ code: z.string(), state: z.string() }).parse((req as any).query);
    req.log.info({ code: q.code, state: q.state, redirectUri: process.env.FORTNOX_REDIRECT_URI }, "Fortnox callback received");
    try {
      // 1) Token exchange
      const tokens = await exchangeCodeForTokens(q.code);
      const encrypted = encryptTokenPair(tokens.access_token, tokens.refresh_token);
      const bearer = `Bearer ${tokens.access_token}`;

      // 2) Profile & company (Fortnox)
      req.log.info({ step: "fetch_me_start" }, "Calling Fortnox /3/me");
      const meResp: any = await getMe(bearer);
      const me = meResp?.MeInformation ?? meResp?.Me ?? meResp ?? null;
      req.log.info({ step: "fetch_me_done", meId: me?.Id ?? null, meEmail: me?.Email ?? null, meName: me?.Name ?? null, meLocale: me?.Locale ?? null, keys: me ? Object.keys(me) : [] }, "Fortnox /3/me response");

      req.log.info({ step: "fetch_company_start" }, "Calling Fortnox /3/companyinformation");
      const ciResp: any = await getCompanyInformation(bearer);
      const ci = ciResp?.CompanyInformation ?? ciResp?.Company ?? ciResp ?? null;
      req.log.info({ step: "fetch_company_done", companyName: ci?.CompanyName ?? null, dbNumber: ci?.DatabaseNumber ?? null }, "Fortnox /3/companyinformation response");
      const fortnoxUserId = me?.Id as string | undefined;
      const dbNum = ci?.DatabaseNumber as number | undefined;

      // 2.5) Kontrollera whitelist - blockera om inte tillåtet
      if (dbNum !== undefined && dbNum !== null) {
        const hasAccess = await canAccessCompany(dbNum);
        if (!hasAccess) {
          req.log.warn({ dbNumber: dbNum, companyName: ci?.CompanyName }, "Company access denied - not in whitelist and not existing");
          return reply.redirect(`${env.WEB_ORIGIN}?error=company_not_allowed&message=${encodeURIComponent("Företaget har inte behörighet till denna applikation")}`);
        }
      } else {
        req.log.error({ companyInfo: ci }, "DatabaseNumber missing from Fortnox response");
        return reply.redirect(`${env.WEB_ORIGIN}?error=missing_database_number&message=${encodeURIComponent("Kunde inte hämta företagsinformation från Fortnox")}`);
      }

      // 3) Upsert user (prefer external_id; fallback by email to avoid duplicates)
      let userId: string;
      {
        const tryExternal = fortnoxUserId ? await supabaseAdmin
          .from("app_user")
          .select("id")
          .eq("external_id", fortnoxUserId)
          .maybeSingle() : { data: null as any };

        if (tryExternal.data?.id) {
          userId = tryExternal.data.id;
          await supabaseAdmin.from("app_user").update({
            email: me?.Email ?? null,
            name: me?.Name ?? null,
            locale: me?.Locale ?? null,
            external_id: fortnoxUserId ?? null,
          }).eq("id", userId);
        } else if (me?.Email) {
          const tryEmail = await supabaseAdmin
            .from("app_user")
            .select("id, external_id")
            .eq("email", me.Email)
            .maybeSingle();
          if (tryEmail.data?.id) {
            userId = tryEmail.data.id;
            await supabaseAdmin.from("app_user").update({
              name: me?.Name ?? null,
              locale: me?.Locale ?? null,
              external_id: tryEmail.data.external_id ?? (fortnoxUserId ?? null),
            }).eq("id", userId);
          } else {
            const { data: inserted, error } = await supabaseAdmin
              .from("app_user")
              .insert({
                email: me.Email,
                name: me?.Name ?? null,
                locale: me?.Locale ?? null,
                external_id: fortnoxUserId ?? null,
              })
              .select("id")
              .single();
            if (error) throw error;
            userId = inserted.id;
          }
        } else {
          const { data: inserted, error } = await supabaseAdmin
            .from("app_user")
            .insert({
              email: null,
              name: me?.Name ?? null,
              locale: me?.Locale ?? null,
              external_id: fortnoxUserId ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          userId = inserted.id;
        }
      }

      // 4) Upsert company by external_db_number
      let companyId: string;
      {
        const { data: existing } = await supabaseAdmin
          .from("company")
          .select("id")
          .eq("external_db_number", dbNum ?? -1)
          .maybeSingle();
        if (existing?.id) {
          companyId = existing.id;
          await supabaseAdmin.from("company").update({
            name: ci?.CompanyName ?? null,
            org_number: ci?.OrganizationNumber ?? null,
          }).eq("id", companyId);
        } else {
          const { data: inserted, error } = await supabaseAdmin
            .from("company")
            .insert({
              name: ci?.CompanyName ?? null,
              org_number: ci?.OrganizationNumber ?? null,
              external_db_number: dbNum ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          companyId = inserted.id;
        }
      }

      // 5) Link & tokens
      await supabaseAdmin.from("user_company").upsert({ user_id: userId, company_id: companyId });
      // Tokens är nu företagsbaserade - uppdatera token för företaget (behåll user_id för spårning)
      // external_db_number sparas redan i company-tabellen (rad 126)
      await supabaseAdmin.from("fortnox_token").upsert({
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
      const session = sign({ type: "user", uid: userId, cid: companyId, iat: Math.floor(Date.now()/1000) }, secret);
      reply.header('Set-Cookie', `sid=${session}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=${60*60*24*7}`);

      req.log.info({ redirectTo: env.WEB_ORIGIN }, "Redirecting after successful auth");
      return reply.redirect(env.WEB_ORIGIN);
    } catch (err: any) {
      req.log.error({ err }, "Auth callback failed");
      return reply.code(500).send({ ok: false, error: "auth_callback_failed", message: String(err?.message ?? err) });
    }
  });
}


