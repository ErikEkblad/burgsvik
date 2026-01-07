import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const schema = z.object({
  PORT: z.string().default("3002"),
  NODE_ENV: z.string().default("development"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string(),
  SUPABASE_SERVICE_ROLE: z.string(),
  FORTNOX_CLIENT_ID: z.string(),
  FORTNOX_CLIENT_SECRET: z.string(),
  FORTNOX_REDIRECT_URI: z.string(),
  ENCRYPTION_KEY: z.string().min(32)
});

export const env = schema.parse(process.env);
