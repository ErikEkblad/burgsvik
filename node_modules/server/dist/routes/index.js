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
exports.registerRoutes = void 0;
const zod_1 = require("zod");
const cors_1 = __importDefault(require("@fastify/cors"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const auth_1 = require("./auth");
const client_1 = require("../ws/client");
const tokens_1 = require("../db/tokens");
const session_1 = require("../auth/session");
const checkAuth = (req) => {
    const session = req.session;
    if ((0, session_1.isAdmin)(session)) {
        return { type: "admin" };
    }
    if ((0, session_1.isUser)(session)) {
        return { type: "user", cid: session.cid };
    }
    return { type: "none" };
};
const registerRoutes = (app) => {
    app.register(cors_1.default, {
        origin: true,
        credentials: true,
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });
    app.register(formbody_1.default);
    app.get("/api/health", async () => ({ ok: true }));
    // Settings GET/PUT för automatisk vändning (företagsbaserade)
    app.get("/api/settings", async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: "unauthorized" });
        const { data, error } = await (await Promise.resolve().then(() => __importStar(require("../db/supabase")))).supabaseAdmin
            .from("settings")
            .select("id,auto_reverse_active,auto_reverse_trigger_series,auto_reverse_target_series,auto_reverse_date_mode")
            .eq("company_id", s.cid)
            .maybeSingle();
        if (error)
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        if (!data)
            return reply.send({ ok: true, settings: { auto_reverse_active: false, auto_reverse_trigger_series: null, auto_reverse_target_series: null, auto_reverse_date_mode: "FIRST_DAY_NEXT_MONTH" } });
        return reply.send({ ok: true, settings: data });
    });
    app.put("/api/settings", async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: "unauthorized" });
        const body = zod_1.z.object({
            auto_reverse_active: zod_1.z.boolean(),
            auto_reverse_trigger_series: zod_1.z.string().nullable(),
            auto_reverse_target_series: zod_1.z.string().nullable(),
            auto_reverse_date_mode: zod_1.z.enum(["FIRST_DAY_NEXT_MONTH", "DATE_IN_COMMENT"]),
        }).parse(req.body);
        const { data: existing, error: exErr } = await (await Promise.resolve().then(() => __importStar(require("../db/supabase")))).supabaseAdmin
            .from("settings").select("id").eq("company_id", s.cid).maybeSingle();
        if (exErr)
            return reply.code(500).send({ ok: false, error: "db_error", message: exErr.message });
        let res;
        if (existing) {
            res = await (await Promise.resolve().then(() => __importStar(require("../db/supabase")))).supabaseAdmin
                .from("settings")
                .update({
                auto_reverse_active: body.auto_reverse_active,
                auto_reverse_trigger_series: body.auto_reverse_trigger_series,
                auto_reverse_target_series: body.auto_reverse_target_series,
                auto_reverse_date_mode: body.auto_reverse_date_mode,
                updated_at: new Date().toISOString(),
            })
                .eq("id", existing.id)
                .select("id,auto_reverse_active,auto_reverse_trigger_series,auto_reverse_target_series,auto_reverse_date_mode")
                .maybeSingle();
        }
        else {
            res = await (await Promise.resolve().then(() => __importStar(require("../db/supabase")))).supabaseAdmin
                .from("settings")
                .insert({
                company_id: s.cid,
                auto_reverse_active: body.auto_reverse_active,
                auto_reverse_trigger_series: body.auto_reverse_trigger_series,
                auto_reverse_target_series: body.auto_reverse_target_series,
                auto_reverse_date_mode: body.auto_reverse_date_mode,
            })
                .select("id,auto_reverse_active,auto_reverse_trigger_series,auto_reverse_target_series,auto_reverse_date_mode")
                .maybeSingle();
        }
        if (res.error)
            return reply.code(500).send({ ok: false, error: "db_error", message: res.error.message });
        // Starta om WebSocket baserat på alla aktiva companies (inte bara denna)
        try {
            const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
            const { data: activeSettings } = await supabaseAdmin
                .from("settings")
                .select("company_id")
                .eq("auto_reverse_active", true);
            if (activeSettings && activeSettings.length > 0) {
                const companyIds = activeSettings.map(s => s.company_id);
                // Hämta user_id från tokens för varje company (för sessions-parametern)
                const sessions = await Promise.all(companyIds.map(async (cid) => {
                    const tokenData = await (0, tokens_1.getAnyFreshTokenForCompany)(cid);
                    return { uid: tokenData?.userId || '', cid };
                }));
                const validSessions = sessions.filter(s => s.uid);
                if (validSessions.length > 0) {
                    await (0, client_1.startVoucherWs)(validSessions);
                }
                else {
                    (0, client_1.stopWs)();
                }
            }
            else {
                // Inga aktiva companies - stoppa WebSocket
                (0, client_1.stopWs)();
            }
        }
        catch (err) {
            // Ignorera fel vid WebSocket-start
            req.log.warn({ error: err }, 'Error updating WebSocket after settings change');
        }
        return reply.send({ ok: true, settings: res.data });
    });
    // WS status - admin får allt, user får filtrerat
    app.get('/api/ws/status', async (req, reply) => {
        const auth = checkAuth(req);
        const status = (0, client_1.getWsStatus)();
        const debug = (0, client_1.getWsDebug)();
        // Admin får allt
        if (auth.type === "admin") {
            return reply.send({ ok: true, status, debug, admin: true });
        }
        // Ingen autentisering - neka åtkomst
        if (auth.type === "none") {
            return reply.code(401).send({ ok: false, error: 'unauthorized' });
        }
        // User får filtrerat debug-data baserat på deras company_id
        // Använd original tenantMappings för att filtrera innan vi filtrerar själva tenantMappings
        const originalTenantMappings = debug.tenantMappings ?? [];
        // Filtrera eventLog
        const filteredEventLog = debug.eventLog?.filter((e) => {
            if (e.data?.companyId)
                return e.data.companyId === auth.cid;
            if (e.data?.tenantId) {
                const mapping = originalTenantMappings.find((t) => String(t.tenantId) === String(e.data.tenantId));
                return mapping?.companyId === auth.cid;
            }
            return true; // Generella meddelanden visas
        }) ?? [];
        // Filtrera receivedMessages
        const filteredReceivedMessages = debug.receivedMessages?.filter((m) => {
            if (!m.tenantId)
                return false;
            const mapping = originalTenantMappings.find((t) => String(t.tenantId) === String(m.tenantId));
            return mapping?.companyId === auth.cid;
        }) ?? [];
        // Filtrera lastMessage baserat på tenantId
        const filteredLastMessage = debug.lastMessage && debug.lastMessage.tenantId ? (() => {
            const mapping = originalTenantMappings.find((t) => String(t.tenantId) === String(debug.lastMessage?.tenantId));
            return mapping?.companyId === auth.cid ? debug.lastMessage : null;
        })() : debug.lastMessage;
        // För lastEvent: hitta det senaste voucher-eventet från filtrerad eventLog
        // eftersom lastEvent inte har tenantId direkt
        const voucherEvents = filteredEventLog.filter((e) => e.data?.fullEvent?.topic === 'vouchers' && e.data?.fullEvent?.type === 'voucher-created-v1');
        const filteredLastEvent = voucherEvents.length > 0 ? {
            topic: voucherEvents[voucherEvents.length - 1].data.fullEvent?.topic,
            type: voucherEvents[voucherEvents.length - 1].data.fullEvent?.type,
            id: voucherEvents[voucherEvents.length - 1].data.fullEvent?.id,
            year: voucherEvents[voucherEvents.length - 1].data.fullEvent?.year,
            series: voucherEvents[voucherEvents.length - 1].data.fullEvent?.series,
        } : null;
        const filteredDebug = {
            ...debug,
            companies: debug.companies?.filter((c) => c === auth.cid) ?? [],
            tenantMappings: originalTenantMappings.filter((m) => m.companyId === auth.cid),
            receivedMessages: filteredReceivedMessages,
            eventLog: filteredEventLog,
            lastEvent: filteredLastEvent,
            lastMessage: filteredLastMessage
        };
        return reply.send({ ok: true, status, debug: filteredDebug });
    });
    // WS add-current - startar om WebSocket för alla aktiva companies
    app.post('/api/ws/add-current', async (req, reply) => {
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        // Hämta alla companies med auto_reverse_active = true
        const { data: activeSettings } = await supabaseAdmin
            .from("settings")
            .select("company_id")
            .eq("auto_reverse_active", true);
        if (!activeSettings || activeSettings.length === 0) {
            req.log.info('No active companies found for WebSocket');
            try {
                (0, client_1.stopWs)();
            }
            catch { }
            return reply.send({ ok: true, status: (0, client_1.getWsStatus)(), skipped: true });
        }
        // Hämta user_id från tokens för varje company
        const companyIds = activeSettings.map(s => s.company_id);
        const sessions = await Promise.all(companyIds.map(async (cid) => {
            const tokenData = await (0, tokens_1.getAnyFreshTokenForCompany)(cid);
            return { uid: tokenData?.userId || '', cid };
        }));
        const validSessions = sessions.filter(s => s.uid);
        if (validSessions.length === 0) {
            req.log.info('No valid tokens found for active companies');
            try {
                (0, client_1.stopWs)();
            }
            catch { }
            return reply.send({ ok: true, status: (0, client_1.getWsStatus)(), skipped: true });
        }
        req.log.info({
            companiesCount: companyIds.length,
            sessionsCount: validSessions.length
        }, 'Starting WebSocket for active companies');
        await (0, client_1.startVoucherWs)(validSessions);
        const status = (0, client_1.getWsStatus)();
        req.log.info({ status }, 'WebSocket started');
        return reply.send({ ok: true, status });
    });
    // Hämta vändningshistorik
    app.get('/api/reversals', async (req, reply) => {
        const s = req.session;
        if (!s)
            return reply.code(401).send({ ok: false, error: 'unauthorized' });
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from('audit_log')
            .select('id, action, payload_json, created_at')
            .eq('company_id', s.cid)
            .in('action', ['reversal_created', 'reversal_failed'])
            .order('created_at', { ascending: false })
            .limit(50);
        if (error)
            return reply.code(500).send({ ok: false, error: error.message });
        // Transformera till mer användarvänligt format
        const reversals = (data ?? []).map(row => ({
            id: row.id,
            status: row.action === 'reversal_created' ? 'success' : 'failed',
            source_series: row.payload_json?.source_series,
            source_number: row.payload_json?.source_number,
            target_series: row.payload_json?.target_series,
            target_number: row.payload_json?.target_number,
            financial_year: row.payload_json?.financial_year,
            error_message: row.payload_json?.error_message,
            created_at: row.created_at
        }));
        return reply.send({ ok: true, reversals });
    });
    // Lista alla företag (endast admin)
    app.get("/api/companies", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("company")
            .select("id, name, org_number, external_db_number, created_at")
            .order("name");
        if (error)
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        return reply.send({ ok: true, companies: data || [] });
    });
    // Lista alla reversals (endast admin)
    app.get("/api/reversals/all", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("audit_log")
            .select("id, action, payload_json, created_at, company_id")
            .in("action", ["reversal_created", "reversal_failed", "reversal_skipped"])
            .order("created_at", { ascending: false })
            .limit(100);
        if (error)
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        // Hämta company-namn separat om det behövs
        const companyIds = [...new Set((data || []).map((r) => r.company_id))];
        const { data: companies } = await supabaseAdmin
            .from("company")
            .select("id, name")
            .in("id", companyIds);
        const companyMap = new Map((companies || []).map((c) => [c.id, c.name]));
        const reversals = (data || []).map((row) => ({
            ...row,
            company_name: companyMap.get(row.company_id) || null,
        }));
        return reply.send({ ok: true, reversals });
    });
    // Hämta settings för alla företag (endast admin)
    app.get("/api/settings/all", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("settings")
            .select("id, company_id, auto_reverse_active, auto_reverse_trigger_series, auto_reverse_target_series, auto_reverse_date_mode, updated_at")
            .order("updated_at", { ascending: false });
        if (error)
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        return reply.send({ ok: true, settings: data || [] });
    });
    // Whitelist-hantering (endast admin)
    // Lista alla tillåtna företag
    app.get("/api/allowed-companies", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("allowed_company")
            .select("id, fortnox_database_number, description, created_at, updated_at")
            .order("created_at", { ascending: false });
        if (error)
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        return reply.send({ ok: true, companies: data || [] });
    });
    // Lägg till nytt tillåtet företag
    app.post("/api/allowed-companies", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const body = zod_1.z.object({
            fortnox_database_number: zod_1.z.number().int().positive(),
            description: zod_1.z.string().min(1),
        }).parse(req.body);
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("allowed_company")
            .insert({
            fortnox_database_number: body.fortnox_database_number,
            description: body.description,
            updated_at: new Date().toISOString(),
        })
            .select("id, fortnox_database_number, description, created_at, updated_at")
            .single();
        if (error) {
            if (error.code === "23505") { // Unique violation
                return reply.code(400).send({ ok: false, error: "duplicate", message: "Detta databasnummer finns redan i whitelisten" });
            }
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        }
        return reply.send({ ok: true, company: data });
    });
    // Uppdatera beskrivning
    app.put("/api/allowed-companies/:id", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const params = zod_1.z.object({ id: zod_1.z.string().uuid() }).parse(req.params);
        const body = zod_1.z.object({
            description: zod_1.z.string().min(1),
        }).parse(req.body);
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { data, error } = await supabaseAdmin
            .from("allowed_company")
            .update({
            description: body.description,
            updated_at: new Date().toISOString(),
        })
            .eq("id", params.id)
            .select("id, fortnox_database_number, description, created_at, updated_at")
            .single();
        if (error) {
            if (error.code === "PGRST116") { // Not found
                return reply.code(404).send({ ok: false, error: "not_found", message: "Företaget hittades inte" });
            }
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        }
        return reply.send({ ok: true, company: data });
    });
    // Ta bort från whitelist
    app.delete("/api/allowed-companies/:id", async (req, reply) => {
        const auth = checkAuth(req);
        if (auth.type !== "admin") {
            return reply.code(403).send({ ok: false, error: "admin_required" });
        }
        const params = zod_1.z.object({ id: zod_1.z.string().uuid() }).parse(req.params);
        const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require("../db/supabase")));
        const { error } = await supabaseAdmin
            .from("allowed_company")
            .delete()
            .eq("id", params.id);
        if (error) {
            return reply.code(500).send({ ok: false, error: "db_error", message: error.message });
        }
        return reply.send({ ok: true });
    });
    (0, auth_1.registerAuthRoutes)(app);
};
exports.registerRoutes = registerRoutes;
