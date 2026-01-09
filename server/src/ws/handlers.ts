import { getVoucher, fortnoxPostJson, listVouchers, getFinancialYearsByDate } from '../fortnox/client'
import { getAnyFreshTokenForCompany } from '../db/tokens'
import { supabaseAdmin } from '../db/supabase'
import { getCompanyIdFromTenantId, getAllMappedTenants } from './mapping'
import { isEventProcessed, markEventProcessed, saveWsOffset } from './db'

type FortnoxVoucherResponse = {
  Voucher?: {
    VoucherSeries?: string
    VoucherNumber?: number
    DocumentNumber?: number
    Year?: number
    TransactionDate?: string
    Description?: string
    Comments?: string
    VoucherRows?: Array<{
      Account?: number
      Debit?: number
      Credit?: number
      CostCenter?: string
      Project?: string
      Description?: string
      TransactionInformation?: string
    }>
  }
}

type VoucherEvent = {
  topic: string
  type: string
  tenantId: number
  year: number
  series: string
  id: number | string
  offset: string
  timestamp: string
}

/**
 * Beräkna första dagen i nästa månad
 * Tar emot ett datum-sträng i formatet YYYY-MM-DD eller ett Date-objekt
 */
const getFirstDayNextMonth = (date: Date | string): string => {
  let year: number
  let month: number
  
  if (typeof date === 'string') {
    // Parse YYYY-MM-DD format direkt
    const parts = date.split('-')
    if (parts.length === 3) {
      year = Number(parts[0])
      month = Number(parts[1]) - 1 // JavaScript månader är 0-indexerade
    } else {
      // Fallback till Date parsing
      const d = new Date(date)
      year = d.getFullYear()
      month = d.getMonth()
    }
  } else {
    year = date.getFullYear()
    month = date.getMonth()
  }
  
  // Skapa första dagen i nästa månad
  const nextMonth = new Date(year, month + 1, 1)
  // Formatera som YYYY-MM-DD utan timezone-problem
  const yearStr = String(nextMonth.getFullYear())
  const monthStr = String(nextMonth.getMonth() + 1).padStart(2, '0')
  const dayStr = String(nextMonth.getDate()).padStart(2, '0')
  return `${yearStr}-${monthStr}-${dayStr}`
}

/**
 * Extrahera datum från kommentar (om möjligt)
 * Letar efter datum i formatet YYYY-MM-DD
 */
const extractDateFromComment = (comment: string): string | null => {
  if (!comment) return null
  
  // Försök hitta datum i formatet YYYY-MM-DD
  const isoMatch = comment.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoMatch) {
    return isoMatch[1]
  }

  return null
}

/**
 * Skapa omvänd verifikation från originalverifikation
 * Enligt instruktion: POST /3/vouchers?financialyear={financialyear}
 * Body: { Voucher: { VoucherSeries, TransactionDate, Description, VoucherRows } }
 */
const createReversedVoucher = (
  originalVoucher: FortnoxVoucherResponse,
  targetSeries: string,
  dateMode: 'FIRST_DAY_NEXT_MONTH' | 'DATE_IN_COMMENT',
  originalSeries: string,
  originalNumber: number
): any => {
  // Använd TransactionDate direkt som sträng om möjligt för att undvika timezone-problem
  const originalDateStr = originalVoucher.Voucher?.TransactionDate
  let transactionDate: string
  let usedFallback = false

  if (dateMode === 'DATE_IN_COMMENT') {
    const comment = originalVoucher.Voucher?.Comments || ''
    const extractedDate = extractDateFromComment(comment)
    if (extractedDate) {
      transactionDate = extractedDate
    } else {
      // Logga att datum inte hittades och använd fallback
      addLogEntry('warn', 'No date found in Comments, using fallback (first day of next month)', {
        comment,
        voucherSeries: originalSeries,
        voucherNumber: originalNumber,
        originalTransactionDate: originalDateStr,
      })
      // Använd getFirstDayNextMonth med datum-strängen direkt
      transactionDate = getFirstDayNextMonth(originalDateStr || new Date().toISOString().slice(0, 10))
      usedFallback = true
    }
  } else {
    // Använd getFirstDayNextMonth med datum-strängen direkt
    transactionDate = getFirstDayNextMonth(originalDateStr || new Date().toISOString().slice(0, 10))
  }

  // Byt debet/kredit på varje rad
  const reversedRows = (originalVoucher.Voucher?.VoucherRows || []).map((row: any) => ({
    Account: row.Account,
    Debit: row.Credit || 0, // Byt debet till kredit
    Credit: row.Debit || 0, // Byt kredit till debet
    CostCenter: row.CostCenter,
    Project: row.Project,
    Description: row.Description,
    TransactionInformation: row.TransactionInformation,
  }))

  // Skapa beskrivning med originalverifikationens serie och nummer
  const description = `Vändning av ${originalSeries}${originalNumber}`
  
  // Om fallback användes, lägg till information om detta i Comments
  const comments = usedFallback 
    ? `Inget datum hittades i kommentaren på verifikat ${originalSeries}${originalNumber} använder därför första datum i nästa månad.`
    : undefined

  // Viktigt: Skicka INTE med VoucherNumber - Fortnox tilldelar numret automatiskt
  const voucher: any = {
    Description: description,
    TransactionDate: transactionDate,
    VoucherSeries: targetSeries,
    VoucherRows: reversedRows,
  }
  
  // Lägg till Comments om fallback användes
  if (comments) {
    voucher.Comments = comments
  }

  return {
    Voucher: voucher,
  }
}

// Event-log för debugging (sparas i minnet, max 100 events)
type EventLogEntry = {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  data?: any
}

const eventLog: EventLogEntry[] = []
const MAX_LOG_ENTRIES = 100

const addLogEntry = (level: EventLogEntry['level'], message: string, data?: any): void => {
  eventLog.push({
    timestamp: Date.now(),
    level,
    message,
    data,
  })
  // Behåll endast de senaste MAX_LOG_ENTRIES
  if (eventLog.length > MAX_LOG_ENTRIES) {
    eventLog.shift()
  }
  // Logga också till console
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  logFn(`[WS] ${message}`, data || '')
}

export const getEventLog = (): EventLogEntry[] => {
  return [...eventLog]
}

/**
 * Loggar vändningshändelser till audit_log.
 *
 * Retentionstider:
 * - reversal_created: behålls för alltid
 * - reversal_failed: behålls för alltid (viktig för felsökning)
 * - reversal_skipped: rensas automatiskt efter 24 timmar
 */
const logReversal = async (
  companyId: string,
  action: 'reversal_created' | 'reversal_failed' | 'reversal_skipped',
  payload: {
    source_series: string
    source_number: number
    target_series?: string
    target_number?: number
    financial_year: number
    error_message?: string
  }
) => {
  try {
    // 1. Logga händelsen
    await supabaseAdmin.from('audit_log').insert({
      company_id: companyId,
      user_id: null, // Automatisk process, ingen användare
      action,
      payload_json: payload
    })

    // 2. Rensa gamla reversal_skipped (äldre än 24 timmar)
    //    Körs slumpmässigt ~10% av gångerna för att inte belasta varje request
    if (Math.random() < 0.1) {
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from('audit_log')
        .delete()
        .eq('action', 'reversal_skipped')
        .lt('created_at', cutoff24h)
    }
  } catch (err: any) {
    addLogEntry('error', 'Failed to log reversal to audit_log', {
      error: err?.message || String(err),
      action,
      payload
    })
  }
}

/**
 * Hantera voucher-created event
 */
export const handleVoucherCreated = async (evt: VoucherEvent): Promise<void> => {
  try {
    // Logga hela eventet för debugging
    addLogEntry('info', `Event received: ${evt.type}`, {
      fullEvent: evt,
    })

    const tenantId = Number(evt.tenantId)
    const offset = String(evt.offset)

    // Parsa id om det är i formatet "financialyear-series-number" (t.ex. "1-R-7")
    let financialYear: number | null = null
    let series: string | null = null
    let voucherNumber: number | null = null

    if (evt.id && typeof evt.id === 'string') {
      // Försök parsa formatet "financialyear-series-number"
      const parts = evt.id.split('-')
      if (parts.length === 3) {
        financialYear = Number(parts[0])
        series = parts[1]
        voucherNumber = Number(parts[2])
        addLogEntry('info', 'Parsed combined ID format', {
          id: evt.id,
          financialYear,
          series,
          voucherNumber,
        })
      }
    }

    // Om inte parsad från id, försök från separata fält
    if (!financialYear || !series || !voucherNumber) {
      financialYear = evt.year ? Number(evt.year) : null
      series = evt.series ? String(evt.series) : null
      voucherNumber = evt.id ? Number(evt.id) : null
    }

    addLogEntry('info', `Parsed event data`, {
      tenantId,
      financialYear,
      series,
      voucherNumber,
      offset,
      idRaw: evt.id,
      yearRaw: evt.year,
      seriesRaw: evt.series,
      financialYearValid: financialYear !== null && Number.isFinite(financialYear) && financialYear > 0,
      seriesValid: series !== null && series !== 'undefined' && series !== 'null',
      voucherNumberValid: voucherNumber !== null && Number.isFinite(voucherNumber) && voucherNumber > 0,
    })

    // Filtrera på type
    if (evt.type !== 'voucher-created-v1') {
      addLogEntry('info', `Event type mismatch: ${evt.type} (expected voucher-created-v1)`)
      return
    }

    // Om financialYear, series eller voucherNumber saknas, försök hitta verifikationen via timestamp
    let finalFinancialYear: number | null = financialYear
    let finalSeries: string | null = series
    let finalVoucherNumber: number | null = voucherNumber

    if (!finalFinancialYear || !Number.isFinite(finalFinancialYear) || finalFinancialYear <= 0 || !finalSeries || finalSeries === 'undefined' || finalSeries === 'null' || !finalVoucherNumber || !Number.isFinite(finalVoucherNumber) || finalVoucherNumber <= 0) {
      addLogEntry('info', 'Event missing year/series/id - attempting to find voucher by timestamp', {
        timestamp: evt.timestamp,
        tenantId,
      })

      // Försök hitta verifikationen baserat på timestamp
      // Hämta räkenskapsår för timestamp-datumet
      const eventDate = new Date(evt.timestamp)
      const dateStr = eventDate.toISOString().slice(0, 10) // YYYY-MM-DD
      
      try {
        // Hämta token för company (behöver companyId först)
        const companyId = await getCompanyIdFromTenantId(tenantId)
        if (!companyId) {
          addLogEntry('warn', 'Cannot find voucher - no company mapping', { tenantId })
          return
        }

        const tokenData = await getAnyFreshTokenForCompany(companyId)
        if (!tokenData?.token?.accessToken) {
          addLogEntry('error', 'Cannot find voucher - no token', { companyId })
          return
        }

        const bearer = `Bearer ${tokenData.token.accessToken}`

        // Hämta räkenskapsår
        const fyResp: any = await getFinancialYearsByDate(bearer, dateStr)
        const years: any[] = Array.isArray(fyResp?.FinancialYears) ? fyResp.FinancialYears : []
        if (years.length === 0) {
          addLogEntry('warn', 'Cannot find voucher - no financial year for date', { dateStr })
          return
        }

        const financialYearId = years[0]?.Id
        if (!financialYearId) {
          addLogEntry('warn', 'Cannot find voucher - financial year has no Id', { years })
          return
        }

        // Lista verifikationer för detta räkenskapsår, sorterade efter datum (senaste först)
        // Hämta de senaste 50 verifikationerna
        const vouchersResp: any = await listVouchers(bearer, {
          financialYear: financialYearId,
          limit: 50,
        })

        const vouchers: any[] = Array.isArray(vouchersResp?.Vouchers) ? vouchersResp.Vouchers : []
        
        // Hitta verifikation som skapades närmast timestamp
        let foundVoucher: any = null
        let minTimeDiff = Infinity
        
        for (const voucher of vouchers) {
          const voucherDate = new Date(voucher.TransactionDate || voucher.CreatedAt || 0)
          const timeDiff = Math.abs(voucherDate.getTime() - eventDate.getTime())
          
          // Acceptera verifikationer inom 5 minuter från event-timestamp
          if (timeDiff < 5 * 60 * 1000 && timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff
            foundVoucher = voucher
          }
        }

        if (!foundVoucher) {
          addLogEntry('warn', 'Cannot find voucher - no voucher found near timestamp', {
            timestamp: evt.timestamp,
            dateStr,
            vouchersChecked: vouchers.length,
          })
          return
        }

        // Använd hittad verifikations data
        finalFinancialYear = foundVoucher.FinancialYearId || financialYearId
        finalSeries = foundVoucher.VoucherSeries
        finalVoucherNumber = foundVoucher.DocumentNumber || foundVoucher.VoucherNumber || foundVoucher.Id

        addLogEntry('info', 'Found voucher by timestamp', {
          financialYear: finalFinancialYear,
          series: finalSeries,
          voucherNumber: finalVoucherNumber,
          timeDiff: minTimeDiff,
        })
      } catch (err: any) {
        addLogEntry('error', 'Error finding voucher by timestamp', {
          error: err?.message || String(err),
          timestamp: evt.timestamp,
        })
        return
      }
    }

    // Nu bör vi ha financialYear, series och voucherNumber
    if (!finalFinancialYear || !Number.isFinite(finalFinancialYear) || finalFinancialYear <= 0 || !finalSeries || finalSeries === 'undefined' || finalSeries === 'null' || !finalVoucherNumber || !Number.isFinite(finalVoucherNumber) || finalVoucherNumber <= 0) {
      addLogEntry('warn', 'Invalid event data - still missing required fields after lookup', {
        financialYear: finalFinancialYear,
        series: finalSeries,
        voucherNumber: finalVoucherNumber,
        tenantId,
        offset,
      })
      return
    }

    // Nu vet vi att dessa inte är null
    const safeFinancialYear = finalFinancialYear
    const safeSeries = finalSeries
    const safeVoucherNumber = finalVoucherNumber

    addLogEntry('info', `Processing voucher: ${safeSeries}-${safeVoucherNumber} (financialYear: ${safeFinancialYear})`, {
      tenantId,
      offset,
      series: safeSeries,
      voucherNumber: safeVoucherNumber,
      financialYear: safeFinancialYear,
    })

    // Mappa tenantId till company_id från databasen
    const companyId = await getCompanyIdFromTenantId(tenantId)
    
    if (!companyId) {
      addLogEntry('warn', `No company mapping found for tenantId ${tenantId}`, {
        tenantId,
        message: 'TenantId finns inte i databasen. Kontrollera att add-tenants-v1 response har sparats korrekt i company.external_db_number.',
      })
      return
    }

    // Filtrera på series (endast R) - efter companyId är hämtat för att kunna logga skip
    if (safeSeries.toUpperCase() !== 'R') {
      addLogEntry('info', `Series ${safeSeries} does not match trigger series R, skipping`)
      // Logga skip
      await logReversal(companyId, 'reversal_skipped', {
        source_series: safeSeries,
        source_number: safeVoucherNumber,
        financial_year: safeFinancialYear,
        error_message: `Serie ${safeSeries} matchar inte trigger-serie R`
      })
      return
    }
    addLogEntry('info', `Mapped tenantId ${tenantId} to companyId ${companyId}`)

    // Kontrollera idempotens
    const alreadyProcessed = await isEventProcessed(companyId, evt.topic, offset)
    if (alreadyProcessed) {
      addLogEntry('info', `Event already processed: ${companyId}/${evt.topic}/${offset}`)
      return
    }

    // Hämta settings för company_id
    addLogEntry('info', `Fetching settings for company ${companyId}`)
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('id,company_id,auto_reverse_active,auto_reverse_trigger_series,auto_reverse_target_series,auto_reverse_date_mode')
      .eq('company_id', companyId)
      .eq('auto_reverse_active', true)
      .maybeSingle()

    if (!settings) {
      addLogEntry('warn', `No active auto-reverse settings for company ${companyId}`)
      return
    }

    addLogEntry('info', 'Settings found', {
      triggerSeries: settings.auto_reverse_trigger_series,
      targetSeries: settings.auto_reverse_target_series,
      dateMode: settings.auto_reverse_date_mode,
    })

    if (!settings.auto_reverse_trigger_series || !settings.auto_reverse_target_series) {
      addLogEntry('warn', `Incomplete settings for company ${companyId}`, settings)
      return
    }

    if (String(settings.auto_reverse_trigger_series).toUpperCase() !== finalSeries.toUpperCase()) {
      addLogEntry('info', `Series ${finalSeries} does not match trigger series ${settings.auto_reverse_trigger_series}`)
      // Logga skip
      await logReversal(companyId, 'reversal_skipped', {
        source_series: finalSeries,
        source_number: safeVoucherNumber,
        financial_year: safeFinancialYear,
        error_message: `Serie ${finalSeries} matchar inte trigger-serie ${settings.auto_reverse_trigger_series}`
      })
      return
    }

    addLogEntry('info', `Series match confirmed: ${finalSeries} matches trigger ${settings.auto_reverse_trigger_series}`)

    // Hämta token för company
    addLogEntry('info', `Fetching token for company ${companyId}`)
    const tokenData = await getAnyFreshTokenForCompany(companyId)
    if (!tokenData?.token?.accessToken) {
      addLogEntry('error', `No token found for company ${companyId}`)
      return
    }

    const bearer = `Bearer ${tokenData.token.accessToken}`

    // Hämta originalverifikationen
    // Enligt instruktion: GET /3/vouchers/{VoucherSeries}/{VoucherNumber}?financialyear={financialyear}
    addLogEntry('info', `Fetching original voucher ${safeSeries}/${safeVoucherNumber}?financialyear=${safeFinancialYear}`)
    const originalVoucher = await getVoucher(bearer, {
      series: safeSeries,
      number: safeVoucherNumber,
      financialYear: safeFinancialYear,
    }) as FortnoxVoucherResponse | null
    
    if (!originalVoucher?.Voucher) {
      addLogEntry('error', `Could not fetch voucher ${safeSeries}/${safeVoucherNumber}?financialyear=${safeFinancialYear}`)
      return
    }

    addLogEntry('info', 'Original voucher fetched', {
      description: originalVoucher.Voucher?.Description,
      comments: originalVoucher.Voucher?.Comments,
      transactionDate: originalVoucher.Voucher?.TransactionDate,
      rowsCount: originalVoucher.Voucher?.VoucherRows?.length || 0,
    })

    // Skapa omvänd verifikation
    addLogEntry('info', `Creating reversed voucher in series ${settings.auto_reverse_target_series}`)
    const reversedVoucher = createReversedVoucher(
      originalVoucher,
      settings.auto_reverse_target_series,
      settings.auto_reverse_date_mode || 'FIRST_DAY_NEXT_MONTH',
      safeSeries,
      safeVoucherNumber
    )

    // Skapa verifikation i Fortnox
    // Testar utan financialyear - Fortnox bör kunna bestämma räkenskapsåret från TransactionDate
    const createUrl = `https://api.fortnox.se/3/vouchers`
    addLogEntry('info', `Creating reversed voucher: POST ${createUrl} (TransactionDate: ${reversedVoucher.Voucher.TransactionDate})`)
    const result = await fortnoxPostJson(createUrl, bearer, reversedVoucher) as FortnoxVoucherResponse | null
    addLogEntry('success', `Created reversed voucher for ${safeSeries}-${safeVoucherNumber} -> ${settings.auto_reverse_target_series}`, {
      result: result?.Voucher ? { id: result.Voucher.DocumentNumber, series: result.Voucher.VoucherSeries } : null,
    })

    // Logga lyckad vändning
    await logReversal(companyId, 'reversal_created', {
      source_series: safeSeries,
      source_number: safeVoucherNumber,
      target_series: result?.Voucher?.VoucherSeries || settings.auto_reverse_target_series,
      target_number: result?.Voucher?.VoucherNumber || result?.Voucher?.DocumentNumber || 0,
      financial_year: safeFinancialYear
    })

    // Markera event som hanterat och spara offset
    await Promise.all([
      markEventProcessed(companyId, evt.topic, offset),
      saveWsOffset(companyId, evt.topic, offset),
    ])
    addLogEntry('info', 'Event marked as processed and offset saved')
  } catch (err: any) {
    addLogEntry('error', 'Error handling voucher created', {
      error: err?.message || String(err),
      stack: err?.stack,
    })
    
    // Logga misslyckad vändning om vi har tillräckligt med data
    try {
      const tenantId = Number(evt.tenantId)
      const companyId = await getCompanyIdFromTenantId(tenantId)
      if (companyId) {
        // Försök extrahera serie och nummer från event eller error context
        const series = evt.series || '?'
        const voucherNumber = typeof evt.id === 'number' ? evt.id : (typeof evt.id === 'string' ? parseInt(evt.id) : 0)
        const financialYear = evt.year || 0
        
        if (series !== '?' && voucherNumber > 0 && financialYear > 0) {
          await logReversal(companyId, 'reversal_failed', {
            source_series: String(series),
            source_number: voucherNumber,
            financial_year: financialYear,
            error_message: err?.message || String(err)
          })
        }
      }
    } catch (logErr) {
      // Ignorera fel vid loggning av fel
    }
  }
}

