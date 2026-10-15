/**
 * X20 (SA-11, décision du 14/10/2026) — le journal du blocage d'un compte dit ce qui s'est passé.
 *
 * Constat : la ligne « Compte bloqué » est écrite AVANT l'appel d'administration (choix voulu : un geste
 * sur un compte sans trace n'est pas acceptable). Si le blocage échouait, le journal gardait « Compte
 * bloqué » suivi d'une ligne d'échec sans cause : une lecture rapide laissait croire que le compte était
 * bloqué.
 *
 * Décision : libeller « Blocage demandé » (la ligne posée avant l'effet) et « Blocage échoué » (la ligne
 * posée quand l'effet échoue), et garder la cause technique expurgée dans les détails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.service }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn() }));

import { controlerCompte } from "../src/app/actions/controle-supervision";
import { causeTechniqueExpurgee } from "../src/lib/journal-supervision";
import { detailsExpurges, libelleActionAudit } from "../src/lib/libelles-journaux";

const ID = "11111111-1111-4111-8111-111111111111";
const MOI = "22222222-2222-4222-8222-222222222222";
const AUTRE = "9f0c3a52-7b1e-4c8d-a6e4-0d2b5f7c91aa";
const JETON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadpayloadpayload.signaturesignature";
/** Une erreur d'administration réaliste ET chargée : adresse, identifiant, jeton, puis un long texte technique. */
const ERREUR_CHARGEE = `Impossible de bloquer marie.durand@exemple.fr (compte ${AUTRE}) avec le jeton ${JETON} ${"détail technique ".repeat(20)}`;
const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};

/** Les lignes d'audit écrites, dans l'ordre. */
function banc(erreurAdmin: string | null) {
  const lignes: { action: string; details: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "journaliser_supervision") lignes.push({ action: String(args?.p_action), details: (args?.p_details ?? {}) as Record<string, unknown> });
    return { data: fn === "dossier_compte_supervision" ? [{ est_super_admin: false }] : true, error: null };
  });
  mocks.createClient.mockResolvedValue({ rpc, auth: { getUser: vi.fn(async () => ({ data: { user: { id: MOI } } })) } });
  const updateUserById = vi.fn(async () => ({ error: erreurAdmin ? { message: erreurAdmin } : null }));
  mocks.service.mockReturnValue({ auth: { admin: { updateUserById } } });
  return { lignes, updateUserById };
}

beforeEach(() => vi.resetAllMocks());

describe("X20 — libellés du journal", () => {
  it("la ligne posée avant l'effet se lit « Blocage demandé », jamais « Compte bloqué »", () => {
    expect(libelleActionAudit("compte_bloque")).toBe("Blocage demandé");
  });
  it("la ligne posée quand l'effet échoue se lit « Blocage échoué »", () => {
    expect(libelleActionAudit("blocage_echoue")).toBe("Blocage échoué");
  });
  it("les autres gestes sur un compte gardent leurs libellés", () => {
    expect(libelleActionAudit("compte_debloque")).toBe("Compte débloqué");
    expect(libelleActionAudit("second_facteur_reinitialise")).toBe("Second facteur réinitialisé");
    expect(libelleActionAudit("controle_compte_echec")).toBe("Geste sur un compte non abouti");
  });
});

describe("X20 — le blocage d'un compte", () => {
  it("blocage réussi : une seule ligne, « demandé » ; l'écran confirme l'effet", async () => {
    const b = banc(null);
    const r = await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }));
    expect(r.succes).toMatch(/Compte bloqué/);
    expect(b.lignes.map((l) => l.action)).toEqual(["compte_bloque"]);
    expect(b.updateUserById).toHaveBeenCalledWith(ID, { ban_duration: "876000h" });
  });

  it("blocage échoué : la ligne « demandé » puis une ligne « échoué » qui garde la cause expurgée", async () => {
    const b = banc("User not allowed");
    const r = await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }));
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toMatch(/n’a pas abouti/);
    expect(b.lignes.map((l) => l.action)).toEqual(["compte_bloque", "blocage_echoue"]);
    expect(b.lignes[1].details).toMatchObject({ compte: ID, geste: "bloquer", cause: "User not allowed" });
    // Ce que lit le super-administrateur sur la fiche du compte :
    expect(b.lignes.map((l) => libelleActionAudit(l.action))).toEqual(["Blocage demandé", "Blocage échoué"]);
  });

  it("blocage échoué avec une erreur d'administration chargée : ce qui est réellement écrit ne porte ni adresse, ni identifiant, ni jeton, ni plus de 120 caractères", async () => {
    const b = banc(ERREUR_CHARGEE);
    await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }));
    expect(b.lignes.map((l) => l.action)).toEqual(["compte_bloque", "blocage_echoue"]);
    // Les détails de la ligne d'échec : ces trois clés et aucune autre (aucun message brut recopié à côté de la cause).
    expect(b.lignes[1].details).toEqual({ compte: ID, geste: "bloquer", cause: expect.any(String) });
    const cause = b.lignes[1].details.cause as string;
    expect(cause).toMatch(/^Impossible de bloquer \[adresse\] \(compte \[identifiant\]\) avec le jeton \[jeton\]/);
    expect(cause.length).toBeLessThanOrEqual(120);
    // Aucune ligne écrite, quelle qu'elle soit, ne contient un morceau de l'erreur brute.
    const tout = JSON.stringify(b.lignes);
    for (const fuite of ["@", "durand", "exemple.fr", AUTRE, "eyJhbGci", "payloadpayload", "signaturesignature", ERREUR_CHARGEE.slice(0, 130)]) {
      expect(tout, fuite).not.toContain(fuite);
    }
  });

  it("déblocage échoué avec la même erreur chargée : la ligne générique ne recopie rien de l'erreur", async () => {
    const b = banc(ERREUR_CHARGEE);
    await controlerCompte(ID, {}, form({ geste: "debloquer", confirmation: "oui" }));
    expect(b.lignes.map((l) => l.action)).toEqual(["compte_debloque", "controle_compte_echec"]);
    expect(b.lignes[1].details).toEqual({ compte: ID, geste: "debloquer" });
  });

  it("la cause garde sa place dans les détails sans qu'un texte libre n'atteigne l'écran", async () => {
    const b = banc("User not allowed");
    await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }));
    // L'écran n'affiche que des codes courts : la cause (une phrase) reste au journal brut.
    expect(detailsExpurges(b.lignes[1].details)).toBe("geste : bloquer");
  });

  it("un échec de déblocage ou de réinitialisation garde la ligne générique (rien de plus que le blocage)", async () => {
    const b = banc("User not allowed");
    await controlerCompte(ID, {}, form({ geste: "debloquer", confirmation: "oui" }));
    expect(b.lignes.map((l) => l.action)).toEqual(["compte_debloque", "controle_compte_echec"]);
  });
});

describe("X20 — la cause technique est expurgée", () => {
  it("retire adresses, identifiants et longs jetons ; borne la longueur", () => {
    expect(causeTechniqueExpurgee("User not allowed")).toBe("User not allowed");
    expect(causeTechniqueExpurgee("Impossible de bloquer marie.durand@exemple.fr")).not.toMatch(/@|durand/);
    expect(causeTechniqueExpurgee(`Utilisateur ${ID} introuvable`)).not.toContain(ID);
    expect(causeTechniqueExpurgee("jeton eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef.xyz")).not.toMatch(/eyJhbGci/);
    expect(causeTechniqueExpurgee("x".repeat(500)).length).toBeLessThanOrEqual(120);
    expect(causeTechniqueExpurgee("")).toBe("cause inconnue");
  });

  it("dit ce qui a été retiré : « [adresse] », « [identifiant] » ou « [jeton] »", () => {
    expect(causeTechniqueExpurgee("Impossible de bloquer marie.durand@exemple.fr.")).toBe("Impossible de bloquer [adresse]");
    // La règle de l'identifiant passe AVANT celle du jeton : sans elle, un identifiant serait rendu « [jeton] ».
    expect(causeTechniqueExpurgee(`Utilisateur ${ID} introuvable`)).toBe("Utilisateur [identifiant] introuvable");
    // Majuscules (AUTRE porte des lettres ; ID n'est fait que de chiffres).
    expect(causeTechniqueExpurgee(`Utilisateur ${AUTRE.toUpperCase()} introuvable`)).toBe("Utilisateur [identifiant] introuvable");
    expect(causeTechniqueExpurgee(`jeton ${JETON} refusé`)).toBe("jeton [jeton] refusé");
    expect(causeTechniqueExpurgee("x".repeat(500))).toBe("[jeton]");
  });

  it("borne un texte ordinaire (sans jeton à absorber) à 120 caractères exactement", () => {
    const longue = causeTechniqueExpurgee("mot ".repeat(100));
    expect(longue).toHaveLength(120);
    expect(longue.startsWith("mot mot mot")).toBe(true);
    // Sous la borne, rien n'est coupé.
    expect(causeTechniqueExpurgee("mot ".repeat(29).trim())).toBe("mot ".repeat(29).trim());
  });

  it("la borne s'applique APRÈS l'expurgation : une adresse n'est jamais coupée en deux puis laissée lisible", () => {
    const cause = causeTechniqueExpurgee(`${"mot ".repeat(28)}marie.durand@exemple.fr suite`);
    expect(cause).not.toMatch(/@|marie|durand|exemple/);
    expect(cause.length).toBeLessThanOrEqual(120);
  });

  it("ramène les espaces et sauts de ligne à un seul espace, sans espace aux bords", () => {
    expect(causeTechniqueExpurgee("  première\n\n  ligne\t suite  ")).toBe("première ligne suite");
  });

  it("rend « cause inconnue » pour une cause absente ou vide", () => {
    expect(causeTechniqueExpurgee(null)).toBe("cause inconnue");
    expect(causeTechniqueExpurgee(undefined)).toBe("cause inconnue");
    expect(causeTechniqueExpurgee("  \n\t ")).toBe("cause inconnue");
  });
});
