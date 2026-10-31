// Segredos guardados no banco (chaves de IA etc.) ficam cifrados com AES-256-GCM; a chave deriva do APP_SECRET.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret: string): Buffer {
  return createHash("sha256").update(`settings:${secret}`).digest();
}

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(payload: string, secret: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("formato de segredo desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
