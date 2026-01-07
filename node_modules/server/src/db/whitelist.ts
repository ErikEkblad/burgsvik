import { supabaseAdmin } from "./supabase";

/**
 * Kontrollera om ett databasnummer finns i whitelist
 */
export const isCompanyAllowed = async (dbNumber: number): Promise<boolean> => {
  if (!dbNumber || !Number.isFinite(dbNumber)) return false;

  const { data, error } = await supabaseAdmin
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

/**
 * Kontrollera om ett företag redan finns i company-tabellen
 */
export const companyExists = async (dbNumber: number): Promise<boolean> => {
  if (!dbNumber || !Number.isFinite(dbNumber)) return false;

  const { data, error } = await supabaseAdmin
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

/**
 * Kombinerad logik: tillåt om i whitelist ELLER om företaget redan finns
 */
export const canAccessCompany = async (dbNumber: number): Promise<boolean> => {
  if (!dbNumber || !Number.isFinite(dbNumber)) return false;

  // Kolla först om företaget redan finns (befintliga företag tillåts)
  const exists = await companyExists(dbNumber);
  if (exists) return true;

  // Om inte befintligt, kolla whitelist
  return await isCompanyAllowed(dbNumber);
};

