"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessCompany = exports.companyExists = exports.isCompanyAllowed = void 0;
const supabase_1 = require("./supabase");
/**
 * Kontrollera om ett databasnummer finns i whitelist
 */
const isCompanyAllowed = async (dbNumber) => {
    if (!dbNumber || !Number.isFinite(dbNumber))
        return false;
    const { data, error } = await supabase_1.supabaseAdmin
        .from("allowed_company")
        .select("id")
        .eq("fortnox_database_number", dbNumber)
        .maybeSingle();
    if (error) {
        console.error("Error checking whitelist:", error);
        return false;
    }
    return !!data;
};
exports.isCompanyAllowed = isCompanyAllowed;
/**
 * Kontrollera om ett företag redan finns i company-tabellen
 */
const companyExists = async (dbNumber) => {
    if (!dbNumber || !Number.isFinite(dbNumber))
        return false;
    const { data, error } = await supabase_1.supabaseAdmin
        .from("company")
        .select("id")
        .eq("external_db_number", dbNumber)
        .maybeSingle();
    if (error) {
        console.error("Error checking existing company:", error);
        return false;
    }
    return !!data;
};
exports.companyExists = companyExists;
/**
 * Kombinerad logik: tillåt om i whitelist ELLER om företaget redan finns
 */
const canAccessCompany = async (dbNumber) => {
    if (!dbNumber || !Number.isFinite(dbNumber))
        return false;
    // Kolla först om företaget redan finns (befintliga företag tillåts)
    const exists = await (0, exports.companyExists)(dbNumber);
    if (exists)
        return true;
    // Om inte befintligt, kolla whitelist
    return await (0, exports.isCompanyAllowed)(dbNumber);
};
exports.canAccessCompany = canAccessCompany;
