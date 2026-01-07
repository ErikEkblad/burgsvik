"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const schema = zod_1.z.object({
    PORT: zod_1.z.string().default("3002"),
    NODE_ENV: zod_1.z.string().default("development"),
    WEB_ORIGIN: zod_1.z.string().default("http://localhost:5173"),
    SUPABASE_URL: zod_1.z.string(),
    SUPABASE_SERVICE_ROLE: zod_1.z.string(),
    FORTNOX_CLIENT_ID: zod_1.z.string(),
    FORTNOX_CLIENT_SECRET: zod_1.z.string(),
    FORTNOX_REDIRECT_URI: zod_1.z.string(),
    ENCRYPTION_KEY: zod_1.z.string().min(32)
});
exports.env = schema.parse(process.env);
