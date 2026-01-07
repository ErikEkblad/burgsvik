"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSession = exports.isUser = exports.isAdmin = exports.verify = exports.sign = void 0;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fastifyCookie = require("@fastify/cookie");
const crypto_1 = __importDefault(require("crypto"));
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const decode = (b64) => JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
const sign = (payload, secret) => {
    const body = encode(payload);
    const sig = crypto_1.default.createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
};
exports.sign = sign;
const verify = (token, secret) => {
    const [body, sig] = token.split(".");
    if (!body || !sig)
        return null;
    const expected = crypto_1.default.createHmac("sha256", secret).update(body).digest("base64url");
    if (!crypto_1.default.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
        return null;
    return decode(body);
};
exports.verify = verify;
const isAdmin = (session) => {
    return session?.type === "admin";
};
exports.isAdmin = isAdmin;
const isUser = (session) => {
    return session?.type === "user";
};
exports.isUser = isUser;
const registerSession = async (app, secret) => {
    await app.register(fastifyCookie);
    app.addHook("preHandler", (req, reply, done) => {
        // Bypass for auth routes, backoffice login/logout, and health
        const path = req.routerPath || req.raw.url;
        if (path?.startsWith("/api/auth/") || path?.startsWith("/api/backoffice/login") || path?.startsWith("/api/backoffice/logout") || path === "/api/health")
            return done();
        const raw = req.cookies?.sid;
        if (!raw)
            return done();
        const s = (0, exports.verify)(raw, secret);
        if (s)
            req.session = s;
        done();
    });
};
exports.registerSession = registerSession;
