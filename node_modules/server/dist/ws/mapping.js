"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMappedTenants = exports.setBearerToCompanyMapping = exports.setTenantMapping = exports.getCompanyIdFromTenantId = exports.updateTenantMapping = void 0;
const supabase_1 = require("../db/supabase");
const client_1 = require("../fortnox/client");
/**
 * Mapping mellan Fortnox tenantId och company_id
 * Använder en in-memory cache för snabb lookup
 */
const tenantToCompanyMap = new Map();
const bearerToCompanyMap = new Map();
/**
 * Uppdatera mapping från add-tenants-v1 response
 * Response innehåller tenantIds som en objekt där nycklarna är tenantId och värdena är metadata
 */
const updateTenantMapping = async (tenantIds, bearerTokens = []) => {
    try {
        // Hämta alla company_id från databasen
        const { data: companies } = await supabase_1.supabaseAdmin
            .from('company')
            .select('id,external_db_number');
        if (!companies)
            return;
        // Försök matcha tenantId med company via external_db_number
        for (const tenantIdStr of Object.keys(tenantIds)) {
            const tenantId = Number(tenantIdStr);
            if (!Number.isFinite(tenantId))
                continue;
            // Försök hitta matchande company via external_db_number (tenantId är Fortnox DatabaseNumber)
            const matched = companies.find((c) => c.external_db_number && Number(c.external_db_number) === tenantId);
            if (matched) {
                tenantToCompanyMap.set(tenantId, matched.id);
            }
        }
        // Försök också matcha via bearer-tokens genom att anropa getMe()
        // Detta ger oss tenantId direkt från token
        for (const bearer of bearerTokens) {
            try {
                const me = await (0, client_1.getMe)(bearer);
                const tokenTenantId = me?.CompanyInformation?.DatabaseNumber;
                if (tokenTenantId && Number.isFinite(tokenTenantId)) {
                    // Hitta company_id för denna bearer-token
                    const companyId = bearerToCompanyMap.get(bearer);
                    if (companyId) {
                        tenantToCompanyMap.set(Number(tokenTenantId), companyId);
                        console.log(`[WS] Mapped tenantId ${tokenTenantId} to companyId ${companyId} via bearer token`);
                    }
                }
            }
            catch (err) {
                // Ignorera fel - token kan vara ogiltig
                console.error(`[WS] Error mapping bearer token:`, err);
            }
        }
    }
    catch (err) {
        console.error('[WS] Error updating tenant mapping:', err);
    }
};
exports.updateTenantMapping = updateTenantMapping;
/**
 * Hämta company_id från tenantId (Fortnox DatabaseNumber)
 * Försök först från minnet, sedan från databasen via external_db_number
 */
const getCompanyIdFromTenantId = async (tenantId) => {
    // Försök först från minnet
    const cached = tenantToCompanyMap.get(tenantId);
    if (cached)
        return cached;
    // Om inte i minnet, hämta från databasen via external_db_number kolumnen
    try {
        const { data: company } = await supabase_1.supabaseAdmin
            .from('company')
            .select('id')
            .eq('external_db_number', tenantId)
            .single();
        if (company?.id) {
            // Spara i minnet för framtida användning
            tenantToCompanyMap.set(tenantId, company.id);
            return company.id;
        }
    }
    catch (err) {
        // Ignorera fel - company kanske inte finns
    }
    return null;
};
exports.getCompanyIdFromTenantId = getCompanyIdFromTenantId;
/**
 * Lägg till explicit mapping (används när vi vet kopplingen)
 */
const setTenantMapping = (tenantId, companyId) => {
    tenantToCompanyMap.set(tenantId, companyId);
};
exports.setTenantMapping = setTenantMapping;
/**
 * Lägg till mapping mellan bearer-token och company_id
 */
const setBearerToCompanyMapping = (bearer, companyId) => {
    bearerToCompanyMap.set(bearer, companyId);
};
exports.setBearerToCompanyMapping = setBearerToCompanyMapping;
/**
 * Hämta alla mappade tenants
 */
const getAllMappedTenants = () => {
    return Array.from(tenantToCompanyMap.entries()).map(([tenantId, companyId]) => ({
        tenantId,
        companyId,
    }));
};
exports.getAllMappedTenants = getAllMappedTenants;
