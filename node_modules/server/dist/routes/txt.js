"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTxtRoutes = void 0;
const zod_1 = require("zod");
const txt_1 = require("../domain/txt");
const client_1 = require("../fortnox/client");
const registerTxtRoutes = (app) => {
    app.post("/api/vouchers/txt/preview", async (req, reply) => {
        const body = zod_1.z
            .object({
            voucherSeries: zod_1.z.string().default("A"),
            transactionDate: zod_1.z.string().optional(), // YYYY-MM-DD
            description: zod_1.z.string().optional(),
            content: zod_1.z.string(),
        })
            .parse(req.body);
        const parsed = (0, txt_1.parseTxt)(body.content);
        const txnDate = body.transactionDate || parsed.inferredDate || new Date().toISOString().slice(0, 10);
        const desc = body.description || parsed.inferredDescription || undefined;
        const payload = (0, txt_1.buildFortnoxVoucher)({
            voucherSeries: body.voucherSeries,
            transactionDate: txnDate,
            description: desc,
            rows: parsed.rows,
        });
        return reply.send({ ok: true, rows: parsed.rows, inferredDate: parsed.inferredDate, inferredDescription: parsed.inferredDescription, payload });
    });
    app.post("/api/vouchers/txt/book", async (req, reply) => {
        const body = zod_1.z
            .object({
            voucherSeries: zod_1.z.string().default("A"),
            transactionDate: zod_1.z.string().optional(),
            description: zod_1.z.string().optional(),
            content: zod_1.z.string(),
        })
            .parse(req.body);
        const parsed = (0, txt_1.parseTxt)(body.content);
        const txnDate = body.transactionDate || parsed.inferredDate || new Date().toISOString().slice(0, 10);
        const desc = body.description || parsed.inferredDescription || undefined;
        const payload = (0, txt_1.buildFortnoxVoucher)({
            voucherSeries: body.voucherSeries,
            transactionDate: txnDate,
            description: desc,
            rows: parsed.rows,
        });
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: "unauthorized" });
        const { getFreshTokensForCompany } = await Promise.resolve().then(() => __importStar(require("../db/tokens")));
        const tokens = await getFreshTokensForCompany(s.cid);
        if (!tokens)
            return reply.code(401).send({ ok: false, error: "missing_tokens" });
        const bearer = `Bearer ${tokens.accessToken}`;
        try {
            const result = await (0, client_1.fortnoxPostJson)("https://api.fortnox.se/3/vouchers", bearer, payload);
            return reply.send({ ok: true, message: "Verifikat skapat i Fortnox", voucher: result });
        }
        catch (err) {
            const status = typeof err?.fortnox?.statusCode === 'number' ? err.fortnox.statusCode : 400;
            const body = err?.fortnox?.body ?? undefined;
            return reply.code(status).send({ ok: false, error: "fortnox_error", message: err?.message || "Fortnox fel", details: body, payload });
        }
    });
};
exports.registerTxtRoutes = registerTxtRoutes;
