"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptString = exports.encryptString = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../env");
const algorithm = "aes-256-gcm";
const deriveKey = (secret) => {
    // Use first 32 bytes of sha256 as key (deterministic and length-safe)
    const hash = crypto_1.default.createHash("sha256").update(secret).digest();
    return hash.subarray(0, 32);
};
const key = deriveKey(env_1.env.ENCRYPTION_KEY);
const encryptString = (plaintext) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: encrypted.toString("base64"),
    };
};
exports.encryptString = encryptString;
const decryptString = (encrypted) => {
    const iv = Buffer.from(encrypted.iv, "base64");
    const authTag = Buffer.from(encrypted.authTag, "base64");
    const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
};
exports.decryptString = decryptString;
