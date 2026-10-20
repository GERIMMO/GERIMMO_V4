import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const api = process.env.SIGNATURE_TEST_API_URL ?? "";
const local = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(api);

describe.skipIf(!local)("Le banc respecte la révocation de session", () => {
  it("refuse la lecture, la modification du compte et le renouvellement après déconnexion", async () => {
    const adresse = [`session-${randomUUID()}`, "example.invalid"].join("@");
    const password = randomUUID();
    const requete = (chemin: string, method: string, body?: unknown, token?: string) => fetch(`${api}/auth/v1/${chemin}`, {
      method, headers: { apikey: "cle-locale", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const creation = await requete("signup", "POST", { email: adresse, password });
    expect(creation.status).toBe(200);
    const session = await creation.json();
    expect((await requete("user", "GET", undefined, session.access_token)).status).toBe(200);
    expect((await requete("logout?scope=local", "POST", undefined, session.access_token)).status).toBe(204);
    expect((await requete("user", "GET", undefined, session.access_token)).status).toBe(401);
    expect((await requete("user", "PUT", { password: randomUUID() }, session.access_token)).status).toBe(401);
    expect((await requete("token?grant_type=refresh_token", "POST", { refresh_token: session.refresh_token })).status).toBe(400);
    expect((await requete("token?grant_type=password", "POST", { email: adresse, password })).status).toBe(200);
  });
});
