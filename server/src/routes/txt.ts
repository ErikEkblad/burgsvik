import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseTxt, buildFortnoxVoucher } from "../domain/txt";
import { getFreshTokensFor } from "../db/tokens";
import { fortnoxPostJson } from "../fortnox/client";

export const registerTxtRoutes = (app: FastifyInstance) => {
  app.post("/api/vouchers/txt/preview", async (req, reply) => {
    const body = z
      .object({
        voucherSeries: z.string().default("A"),
        transactionDate: z.string().optional(), // YYYY-MM-DD
        description: z.string().optional(),
        content: z.string(),
      })
      .parse((req as any).body);
    const parsed = parseTxt(body.content);
    const txnDate = body.transactionDate || parsed.inferredDate || new Date().toISOString().slice(0, 10);
    const desc = body.description || parsed.inferredDescription || undefined;
    const payload = buildFortnoxVoucher({
      voucherSeries: body.voucherSeries,
      transactionDate: txnDate,
      description: desc,
      rows: parsed.rows,
    });
    return reply.send({ ok: true, rows: parsed.rows, inferredDate: parsed.inferredDate, inferredDescription: parsed.inferredDescription, payload });
  });

  app.post("/api/vouchers/txt/book", async (req, reply) => {
    const body = z
      .object({
        voucherSeries: z.string().default("A"),
        transactionDate: z.string().optional(),
        description: z.string().optional(),
        content: z.string(),
      })
      .parse((req as any).body);
    const parsed = parseTxt(body.content);
    const txnDate = body.transactionDate || parsed.inferredDate || new Date().toISOString().slice(0, 10);
    const desc = body.description || parsed.inferredDescription || undefined;
    const payload = buildFortnoxVoucher({
      voucherSeries: body.voucherSeries,
      transactionDate: txnDate,
      description: desc,
      rows: parsed.rows,
    });
    const s = (req as any).session as { uid: string; cid: string } | undefined;
    if (!s) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const { getFreshTokensForCompany } = await import("../db/tokens");
    const tokens = await getFreshTokensForCompany(s.cid);
    if (!tokens) return reply.code(401).send({ ok: false, error: "missing_tokens" });
    const bearer = `Bearer ${tokens.accessToken}`;
    try {
      const result = await fortnoxPostJson("https://api.fortnox.se/3/vouchers", bearer, payload);
      return reply.send({ ok: true, message: "Verifikat skapat i Fortnox", voucher: result });
    } catch (err: any) {
      const status = typeof err?.fortnox?.statusCode === 'number' ? err.fortnox.statusCode : 400;
      const body = err?.fortnox?.body ?? undefined;
      return reply.code(status).send({ ok: false, error: "fortnox_error", message: err?.message || "Fortnox fel", details: body, payload });
    }
  });
};


