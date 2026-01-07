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
exports.registerFortnoxRoutes = void 0;
const client_1 = require("../fortnox/client");
const registerFortnoxRoutes = (app) => {
    app.get("/api/fortnox/me", async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: "unauthorized" });
        const { getFreshTokensForCompany } = await Promise.resolve().then(() => __importStar(require("../db/tokens")));
        const tokens = await getFreshTokensForCompany(s.cid);
        if (!tokens)
            return reply.code(401).send({ ok: false, error: "missing_tokens" });
        const bearer = `Bearer ${tokens.accessToken}`;
        const meResp = await (0, client_1.getMe)(bearer);
        return reply.send({ ok: true, me: meResp?.MeInformation ?? meResp });
    });
    app.get("/api/fortnox/company", async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: "unauthorized" });
        const { getFreshTokensForCompany } = await Promise.resolve().then(() => __importStar(require("../db/tokens")));
        const tokens = await getFreshTokensForCompany(s.cid);
        if (!tokens)
            return reply.code(401).send({ ok: false, error: "missing_tokens" });
        const bearer = `Bearer ${tokens.accessToken}`;
        const ciResp = await (0, client_1.getCompanyInformation)(bearer);
        return reply.send({ ok: true, company: ciResp?.CompanyInformation ?? ciResp });
    });
};
exports.registerFortnoxRoutes = registerFortnoxRoutes;
