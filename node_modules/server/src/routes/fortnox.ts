import type { FastifyInstance } from "fastify";
import { getMe, getCompanyInformation } from "../fortnox/client";
import { getFreshTokensFor } from "../db/tokens";

export const registerFortnoxRoutes = (app: FastifyInstance) => {
  app.get("/api/fortnox/me", async (req, reply) => {
    const s = (req as any).session as { uid: string; cid: string } | undefined;
    if (!s) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const { getFreshTokensForCompany } = await import("../db/tokens");
    const tokens = await getFreshTokensForCompany(s.cid);
    if (!tokens) return reply.code(401).send({ ok: false, error: "missing_tokens" });
    const bearer = `Bearer ${tokens.accessToken}`;
    const meResp: any = await getMe(bearer);
    return reply.send({ ok: true, me: meResp?.MeInformation ?? meResp });
  });

  app.get("/api/fortnox/company", async (req, reply) => {
    const s = (req as any).session as { uid: string; cid: string } | undefined;
    if (!s) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const { getFreshTokensForCompany } = await import("../db/tokens");
    const tokens = await getFreshTokensForCompany(s.cid);
    if (!tokens) return reply.code(401).send({ ok: false, error: "missing_tokens" });
    const bearer = `Bearer ${tokens.accessToken}`;
    const ciResp: any = await getCompanyInformation(bearer);
    return reply.send({ ok: true, company: ciResp?.CompanyInformation ?? ciResp });
  });
};


