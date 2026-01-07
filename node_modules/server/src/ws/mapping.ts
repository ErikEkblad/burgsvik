import { supabaseAdmin } from '../db/supabase'
import { getMe } from '../fortnox/client'

/**
 * Mapping mellan Fortnox tenantId och company_id
 * Använder en in-memory cache för snabb lookup
 */
const tenantToCompanyMap = new Map<number, string>()
const bearerToCompanyMap = new Map<string, string>()

/**
 * Uppdatera mapping från add-tenants-v1 response
 * Response innehåller tenantIds som en objekt där nycklarna är tenantId och värdena är metadata
 */
export const updateTenantMapping = async (
  tenantIds: Record<string | number, unknown>,
  bearerTokens: string[] = []
): Promise<void> => {
  try {
    // Hämta alla company_id från databasen
    const { data: companies } = await supabaseAdmin
      .from('company')
      .select('id,external_db_number')

    if (!companies) return

    // Försök matcha tenantId med company via external_db_number
    for (const tenantIdStr of Object.keys(tenantIds)) {
      const tenantId = Number(tenantIdStr)
      if (!Number.isFinite(tenantId)) continue

      // Försök hitta matchande company via external_db_number (tenantId är Fortnox DatabaseNumber)
      const matched = companies.find(
        (c) => c.external_db_number && Number(c.external_db_number) === tenantId
      )

      if (matched) {
        tenantToCompanyMap.set(tenantId, matched.id)
      }
    }

    // Försök också matcha via bearer-tokens genom att anropa getMe()
    // Detta ger oss tenantId direkt från token
    for (const bearer of bearerTokens) {
      try {
        const me: any = await getMe(bearer)
        const tokenTenantId = me?.CompanyInformation?.DatabaseNumber
        if (tokenTenantId && Number.isFinite(tokenTenantId)) {
          // Hitta company_id för denna bearer-token
          const companyId = bearerToCompanyMap.get(bearer)
          if (companyId) {
            tenantToCompanyMap.set(Number(tokenTenantId), companyId)
            console.log(`[WS] Mapped tenantId ${tokenTenantId} to companyId ${companyId} via bearer token`)
          }
        }
      } catch (err) {
        // Ignorera fel - token kan vara ogiltig
        console.error(`[WS] Error mapping bearer token:`, err)
      }
    }
  } catch (err) {
    console.error('[WS] Error updating tenant mapping:', err)
  }
}

/**
 * Hämta company_id från tenantId (Fortnox DatabaseNumber)
 * Försök först från minnet, sedan från databasen via external_db_number
 */
export const getCompanyIdFromTenantId = async (tenantId: number): Promise<string | null> => {
  // Försök först från minnet
  const cached = tenantToCompanyMap.get(tenantId)
  if (cached) return cached
  
  // Om inte i minnet, hämta från databasen via external_db_number kolumnen
  try {
    const { data: company } = await supabaseAdmin
      .from('company')
      .select('id')
      .eq('external_db_number', tenantId)
      .single()
    
    if (company?.id) {
      // Spara i minnet för framtida användning
      tenantToCompanyMap.set(tenantId, company.id)
      return company.id
    }
  } catch (err) {
    // Ignorera fel - company kanske inte finns
  }
  
  return null
}

/**
 * Lägg till explicit mapping (används när vi vet kopplingen)
 */
export const setTenantMapping = (tenantId: number, companyId: string): void => {
  tenantToCompanyMap.set(tenantId, companyId)
}

/**
 * Lägg till mapping mellan bearer-token och company_id
 */
export const setBearerToCompanyMapping = (bearer: string, companyId: string): void => {
  bearerToCompanyMap.set(bearer, companyId)
}

/**
 * Hämta alla mappade tenants
 */
export const getAllMappedTenants = (): Array<{ tenantId: number; companyId: string }> => {
  return Array.from(tenantToCompanyMap.entries()).map(([tenantId, companyId]) => ({
    tenantId,
    companyId,
  }))
}

