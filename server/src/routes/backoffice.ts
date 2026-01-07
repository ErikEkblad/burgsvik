import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { sign } from "../auth/session";

const BACKOFFICE_USER = process.env.BACKOFFICE_USER;
const BACKOFFICE_PASSWORD_HASH = process.env.BACKOFFICE_PASSWORD_HASH;

export const registerBackofficeRoutes = (app: FastifyInstance) => {
  // Login endpoint
  app.post("/api/backoffice/login", async (req, reply) => {
    // Validera att backoffice är konfigurerat
    if (!BACKOFFICE_USER || !BACKOFFICE_PASSWORD_HASH) {
      return reply.code(503).send({
        ok: false,
        error: "backoffice_not_configured"
      });
    }

    // Validera input
    const body = z.object({
      username: z.string(),
      password: z.string(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.code(400).send({ ok: false, error: "invalid_input" });
    }

    const { username, password } = body.data;

    // Verifiera credentials
    if (username !== BACKOFFICE_USER) {
      // Kör bcrypt ändå för att undvika timing attacks
      await bcrypt.compare(password, BACKOFFICE_PASSWORD_HASH);
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    const passwordValid = await bcrypt.compare(password, BACKOFFICE_PASSWORD_HASH);
    if (!passwordValid) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    // Skapa admin-session
    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const session = sign(
      {
        type: "admin",
        username,
        iat: Math.floor(Date.now() / 1000)
      },
      secret
    );

    reply.header(
      "Set-Cookie",
      `sid=${session}; HttpOnly; Path=/; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }; Max-Age=${60 * 60 * 8}` // 8 timmar
    );

    return reply.send({ ok: true, username });
  });

  // Logout endpoint
  app.post("/api/backoffice/logout", async (req, reply) => {
    reply.header(
      "Set-Cookie",
      `sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    );
    return reply.send({ ok: true });
  });

  // Verifiera session
  app.get("/api/backoffice/me", async (req, reply) => {
    const session = (req as any).session;

    if (!session || session.type !== "admin") {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }

    return reply.send({
      ok: true,
      admin: true,
      username: session.username
    });
  });
};

