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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const fs = __importStar(require("node:fs/promises"));
const env_1 = require("./env");
const routes_1 = require("./routes");
const txt_1 = require("./routes/txt");
const session_1 = require("./auth/session");
const supabase_1 = require("./db/supabase");
const fortnox_1 = require("./routes/fortnox");
const backoffice_1 = require("./routes/backoffice");
const client_1 = require("./ws/client");
const buildServer = async () => {
    const app = (0, fastify_1.default)({
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
            const responseTime = reply.getResponseTime?.() ?? 0;
            request.log.info({
                method: request.method,
                url: request.url,
                statusCode: reply.statusCode,
                responseTime,
            }, 'request completed');
        }
    });
    await (0, session_1.registerSession)(app, process.env.SESSION_SECRET || "dev-secret-change-me");
    // Basrutter
    (0, routes_1.registerRoutes)(app);
    (0, fortnox_1.registerFortnoxRoutes)(app);
    (0, backoffice_1.registerBackofficeRoutes)(app);
    // Autentisering: me/logout
    app.get("/api/me", async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false });
        const [{ data: user }, { data: company }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from("app_user")
                .select("id,email,external_id,name,locale")
                .eq("id", s.uid)
                .maybeSingle(),
            supabase_1.supabaseAdmin
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
    (0, txt_1.registerTxtRoutes)(app);
    return app;
};
let runningApp = null;
const isProcessRunning = (pid) => {
    if (!pid || Number.isNaN(pid))
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ensureSingleInstance = async (name) => {
    const lockPath = node_path_1.default.join(node_os_1.default.tmpdir(), `${name}.lock`);
    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const fh = await fs.open(lockPath, "wx");
            await fh.writeFile(String(process.pid));
            await fh.close();
            break; // acquired
        }
        catch (err) {
            if (!(err && err.code === "EEXIST"))
                throw err;
            const existingPidText = await fs.readFile(lockPath, "utf8").catch(() => "");
            const existingPid = Number(existingPidText.trim());
            if (existingPid && isProcessRunning(existingPid)) {
                throw new Error(`already_running:${existingPid}`);
            }
            // Stale eller okänd fil: försök ta bort och prova igen med backoff
            await fs.unlink(lockPath).catch(() => { });
            if (attempt === maxAttempts) {
                // Sista försöket – låt felet bubbla upp
                throw err;
            }
            await sleep(25 * attempt); // enkel linjär backoff
            continue;
        }
    }
    const release = async () => {
        await fs.unlink(lockPath).catch(() => { });
    };
    return release;
};
const start = async () => {
    let releaseLock = null;
    try {
        releaseLock = await ensureSingleInstance(`burgsvik-server-${env_1.env.PORT}`);
    }
    catch (e) {
        const msg = String(e?.message || "");
        if (msg.startsWith("already_running:")) {
            console.error(`Server redan igång på port ${env_1.env.PORT}. Avslutar denna instans.`);
            process.exit(0);
            return;
        }
        throw e;
    }
    const app = await buildServer();
    runningApp = app;
    // Sätt logger för WebSocket-klienten
    (0, client_1.setLogger)((msg, data) => {
        app.log.info({ ws: true, data }, msg);
    });
    const shutdown = async (signal) => {
        try {
            app.log?.info({ signal }, "Shutting down server");
            await app.close();
        }
        catch (e) {
            console.error("Error during shutdown", e);
        }
        finally {
            if (releaseLock) {
                await releaseLock().catch(() => { });
            }
            process.exit(0);
        }
    };
    // Hantera OS-signaler
    ["SIGINT", "SIGTERM"].forEach((sig) => {
        process.once(sig, () => {
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
        await app.listen({ port: Number(env_1.env.PORT), host: "0.0.0.0" });
        // Starta WebSocket automatiskt för alla companies med auto_reverse_active = true
        const startWebSocketForActiveCompanies = async () => {
            try {
                const { data: activeSettings } = await supabase_1.supabaseAdmin
                    .from("settings")
                    .select("company_id")
                    .eq("auto_reverse_active", true);
                if (activeSettings && activeSettings.length > 0) {
                    const companyIds = activeSettings.map(s => s.company_id);
                    // Hämta user_id från tokens för varje company
                    const { getAnyFreshTokenForCompany } = await Promise.resolve().then(() => __importStar(require("./db/tokens")));
                    const sessions = await Promise.all(companyIds.map(async (cid) => {
                        const tokenData = await getAnyFreshTokenForCompany(cid);
                        return { uid: tokenData?.userId || '', cid };
                    }));
                    const validSessions = sessions.filter(s => s.uid);
                    if (validSessions.length > 0) {
                        app.log.info({
                            companiesCount: companyIds.length,
                            sessionsCount: validSessions.length
                        }, 'Starting WebSocket for active companies');
                        await (0, client_1.startVoucherWs)(validSessions);
                    }
                    else {
                        app.log.warn('No valid tokens found for active companies');
                    }
                }
                else {
                    app.log.info('No active companies found for WebSocket');
                }
            }
            catch (err) {
                app.log.error({ error: err?.message || String(err) }, 'Error starting WebSocket for active companies');
            }
        };
        await startWebSocketForActiveCompanies();
    }
    catch (err) {
        if (err && err.code === "EADDRINUSE") {
            app.log?.error({ port: Number(env_1.env.PORT) }, "Port upptagen (EADDRINUSE). Antar att annan instans kör. Avslutar.");
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
