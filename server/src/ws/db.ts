import { supabaseAdmin } from '../db/supabase'

/**
 * Spara WebSocket offset för ett företag och topic
 */
export const saveWsOffset = async (
  companyId: string,
  topic: string,
  offset: string
): Promise<void> => {
  try {
    await supabaseAdmin
      .from('ws_offset')
      .upsert(
        {
          company_id: companyId,
          topic,
          event_offset: offset,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'company_id,topic',
        }
      )
  } catch (err) {
    console.error('[WS] Error saving offset:', err)
  }
}

/**
 * Hämta senaste WebSocket offset för ett företag och topic
 */
export const getWsOffset = async (
  companyId: string,
  topic: string
): Promise<string | null> => {
  try {
    const { data } = await supabaseAdmin
      .from('ws_offset')
      .select('event_offset')
      .eq('company_id', companyId)
      .eq('topic', topic)
      .maybeSingle()

    return data?.event_offset ?? null
  } catch (err) {
    console.error('[WS] Error getting offset:', err)
    return null
  }
}

/**
 * Kontrollera om ett event redan har hanterats (idempotens)
 */
export const isEventProcessed = async (
  companyId: string,
  topic: string,
  offset: string
): Promise<boolean> => {
  try {
    const { data } = await supabaseAdmin
      .from('event_dedupe')
      .select('id')
      .eq('company_id', companyId)
      .eq('topic', topic)
      .eq('event_offset', offset)
      .maybeSingle()

    return data !== null
  } catch (err) {
    console.error('[WS] Error checking event processed:', err)
    return false
  }
}

/**
 * Markera ett event som hanterat (idempotens)
 */
export const markEventProcessed = async (
  companyId: string,
  topic: string,
  offset: string
): Promise<void> => {
  try {
    await supabaseAdmin.from('event_dedupe').insert({
      company_id: companyId,
      topic,
      event_offset: offset,
      received_at: new Date().toISOString(),
    })
  } catch (err) {
    // Ignorera duplicate key errors (event redan markerat)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return
    }
    console.error('[WS] Error marking event processed:', err)
  }
}

