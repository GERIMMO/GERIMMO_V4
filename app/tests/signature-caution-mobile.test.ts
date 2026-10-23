/**
 * Décision du dirigeant du 23/10/2026 « Cautionnement et état des lieux signés dans Gerimmo » (à la place de R29/R31
 * du plan de conformité), et constat R53 :
 *  · la caution confirme elle-même son mobile : lien à usage unique (empreinte en base), numéro saisi deux fois par
 *    elle, jamais celui du dossier ; la demande de signature est créée avec CE numéro ;
 *  · jeton mal formé, expiré ou réutilisé : refusé, sans appel au prestataire ;
 *  · état des lieux : la case « établi contradictoirement, sur place » et la date de la visite sont exigées par le
 *    serveur, confirmées en base avant la réservation ;
 *  · R53 : le message d'invitation dit la transmission des données à Zoho Sign ; l'état des lieux d'entrée y rappelle
 *    le droit de le compléter.
 * Prestataire, e-mail et base sont des doublures : aucun appel réel.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({
  acces: vi.fn(), assembler: vi.fn(), preparer: vi.fn(), activer: vi.fn(), email: vi.fn(), garde: vi.fn(), contexte: vi.fn(),
  rpc: vi.fn(), circuit: {} as Record<string, unknown>, mises: [] as [string, Record<string, unknown>][], liens: [] as Record<string, unknown>[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: m.garde }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.email }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ ipDeLaRequete: async () => "203.0.113.7" }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => base() }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({ ...(await original<object>()), chargerContexteBail: m.contexte }));
vi.mock("@/lib/signature-document", async (original) => ({ ...(await original<object>()), assemblerSignatureDocument: m.assembler }));
vi.mock("@/lib/signature-bail", async (original) => ({
  ...(await original<object>()),
  configurationSignatureBail: () => ({ prestataire: "zoho", environnement: "production", clientId: "x", clientSecret: "x", refreshToken: "x" }),
  configurationSuiviSignatureBail: () => null,
}));
vi.mock("@/lib/signature-prestataire", async (original) => ({ ...(await original<object>()), preparerCircuitSignature: m.preparer, activerDemandeSignature: m.activer }));

import { envoyerSignatureBail } from "@/app/actions/signature-bail";
import { confirmerMobileCaution } from "@/app/actions/confirmation-caution";
import { REFUS_CONFIRMATION_EDL, REFUS_MOBILE_CAUTION_NON_CONFIRME, envoyerApresControle, telephoneGarantConfirme } from "@/lib/signature-envoi";
import { empreinteJetonCaution, lireLienCaution, mobileCautionDepuisSaisie, nouveauJetonCaution } from "@/lib/confirmation-mobile-caution";
import { LONGUEUR_MAX_MESSAGE_INVITATION, bailleurDesSignataires, messageInvitationSignature, phraseTransmissionZoho } from "@/lib/message-invitation-signature";
import { RAPPEL_COMPLEMENT_EDL_ENTREE } from "@/lib/textes-signature-actes";
import { INSTRUCTIONS_CAUTION_MOBILE } from "@/lib/zoho-sign";
import type { CircuitBail } from "@/lib/signature-bail";

const ORG = "org";
const BAIL = "11111111-1111-4111-8111-111111111111";
const GARANT = "22222222-2222-4222-8222-222222222222";
const EDL = "33333333-3333-4333-8333-333333333333";
const PDF = new TextEncoder().encode("%PDF-acte-fictif");
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const MOBILE_DOSSIER = "+33600000009"; // saisi par le bailleur sur la fiche du garant : ne doit jamais servir
const MOBILE_CAUTION = "+33611223344";

const signataires = (telephoneGarant = "", confirme = false) => [
  { personId: GARANT, qualite: "Garant", prenom: "Gaston", nom: "Garant", email: "gaston@example.invalid", telephone: telephoneGarant, mentionCaution: "Mention", ...(confirme ? { telephoneConfirmeLe: "2026-10-24T08:00:00Z" } : {}) },
  { personId: "prop", qualite: "Propriétaire", prenom: "Paule", nom: "Proprio", email: "paule@example.invalid", telephone: "+33600000002" },
];

/** Une base factice : lectures bornées, mises à jour notées, RPC pilotées par `m.rpc`. */
function base() {
  const from = (table: string) => {
    let maj: Record<string, unknown> | null = null;
    const resultat = () => {
      if (maj) return { data: { id: m.circuit.id }, error: null };
      if (table === "bail_signature_circuits") return { data: m.circuit, error: null };
      if (table === "documents") return { data: { storage_path: "org/acte.pdf", mime_type: "application/pdf" }, error: null };
      if (table === "etats_des_lieux") return { data: { type: "entree", date_edl: "2026-10-01" }, error: null };
      return { data: null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
      update: (v: Record<string, unknown>) => { maj = v; m.mises.push([table, v]); return q; },
      limit: async () => ({ data: table === "confirmations_mobile_caution" ? m.liens : table === "bail_signature_circuits" ? [m.circuit] : [], error: null }),
      single: async () => resultat(), maybeSingle: async () => resultat(),
      then: (ok: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(ok),
    };
    return q;
  };
  return { rpc: m.rpc, from, storage: { from: () => ({ download: async () => ({ data: new Blob([PDF]), error: null }) }) } };
}
const rpcAppelees = () => m.rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.resetAllMocks();
  m.mises = []; m.liens = [];
  vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.example");
  vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "");
  m.circuit = { id: "circuit", organization_id: ORG, bail_id: BAIL, cible_id: BAIL, document_id: "doc", modele: "cautionnement",
    options: { garant: GARANT, forme: "solidaire", montant_max: "15000", sans_garantie_cumulee: "oui" }, prestataire: "zoho", environnement: "production",
    etat: "pret", empreinte: "e".repeat(64), pdf_hash: sha(PDF), signataires: signataires(), annexes: [], essai: false,
    expire_le: new Date(Date.now() + 20 * 86_400_000).toISOString(), created_at: new Date().toISOString() };
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "demander_confirmation_mobile_caution") return { data: new Date(Date.now() + 7 * 86_400_000).toISOString(), error: null };
    if (nom === "consommer_confirmation_mobile_caution") {
      // La base pose le numéro saisi sur le seul garant (migration 20261024120000).
      m.circuit.signataires = signataires(MOBILE_CAUTION, true);
      return { data: [{ circuit_id: "circuit", organization_id: ORG, demande_par: "owner" }], error: null };
    }
    return { data: true, error: null };
  });
  m.acces.mockResolvedValue({ supabase: base(), user: { id: "owner" } });
  m.garde.mockResolvedValue(undefined);
  m.email.mockResolvedValue({ id: "courriel" });
  m.assembler.mockImplementation(async () => ({ bailId: BAIL, empreinte: m.circuit.empreinte, manquants: [], annexes: [], titreGed: "Acte fictif", signataires: signataires(), document: {}, liens: [] }));
  m.preparer.mockResolvedValue({ demandeId: "100", documentId: "200", signataireIds: ["301", "302"] });
  m.activer.mockResolvedValue(undefined);
  const ctx = contexte();
  ctx.bailleurs = [{ ...personne({ id: "prop", nom: "Proprio", prenom: "Paule" }), quote_part: 100 }];
  ctx.garants = [{ ...personne({ id: GARANT, nom: "Garant", prenom: "Gaston", telephone: "06 00 00 00 09" }), garant_de: null }];
  m.contexte.mockResolvedValue(ctx);
});
afterEach(() => vi.unstubAllEnvs());

describe("jeton et numéro de la caution", () => {
  it("le jeton a 32 octets aléatoires ; seule son empreinte SHA-256 sert de clé", () => {
    const { jeton, empreinte } = nouveauJetonCaution();
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(empreinte).toBe(sha(jeton));
    expect(nouveauJetonCaution().jeton).not.toBe(jeton);
    for (const faux of ["", "court", `${jeton}x`, jeton.replace(/.$/, "!")]) expect(empreinteJetonCaution(faux)).toBeNull();
  });

  it.each([["06 11 22 33 44", "+33611223344"], ["+32 470 12 34 56", "+32470123456"]])("accepte le mobile %s", (saisie, attendu) => {
    expect(mobileCautionDepuisSaisie(saisie)).toEqual({ telephone: attendu });
  });
  it.each(["01 45 67 89 01", "09 12 34 56 78", "07 00 00 00 01", "1234", "pas un numéro"])("refuse %s (fixe, voix sur IP, invalide)", (saisie) => {
    expect(mobileCautionDepuisSaisie(saisie)).toHaveProperty("erreur");
  });

  it("le garant n'est confirmé que par l'horodatage posé en base, jamais par un numéro seul", () => {
    expect(telephoneGarantConfirme(signataires(MOBILE_DOSSIER) as CircuitBail["signataires"])).toBe(false);
    expect(telephoneGarantConfirme(signataires(MOBILE_CAUTION, true) as CircuitBail["signataires"])).toBe(true);
    expect(telephoneGarantConfirme(signataires("", true) as CircuitBail["signataires"])).toBe(false);
  });
});

describe("le bailleur lance la signature d'un acte de cautionnement", () => {
  it("sans confirmation de la caution : un lien lui part par e-mail, rien chez le prestataire", async () => {
    const vue = await envoyerSignatureBail(ORG, BAIL, "circuit");
    expect(vue.erreur).toBeUndefined();
    expect(vue.succes).toContain("Lien envoyé à la caution (gaston@example.invalid)");
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.activer).not.toHaveBeenCalled();
    expect(rpcAppelees()).not.toContain("reserver_envoi_signature_bail");
    const demande = m.rpc.mock.calls.find((c) => c[0] === "demander_confirmation_mobile_caution")![1] as Record<string, string>;
    expect(demande).toMatchObject({ p_circuit: "circuit", p_actor: "owner" });
    expect(demande.p_jeton_empreinte).toMatch(/^[0-9a-f]{64}$/);
    const courriel = m.email.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(courriel.to).toBe("gaston@example.invalid");
    expect(courriel.subject).toBe("Acte de cautionnement : confirmez votre numéro de mobile");
    const jeton = /https:\/\/site\.example\/signature\/caution\/([A-Za-z0-9_-]{43})/.exec(courriel.html)?.[1];
    expect(jeton && sha(jeton)).toBe(demande.p_jeton_empreinte);
    // Qui demande quoi : bailleur, logement, montant de l'engagement.
    expect(courriel.html).toContain("Paule Proprio vous demande de signer électroniquement un acte de cautionnement");
    expect(courriel.html).toContain("12 rue des Lilas");
    expect(courriel.html).toMatch(/15[\s  ]000,00/);
    expect(courriel.html).not.toContain("06 00 00 00 09");
    expect(rpcAppelees().indexOf("autoriser_lien_mot_de_passe_cle")).toBeLessThan(rpcAppelees().indexOf("demander_confirmation_mobile_caution"));
  });

  it("le réglage qui suspend le cautionnement électronique n'envoie aucun lien", async () => {
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "true");
    expect((await envoyerSignatureBail(ORG, BAIL, "circuit")).erreur).toContain("cautionnement est suspendu");
    expect(m.email).not.toHaveBeenCalled();
    expect(rpcAppelees()).not.toContain("demander_confirmation_mobile_caution");
  });

  it("une fois le numéro confirmé par la caution, la demande part avec CE numéro et le message R53", async () => {
    m.circuit.signataires = signataires(MOBILE_CAUTION, true);
    const vue = await envoyerSignatureBail(ORG, BAIL, "circuit");
    expect(vue.erreur).toBeUndefined();
    expect(m.email).not.toHaveBeenCalled();
    const params = m.preparer.mock.calls[0][0] as { signataires: { telephone: string; qualite: string }[]; message: string };
    expect(params.signataires.find((s) => s.qualite === "Garant")!.telephone).toBe(MOBILE_CAUTION);
    expect(JSON.stringify(params.signataires)).not.toContain(MOBILE_DOSSIER);
    expect(params.message).toContain(INSTRUCTIONS_CAUTION_MOBILE);
    expect(params.message).toContain(phraseTransmissionZoho("Paule Proprio", "https://site.example/confidentialite"));
    expect(m.activer.mock.calls[0][3]).toBe(params.message);
  });

  it("garde de l'envoi : sans confirmation, jamais de réservation ni d'appel au prestataire", async () => {
    m.circuit.signataires = signataires(MOBILE_DOSSIER);
    const r = await envoyerApresControle({ db: base() as never, org: ORG, circuit: m.circuit as CircuitBail, acteur: "owner",
      controle: { config: {} as never, titre: "Acte", contenu: PDF, annexes: [] } });
    expect(r).toEqual({ erreur: REFUS_MOBILE_CAUTION_NON_CONFIRME });
    expect(rpcAppelees()).not.toContain("reserver_envoi_signature_bail");
    expect(m.preparer).not.toHaveBeenCalled();
  });
});

describe("la caution confirme son numéro sur la page publique", () => {
  const formulaire = (mobile: string, repetition = mobile, personnel = true) => {
    const f = new FormData();
    f.set("mobile", mobile); f.set("mobile_confirmation", repetition);
    if (personnel) f.set("personnel", "oui");
    return f;
  };
  const jeton = "A".repeat(43);

  it("le numéro saisi par la caution est consommé une fois, puis la demande part avec lui", async () => {
    const r = await confirmerMobileCaution(jeton, {}, formulaire("06 11 22 33 44"));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("+33 6 11 22 33 44");
    expect(m.rpc).toHaveBeenCalledWith("consommer_confirmation_mobile_caution", { p_jeton_empreinte: sha(jeton), p_telephone: MOBILE_CAUTION });
    const params = m.preparer.mock.calls[0][0] as { signataires: { telephone: string; qualite: string }[] };
    expect(params.signataires.find((s) => s.qualite === "Garant")!.telephone).toBe(MOBILE_CAUTION);
    // La réservation est faite au nom du propriétaire qui a envoyé le lien (la base revérifie son rôle).
    expect(m.rpc).toHaveBeenCalledWith("reserver_envoi_signature_bail", { p_circuit: "circuit", p_actor: "owner" });
    expect(rpcAppelees().indexOf("consommer_confirmation_mobile_caution")).toBeLessThan(rpcAppelees().indexOf("reserver_envoi_signature_bail"));
  });

  it.each([
    ["un jeton mal formé", "court", formulaire("06 11 22 33 44"), "pas valable"],
    ["deux numéros différents", jeton, formulaire("06 11 22 33 44", "06 11 22 33 45"), "pas identiques"],
    ["un numéro fixe", jeton, formulaire("01 45 67 89 01"), "mobile"],
    ["sans la case « numéro personnel »", jeton, formulaire("06 11 22 33 44", "06 11 22 33 44", false), "personnel"],
  ])("%s : refusé sans consommer le lien", async (_cas, j, f, motif) => {
    const r = await confirmerMobileCaution(j, {}, f);
    expect(r.erreur).toContain(motif);
    expect(rpcAppelees()).not.toContain("consommer_confirmation_mobile_caution");
    expect(m.preparer).not.toHaveBeenCalled();
  });

  it.each([
    ["expiré", "Ce lien a expiré. Demandez au bailleur de vous en envoyer un nouveau."],
    ["déjà utilisé", "Ce lien a déjà été utilisé. Il ne sert qu’une fois."],
  ])("un lien %s est refusé par la base, sans appel au prestataire", async (_cas, message) => {
    m.rpc.mockImplementation(async (nom: string) => nom === "consommer_confirmation_mobile_caution" ? { data: null, error: { message } } : { data: true, error: null });
    const r = await confirmerMobileCaution(jeton, {}, formulaire("06 11 22 33 44"));
    expect(r.erreur).toBe(message);
    expect(rpcAppelees()).not.toContain("reserver_envoi_signature_bail");
    expect(m.preparer).not.toHaveBeenCalled();
  });

  it("le cautionnement suspendu par réglage ne consomme pas le lien", async () => {
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    expect((await confirmerMobileCaution(jeton, {}, formulaire("06 11 22 33 44"))).erreur).toContain("suspendue");
    expect(rpcAppelees()).not.toContain("consommer_confirmation_mobile_caution");
  });

  it("une limite de fréquence atteinte ne consomme pas le lien", async () => {
    m.rpc.mockImplementation(async (nom: string) => ({ data: nom === "autoriser_lien_mot_de_passe_cle" ? false : true, error: null }));
    expect((await confirmerMobileCaution(jeton, {}, formulaire("06 11 22 33 44"))).erreur).toContain("Trop de tentatives");
    expect(rpcAppelees()).not.toContain("consommer_confirmation_mobile_caution");
  });

  it("un envoi impossible après la confirmation garde le numéro et prévient le bailleur sur l'acte prêt", async () => {
    m.assembler.mockResolvedValue({ bailId: BAIL, empreinte: "autre".padEnd(64, "0"), manquants: [], annexes: [], titreGed: "Acte", signataires: signataires(), document: {}, liens: [] });
    const r = await confirmerMobileCaution(jeton, {}, formulaire("06 11 22 33 44"));
    expect(r.erreur).toContain("Votre numéro +33 6 11 22 33 44 est confirmé.");
    expect(r.erreur).toContain("sans vous redemander votre numéro");
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.mises.some(([t, v]) => t === "bail_signature_circuits" && String(v.erreur).startsWith("La caution a confirmé son mobile"))).toBe(true);
  });
});

describe("état des lieux : établi ensemble, sur place", () => {
  beforeEach(() => {
    Object.assign(m.circuit, { modele: "edl", cible_id: EDL, options: {}, signataires: [{ ...signataires()[0], qualite: "Locataire", telephone: "+33600000001" }, signataires()[1]] });
  });

  it.each([undefined, {}, { visiteLe: "" }, { visiteLe: "01/10/2026" }, { visiteLe: "2026-02-30" }])("sans case cochée ni date valable (%j) : refus serveur avant toute lecture", async (confirmation) => {
    const vue = await envoyerSignatureBail(ORG, BAIL, "circuit", confirmation);
    expect(vue.erreur).toBe(REFUS_CONFIRMATION_EDL);
    expect(m.assembler).not.toHaveBeenCalled();
    expect(rpcAppelees().filter((n) => n !== "has_org_role")).toEqual([]);
    expect(m.preparer).not.toHaveBeenCalled();
  });

  it("avec la date de la visite : confirmée en base avant la réservation ; l'invitation rappelle le droit de compléter", async () => {
    const vue = await envoyerSignatureBail(ORG, BAIL, "circuit", { visiteLe: "2026-10-01" });
    expect(vue.erreur).toBeUndefined();
    expect(m.rpc).toHaveBeenCalledWith("confirmer_edl_sur_place", { p_circuit: "circuit", p_actor: "owner", p_visite_le: "2026-10-01" });
    expect(rpcAppelees().indexOf("confirmer_edl_sur_place")).toBeLessThan(rpcAppelees().indexOf("reserver_envoi_signature_bail"));
    const message = (m.preparer.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain(RAPPEL_COMPLEMENT_EDL_ENTREE);
    expect(message).toContain("Zoho Sign pour ce seul document, à la demande de Paule Proprio");
    expect(message).not.toContain(INSTRUCTIONS_CAUTION_MOBILE);
  });

  it("une date refusée par la base (postérieure à aujourd'hui) empêche la réservation", async () => {
    m.rpc.mockImplementation(async (nom: string) => nom === "confirmer_edl_sur_place" ? { data: null, error: { message: "La date de la visite ne peut pas être postérieure à aujourd’hui." } } : { data: true, error: null });
    const vue = await envoyerSignatureBail(ORG, BAIL, "circuit", { visiteLe: "2099-01-01" });
    expect(vue.erreur).toContain("postérieure");
    expect(rpcAppelees()).not.toContain("reserver_envoi_signature_bail");
  });
});

describe("message d'invitation du prestataire (R53)", () => {
  it("dit la transmission à Zoho Sign, à la demande du bailleur, avec le lien de la page confidentialité", () => {
    expect(phraseTransmissionZoho("Paule Proprio", "https://site.example/confidentialite")).toBe(
      "Vos nom, adresse électronique et numéro de mobile sont transmis à notre prestataire de signature Zoho Sign pour ce seul document, à la demande de Paule Proprio. Détails : https://site.example/confidentialite.");
    const bail = messageInvitationSignature({ modele: "bail", bailleur: "Paule Proprio", lienConfidentialite: "https://site.example/confidentialite" });
    expect(bail).not.toContain(RAPPEL_COMPLEMENT_EDL_ENTREE);
    expect(messageInvitationSignature({ modele: "edl", bailleur: "X", lienConfidentialite: "L", edlEntree: false })).not.toContain(RAPPEL_COMPLEMENT_EDL_ENTREE);
  });

  it("nomme les propriétaires signataires, bornés, et tient dans la place disponible", () => {
    const proprietaires = Array.from({ length: 6 }, (_, i) => ({ qualite: "Propriétaire", prenom: `Prénom${i}`, nom: "N".repeat(60) }));
    const bailleur = bailleurDesSignataires([{ qualite: "Garant", prenom: "G", nom: "G" }, ...proprietaires]);
    expect(bailleur.length).toBeLessThanOrEqual(160);
    expect(bailleur).not.toContain("G G");
    expect(bailleurDesSignataires([{ qualite: "Propriétaire", prenom: "A", nom: "B" }, { qualite: "Propriétaire", prenom: "C", nom: "D" }])).toBe("A B et C D");
    const message = messageInvitationSignature({ modele: "cautionnement", bailleur, lienConfidentialite: "https://site.example/confidentialite" });
    expect(message.length).toBeLessThanOrEqual(LONGUEUR_MAX_MESSAGE_INVITATION);
  });
});

describe("le bailleur voit l'état « en attente de la caution »", () => {
  it("la lecture rend le dernier lien envoyé et son échéance", async () => {
    const { lireSignatureBail } = await import("@/app/actions/signature-bail");
    m.liens = [{ cree_le: "2026-10-24T08:00:00Z", expire_le: new Date(Date.now() + 86_400_000).toISOString(), utilise_le: null, annulee_le: null }];
    const vue = await lireSignatureBail(ORG, BAIL, { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } });
    expect(vue.attenteCaution).toMatchObject({ envoyeLe: "2026-10-24T08:00:00Z", etat: "en_attente" });
    m.liens = [{ cree_le: "2026-10-01T08:00:00Z", expire_le: "2026-10-08T08:00:00Z", utilise_le: null, annulee_le: null }];
    expect((await lireSignatureBail(ORG, BAIL, { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } })).attenteCaution?.etat).toBe("expire");
  });
});

describe("la page publique du lien ne dit rien d'un lien clos", () => {
  const service = (lien: Record<string, unknown> | null) => {
    const lectures: string[] = [];
    const client = { from: (table: string) => {
      lectures.push(table);
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "confirmations_mobile_caution" ? lien : m.circuit, error: null }) };
      return q;
    } };
    return { client: client as never, lectures };
  };
  const ouvert = { organization_id: ORG, circuit_id: "circuit", expire_le: new Date(Date.now() + 86_400_000).toISOString(), utilise_le: null, annulee_le: null };

  it("un jeton mal formé ne lit rien en base", async () => {
    const s = service(ouvert);
    expect(await lireLienCaution(s.client, "court")).toEqual({ etat: "invalide" });
    expect(s.lectures).toEqual([]);
  });

  it.each([
    [null, "invalide"],
    [{ ...ouvert, utilise_le: "2026-10-24T08:00:00Z" }, "utilise"],
    [{ ...ouvert, annulee_le: "2026-10-24T08:00:00Z" }, "annule"],
    [{ ...ouvert, expire_le: "2026-10-01T00:00:00Z" }, "expire"],
  ])("lien %j : état %s, sans aucune donnée du dossier", async (lien, etat) => {
    const s = service(lien);
    expect(await lireLienCaution(s.client, "A".repeat(43))).toEqual({ etat });
    expect(s.lectures).toEqual(["confirmations_mobile_caution"]);
    expect(m.contexte).not.toHaveBeenCalled();
  });

  it("un lien ouvert sur un acte prêt dit qui demande quoi ; un acte qui n'est plus prêt, rien", async () => {
    const r = await lireLienCaution(service(ouvert).client, "A".repeat(43));
    expect(r).toMatchObject({ etat: "valide", bailleur: "Paule Proprio", solidaire: true, garant: { prenom: "Gaston", nom: "Garant" } });
    expect(r.etat === "valide" && r.logement).toContain("12 rue des Lilas");
    expect(r.etat === "valide" && r.montant).toMatch(/15[\s  ]000,00 € \(quinze mille euros\)/);
    m.circuit.etat = "annule";
    expect(await lireLienCaution(service(ouvert).client, "A".repeat(43))).toEqual({ etat: "annule" });
  });
});
