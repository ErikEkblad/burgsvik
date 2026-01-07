import Fastify from "fastify";
import os from "node:os";
import path from "node:path";
import * as fs from "node:fs/promises";
import { env } from "./env";
import { registerRoutes } from "./routes";
import { registerTxtRoutes } from "./routes/txt";
import { registerSession, sign } from "./auth/session";
import { supabaseAdmin } from "./db/supabase";
import { registerFortnoxRoutes } from "./routes/fortnox";
import { registerBackofficeRoutes } from "./routes/backoffice";
import { startVoucherWs, setLogger } from "./ws/client";
import fastifyStatic from "@fastify/static";

const buildServer = async () => {
  const app = Fastify({ 
    logger: { 
      level: process.env.LOG_LEVEL ?? "info",
    },
    // Använd custom request logger för att filtrera bort rutinmässiga requests
    disableRequestLogging: true,
  });
  
  // Custom request logger som filtrerar bort rutinmässiga requests
  app.addHook('onRequest', async (request, reply) => {
    // Logga inte health checks och status requests
    if (request.url !== '/api/health' && request.url !== '/api/ws/status') {
      request.log.info({ 
        method: request.method, 
        url: request.url,
        hostname: request.hostname,
        remoteAddress: request.ip,
        remotePort: request.socket?.remotePort,
      }, 'incoming request');
    }
  });
  
  app.addHook('onResponse', async (request, reply) => {
    // Logga inte health checks och status requests
    if (request.url !== '/api/health' && request.url !== '/api/ws/status') {
      const responseTime = (reply as any).getResponseTime?.() ?? 0;
      request.log.info({ 
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime,
      }, 'request completed');
    }
  });
  await registerSession(app, process.env.SESSION_SECRET || "dev-secret-change-me");

  // Basrutter
  registerRoutes(app);
  registerFortnoxRoutes(app);
  registerBackofficeRoutes(app);

  // Autentisering: me/logout
  app.get("/api/me", async (req, reply) => {
    const s = (req as any).session as { uid: string; cid: string } | undefined;
    if (!s) return reply.code(401).send({ ok: false });
    const [{ data: user }, { data: company }] = await Promise.all([
      supabaseAdmin
        .from("app_user")
        .select("id,email,external_id,name,locale")
        .eq("id", s.uid)
        .maybeSingle(),
      supabaseAdmin
        .from("company")
        .select("id,name,org_number,external_db_number")
        .eq("id", s.cid)
        .maybeSingle(),
    ]);
    // Logga bara vid första anrop eller vid fel
    // (req as any).log.info({ meSession: s, userFound: Boolean(user), companyFound: Boolean(company), user, company }, "api/me");
    return reply.send({ ok: true, user, company });
  });

  // Hälsokontroll finns i registerRoutes

  app.post("/api/auth/logout", async (req, reply) => {
    reply.header("Set-Cookie", `sid=; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}; Expires=${new Date(0).toUTCString()}`);
    return reply.send({ ok: true });
  });

  // Domänrutter (förutsätter session i endpoints själva)
  registerTxtRoutes(app);

  // Servera frontend i produktion
  if (process.env.NODE_ENV === "production") {
    const webDistPath = path.join(__dirname, "../../web/dist");

    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
    });

    // SPA fallback - servera index.html för alla icke-API routes
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ ok: false, error: "not_found" });
      }
      return (reply as any).sendFile("index.html");
    });
  }

  return app;
};

let runningApp: ReturnType<typeof Fastify> | null = null;

const isProcessRunning = (pid: number): boolean => {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureSingleInstance = async (name: string) => {
  const lockPath = path.join(os.tmpdir(), `${name}.lock`);
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fh = await fs.open(lockPath, "wx");
      await fh.writeFile(String(process.pid));
      await fh.close();
      break; // acquired
    } catch (err: any) {
      if (!(err && err.code === "EEXIST")) throw err;
      const existingPidText = await fs.readFile(lockPath, "utf8").catch(() => "");
      const existingPid = Number(existingPidText.trim());
      if (existingPid && isProcessRunning(existingPid)) {
        throw new Error(`already_running:${existingPid}`);
      }
      // Stale eller okänd fil: försök ta bort och prova igen med backoff
      await fs.unlink(lockPath).catch(() => {});
      if (attempt === maxAttempts) {
        // Sista försöket – låt felet bubbla upp
        throw err;
      }
      await sleep(25 * attempt); // enkel linjär backoff
      continue;
    }
  }
  const release = async () => {
    await fs.unlink(lockPath).catch(() => {});
  };
  return release;
};

const start = async () => {
  let releaseLock: null | (() => Promise<void>) = null;
  try {
    releaseLock = await ensureSingleInstance(`burgsvik-server-${env.PORT}`);
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.startsWith("already_running:")) {
      console.error(`Server redan igång på port ${env.PORT}. Avslutar denna instans.`);
      process.exit(0);
      return;
    }
    throw e;
  }

  const app = await buildServer();
  runningApp = app;
  
  // Sätt logger för WebSocket-klienten
  setLogger((msg: string, data?: any) => {
    (app as any).log.info({ ws: true, data }, msg);
  });

  const shutdown = async (signal: string) => {
    try {
      (app as any).log?.info({ signal }, "Shutting down server");
      await app.close();
    } catch (e) {
      console.error("Error during shutdown", e);
    } finally {
      if (releaseLock) {
        await releaseLock().catch(() => {});
      }
      process.exit(0);
    }
  };

  // Hantera OS-signaler
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig as NodeJS.Signals, () => {
      shutdown(sig).catch(() => process.exit(0));
    });
  });

  // Nodemon restart-signal (mönster: stäng ned och skicka vidare SIGUSR2)
  process.once("SIGUSR2", () => {
    shutdown("SIGUSR2").finally(() => {
      process.kill(process.pid, "SIGUSR2");
    });
  });

  try {
    await app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
    
    // Starta WebSocket automatiskt för alla companies med auto_reverse_active = true
    const startWebSocketForActiveCompanies = async () => {
      try {
        const { data: activeSettings } = await supabaseAdmin
          .from("settings")
          .select("company_id")
          .eq("auto_reverse_active", true);
        
        if (activeSettings && activeSettings.length > 0) {
          const companyIds = activeSettings.map(s => s.company_id);
          
          // Hämta user_id från tokens för varje company
          const { getAnyFreshTokenForCompany } = await import("./db/tokens");
          const sessions = await Promise.all(companyIds.map(async (cid) => {
            const tokenData = await getAnyFreshTokenForCompany(cid);
            return { uid: tokenData?.userId || '', cid };
          }));
          const validSessions = sessions.filter(s => s.uid);
          
          if (validSessions.length > 0) {
            (app as any).log.info({ 
              companiesCount: companyIds.length,
              sessionsCount: validSessions.length 
            }, 'Starting WebSocket for active companies');
            
            await startVoucherWs(validSessions);
          } else {
            (app as any).log.warn('No valid tokens found for active companies');
          }
        } else {
          (app as any).log.info('No active companies found for WebSocket');
        }
      } catch (err: any) {
        (app as any).log.error({ error: err?.message || String(err) }, 'Error starting WebSocket for active companies');
      }
    };
    
    await startWebSocketForActiveCompanies();
  } catch (err: any) {
    if (err && err.code === "EADDRINUSE") {
      (app as any).log?.error({ port: Number(env.PORT) }, "Port upptagen (EADDRINUSE). Antar att annan instans kör. Avslutar.");
      await shutdown("EADDRINUSE");
      return;
    }
    throw err;
  }
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
