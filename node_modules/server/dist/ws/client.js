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
exports.getWsDebug = exports.stopWs = exports.getWsStatus = exports.addCurrentTenantToWs = exports.startVoucherWs = exports.setLogger = void 0;
const ws_1 = __importDefault(require("ws"));
const tokens_1 = require("../db/tokens");
const handlers_1 = require("./handlers");
const db_1 = require("./db");
const mapping_1 = require("./mapping");
const handlers_2 = require("./handlers");
// Logger-funktion som kan användas för strukturerad loggning
let logger = null;
const setLogger = (logFn) => {
    logger = logFn;
};
exports.setLogger = setLogger;
const log = (msg, data) => {
    if (logger) {
        logger(msg, data);
    }
    else {
        console.log(`[WS] ${msg}`, data || '');
    }
};
const logError = (msg, data) => {
    if (logger) {
        logger(msg, data);
    }
    else {
        console.error(`[WS] ${msg}`, data || '');
    }
};
// WebSocket-tillstånd
let socket = null;
let isConnected = false;
let tenantsRegistered = false;
let topicsAdded = false;
let streamStarted = false;
// Mappar companyId -> bearer token ("Bearer ...")
const companyToBearer = new Map();
const tenantTokens = new Set();
// Debug-statistik
let lastOpenAt = null;
let lastCloseAt = null;
let lastError = null;
let lastEventAt = null;
let totalEvents = 0;
let totalMessages = 0;
let lastMessageMeta = null;
let lastEvent = null;
const receivedMessages = [];
const MAX_MESSAGES = 100;
const sendJson = (ws, obj) => {
    try {
        ws.send(JSON.stringify(obj));
    }
    catch (err) {
        logError('Error sending message', { error: err });
    }
};
const waitForOpen = async (ws, timeoutMs = 5000) => {
    if (ws.readyState === ws_1.default.OPEN)
        return true;
    return await new Promise((resolve) => {
        const to = setTimeout(() => resolve(false), timeoutMs);
        ws.once('open', () => {
            clearTimeout(to);
            resolve(true);
        });
    });
};
/**
 * Återanslut till WebSocket med offset-hantering
 */
const reconnect = async () => {
    if (socket && socket.readyState === ws_1.default.OPEN) {
        log('Socket already open, skipping reconnect');
        return;
    }
    if (socket && socket.readyState === ws_1.default.CONNECTING) {
        log('Socket already connecting, skipping reconnect');
        return;
    }
    log('Connecting to WebSocket', { url: 'wss://ws.fortnox.se/topics-v1' });
    socket = new ws_1.default('wss://ws.fortnox.se/topics-v1');
    socket.on('open', async () => {
        isConnected = true;
        lastOpenAt = Date.now();
        log('WebSocket connected', { readyState: socket?.readyState });
        // Återställ flaggor för att köra protokoll igen
        tenantsRegistered = false;
        topicsAdded = false;
        streamStarted = false;
        // Initiera protokoll igen
        await initializeProtocol();
    });
    socket.on('close', (code, reason) => {
        isConnected = false;
        tenantsRegistered = false;
        topicsAdded = false;
        streamStarted = false;
        lastCloseAt = Date.now();
        log('WebSocket disconnected', { code, reason: reason?.toString() });
        // Försök återansluta efter 5 sekunder
        setTimeout(() => {
            if (!socket || socket.readyState === ws_1.default.CLOSED) {
                log('Attempting to reconnect...');
                void reconnect();
            }
        }, 5000);
    });
    socket.on('error', (err) => {
        lastError = String(err?.message || err);
        logError('WebSocket error', { error: lastError, stack: err?.stack });
    });
    socket.on('message', async (data) => {
        try {
            const evt = JSON.parse(String(data));
            totalMessages += 1;
            // Spara meddelandet i listan
            const message = {
                timestamp: Date.now(),
                topic: evt?.topic,
                type: evt?.type,
                response: evt?.response,
                tenantId: evt?.tenantId,
                year: evt?.year ?? evt?.additional?.year ?? null,
                series: evt?.series ?? evt?.additional?.series ?? null,
                id: evt?.id ?? evt?.entityId ?? evt?.additional?.id ?? null,
                offset: evt?.offset,
                raw: evt, // Spara hela raw-eventet för debugging
            };
            receivedMessages.push(message);
            // Behåll endast de senaste MAX_MESSAGES
            if (receivedMessages.length > MAX_MESSAGES) {
                receivedMessages.shift();
            }
            lastMessageMeta = {
                topic: evt?.topic,
                type: evt?.type,
                id: evt?.id ?? null,
                year: evt?.year ?? null,
                series: evt?.series ?? null,
                response: evt?.response,
                tenantId: evt?.tenantId,
                offset: evt?.offset,
            };
            // Hantera responses från kommandon
            if (evt?.response === 'subscribe-v1') {
                log('subscribe-v1 response received', {
                    result: evt?.result,
                });
            }
            // Hantera add-tenants-v1 response för tenant-mapping
            if (evt?.response === 'add-tenants-v1') {
                log('add-tenants-v1 response received', {
                    tenantIds: evt?.tenantIds,
                    invalidTokens: evt?.invalidTokens,
                });
                const tenantIds = evt?.tenantIds;
                if (tenantIds && typeof tenantIds === 'object') {
                    log('Processing tenant mapping from add-tenants-v1 response', {
                        tenantIdsObject: tenantIds,
                    });
                    // tenantIds är ett objekt där nycklarna är bearer-tokens och värdena är tenantId
                    // Format: { "Bearer token1": tenantId1, "Bearer token2": tenantId2 }
                    const { supabaseAdmin } = await Promise.resolve().then(() => __importStar(require('../db/supabase')));
                    const { setTenantMapping } = await Promise.resolve().then(() => __importStar(require('./mapping')));
                    // För varje bearer-token i tenantIds-objektet
                    for (const [bearerToken, tenantIdValue] of Object.entries(tenantIds)) {
                        const tenantId = Number(tenantIdValue);
                        if (!Number.isFinite(tenantId)) {
                            log('Skipping invalid tenantId value', { bearerToken, tenantIdValue });
                            continue;
                        }
                        // Hitta company_id för denna bearer-token
                        let companyId = null;
                        for (const [cid, bt] of companyToBearer.entries()) {
                            if (bt === bearerToken) {
                                companyId = cid;
                                break;
                            }
                        }
                        if (!companyId) {
                            log('Could not find company_id for bearer token', {
                                bearerToken: bearerToken.substring(0, 30) + '...',
                                tenantId,
                            });
                            continue;
                        }
                        // Spara tenantId i databasen i external_db_number kolumnen
                        try {
                            const { data: company } = await supabaseAdmin
                                .from('company')
                                .select('id, external_db_number')
                                .eq('id', companyId)
                                .single();
                            if (company) {
                                // Uppdatera external_db_number om det inte redan är satt eller om det skiljer sig
                                if (!company.external_db_number || Number(company.external_db_number) !== tenantId) {
                                    await supabaseAdmin
                                        .from('company')
                                        .update({ external_db_number: tenantId })
                                        .eq('id', companyId);
                                    log('Updated external_db_number in database', {
                                        companyId,
                                        tenantId,
                                        oldValue: company.external_db_number,
                                        newValue: tenantId,
                                    });
                                }
                                // Spara också i minnet för snabb lookup
                                setTenantMapping(tenantId, companyId);
                                log('Mapped tenantId to companyId', {
                                    tenantId,
                                    companyId,
                                    savedToDb: true,
                                });
                            }
                        }
                        catch (err) {
                            log('Error saving tenantId to database', {
                                error: err?.message || String(err),
                                companyId,
                                tenantId,
                            });
                            // Fortsätt ändå och spara i minnet
                            setTenantMapping(tenantId, companyId);
                        }
                    }
                    const { getAllMappedTenants } = await Promise.resolve().then(() => __importStar(require('./mapping')));
                    const allMappings = getAllMappedTenants();
                    log('Tenant mapping completed', {
                        mappedTenants: allMappings.length,
                        mappings: allMappings,
                    });
                }
                ;
                global.__wsAddTenantsDebug = {
                    tenantIds: evt?.tenantIds,
                    invalidTokens: evt?.invalidTokens,
                };
            }
            // Hantera add-topics-v1 response
            if (evt?.response === 'add-topics-v1') {
                log('add-topics-v1 response received', {
                    result: evt?.result,
                    invalidTopics: evt?.invalidTopics,
                });
                if (evt?.result === 'error') {
                    logError('add-topics-v1 failed', {
                        invalidTopics: evt?.invalidTopics,
                    });
                }
            }
            // Logga alla meddelanden för debugging
            log('WebSocket message received', {
                topic: evt?.topic,
                type: evt?.type,
                response: evt?.response,
                result: evt?.result,
                tenantId: evt?.tenantId,
                year: evt?.year,
                series: evt?.series,
                id: evt?.id,
                offset: evt?.offset,
                invalidTopics: evt?.invalidTopics,
                invalidTokens: evt?.invalidTokens,
            });
            // Hantera voucher-events
            if (evt?.topic === 'vouchers' && evt?.type === 'voucher-created-v1') {
                lastEventAt = Date.now();
                totalEvents += 1;
                // Logga hela eventet för debugging
                log('Voucher event received - full event data', {
                    fullEvent: evt,
                });
                // Fortnox kan skicka fält på olika sätt - försök hitta year, series, id
                // De kan vara direkt på eventet eller i entityId eller additional
                const year = evt?.year ?? evt?.additional?.year ?? null;
                const series = evt?.series ?? evt?.additional?.series ?? null;
                const id = evt?.id ?? evt?.entityId ?? evt?.additional?.id ?? null;
                lastEvent = {
                    topic: evt?.topic,
                    type: evt?.type,
                    id: id ?? null,
                    year: year ?? null,
                    series: series ?? null,
                };
                log('Voucher event received - processing', {
                    tenantId: evt.tenantId,
                    year,
                    series,
                    id,
                    offset: evt.offset,
                    entityId: evt?.entityId,
                    additional: evt?.additional,
                });
                // Hantera eventet
                await (0, handlers_1.handleVoucherCreated)({
                    topic: evt.topic,
                    type: evt.type,
                    tenantId: evt.tenantId,
                    year: year,
                    series: series,
                    id: id,
                    offset: evt.offset,
                    timestamp: evt.timestamp,
                });
            }
            else if (evt?.topic === 'vouchers') {
                // Logga andra voucher-events också
                log('Voucher event received (not created)', {
                    type: evt?.type,
                    tenantId: evt?.tenantId,
                    year: evt?.year,
                    series: evt?.series,
                    id: evt?.id,
                });
            }
        }
        catch (err) {
            logError('Error parsing WebSocket message', { error: err });
        }
    });
};
/**
 * Initiera WebSocket-protokoll i rätt ordning
 */
const initializeProtocol = async () => {
    if (!socket || socket.readyState !== ws_1.default.OPEN)
        return;
    // Steg 1: Registrera tenants (om vi har några)
    if (!tenantsRegistered && companyToBearer.size > 0) {
        const tokensToAdd = [];
        for (const bearer of companyToBearer.values()) {
            if (!tenantTokens.has(bearer)) {
                tokensToAdd.push(bearer);
            }
        }
        if (tokensToAdd.length > 0) {
            sendJson(socket, {
                command: 'add-tenants-v1',
                clientSecret: process.env.FORTNOX_CLIENT_SECRET,
                accessTokens: tokensToAdd,
            });
            tokensToAdd.forEach((t) => tenantTokens.add(t));
            tenantsRegistered = true;
            log('Registered tenants', { count: tokensToAdd.length });
            // Försök uppdatera tenant-mapping direkt via getMe()
            void (async () => {
                try {
                    const { setTenantMapping } = await Promise.resolve().then(() => __importStar(require('./mapping')));
                    const { getMe } = await Promise.resolve().then(() => __importStar(require('../fortnox/client')));
                    // Hämta tenantId för varje token via getMe() och mappa direkt
                    for (const bearer of tokensToAdd) {
                        try {
                            const me = await getMe(bearer);
                            const tenantId = me?.CompanyInformation?.DatabaseNumber;
                            if (tenantId && Number.isFinite(tenantId)) {
                                // Hitta company_id för denna bearer
                                for (const [companyId, b] of companyToBearer.entries()) {
                                    if (b === bearer) {
                                        setTenantMapping(Number(tenantId), companyId);
                                        log('Mapped tenantId to companyId', {
                                            tenantId: Number(tenantId),
                                            companyId,
                                            bearer: bearer.substring(0, 20) + '...',
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                        catch (err) {
                            logError('Error getting tenantId from token', { error: err, bearer: bearer.substring(0, 20) + '...' });
                        }
                    }
                }
                catch (err) {
                    logError('Error updating tenant mapping', { error: err });
                }
            })();
        }
    }
    // Steg 2: Lägg till topics med offset-hantering
    if (!topicsAdded) {
        // Hämta senaste offset från någon av de registrerade companies
        // Fortnox använder en offset per topic globalt, så vi behöver bara en
        let voucherOffset = null;
        if (companyToBearer.size > 0) {
            // Försök hitta senaste offset från någon company
            for (const companyId of companyToBearer.keys()) {
                const offset = await (0, db_1.getWsOffset)(companyId, 'vouchers');
                if (offset) {
                    voucherOffset = offset;
                    break; // Använd första offset vi hittar
                }
            }
        }
        // Format enligt Fortnox: topics är en array av objekt
        const topicsArray = [
            {
                topic: 'vouchers',
                ...(voucherOffset ? { offset: voucherOffset } : {}),
            },
        ];
        const topicsCmd = {
            command: 'add-topics-v1',
            topics: topicsArray,
        };
        sendJson(socket, topicsCmd);
        topicsAdded = true;
        log('Added topics', {
            topics: topicsArray,
            command: 'add-topics-v1',
        });
    }
    // Steg 3: Starta subscriptionen
    if (!streamStarted) {
        sendJson(socket, { command: 'subscribe-v1' });
        streamStarted = true;
        log('Started subscription', { command: 'subscribe-v1' });
    }
};
/**
 * Säkerställ att WebSocket är ansluten
 */
const ensureSocket = async () => {
    if (socket && socket.readyState === ws_1.default.OPEN)
        return socket;
    if (socket && socket.readyState === ws_1.default.CONNECTING) {
        await waitForOpen(socket);
        return socket;
    }
    await reconnect();
    await waitForOpen(socket);
    return socket;
};
/**
 * Starta WebSocket för sessions
 */
const startVoucherWs = async (sessions) => {
    if (!sessions || sessions.length === 0)
        return;
    const ws = await ensureSocket();
    if (!ws)
        return;
    await waitForOpen(ws);
    // Samla tokens för alla companies
    const tokensToAdd = [];
    for (const s of sessions) {
        const existing = companyToBearer.get(s.cid);
        if (existing) {
            if (!tenantTokens.has(existing))
                tokensToAdd.push(existing);
            continue;
        }
        const tokenData = await (0, tokens_1.getAnyFreshTokenForCompany)(s.cid);
        if (tokenData?.token?.accessToken) {
            const bearer = `Bearer ${tokenData.token.accessToken}`;
            companyToBearer.set(s.cid, bearer);
            (0, mapping_1.setBearerToCompanyMapping)(bearer, s.cid);
            if (!tenantTokens.has(bearer))
                tokensToAdd.push(bearer);
        }
    }
    // Lägg till nya tokens
    if (tokensToAdd.length > 0 && ws.readyState === ws_1.default.OPEN) {
        sendJson(ws, {
            command: 'add-tenants-v1',
            clientSecret: process.env.FORTNOX_CLIENT_SECRET,
            accessTokens: tokensToAdd,
        });
        tokensToAdd.forEach((t) => tenantTokens.add(t));
        tenantsRegistered = true;
        log('Added tenants', { count: tokensToAdd.length });
    }
    // Initiera protokoll om inte redan gjort
    if (ws.readyState === ws_1.default.OPEN) {
        await initializeProtocol();
    }
};
exports.startVoucherWs = startVoucherWs;
/**
 * Lägg till aktuell tenant i WebSocket
 */
const addCurrentTenantToWs = async (uid, cid) => {
    await (0, exports.startVoucherWs)([{ uid, cid }]);
};
exports.addCurrentTenantToWs = addCurrentTenantToWs;
/**
 * Hämta WebSocket-status
 */
const getWsStatus = () => ({
    connected: isConnected,
    tenants: tenantTokens.size,
    topicsAdded,
});
exports.getWsStatus = getWsStatus;
/**
 * Stoppa WebSocket
 */
const stopWs = () => {
    try {
        log('Stop requested');
        socket?.close();
    }
    catch { }
    try {
        if (socket && socket.readyState !== ws_1.default.CLOSED)
            socket.terminate();
    }
    catch { }
    socket = null;
    isConnected = false;
    tenantsRegistered = false;
    topicsAdded = false;
    streamStarted = false;
    tenantTokens.clear();
    companyToBearer.clear();
    log('WebSocket stopped');
};
exports.stopWs = stopWs;
/**
 * Hämta debug-information
 */
const getWsDebug = () => ({
    connected: isConnected,
    tenants: tenantTokens.size,
    topicsAdded,
    streamStarted,
    tenantsRegistered,
    companiesCount: companyToBearer.size,
    companies: Array.from(companyToBearer.keys()),
    lastOpenAt,
    lastCloseAt,
    lastError,
    lastEventAt,
    totalEvents,
    totalMessages,
    lastEvent,
    lastMessage: lastMessageMeta,
    receivedMessages: [...receivedMessages], // Kopiera arrayen
    addTenantsDebug: global.__wsAddTenantsDebug ?? null,
    readyState: socket?.readyState ?? null,
    tenantMappings: (0, mapping_1.getAllMappedTenants)(),
    eventLog: (0, handlers_2.getEventLog)(),
});
exports.getWsDebug = getWsDebug;
/**
 * Periodisk tokenförnyelse var 50:e minut
 */
let refreshTimer = null;
const scheduleTokenRefresh = () => {
    if (refreshTimer)
        return;
    const run = async () => {
        try {
            if (!isConnected || !socket || socket.readyState !== ws_1.default.OPEN) {
                refreshTimer = setTimeout(run, 50 * 60 * 1000);
                return;
            }
            const ws = socket;
            for (const [companyId, oldBearer] of companyToBearer.entries()) {
                try {
                    const tokenData = await (0, tokens_1.getAnyFreshTokenForCompany)(companyId);
                    if (!tokenData?.token?.accessToken)
                        continue;
                    const newBearer = `Bearer ${tokenData.token.accessToken}`;
                    if (newBearer !== oldBearer) {
                        // Ta bort gammal och lägg till ny bearer
                        try {
                            sendJson(ws, { command: 'remove-tenants-v1', accessTokens: [oldBearer] });
                        }
                        catch { }
                        companyToBearer.set(companyId, newBearer);
                        tenantTokens.delete(oldBearer);
                        if (!tenantTokens.has(newBearer)) {
                            tenantTokens.add(newBearer);
                            sendJson(ws, {
                                command: 'add-tenants-v1',
                                clientSecret: process.env.FORTNOX_CLIENT_SECRET,
                                accessTokens: [newBearer],
                            });
                        }
                        log('Rotated token for company', { companyId });
                    }
                }
                catch (e) {
                    // Fallback: prova tvingad refresh
                    try {
                        const tokenData = await (0, tokens_1.getAnyFreshTokenForCompany)(companyId);
                        if (tokenData?.userId) {
                            const forced = await (0, tokens_1.forceRefreshTokensForCompany)(companyId);
                            if (forced?.accessToken) {
                                const newBearer2 = `Bearer ${forced.accessToken}`;
                                if (newBearer2 !== oldBearer) {
                                    try {
                                        sendJson(ws, { command: 'remove-tenants-v1', accessTokens: [oldBearer] });
                                    }
                                    catch { }
                                    companyToBearer.set(companyId, newBearer2);
                                    tenantTokens.delete(oldBearer);
                                    if (!tenantTokens.has(newBearer2)) {
                                        tenantTokens.add(newBearer2);
                                        sendJson(ws, {
                                            command: 'add-tenants-v1',
                                            clientSecret: process.env.FORTNOX_CLIENT_SECRET,
                                            accessTokens: [newBearer2],
                                        });
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
        }
        finally {
            refreshTimer = setTimeout(run, 50 * 60 * 1000); // 50 minuter
        }
    };
    refreshTimer = setTimeout(run, 50 * 60 * 1000);
};
// Starta schemaläggare när modulen laddas
void (async () => {
    try {
        scheduleTokenRefresh();
    }
    catch { }
})();
