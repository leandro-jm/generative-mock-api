import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";

const ISSUER = "mock-api";

export class JwtService {
  private key: Uint8Array;
  constructor(secret: string) {
    this.key = createHash("sha256").update(`jwt:${secret}`).digest();
  }

  async sign(claims: { sub: string; scopes: string[]; name?: string; kid?: string }, ttlMinutes: number): Promise<string> {
    return new SignJWT({ scopes: claims.scopes, name: claims.name, kid: claims.kid })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ttlMinutes}m`)
      .sign(this.key);
  }

  async verify(token: string): Promise<{ sub: string; scopes: string[]; name?: string; kid?: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ["HS256"] });
      return { sub: String(payload.sub), scopes: (payload.scopes as string[]) ?? [], name: payload.name as string | undefined, kid: payload.kid as string | undefined };
    } catch {
      return null;
    }
  }
}
