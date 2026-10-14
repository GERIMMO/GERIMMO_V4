/**
 * Audit du 13/10/2026 (VER-PR178-02, VER-PR178-05) : la purge des copies de saisie ne couvrait que le chemin
 * « déconnexion cliquée » :
 *   - un compte qui arrivait après une session expirée (sans clic sur « Se déconnecter ») héritait des copies du
 *     précédent, tant qu'il n'ouvrait pas la fiche personne ou le formulaire d'incident ;
 *   - le texte « supprimées au bout de 7 jours » était faux pour le brouillon de lot et le devis (l'expiration n'était
 *     évaluée qu'à la relecture de la même clé) ;
 *   - la purge partait au clic, avant la réussite de la déconnexion : hors ligne, la copie était perdue et la session
 *     restait ouverte. Elle part maintenant à l'arrivée sur /connexion?raison=deconnecte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copieExpiree, DUREE_COPIES_LOCALES_MS, purgerCopiesPerimees, RAISON_DECONNEXION,
} from "../src/lib/copies-locales";
import { cleCopieFichiers, copieObsolete, DUREE_COPIE_FICHIERS } from "../src/lib/brouillon-fichiers";
import { cleDevisLocal, DUREE_DEVIS_LOCAL } from "../src/lib/brouillon-devis-local";
import { cleBrouillonBien, DUREE_BROUILLON_BIEN } from "../src/lib/brouillon-bien";
import { MESSAGE_SESSION_EXPIREE, sansMessageSessionExpiree } from "../src/lib/session-expiree";
import { validerBrouillonIncident, validerBrouillonPersonne } from "../src/lib/brouillons-personne-incident";

const JOUR = 24 * 60 * 60 * 1000;
const MAINTENANT = Date.UTC(2026, 9, 14, 10, 0, 0);
const copie = (age: number) => JSON.stringify({ version: 1, enregistreLe: MAINTENANT - age, contenu: {} });

function faux(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return {
    map: m,
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

describe("durée de conservation", () => {
  it("une seule durée pour toutes les copies : celle que l'écran annonce", () => {
    expect(DUREE_COPIES_LOCALES_MS).toBe(7 * JOUR);
    expect(DUREE_BROUILLON_BIEN).toBe(DUREE_COPIES_LOCALES_MS);
    expect(DUREE_DEVIS_LOCAL).toBe(DUREE_COPIES_LOCALES_MS);
    expect(DUREE_COPIE_FICHIERS).toBe(DUREE_COPIES_LOCALES_MS);
  });
});

describe("copieExpiree (localStorage : brouillon de lot, devis)", () => {
  it("expire après 7 jours, pas avant", () => {
    expect(copieExpiree(copie(7 * JOUR), MAINTENANT)).toBe(false);
    expect(copieExpiree(copie(7 * JOUR + 1), MAINTENANT)).toBe(true);
    expect(copieExpiree(copie(0), MAINTENANT)).toBe(false);
  });
  it("laisse à son lecteur ce qu'elle ne comprend pas", () => {
    expect(copieExpiree(null, MAINTENANT)).toBe(false);
    expect(copieExpiree("pas du json", MAINTENANT)).toBe(false);
    expect(copieExpiree(JSON.stringify({ contenu: {} }), MAINTENANT)).toBe(false);
    expect(copieExpiree(JSON.stringify({ enregistreLe: "hier" }), MAINTENANT)).toBe(false);
    expect(copieExpiree("42", MAINTENANT)).toBe(false);
  });
});

describe("purgerCopiesPerimees", () => {
  it("efface les copies périmées de lot et de devis, garde les récentes et ce qui n'est pas une copie", () => {
    const local = faux({
      [cleBrouillonBien("A", "org")]: copie(8 * JOUR),
      [cleDevisLocal("A", "vieux")]: copie(30 * JOUR),
      [cleDevisLocal("A", "recent")]: copie(2 * JOUR),
      "gerimmo-edl-brouillon-42": copie(60 * JOUR),
      "theme": copie(60 * JOUR),
    });
    expect(purgerCopiesPerimees(local, MAINTENANT)).toBe(2);
    expect([...local.map.keys()].sort()).toEqual([cleDevisLocal("A", "recent"), "gerimmo-edl-brouillon-42", "theme"].sort());
  });
  it("ne lève jamais d'erreur si le stockage est refusé", () => {
    const refuse = { get length(): number { throw new Error("refusé"); }, key: () => null, removeItem: () => {}, getItem: () => null };
    expect(() => purgerCopiesPerimees(refuse, MAINTENANT)).not.toThrow();
    vi.stubGlobal("localStorage", undefined);
    try { expect(purgerCopiesPerimees(undefined, MAINTENANT)).toBe(0); } finally { vi.unstubAllGlobals(); }
  });
});

describe("copieObsolete (IndexedDB : fiche personne, incident)", () => {
  const valeur = (age: number) => ({ revision: "r", date: MAINTENANT - age, donnees: {} });
  const cle = cleCopieFichiers("personne", "A", "org");
  it("garde la copie récente du compte courant", () => {
    expect(copieObsolete(cle, valeur(JOUR), "A", MAINTENANT)).toBe(false);
  });
  it("efface la copie d'un autre compte, même récente", () => {
    expect(copieObsolete(cle, valeur(JOUR), "B", MAINTENANT)).toBe(true);
    expect(copieObsolete(cleCopieFichiers("incident", "A", "org"), valeur(0), "B", MAINTENANT)).toBe(true);
  });
  it("efface la copie périmée ou incohérente du compte courant", () => {
    expect(copieObsolete(cle, valeur(7 * JOUR + 1), "A", MAINTENANT)).toBe(true);
    expect(copieObsolete(cle, { revision: "r" }, "A", MAINTENANT)).toBe(true);
    expect(copieObsolete(cle, null, "A", MAINTENANT)).toBe(true);
  });
  it("ne juge pas le compte d'une clé qui n'a pas la forme d'une copie", () => {
    expect(copieObsolete("autre-chose", valeur(JOUR), "B", MAINTENANT)).toBe(false);
  });
});

describe("déconnexion : la purge part à l'arrivée sur la page de connexion", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.doUnmock("@/lib/supabase/server"); vi.doUnmock("next/headers"); vi.doUnmock("next/navigation"); });

  it("la déconnexion réussie redirige vers /connexion?raison=deconnecte", async () => {
    const redirect = vi.fn((adresse: string) => { throw new Error(`NEXT_REDIRECT ${adresse}`); });
    const signOut = vi.fn(async () => ({ error: null }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut } }) }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));
    vi.doMock("next/navigation", () => ({ redirect }));
    const { seDeconnecter } = await import("../src/app/actions/auth");
    await expect(seDeconnecter()).rejects.toThrow("NEXT_REDIRECT");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(`/connexion?raison=${RAISON_DECONNEXION}`);
    expect(RAISON_DECONNEXION).toBe("deconnecte");
  });

  it("une déconnexion qui échoue ne redirige pas : la copie locale n'a pas été touchée", async () => {
    const redirect = vi.fn();
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: async () => { throw new TypeError("fetch failed"); } } }) }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));
    vi.doMock("next/navigation", () => ({ redirect }));
    const { seDeconnecter } = await import("../src/app/actions/auth");
    await expect(seDeconnecter()).rejects.toThrow("fetch failed");
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ── VER-PR178-04 : le message « session expirée » mémorisé n'est pas réaffiché après la reconnexion ──────────────────
describe("reprise après une session expirée", () => {
  const valeurs = Object.fromEntries(["nom", "prenom", "date_naissance", "commune_naissance", "email", "telephone", "address_line1", "postal_code", "city"].map(k => [k, "test"]));
  const personne = (bilan: object) => ({ role: "locataire", morale: false, etape: 4, lotId: "", valeurs, pieces: [], bilan });
  const incident = (bilan: object) => ({
    commande: crypto.randomUUID(), categorie: "plomberie_joint", piece: "Cuisine", description: "fuite", anciennete: "hier",
    urgence: "normale", photos: [], envoye: false, bilan,
  });

  it("retire le message de session expirée d'un bilan, rien d'autre", () => {
    expect(sansMessageSessionExpiree({ erreur: MESSAGE_SESSION_EXPIREE, personneCreee: { id: "p" } })).toEqual({ personneCreee: { id: "p" } });
    const autre = { erreur: "La création n’a pas pu être confirmée.", creationIncertaine: true };
    expect(sansMessageSessionExpiree(autre)).toEqual(autre);
    expect(sansMessageSessionExpiree({})).toEqual({});
  });

  it("une fiche reprise ne réaffiche pas « Votre session a expiré » : la personne s'est reconnectée", () => {
    const reprise = validerBrouillonPersonne(personne({ erreur: MESSAGE_SESSION_EXPIREE }));
    expect(reprise?.bilan.erreur).toBeUndefined();
  });
  it("une fiche reprise garde les autres messages, dont celui d'une création incertaine", () => {
    const reprise = validerBrouillonPersonne(personne({ creationIncertaine: true, erreur: "La création n’a pas pu être confirmée. Vérifiez la liste des fiches avant de réessayer." }));
    expect(reprise?.bilan.creationIncertaine).toBe(true);
    expect(reprise?.bilan.erreur).toMatch(/Vérifiez la liste/);
  });
  it("un signalement repris ne réaffiche pas non plus le message de session expirée", () => {
    expect(validerBrouillonIncident(incident({ erreur: MESSAGE_SESSION_EXPIREE }))?.bilan.erreur).toBeUndefined();
    expect(validerBrouillonIncident(incident({ erreur: "La réponse n’est pas arrivée." }))?.bilan.erreur).toBe("La réponse n’est pas arrivée.");
  });
});
