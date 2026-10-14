/**
 * Audit du 13/10/2026 (PR178-A-05, PR178-B-01) : un envoi refusé parce que la session a expiré était présenté comme une
 * « confirmation non reçue », sans mot sur la session.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_SESSION_EXPIREE, messageApresEchec, sessionExpiree } from "../src/lib/session-expiree";

afterEach(() => vi.unstubAllGlobals());

describe("sessionExpiree", () => {
  it("vrai quand la page courante est redirigée (le proxy renvoie vers la connexion)", async () => {
    const fetchSimule = vi.fn(async () => ({ type: "opaqueredirect" }));
    vi.stubGlobal("fetch", fetchSimule);
    expect(await sessionExpiree("https://exemple.test/agence/1/alertes")).toBe(true);
    expect(fetchSimule).toHaveBeenCalledWith("https://exemple.test/agence/1/alertes",
      expect.objectContaining({ method: "HEAD", redirect: "manual", credentials: "same-origin", cache: "no-store" }));
  });
  it("faux quand la page répond normalement", async () => {
    vi.stubGlobal("fetch", async () => ({ type: "basic", status: 200 }));
    expect(await sessionExpiree("https://exemple.test/p")).toBe(false);
  });
  it("faux en cas de doute : réseau coupé, adresse absente", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    expect(await sessionExpiree("https://exemple.test/p")).toBe(false);
    expect(await sessionExpiree(undefined)).toBe(false);
  });
});

describe("messageApresEchec", () => {
  it("dit que la session a expiré, et que la saisie est conservée", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/p" });
    vi.stubGlobal("fetch", async () => ({ type: "opaqueredirect" }));
    const message = await messageApresEchec("La confirmation n’a pas pu être reçue.");
    expect(message).toBe(MESSAGE_SESSION_EXPIREE);
    expect(message).toMatch(/session a expiré/);
    expect(message).toMatch(/saisie est conservée/);
  });
  it("garde le message d'origine quand la session est ouverte", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/p" });
    vi.stubGlobal("fetch", async () => ({ type: "basic" }));
    expect(await messageApresEchec("La confirmation n’a pas pu être reçue.")).toBe("La confirmation n’a pas pu être reçue.");
  });
});
