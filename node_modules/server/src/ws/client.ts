import WebSocket from 'ws'
import { getAnyFreshTokenForCompany, forceRefreshTokensForCompany } from '../db/tokens'
import { handleVoucherCreated } from './handlers'
import { getWsOffset, saveWsOffset } from './db'
import { updateTenantMapping, setBearerToCompanyMapping, getAllMappedTenants } from './mapping'
import { getEventLog } from './handlers'

type SessionCtx = { uid: string; cid: string }

// Logger-funktion som kan användas för strukturerad loggning
let logger: ((msg: string, data?: any) => void) | null = null
export const setLogger = (logFn: (msg: string, data?: any) => void) => {
  logger = logFn
}

const log = (msg: string, data?: any) => {
  if (logger) {
    logger(msg, data)
  } else {
    console.log(`[WS] ${msg}`, data || '')
  }
}

const logError = (msg: string, data?: any) => {
  if (logger) {
    logger(msg, data)
  } else {
    console.error(`[WS] ${msg}`, data || '')
  }
}

// WebSocket-tillstånd
let socket: WebSocket | null = null
let isConnected = false
let tenantsRegistered = false
let topicsAdded = false
let streamStarted = false

// Mappar companyId -> bearer token ("Bearer ...")
const companyToBearer = new Map<string, string>()
const tenantTokens = new Set<string>()

// Debug-statistik
let lastOpenAt: number | null = null
let lastCloseAt: number | null = null
let lastError: string | null = null
let lastEventAt: number | null = null
let totalEvents = 0
let totalMessages = 0
let lastMessageMeta: null | {
  topic?: string
  type?: string
  id?: number | string | null
  year?: number | null
  series?: string | null
  response?: string
  tenantId?: number
  offset?: string
} = null
let lastEvent: null | {
  topic?: string
  type?: string
  id?: number | string | null
  year?: number | null
  series?: string | null
} = null

// Lista över alla mottagna meddelanden (max 100)
type WsMessage = {
  timestamp: number
  topic?: string
  type?: string
  response?: string
  tenantId?: number
  year?: number
  series?: string
  id?: number | string
  offset?: string
  raw?: any
}
const receivedMessages: WsMessage[] = []
const MAX_MESSAGES = 100

const sendJson = (ws: WebSocket, obj: unknown): void => {
  try {
    ws.send(JSON.stringify(obj))
  } catch (err) {
    logError('Error sending message', { error: err })
  }
}

const waitForOpen = async (ws: WebSocket, timeoutMs = 5000): Promise<boolean> => {
  if (ws.readyState === WebSocket.OPEN) return true
  return await new Promise<boolean>((resolve) => {
    const to = setTimeout(() => resolve(false), timeoutMs)
    ws.once('open', () => {
      clearTimeout(to)
      resolve(true)
    })
  })
}

/**
 * Återanslut till WebSocket med offset-hantering
 */
const reconnect = async (): Promise<void> => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    log('Socket already open, skipping reconnect')
    return
  }
  if (socket && socket.readyState === WebSocket.CONNECTING) {
    log('Socket already connecting, skipping reconnect')
    return
  }

  log('Connecting to WebSocket', { url: 'wss://ws.fortnox.se/topics-v1' })
  socket = new WebSocket('wss://ws.fortnox.se/topics-v1')

  socket.on('open', async () => {
    isConnected = true
    lastOpenAt = Date.now()
    log('WebSocket connected', { readyState: socket?.readyState })

    // Återställ flaggor för att köra protokoll igen
    tenantsRegistered = false
    topicsAdded = false
    streamStarted = false

    // Initiera protokoll igen
    await initializeProtocol()
  })

  socket.on('close', (code, reason) => {
    isConnected = false
    tenantsRegistered = false
    topicsAdded = false
    streamStarted = false
    lastCloseAt = Date.now()
    log('WebSocket disconnected', { code, reason: reason?.toString() })

    // Försök återansluta efter 5 sekunder
    setTimeout(() => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        log('Attempting to reconnect...')
        void reconnect()
      }
    }, 5000)
  })

  socket.on('error', (err) => {
    lastError = String((err as any)?.message || err)
    logError('WebSocket error', { error: lastError, stack: (err as any)?.stack })
  })

  socket.on('message', async (data: WebSocket.RawData) => {
    try {
      const evt = JSON.parse(String(data))
      totalMessages += 1

      // Spara meddelandet i listan
      const message: WsMessage = {
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
      }
      receivedMessages.push(message)
      // Behåll endast de senaste MAX_MESSAGES
      if (receivedMessages.length > MAX_MESSAGES) {
        receivedMessages.shift()
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
      }

      // Hantera responses från kommandon
      if (evt?.response === 'subscribe-v1') {
        log('subscribe-v1 response received', {
          result: evt?.result,
        })
      }

      // Hantera add-tenants-v1 response för tenant-mapping
      if (evt?.response === 'add-tenants-v1') {
        log('add-tenants-v1 response received', {
          tenantIds: evt?.tenantIds,
          invalidTokens: evt?.invalidTokens,
        })
        const tenantIds = evt?.tenantIds
        if (tenantIds && typeof tenantIds === 'object') {
          log('Processing tenant mapping from add-tenants-v1 response', {
            tenantIdsObject: tenantIds,
          })
          
          // tenantIds är ett objekt där nycklarna är bearer-tokens och värdena är tenantId
          // Format: { "Bearer token1": tenantId1, "Bearer token2": tenantId2 }
          const { supabaseAdmin } = await import('../db/supabase')
          const { setTenantMapping } = await import('./mapping')
          
          // För varje bearer-token i tenantIds-objektet
          for (const [bearerToken, tenantIdValue] of Object.entries(tenantIds)) {
            const tenantId = Number(tenantIdValue)
            if (!Number.isFinite(tenantId)) {
              log('Skipping invalid tenantId value', { bearerToken, tenantIdValue })
              continue
            }
            
            // Hitta company_id för denna bearer-token
            let companyId: string | null = null
            for (const [cid, bt] of companyToBearer.entries()) {
              if (bt === bearerToken) {
                companyId = cid
                break
              }
            }
            
            if (!companyId) {
              log('Could not find company_id for bearer token', {
                bearerToken: bearerToken.substring(0, 30) + '...',
                tenantId,
              })
              continue
            }
            
            // Spara tenantId i databasen i external_db_number kolumnen
            try {
              const { data: company } = await supabaseAdmin
                .from('company')
                .select('id, external_db_number')
                .eq('id', companyId)
                .single()
              
              if (company) {
                // Uppdatera external_db_number om det inte redan är satt eller om det skiljer sig
                if (!company.external_db_number || Number(company.external_db_number) !== tenantId) {
                  await supabaseAdmin
                    .from('company')
                    .update({ external_db_number: tenantId })
                    .eq('id', companyId)
                  
                  log('Updated external_db_number in database', {
                    companyId,
                    tenantId,
                    oldValue: company.external_db_number,
                    newValue: tenantId,
                  })
                }
                
                // Spara också i minnet för snabb lookup
                setTenantMapping(tenantId, companyId)
                log('Mapped tenantId to companyId', {
                  tenantId,
                  companyId,
                  savedToDb: true,
                })
              }
            } catch (err: any) {
              log('Error saving tenantId to database', {
                error: err?.message || String(err),
                companyId,
                tenantId,
              })
              // Fortsätt ändå och spara i minnet
              setTenantMapping(tenantId, companyId)
            }
          }
          
          const { getAllMappedTenants } = await import('./mapping')
          const allMappings = getAllMappedTenants()
          log('Tenant mapping completed', {
            mappedTenants: allMappings.length,
            mappings: allMappings,
          })
        }
        ;(global as any).__wsAddTenantsDebug = {
          tenantIds: evt?.tenantIds,
          invalidTokens: evt?.invalidTokens,
        }
      }

      // Hantera add-topics-v1 response
      if (evt?.response === 'add-topics-v1') {
        log('add-topics-v1 response received', {
          result: evt?.result,
          invalidTopics: evt?.invalidTopics,
        })
        if (evt?.result === 'error') {
          logError('add-topics-v1 failed', {
            invalidTopics: evt?.invalidTopics,
          })
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
      })

      // Hantera voucher-events
      if (evt?.topic === 'vouchers' && evt?.type === 'voucher-created-v1') {
        lastEventAt = Date.now()
        totalEvents += 1
        
        // Logga hela eventet för debugging
        log('Voucher event received - full event data', {
          fullEvent: evt,
        })

        // Fortnox kan skicka fält på olika sätt - försök hitta year, series, id
        // De kan vara direkt på eventet eller i entityId eller additional
        const year = evt?.year ?? evt?.additional?.year ?? null
        const series = evt?.series ?? evt?.additional?.series ?? null
        const id = evt?.id ?? evt?.entityId ?? evt?.additional?.id ?? null
        
        lastEvent = {
          topic: evt?.topic,
          type: evt?.type,
          id: id ?? null,
          year: year ?? null,
          series: series ?? null,
        }

        log('Voucher event received - processing', {
          tenantId: evt.tenantId,
          year,
          series,
          id,
          offset: evt.offset,
          entityId: evt?.entityId,
          additional: evt?.additional,
        })

        // Hantera eventet
        await handleVoucherCreated({
          topic: evt.topic,
          type: evt.type,
          tenantId: evt.tenantId,
          year: year as number,
          series: series as string,
          id: id as number | string,
          offset: evt.offset,
          timestamp: evt.timestamp,
        })
      } else if (evt?.topic === 'vouchers') {
        // Logga andra voucher-events också
        log('Voucher event received (not created)', {
          type: evt?.type,
          tenantId: evt?.tenantId,
          year: evt?.year,
          series: evt?.series,
          id: evt?.id,
        })
      }
    } catch (err) {
      logError('Error parsing WebSocket message', { error: err })
    }
  })
}

/**
 * Initiera WebSocket-protokoll i rätt ordning
 */
const initializeProtocol = async (): Promise<void> => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return

  // Steg 1: Registrera tenants (om vi har några)
  if (!tenantsRegistered && companyToBearer.size > 0) {
    const tokensToAdd: string[] = []
    for (const bearer of companyToBearer.values()) {
      if (!tenantTokens.has(bearer)) {
        tokensToAdd.push(bearer)
      }
    }

    if (tokensToAdd.length > 0) {
      sendJson(socket, {
        command: 'add-tenants-v1',
        clientSecret: process.env.FORTNOX_CLIENT_SECRET,
        accessTokens: tokensToAdd,
      })
      tokensToAdd.forEach((t) => tenantTokens.add(t))
      tenantsRegistered = true
      log('Registered tenants', { count: tokensToAdd.length })
      
      // Försök uppdatera tenant-mapping direkt via getMe()
      void (async () => {
        try {
          const { setTenantMapping } = await import('./mapping')
          const { getMe } = await import('../fortnox/client')
          
          // Hämta tenantId för varje token via getMe() och mappa direkt
          for (const bearer of tokensToAdd) {
            try {
              const me: any = await getMe(bearer)
              const tenantId = me?.CompanyInformation?.DatabaseNumber
              if (tenantId && Number.isFinite(tenantId)) {
                // Hitta company_id för denna bearer
                for (const [companyId, b] of companyToBearer.entries()) {
                  if (b === bearer) {
                    setTenantMapping(Number(tenantId), companyId)
                    log('Mapped tenantId to companyId', {
                      tenantId: Number(tenantId),
                      companyId,
                      bearer: bearer.substring(0, 20) + '...',
                    })
                    break
                  }
                }
              }
            } catch (err) {
              logError('Error getting tenantId from token', { error: err, bearer: bearer.substring(0, 20) + '...' })
            }
          }
        } catch (err) {
          logError('Error updating tenant mapping', { error: err })
        }
      })()
    }
  }

  // Steg 2: Lägg till topics med offset-hantering
  if (!topicsAdded) {
    // Hämta senaste offset från någon av de registrerade companies
    // Fortnox använder en offset per topic globalt, så vi behöver bara en
    let voucherOffset: string | null = null
    if (companyToBearer.size > 0) {
      // Försök hitta senaste offset från någon company
      for (const companyId of companyToBearer.keys()) {
        const offset = await getWsOffset(companyId, 'vouchers')
        if (offset) {
          voucherOffset = offset
          break // Använd första offset vi hittar
        }
      }
    }

    // Format enligt Fortnox: topics är en array av objekt
    const topicsArray: Array<{ topic: string; offset?: string }> = [
      {
        topic: 'vouchers',
        ...(voucherOffset ? { offset: voucherOffset } : {}),
      },
    ]

    const topicsCmd = {
      command: 'add-topics-v1',
      topics: topicsArray,
    }

    sendJson(socket, topicsCmd)
    topicsAdded = true
    log('Added topics', {
      topics: topicsArray,
      command: 'add-topics-v1',
    })
  }

  // Steg 3: Starta subscriptionen
  if (!streamStarted) {
    sendJson(socket, { command: 'subscribe-v1' })
    streamStarted = true
    log('Started subscription', { command: 'subscribe-v1' })
  }
}

/**
 * Säkerställ att WebSocket är ansluten
 */
const ensureSocket = async (): Promise<WebSocket | null> => {
  if (socket && socket.readyState === WebSocket.OPEN) return socket
  if (socket && socket.readyState === WebSocket.CONNECTING) {
    await waitForOpen(socket)
    return socket
  }

  await reconnect()
  await waitForOpen(socket!)
  return socket
}

/**
 * Starta WebSocket för sessions
 */
export const startVoucherWs = async (sessions: SessionCtx[]): Promise<void> => {
  if (!sessions || sessions.length === 0) return

  const ws = await ensureSocket()
  if (!ws) return

  await waitForOpen(ws)

  // Samla tokens för alla companies
  const tokensToAdd: string[] = []
  for (const s of sessions) {
    const existing = companyToBearer.get(s.cid)
    if (existing) {
      if (!tenantTokens.has(existing)) tokensToAdd.push(existing)
      continue
    }

    const tokenData = await getAnyFreshTokenForCompany(s.cid)
    if (tokenData?.token?.accessToken) {
      const bearer = `Bearer ${tokenData.token.accessToken}`
      companyToBearer.set(s.cid, bearer)
      setBearerToCompanyMapping(bearer, s.cid)
      if (!tenantTokens.has(bearer)) tokensToAdd.push(bearer)
    }
  }

  // Lägg till nya tokens
  if (tokensToAdd.length > 0 && ws.readyState === WebSocket.OPEN) {
    sendJson(ws, {
      command: 'add-tenants-v1',
      clientSecret: process.env.FORTNOX_CLIENT_SECRET,
      accessTokens: tokensToAdd,
    })
      tokensToAdd.forEach((t) => tenantTokens.add(t))
      tenantsRegistered = true
      log('Added tenants', { count: tokensToAdd.length })
  }

  // Initiera protokoll om inte redan gjort
  if (ws.readyState === WebSocket.OPEN) {
    await initializeProtocol()
  }
}

/**
 * Lägg till aktuell tenant i WebSocket
 */
export const addCurrentTenantToWs = async (uid: string, cid: string): Promise<void> => {
  await startVoucherWs([{ uid, cid }])
}

/**
 * Hämta WebSocket-status
 */
export const getWsStatus = () => ({
  connected: isConnected,
  tenants: tenantTokens.size,
  topicsAdded,
})

/**
 * Stoppa WebSocket
 */
export const stopWs = (): void => {
  try {
    log('Stop requested')
    socket?.close()
  } catch {}
  try {
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate()
  } catch {}
  socket = null
  isConnected = false
  tenantsRegistered = false
  topicsAdded = false
  streamStarted = false
  tenantTokens.clear()
  companyToBearer.clear()
  log('WebSocket stopped')
}

/**
 * Hämta debug-information
 */
export const getWsDebug = () => ({
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
  addTenantsDebug: (global as any).__wsAddTenantsDebug ?? null,
  readyState: socket?.readyState ?? null,
  tenantMappings: getAllMappedTenants(),
  eventLog: getEventLog(),
})

/**
 * Periodisk tokenförnyelse var 50:e minut
 */
let refreshTimer: NodeJS.Timeout | null = null
const scheduleTokenRefresh = () => {
  if (refreshTimer) return
  const run = async () => {
    try {
      if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) {
        refreshTimer = setTimeout(run, 50 * 60 * 1000)
        return
      }

      const ws = socket
      for (const [companyId, oldBearer] of companyToBearer.entries()) {
        try {
          const tokenData = await getAnyFreshTokenForCompany(companyId)
          if (!tokenData?.token?.accessToken) continue

          const newBearer = `Bearer ${tokenData.token.accessToken}`
          if (newBearer !== oldBearer) {
            // Ta bort gammal och lägg till ny bearer
            try {
              sendJson(ws, { command: 'remove-tenants-v1', accessTokens: [oldBearer] })
            } catch {}
            companyToBearer.set(companyId, newBearer)
            tenantTokens.delete(oldBearer)
            if (!tenantTokens.has(newBearer)) {
              tenantTokens.add(newBearer)
              sendJson(ws, {
                command: 'add-tenants-v1',
                clientSecret: process.env.FORTNOX_CLIENT_SECRET,
                accessTokens: [newBearer],
              })
            }
            log('Rotated token for company', { companyId })
          }
        } catch (e) {
          // Fallback: prova tvingad refresh
          try {
            const tokenData = await getAnyFreshTokenForCompany(companyId)
            if (tokenData?.userId) {
              const forced = await forceRefreshTokensForCompany(companyId)
              if (forced?.accessToken) {
                const newBearer2 = `Bearer ${forced.accessToken}`
                if (newBearer2 !== oldBearer) {
                  try {
                    sendJson(ws, { command: 'remove-tenants-v1', accessTokens: [oldBearer] })
                  } catch {}
                  companyToBearer.set(companyId, newBearer2)
                  tenantTokens.delete(oldBearer)
                  if (!tenantTokens.has(newBearer2)) {
                    tenantTokens.add(newBearer2)
                    sendJson(ws, {
                      command: 'add-tenants-v1',
                      clientSecret: process.env.FORTNOX_CLIENT_SECRET,
                      accessTokens: [newBearer2],
                    })
                  }
                }
              }
            }
          } catch {}
        }
      }
    } finally {
      refreshTimer = setTimeout(run, 50 * 60 * 1000) // 50 minuter
    }
  }
  refreshTimer = setTimeout(run, 50 * 60 * 1000)
}

// Starta schemaläggare när modulen laddas
void (async () => {
  try {
    scheduleTokenRefresh()
  } catch {}
})()
