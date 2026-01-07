import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fastifyCookie = require("@fastify/cookie");
import crypto from "crypto";

export type Session =
  | { type: "user"; uid: string; cid: string; iat: number }
  | { type: "admin"; username: string; iat: number };

type SessionPayload = Session;

const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const decode = (b64: string) => JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));

export const sign = (payload: SessionPayload, secret: string) => {
  const body = encode(payload);
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};

export const verify = (token: string, secret: string): SessionPayload | null => {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return decode(body) as SessionPayload;
};

export const isAdmin = (session: Session | undefined): session is { type: "admin"; username: string; iat: number } => {
  return session?.type === "admin";
};

export const isUser = (session: Session | undefined): session is { type: "user"; uid: string; cid: string; iat: number } => {
  return session?.type === "user";
};

export const registerSession = async (app: FastifyInstance, secret: string) => {
  await app.register(fastifyCookie);

  app.addHook("preHandler", (req: FastifyRequest, reply: FastifyReply, done) => {
    // Bypass for auth routes, backoffice login/logout, and health
    const path = (req as any).routerPath || (req.raw.url as string);
    if (path?.startsWith("/api/auth/") || path?.startsWith("/api/backoffice/login") || path?.startsWith("/api/backoffice/logout") || path === "/api/health") return done();

    const raw = ((req as any).cookies as Record<string, string> | undefined)?.sid;
    if (!raw) return done();
    const s = verify(raw, secret);
    if (s) (req as any).session = s;
    done();
  });
};


