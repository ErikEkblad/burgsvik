"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markEventProcessed = exports.isEventProcessed = exports.getWsOffset = exports.saveWsOffset = void 0;
const supabase_1 = require("../db/supabase");
/**
 * Spara WebSocket offset för ett företag och topic
 */
const saveWsOffset = async (companyId, topic, offset) => {
    try {
        await supabase_1.supabaseAdmin
            .from('ws_offset')
            .upsert({
            company_id: companyId,
            topic,
            event_offset: offset,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'company_id,topic',
        });
    }
    catch (err) {
        console.error('[WS] Error saving offset:', err);
    }
};
exports.saveWsOffset = saveWsOffset;
/**
 * Hämta senaste WebSocket offset för ett företag och topic
 */
const getWsOffset = async (companyId, topic) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('ws_offset')
            .select('event_offset')
            .eq('company_id', companyId)
            .eq('topic', topic)
            .maybeSingle();
        return data?.event_offset ?? null;
    }
    catch (err) {
        console.error('[WS] Error getting offset:', err);
        return null;
    }
};
exports.getWsOffset = getWsOffset;
/**
 * Kontrollera om ett event redan har hanterats (idempotens)
 */
const isEventProcessed = async (companyId, topic, offset) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('event_dedupe')
            .select('id')
            .eq('company_id', companyId)
            .eq('topic', topic)
            .eq('event_offset', offset)
            .maybeSingle();
        return data !== null;
    }
    catch (err) {
        console.error('[WS] Error checking event processed:', err);
        return false;
    }
};
exports.isEventProcessed = isEventProcessed;
/**
 * Markera ett event som hanterat (idempotens)
 */
const markEventProcessed = async (companyId, topic, offset) => {
    try {
        await supabase_1.supabaseAdmin.from('event_dedupe').insert({
            company_id: companyId,
            topic,
            event_offset: offset,
            received_at: new Date().toISOString(),
        });
    }
    catch (err) {
        // Ignorera duplicate key errors (event redan markerat)
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
            return;
        }
        console.error('[WS] Error marking event processed:', err);
    }
};
exports.markEventProcessed = markEventProcessed;
