import crypto from "crypto";
import { env } from "../env";

const algorithm = "aes-256-gcm";

const deriveKey = (secret: string): Buffer => {
  // Use first 32 bytes of sha256 as key (deterministic and length-safe)
  const hash = crypto.createHash("sha256").update(secret).digest();
  return hash.subarray(0, 32);
};

const key = deriveKey(env.ENCRYPTION_KEY);

export type EncryptedValue = {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
};

export const encryptString = (plaintext: string): EncryptedValue => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
};

export const decryptString = (encrypted: EncryptedValue): string => {
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
};


