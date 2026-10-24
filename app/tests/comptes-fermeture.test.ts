/**
 * Plan de conformité du 23/10/2026, lot 1E (R14, R15, R51) : la règle d'inactivité, les calculs, les trois courriels,
 * les gestes Stripe de la fermeture (doublure, aucun appel réel) et les suites de nuit (lib/comptes-fermeture*.ts).
 * Sans base. Aucune adresse réelle (example.invalid).
 */
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  SUJET_COMPTE_FERME,
  VERSION_MIN_INACTIVITE,
  corpsAvertissementInactivite,
  corpsCompteFerme,
  elementsConserves,
  elementsEffaces,
  jourEnLettres,
  jourParisPlus,
  minuitParisEnSecondes,
  nuitDu,
  remboursementProrata,
  sujetAvertissementInactivite,
  versionInactiviteValide,
} from "../src/lib/comptes-fermeture";
import { annulerStripeFermeture, calculerRemboursement, preparerStripeFermeture, rembourserFermeture, traiterSuitesComptes } from "../src/lib/comptes-fermeture-serveur";

describe("règle d'inactivité et calculs", () => {
  it("la règle est inactive tant que la V1 n'est pas publiée (VERSION_MIN_INACTIVITE nulle)", () => {
    expect(VERSION_MIN_INACTIVITE).toBeNull();
    expect(versionInactiviteValide(VERSION_MIN_INACTIVITE)).toBe(false);
    expect(versionInactiviteValide("2026-11-15")).toBe(true);
    expect(versionInactiviteValide("V1")).toBe(false);
  });

  it("remboursement au prorata : part non utilisée, arrondie au centime, jamais négative ni supérieure au payé", () => {
    const debut = new Date("2026-11-01T00:00:00Z");
    const fin = new Date("2026-12-01T00:00:00Z");
    expect(remboursementProrata({ payeCents: 3000, debut, fin, arret: new Date("2026-11-16T00:00:00Z") })).toBe(1500);
    expect(remboursementProrata({ payeCents: 1000, debut, fin, arret: new Date("2026-11-11T00:00:00Z") })).toBe(667);
    expect(remboursementProrata({ payeCents: 3000, debut, fin, arret: new Date("2026-12-05T00:00:00Z") })).toBe(0);
    expect(remboursementProrata({ payeCents: 3000, debut, fin, arret: new Date("2026-10-01T00:00:00Z") })).toBe(3000);
    expect(remboursementProrata({ payeCents: 0, debut, fin, arret: debut })).toBe(0);
  });

  it("jours de Paris : J+14 compté depuis le jour de Paris, minuit de Paris en hiver comme en été", () => {
    expect(jourParisPlus(new Date("2026-10-23T22:30:00Z"), 14)).toBe("2026-11-07"); // 0 h 30 le 24 à Paris
    expect(jourParisPlus(new Date("2026-10-23T12:00:00Z"), 14)).toBe("2026-11-06");
    expect(new Date(minuitParisEnSecondes("2026-11-07") * 1000).toISOString()).toBe("2026-11-06T23:00:00.000Z");
    expect(new Date(minuitParisEnSecondes("2026-07-01") * 1000).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("dates en lettres : « 1er » le premier du mois ; la nuit de l'effacement dite sans ambiguïté (relecture du 24/10)", () => {
    expect(jourEnLettres("2026-12-01")).toBe("1er décembre 2026");
    expect(jourEnLettres("2026-12-15")).toBe("15 décembre 2026");
    expect(nuitDu("2026-12-16")).toBe("nuit du 15 au 16 décembre 2026");
    expect(nuitDu("2026-12-01")).toBe("nuit du 30 novembre au 1er décembre 2026");
    expect(nuitDu("2027-01-01")).toBe("nuit du 31 décembre 2026 au 1er janvier 2027");
  });
});

/** Le texte d'un courriel, entités et espaces insécables ramenés à leur forme lisible. */
const lisible = (html: string) => html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[\u00a0\u202f]/g, " ");

describe("courriels", () => {
  const base = { derniereActivite: "2024-12-21T10:00:00Z", suppressionLe: "2026-12-23", lienArchive: "https://site.example.com/compte/donnees#archive" };

  it("J-60 d'un espace : le texte du plan, sans numéro d'article, avec le lien de l'archive et l'annonce du rappel", () => {
    expect(sujetAvertissementInactivite({ etape: "j60", suppressionLe: "2026-12-23" })).toBe("Votre compte Gerimmo sera supprimé le 23 décembre 2026");
    const html = lisible(corpsAvertissementInactivite({ ...base, etape: "j60", nature: "organisation", organisation: "Espace <Dupont>" }));
    expect(html).toContain("Personne ne s'est connecté à votre espace Gerimmo Espace &lt;Dupont&gt; depuis le 21 décembre 2024 et aucun abonnement n'y est en cours.");
    expect(html).toContain("Conformément aux conditions générales, le compte et ses données de gestion seront supprimés le 23 décembre 2026.");
    expect(html).toContain("Pour les garder, il suffit de vous connecter avant cette date.");
    expect(html).toContain('téléchargez l\'archive complète depuis <a href="https://site.example.com/compte/donnees#archive">');
    expect(html).toContain("Vous recevrez un dernier rappel quinze jours avant.");
    expect(html).not.toMatch(/article\s+\d/i);
  });

  it("J-15 : sujet « Dernier rappel », même texte sans l'annonce d'un autre rappel ; compte personnel sans espace", () => {
    expect(sujetAvertissementInactivite({ etape: "j15", suppressionLe: "2026-12-23" })).toBe("Dernier rappel : votre compte Gerimmo sera supprimé le 23 décembre 2026");
    const html = corpsAvertissementInactivite({ ...base, etape: "j15", nature: "organisation", organisation: "Espace" });
    expect(html).not.toContain("dernier rappel quinze jours");
    const perso = lisible(corpsAvertissementInactivite({ ...base, etape: "j60", nature: "personnel", organisation: null, lienArchive: null }));
    expect(perso).toContain("Votre compte Gerimmo n'a pas servi depuis le 21 décembre 2024.");
    expect(perso).toContain("Conformément aux conditions que vous avez acceptées, ce compte et les données qui y sont attachées seront supprimés le 23 décembre 2026");
    expect(perso).not.toContain("conditions générales");
    expect(perso).not.toMatch(/article\s+\d/i);
  });

  it("artisan : ses registres et leur export ; agent : l'archive est demandée au titulaire (relecture du 24/10)", () => {
    const artisan = lisible(corpsAvertissementInactivite({ ...base, etape: "j60", nature: "artisan", organisation: null, lienArchive: null,
      lienExportArtisan: "https://site.example.com/api/artisan-prive/export" }));
    expect(artisan).toContain("Conformément aux conditions que vous avez acceptées, ce compte, votre fiche d'artisan et vos registres privés seront supprimés le 23 décembre 2026.");
    expect(artisan).toContain('téléchargez l\'export de votre activité depuis <a href="https://site.example.com/api/artisan-prive/export">');
    const agent = lisible(corpsAvertissementInactivite({ ...base, etape: "j60", nature: "organisation", organisation: "Agence", titulaire: false }));
    expect(agent).toContain("demandez à son titulaire de télécharger l'archive complète");
    expect(agent).not.toContain("compte/donnees#archive");
  });

  it("« Votre compte Gerimmo est fermé » : date, demande, effacé, conservé avec les dates de l'archive, remboursement", () => {
    expect(SUJET_COMPTE_FERME).toBe("Votre compte Gerimmo est fermé");
    const html = lisible(corpsCompteFerme({
      origine: "super_admin",
      executeeLe: "2026-11-07T02:20:00Z",
      demandeeLe: "2026-10-24",
      derniereActivite: null,
      bilan: { mode: "suppression", organisations_effacees: ["o1"], organisations_noms: ["Espace Martin"], adhesions_retirees: 1, dossiers_tiers_detaches: 1, demandes_zoho: ["z1"] },
      archives: [{ preuve_conservee_jusqu_au: "2036-11-05", factures_conservees_jusqu_au: "2032-10-01" }],
      remboursementCents: 1234,
    }, "https://site.example.com/confidentialite"));
    expect(html).toContain("Votre compte Gerimmo a été fermé le 7 novembre 2026, à votre demande du 24 octobre 2026.");
    expect(html).toContain("Nous avons effacé : votre compte de connexion ; votre espace « Espace Martin », avec ses dossiers, ses documents et ses fichiers ; vos accès aux autres espaces, qui restent à leurs autres gestionnaires ou à leur propriétaire.");
    expect(html.match(/vos accès/g)).toHaveLength(1);
    expect(html).toContain("jusqu'au 5 novembre 2036");
    expect(html).toContain("les références de vos factures d'abonnement, jusqu'au 1er octobre 2032 ; les factures elles-mêmes restent dans notre compte chez notre prestataire de paiement jusqu'à la même date");
    expect(html).toContain("la trace de votre demande et de son traitement, pendant trois ans");
    expect(html).toContain("Nous vous avons remboursé 12,34 €");
    expect(html).toContain("prestataire de signature électronique");
    expect(html).toContain("nous les avons prévenus de votre demande");
    expect(html).toContain("disparaissent sous 90 jours");
    expect(html).not.toMatch(/article\s+\d/i);
  });

  it("fermeture pour inactivité, compte neutralisé, sans contrat payé : ni « à votre demande » ni archive promise", () => {
    const f = {
      origine: "inactivite" as const, executeeLe: "2026-12-23T02:20:00Z", demandeeLe: "2026-12-23", derniereActivite: "2024-12-21T10:00:00Z",
      bilan: { mode: "neutralisation" as const }, archives: [], remboursementCents: null,
    };
    const html = lisible(corpsCompteFerme(f, null));
    expect(html).toContain("faute de connexion depuis le 21 décembre 2024, après les deux avertissements envoyés à cette adresse");
    expect(html).not.toContain("demande");
    expect(elementsConserves(f)).toEqual([
      "la trace de la fermeture de votre compte et des avertissements envoyés, pendant trois ans",
      "les journaux de sécurité, jusqu'au terme de leur durée de conservation indiquée dans notre page confidentialité",
      "l'identifiant technique de votre compte, sans adresse électronique ni mot de passe, tant que ces journaux y font référence",
    ]);
    expect(elementsEffaces({ artisan: { id: "a", fiche: "detachee" } })).toEqual(["votre compte de connexion", "vos zones, vos métiers et vos registres privés d'artisan"]);
    // Les propriétaires tiers sont prévenus de la fermeture, pas d'une demande qui n'existe pas.
    const tiers = lisible(corpsCompteFerme({ ...f, bilan: { mode: "suppression", dossiers_tiers_detaches: 2 } }, null));
    expect(tiers).toContain("nous les avons prévenus de la fermeture de votre compte");
    expect(tiers).not.toContain("demande");
  });

  it("remboursement pas encore confirmé au moment du courriel : annoncé comme en cours, pas comme fait", () => {
    const html = lisible(corpsCompteFerme({
      origine: "super_admin", executeeLe: "2026-11-07T02:20:00Z", demandeeLe: "2026-10-24", derniereActivite: null,
      bilan: { mode: "suppression" }, archives: [], remboursementCents: null, remboursementEnCoursCents: 1234,
    }, null));
    expect(html).toContain("Le remboursement de 12,34 €, pour la part non utilisée de votre période payée, est en cours sur le moyen de paiement utilisé.");
    expect(html).not.toContain("Nous vous avons remboursé");
  });
});

/** Une facture payée de la doublure : ses lignes portent leur période (secondes Unix) et leur montant. */
type FactureDoublure = { id: string; amount_paid: number; lines: { amount: number; debut: string; fin: string }[] };
const facture = (id: string, amount_paid: number, lignes: [number, string, string][]): FactureDoublure =>
  ({ id, amount_paid, lines: lignes.map(([amount, debut, fin]) => ({ amount, debut, fin })) });
const secondes = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/** Une doublure de Stripe : rien ne part, chaque appel est relevé. */
function fauxStripe(o: {
  echoue?: boolean;
  factures?: FactureDoublure[];
  paiement?: Record<string, unknown>;
  souscription?: Record<string, unknown>;
  remboursementsExistants?: { id: string; amount: number; metadata: Record<string, string>; status?: string }[];
  clientAbsent?: boolean;
  /** Montant payé que Stripe rend avec le paiement de la facture (`amount_paid`). */
  montantPaye?: number;
  dejaRembourseChezStripe?: boolean;
} = {}) {
  const appels: { methode: string; args: unknown[] }[] = [];
  const note = (methode: string) => async (...args: unknown[]) => {
    appels.push({ methode, args });
    if (o.echoue) throw new Error("Stripe indisponible");
    if (methode === "subscriptions.retrieve") return { id: args[0], schedule: null, cancel_at_period_end: false, cancel_at: null, ...(o.souscription ?? {}) };
    if (methode === "subscriptionSchedules.retrieve") return { id: args[0], status: "active" };
    if (methode === "invoices.list") {
      return { data: (o.factures ?? [facture("in_essai1", 3000, [[3000, "2026-10-20T00:00:00Z", "2026-11-20T00:00:00Z"]])]).map((f) => ({
        id: f.id, amount_paid: f.amount_paid,
        lines: { has_more: false, data: f.lines.map((l) => ({ amount: l.amount, period: { start: secondes(l.debut), end: secondes(l.fin) } })) },
      })) };
    }
    if (methode === "invoicePayments.list") return { data: [{ ...(o.montantPaye !== undefined ? { amount_paid: o.montantPaye } : {}), payment: o.paiement ?? { payment_intent: `pi_${(args[0] as { invoice: string }).invoice}` } }] };
    if (methode === "refunds.list") return { data: o.remboursementsExistants ?? [] };
    if (methode === "refunds.create" && o.dejaRembourseChezStripe) throw Object.assign(new Error("Charge ch_x has already been refunded."), { type: "StripeInvalidRequestError", code: "charge_already_refunded", statusCode: 400 });
    if (methode === "refunds.create") return { id: `re_${(args[0] as { metadata: { facture: string } }).metadata.facture}`, amount: (args[0] as { amount: number }).amount };
    if (methode === "customers.del") {
      if (o.clientAbsent) throw Object.assign(new Error("No such customer"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
      return { id: args[0], deleted: true };
    }
    return { id: "sub_essai1" };
  };
  const stripe = {
    subscriptions: { retrieve: note("subscriptions.retrieve"), update: note("subscriptions.update") },
    subscriptionSchedules: { release: note("subscriptionSchedules.release"), retrieve: note("subscriptionSchedules.retrieve") },
    invoices: { list: note("invoices.list") },
    invoicePayments: { list: note("invoicePayments.list") },
    refunds: { create: note("refunds.create"), list: note("refunds.list") },
    customers: { del: note("customers.del") },
  } as unknown as Stripe;
  return { stripe, appels };
}

describe("gestes Stripe de la fermeture (doublure)", () => {
  const abo = { stripe_subscription_id: "sub_essai1", vivante: true, payee_en_cours: true, periode_debut: "2026-10-20T00:00:00Z", periode_fin: "2026-11-20T00:00:00Z" };
  const AVANT_NEUTRE = { cancel_at_period_end: false, cancel_at: null, schedule: null };

  const MARQUE = { gerimmo_fermeture: "programmee" };
  const SANS_MARQUE = { gerimmo_fermeture: "" };

  it("fin de période : résiliation à l'échéance, marquée « fermeture », aucun remboursement ; l'état d'avant est relevé", async () => {
    const f = fauxStripe();
    expect(await preparerStripeFermeture(f.stripe, abo, "fin_periode")).toEqual({ ok: true, remboursement: null, arret: abo.periode_fin, avant: { ...AVANT_NEUTRE, pose: "fin_periode", arret_pose: null } });
    expect(f.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at_period_end: true, metadata: MARQUE }]);
  });

  it("J+14 : arrêt à minuit de Paris du quatorzième jour, sans avoir Stripe, remboursement de la part non utilisée de la facture", async () => {
    const f = fauxStripe();
    const r = await preparerStripeFermeture(f.stripe, abo, "j14_prorata", new Date("2026-10-24T10:00:00Z"));
    const arret = minuitParisEnSecondes("2026-11-07");
    expect(f.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at: arret, proration_behavior: "none", metadata: MARQUE }]);
    const attendu = remboursementProrata({ payeCents: 3000, debut: new Date(abo.periode_debut), fin: new Date(abo.periode_fin), arret: new Date(arret * 1000) });
    expect(r).toEqual({ ok: true, arret: new Date(arret * 1000).toISOString(), avant: { ...AVANT_NEUTRE, pose: "cancel_at", arret_pose: arret },
      remboursement: { montant_cents: attendu, factures: [{ facture: "in_essai1", montant_cents: attendu }] } });
    expect(attendu).toBeGreaterThan(1000);
  });

  it("J+14 après une hausse en cours de période : toutes les factures de la période comptent, prorata compris (relecture du 24/10)", async () => {
    // Annuel de 120 € payé le 01/01/2027 ; hausse à 240 € le 01/07/2027 (facture de prorata : +120 € pour le nouveau
    // prix, -60 € pour l'ancien, 60 € payés) ; arrêt le 15/10/2027. Part non utilisée au prix en vigueur : 240 € × 78/365.
    const arret = new Date("2027-10-15T00:00:00Z");
    const f = fauxStripe({ factures: [
      facture("in_prorata", 6000, [[12000, "2027-07-01T00:00:00Z", "2028-01-01T00:00:00Z"], [-6000, "2027-07-01T00:00:00Z", "2028-01-01T00:00:00Z"]]),
      facture("in_annuel", 12000, [[12000, "2027-01-01T00:00:00Z", "2028-01-01T00:00:00Z"]]),
    ] });
    const r = await calculerRemboursement(f.stripe, "sub_essai1", arret);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.montant_cents).toBeGreaterThan(5000);
    expect(r.montant_cents).toBeLessThan(5200);
    // Chaque paiement rembourse sa propre part non utilisée, sans jamais dépasser ce qu'il a payé.
    expect(r.factures).toEqual([{ facture: "in_prorata", montant_cents: Math.round(6000 * 78 / 184) }, { facture: "in_annuel", montant_cents: Math.round(12000 * 78 / 365) }]);
    expect(r.factures.reduce((n, p) => n + p.montant_cents, 0)).toBe(r.montant_cents);
    const g = fauxStripe({ factures: [
      facture("in_petit", 1000, [[1000, "2027-10-01T00:00:00Z", "2028-01-01T00:00:00Z"]]),
      facture("in_annuel", 12000, [[12000, "2027-01-01T00:00:00Z", "2028-01-01T00:00:00Z"]]),
    ] });
    const s = await calculerRemboursement(g.stripe, "sub_essai1", arret);
    expect(s.ok && s.factures.map((p) => p.facture)).toEqual(["in_petit", "in_annuel"]);
    expect(s.ok && s.factures[0].montant_cents).toBe(Math.round(1000 * 78 / 92));
    expect(s.ok && s.factures.reduce((n, p) => n + p.montant_cents, 0)).toBe(s.ok && s.montant_cents);
  });

  it("J+14 refusé quand la période payée finit avant le quatorzième jour, ou quand le montant ne peut pas être établi", async () => {
    const tot = await preparerStripeFermeture(fauxStripe().stripe, { ...abo, periode_fin: "2026-10-30T00:00:00Z" }, "j14_prorata", new Date("2026-10-24T10:00:00Z"));
    expect(tot).toMatchObject({ ok: false, erreur: expect.stringContaining("fin de la période payée") });
    const g = fauxStripe({ factures: [] });
    expect(await preparerStripeFermeture(g.stripe, abo, "j14_prorata", new Date("2026-10-24T10:00:00Z"))).toMatchObject({ ok: false, erreur: expect.stringContaining("montant") });
    // Refus AVANT tout arrêt posé chez Stripe.
    expect(g.appels.some((a) => a.methode === "subscriptions.update")).toBe(false);
  });

  it("souscription vivante non payée (essai) : arrêt au quatorzième jour, rien à rembourser ; sans souscription : rien chez Stripe", async () => {
    const f = fauxStripe();
    expect(await preparerStripeFermeture(f.stripe, { ...abo, payee_en_cours: false, stripe_statut: "trialing" }, null)).toMatchObject({ ok: true, remboursement: null });
    expect(f.appels.some((a) => a.methode === "invoices.list")).toBe(false);
    // Finitions du 24/10 (M2) : un essai qui finit AVANT le quatorzième jour s'arrête à sa fin (aucune première facture).
    const maintenant = new Date("2026-10-24T10:00:00Z");
    const finEssai = Math.floor(Date.parse("2026-10-30T10:00:00Z") / 1000);
    const e = fauxStripe({ souscription: { status: "trialing", trial_end: finEssai } });
    expect(await preparerStripeFermeture(e.stripe, { ...abo, payee_en_cours: false, stripe_statut: "trialing" }, null, maintenant))
      .toEqual({ ok: true, remboursement: null, arret: new Date(finEssai * 1000).toISOString(), avant: { ...AVANT_NEUTRE, pose: "fin_periode", arret_pose: null } });
    expect(e.appels.filter((a) => a.methode === "subscriptions.update").map((a) => a.args[1])).toEqual([{ cancel_at_period_end: true, metadata: MARQUE }]);
    // Un essai qui finit APRÈS le quatorzième jour garde l'arrêt au quatorzième jour.
    const tard = fauxStripe({ souscription: { status: "trialing", trial_end: Math.floor(Date.parse("2026-11-20T10:00:00Z") / 1000) } });
    await preparerStripeFermeture(tard.stripe, { ...abo, payee_en_cours: false, stripe_statut: "trialing" }, null, maintenant);
    expect(tard.appels.filter((a) => a.methode === "subscriptions.update").map((a) => a.args[1])).toEqual([{ cancel_at: minuitParisEnSecondes("2026-11-07"), proration_behavior: "none", metadata: MARQUE }]);
    const g = fauxStripe();
    expect(await preparerStripeFermeture(g.stripe, { vivante: false }, null)).toEqual({ ok: true, remboursement: null, arret: null, avant: null });
    expect(g.appels).toEqual([]);
  });

  it("abonnement payé sans choix : refus ; Stripe en panne : refus net, rien de programmé", async () => {
    expect(await preparerStripeFermeture(fauxStripe().stripe, abo, null)).toMatchObject({ ok: false });
    expect(await preparerStripeFermeture(fauxStripe({ echoue: true }).stripe, abo, "j14_prorata")).toMatchObject({ ok: false });
  });

  const ARRET = 1794006000;
  const POSE_FIN = { ...AVANT_NEUTRE, pose: "fin_periode" as const, arret_pose: null };
  const POSE_J14 = { ...AVANT_NEUTRE, pose: "cancel_at" as const, arret_pose: ARRET };
  const misesAJour = (f: ReturnType<typeof fauxStripe>) => f.appels.filter((a) => a.methode === "subscriptions.update").map((a) => a.args[1]);

  it("annulation : l'état d'avant revient — résiliation levée, ou date d'arrêt retirée — et la marque de la fermeture part", async () => {
    const f = fauxStripe({ souscription: { cancel_at_period_end: true } });
    expect(await annulerStripeFermeture(f.stripe, abo, "fin_periode", POSE_FIN)).toEqual({ ok: true, echeancierNonRetabli: false });
    expect(misesAJour(f)).toEqual([{ cancel_at_period_end: false, metadata: SANS_MARQUE }]);
    const g = fauxStripe({ souscription: { cancel_at: ARRET } });
    expect(await annulerStripeFermeture(g.stripe, abo, "j14_prorata", POSE_J14)).toEqual({ ok: true, echeancierNonRetabli: false });
    expect(misesAJour(g)).toEqual([{ cancel_at: "", metadata: SANS_MARQUE }]);
  });

  it("annulation : une résiliation demandée par le client AVANT la fermeture reste ; une date d'arrêt antérieure revient (relecture du 24/10)", async () => {
    const f = fauxStripe({ souscription: { cancel_at_period_end: true } });
    expect(await annulerStripeFermeture(f.stripe, abo, "fin_periode", { ...POSE_FIN, cancel_at_period_end: true })).toEqual({ ok: true, echeancierNonRetabli: false });
    expect(misesAJour(f)).toEqual([{ metadata: SANS_MARQUE }]);
    const g = fauxStripe({ souscription: { cancel_at: ARRET } });
    await annulerStripeFermeture(g.stripe, abo, "j14_prorata", { ...POSE_J14, cancel_at_period_end: true });
    expect(misesAJour(g)).toEqual([{ cancel_at: "", metadata: SANS_MARQUE }, { cancel_at_period_end: true }]);
    const h = fauxStripe({ souscription: { cancel_at: ARRET } });
    await annulerStripeFermeture(h.stripe, abo, "j14_prorata", { ...POSE_J14, cancel_at: 1798000000 });
    expect(misesAJour(h)).toEqual([{ cancel_at: 1798000000, metadata: SANS_MARQUE }]);
    // Un échéancier libéré à la programmation ne se recrée pas : l'appelant le sait (la base remet l'échéance à préparer).
    const k = fauxStripe({ souscription: { cancel_at: ARRET } });
    expect(await annulerStripeFermeture(k.stripe, abo, "j14_prorata", { ...POSE_J14, schedule: "sub_sched_1" }))
      .toEqual({ ok: true, echeancierNonRetabli: true });
  });

  it("finitions du 24/10 (I5) : la souscription est relue ; une résiliation du client depuis la programmation reste", async () => {
    // Essai s12 de la relecture transverse : le client a résilié après la programmation J+14 (cancel_at_period_end).
    const resilie = fauxStripe({ souscription: { cancel_at_period_end: true, cancel_at: ARRET + 86_400 * 200 } });
    expect(await annulerStripeFermeture(resilie.stripe, abo, "j14_prorata", POSE_J14)).toEqual({ ok: true, echeancierNonRetabli: false, etatGarde: true });
    expect(misesAJour(resilie)).toEqual([{ metadata: SANS_MARQUE }]);
    // Une autre date d'arrêt posée depuis (tableau de bord) : gardée.
    const autre = fauxStripe({ souscription: { cancel_at: ARRET + 3600 } });
    expect(await annulerStripeFermeture(autre.stripe, abo, "j14_prorata", POSE_J14)).toMatchObject({ ok: true, etatGarde: true });
    expect(misesAJour(autre)).toEqual([{ metadata: SANS_MARQUE }]);
    // La base dit qu'une résiliation a été notifiée ou accusée depuis la programmation : remise à l'échéance.
    const notifiee = fauxStripe({ souscription: { cancel_at: ARRET } });
    expect(await annulerStripeFermeture(notifiee.stripe, abo, "j14_prorata", POSE_J14, { resiliationNotifiee: true })).toMatchObject({ ok: true, etatGarde: true });
    expect(misesAJour(notifiee)).toEqual([{ cancel_at: "", metadata: SANS_MARQUE }, { cancel_at_period_end: true, metadata: SANS_MARQUE }]);
    // Fin de période déjà levée par quelqu'un : rien de plus que la marque.
    const levee = fauxStripe({ souscription: { cancel_at_period_end: false } });
    expect(await annulerStripeFermeture(levee.stripe, abo, "fin_periode", POSE_FIN)).toMatchObject({ ok: true, etatGarde: true });
    expect(misesAJour(levee)).toEqual([{ metadata: SANS_MARQUE }]);
    // Souscription déjà terminée : rien n'est écrit.
    const finie = fauxStripe({ souscription: { status: "canceled" } });
    expect(await annulerStripeFermeture(finie.stripe, abo, "j14_prorata", POSE_J14)).toMatchObject({ ok: true, etatGarde: true });
    expect(misesAJour(finie)).toEqual([]);
  });

  it("remboursement : une fois par facture ; un remboursement déjà fait (clé d'idempotence expirée) est retrouvé, jamais refait", async () => {
    const parts = [{ facture: "in_a", montant_cents: 300 }, { facture: "in_b", montant_cents: 120 }];
    const f = fauxStripe();
    expect(await rembourserFermeture(f.stripe, { fermetureId: "f1", parts })).toEqual({ ok: true, dejaRemboursees: [], faits: [
      { facture: "in_a", remboursement: "re_in_a", montant_cents: 300 }, { facture: "in_b", remboursement: "re_in_b", montant_cents: 120 }] });
    expect(f.appels.filter((a) => a.methode === "refunds.create").map((a) => a.args)).toEqual([
      [{ payment_intent: "pi_in_a", amount: 300, reason: "requested_by_customer", metadata: { fermeture: "f1", facture: "in_a" } }, { idempotencyKey: "fermeture-f1-remboursement-in_a" }],
      [{ payment_intent: "pi_in_b", amount: 120, reason: "requested_by_customer", metadata: { fermeture: "f1", facture: "in_b" } }, { idempotencyKey: "fermeture-f1-remboursement-in_b" }],
    ]);
    const g = fauxStripe({ remboursementsExistants: [{ id: "re_ancien", amount: 300, metadata: { fermeture: "f1", facture: "in_a" } }] });
    expect(await rembourserFermeture(g.stripe, { fermetureId: "f1", parts: [parts[0]] })).toEqual({ ok: true, dejaRemboursees: [], faits: [{ facture: "in_a", remboursement: "re_ancien", montant_cents: 300 }] });
    expect(g.appels.some((a) => a.methode === "refunds.create")).toBe(false);
    expect(await rembourserFermeture(fauxStripe({ paiement: {} }).stripe, { fermetureId: "f1", parts: [parts[0]] })).toMatchObject({ ok: false });
    expect(await rembourserFermeture(f.stripe, { fermetureId: "f1", parts: [{ facture: "in_x", montant_cents: 0 }] })).toMatchObject({ ok: false });
  });

  it("finitions du 24/10 (I3) : un paiement déjà entièrement remboursé (rétractation) est un état final, jamais une erreur de chaque nuit", async () => {
    const part = { facture: "in_annuel", montant_cents: 5800 };
    // Essai s6 : la rétractation a remboursé les 348 € du paiement.
    const entier = fauxStripe({ montantPaye: 34800, remboursementsExistants: [{ id: "re_retractation", amount: 34800, status: "succeeded", metadata: { gerimmo_retractation: "retractation-abonnement-sub_x" } }] });
    expect(await rembourserFermeture(entier.stripe, { fermetureId: "f1", parts: [part] })).toEqual({ ok: true, faits: [], dejaRemboursees: ["in_annuel"] });
    expect(entier.appels.some((a) => a.methode === "refunds.create")).toBe(false);
    // Remboursé en partie par un autre geste : seul le reste part.
    const partiel = fauxStripe({ montantPaye: 34800, remboursementsExistants: [{ id: "re_geste", amount: 30000, status: "succeeded", metadata: {} }] });
    expect(await rembourserFermeture(partiel.stripe, { fermetureId: "f1", parts: [part] })).toEqual({ ok: true, dejaRemboursees: [], faits: [{ facture: "in_annuel", remboursement: "re_in_annuel", montant_cents: 4800 }] });
    // Stripe répond « déjà remboursé » : même état final.
    const refus = fauxStripe({ dejaRembourseChezStripe: true });
    expect(await rembourserFermeture(refus.stripe, { fermetureId: "f1", parts: [part] })).toEqual({ ok: true, faits: [], dejaRemboursees: ["in_annuel"] });
  });
});

describe("suites de nuit (doublures de la base, de Stripe et de l'envoi)", () => {
  function fausseBase(o: { suites?: unknown[]; aPrevenir?: unknown[]; panneSuites?: boolean; dus?: unknown[]; clients?: string[] } = {}) {
    const rpc: { nom: string; args: Record<string, unknown> }[] = [];
    const retraits: { compartiment: string; chemins: string[] }[] = [];
    const db = {
      rpc: async (nom: string, args: Record<string, unknown>) => {
        rpc.push({ nom, args });
        if (nom === "exports_complets_a_supprimer") return { data: [], error: null };
        if (nom === "fermetures_remboursements_dus") return { data: o.dus ?? [], error: null };
        if (nom === "fermetures_suites_a_faire") return o.panneSuites ? { data: null, error: { message: "panne" } } : { data: o.suites ?? [], error: null };
        if (nom === "comptes_inactifs_a_prevenir") return { data: o.aPrevenir ?? [], error: null };
        if (nom === "clients_stripe_au_terme") return { data: (o.clients ?? []).map((c) => ({ stripe_customer_id: c })), error: null };
        return { data: true, error: null };
      },
      storage: { from: (compartiment: string) => ({ remove: async (chemins: string[]) => { retraits.push({ compartiment, chemins }); return { data: [], error: null }; } }) },
    };
    return { db: db as never, rpc, retraits };
  }
  const suite = {
    id: "f1", account_id: "a1", origine: "super_admin", choix: "j14_prorata", adresse_courriel: "titulaire@example.invalid",
    demandee_le: "2026-10-24", derniere_activite_le: null, executee_le: "2026-11-07T02:20:00Z", mode_effacement: "suppression",
    bilan_execution: {
      organisations_effacees: ["o1"], organisations_noms: ["Espace Martin"],
      fichiers_hors_documents: [{ compartiment: "artisan-prive", chemin: "a1/x.pdf" }, { compartiment: "devis-preparations", chemin: "a1/d.pdf" },
        { compartiment: "documents", chemin: "o1/y.pdf" }],
    },
    abonnement: {}, remboursement_prevu_cents: 420, remboursement_cents: 420, rembourse_le: "2026-11-07T02:40:00Z",
    archives: [{ preuve_conservee_jusqu_au: "2036-11-05", factures_conservees_jusqu_au: null }],
  };
  const du = { id: "f1", remboursement_prevu_cents: 420, remboursement_repartition: [{ facture: "in_essai1", montant_cents: 420 }], stripe_facture_id: "in_essai1" };

  it("remboursement dû fait dès l'arrêt chez Stripe, à part du courriel ; fichiers hors `documents` retirés (jamais `documents`), puis courriel et solde", async () => {
    const b = fausseBase({ dus: [du], suites: [suite] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    const f = fauxStripe();
    const bilan = await traiterSuitesComptes(b.db, { stripe: f.stripe, envoyer, site: "https://site.example.com", versionMin: null, exports: false });
    expect(bilan).toMatchObject({ courriels_fermeture: 1, remboursements: 1, echecs: 0 });
    expect(b.rpc.find((r) => r.nom === "fermeture_remboursement_fait")?.args).toEqual({ p_fermeture: "f1", p_faits: [{ facture: "in_essai1", remboursement: "re_in_essai1", montant_cents: 420 }], p_motif: null });
    expect(b.retraits).toEqual([{ compartiment: "artisan-prive", chemins: ["a1/x.pdf"] }, { compartiment: "devis-preparations", chemins: ["a1/d.pdf"] }]);
    expect(b.rpc.filter((r) => r.nom === "fermeture_suites_faites").map((r) => r.args)).toEqual([
      { p_fermeture: "f1", p_remboursement_cents: null, p_stripe_remboursement_id: null, p_courriel_envoye: true },
    ]);
    expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({ to: "titulaire@example.invalid", subject: "Votre compte Gerimmo est fermé", cleIdempotence: "fermeture-f1" }));
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("Nous vous avons remboursé 4,20 €");
    expect(html).toContain("https://site.example.com/confidentialite");
  });

  it("finitions du 24/10 (I2, I3) : rétractation exécutée, souscription poursuivie, déjà remboursée : clos sans échec ; souscription encore vivante : attente", async () => {
    const arret = "2026-11-06T23:00:00Z";
    const duJ14 = { ...du, stripe_subscription_id: "sub_essai1", arret_prevu_le: arret, retractation_executee: false };
    // Rétractation déjà exécutée sur la souscription : clos « retractation », sans appel à Stripe.
    const r1 = fausseBase({ dus: [{ ...duJ14, retractation_executee: true }] });
    const f1 = fauxStripe();
    expect(await traiterSuitesComptes(r1.db, { stripe: f1.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ remboursements: 0, remboursements_clos: 1, echecs: 0 });
    expect(r1.rpc.find((r) => r.nom === "fermeture_remboursement_fait")?.args).toEqual({ p_fermeture: "f1", p_faits: [], p_motif: "retractation" });
    expect(f1.appels).toEqual([]);
    // La souscription s'est terminée bien après l'arrêt prévu (arrêt levé puis fin de période) : rien n'est dû.
    const r2 = fausseBase({ dus: [duJ14] });
    const f2 = fauxStripe({ souscription: { status: "canceled", ended_at: Math.floor(Date.parse("2026-11-20T00:00:00Z") / 1000) } });
    expect(await traiterSuitesComptes(r2.db, { stripe: f2.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ remboursements_clos: 1, echecs: 0 });
    expect(r2.rpc.find((r) => r.nom === "fermeture_remboursement_fait")?.args).toEqual({ p_fermeture: "f1", p_faits: [], p_motif: "souscription_poursuivie" });
    expect(f2.appels.some((a) => a.methode === "refunds.create")).toBe(false);
    // Encore vivante chez Stripe : la nuit suivante, sans échec ni geste.
    const r3 = fausseBase({ dus: [duJ14] });
    const f3 = fauxStripe({ souscription: { status: "active" } });
    expect(await traiterSuitesComptes(r3.db, { stripe: f3.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ remboursements: 0, remboursements_clos: 0, echecs: 0 });
    expect(r3.rpc.some((r) => r.nom === "fermeture_remboursement_fait")).toBe(false);
    // Arrêtée à la date prévue, mais paiement déjà entièrement remboursé : clos « deja_rembourse ».
    const r4 = fausseBase({ dus: [duJ14] });
    const f4 = fauxStripe({ souscription: { status: "canceled", ended_at: Math.floor(Date.parse(arret) / 1000) }, dejaRembourseChezStripe: true });
    expect(await traiterSuitesComptes(r4.db, { stripe: f4.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ remboursements_clos: 1, echecs: 0 });
    expect(r4.rpc.find((r) => r.nom === "fermeture_remboursement_fait")?.args).toEqual({ p_fermeture: "f1", p_faits: [], p_motif: "deja_rembourse" });
    // Arrêtée à la date prévue : remboursée.
    const r5 = fausseBase({ dus: [duJ14] });
    const f5 = fauxStripe({ souscription: { status: "canceled", ended_at: Math.floor(Date.parse(arret) / 1000) } });
    expect(await traiterSuitesComptes(r5.db, { stripe: f5.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ remboursements: 1, echecs: 0 });
  });

  it("finitions du 24/10 (I3) : le courriel de fin renvoie à la rétractation au lieu d'annoncer un remboursement en cours ; la déclaration gardée est dite", async () => {
    const clos = { ...suite, remboursement_cents: 0, rembourse_le: "2026-11-08T02:40:00Z", remboursement_motif: "retractation", bilan_execution: { ...suite.bilan_execution, retractations_conservees: 1 } };
    const b = fausseBase({ suites: [clos] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    expect(await traiterSuitesComptes(b.db, { stripe: null, envoyer, site: null, versionMin: null, exports: false })).toMatchObject({ courriels_fermeture: 1, echecs: 0 });
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("remboursée en entier au titre de votre rétractation");
    expect(html).not.toContain("est en cours");
    expect(html).not.toContain("Nous vous avons remboursé");
    expect(html).toContain("votre déclaration de rétractation");
  });

  it("fermeture pour inactivité : le courriel dit la dernière activité, pas une demande", async () => {
    const b = fausseBase({ suites: [{ ...suite, origine: "inactivite", choix: null, remboursement_prevu_cents: null, remboursement_cents: null, rembourse_le: null, derniere_activite_le: "2024-12-21T10:00:00Z" }] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    expect(await traiterSuitesComptes(b.db, { stripe: null, envoyer, site: null, versionMin: null, exports: false })).toMatchObject({ courriels_fermeture: 1, echecs: 0 });
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("faute de connexion depuis le 21 décembre 2024");
    expect(html).not.toContain("à votre demande");
  });

  it("remboursement pas encore fait : le courriel attend ; au-delà de sept jours, il part en l'annonçant en cours (relecture du 24/10)", async () => {
    const enAttente = { ...suite, remboursement_cents: null, rembourse_le: null };
    const b = fausseBase({ dus: [du], suites: [enAttente] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    expect(await traiterSuitesComptes(b.db, { stripe: null, envoyer, site: null, versionMin: null, exports: false, maintenant: new Date("2026-11-08T03:40:00Z") }))
      .toMatchObject({ echecs: 1, courriels_fermeture: 0 });
    expect(envoyer).not.toHaveBeenCalled();
    expect(b.rpc.some((r) => r.nom === "fermeture_suites_faites")).toBe(false);
    const c = fausseBase({ dus: [du], suites: [enAttente] });
    expect(await traiterSuitesComptes(c.db, { stripe: null, envoyer, site: null, versionMin: null, exports: false, maintenant: new Date("2026-11-15T03:40:00Z") }))
      .toMatchObject({ courriels_fermeture: 1 });
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("Le remboursement de 4,20 €, pour la part non utilisée de votre période payée, est en cours");
  });

  it("envoi refusé : rien n'est soldé, la nuit suivante reprend ; panne de lecture comptée", async () => {
    const c = fausseBase({ suites: [{ ...suite, choix: null, remboursement_prevu_cents: null, remboursement_cents: null, rembourse_le: null }] });
    const refus = vi.fn(async () => ({ erreur: "refus" }));
    expect(await traiterSuitesComptes(c.db, { stripe: null, envoyer: refus, site: null, versionMin: null, exports: false })).toMatchObject({ echecs: 1 });
    expect(c.rpc.some((r) => r.nom === "fermeture_suites_faites")).toBe(false);
    expect(await traiterSuitesComptes(fausseBase({ panneSuites: true }).db, { envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ echecs: 1 });
  });

  it("clients Stripe au terme des factures : supprimés chez Stripe puis consignés ; déjà absent, consigné aussi", async () => {
    const b = fausseBase({ clients: ["cus_terme1"] });
    const f = fauxStripe();
    expect(await traiterSuitesComptes(b.db, { stripe: f.stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ clients_stripe_supprimes: 1, echecs: 0 });
    expect(f.appels.find((a) => a.methode === "customers.del")?.args).toEqual(["cus_terme1"]);
    expect(b.rpc.find((r) => r.nom === "client_stripe_supprime")?.args).toEqual({ p_customer: "cus_terme1" });
    const c = fausseBase({ clients: ["cus_absent"] });
    expect(await traiterSuitesComptes(c.db, { stripe: fauxStripe({ clientAbsent: true }).stripe, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ clients_stripe_supprimes: 1, echecs: 0 });
    // Sans Stripe configuré : rien n'est consigné.
    const d = fausseBase({ clients: ["cus_terme1"] });
    await traiterSuitesComptes(d.db, { stripe: null, envoyer: vi.fn(), site: null, versionMin: null, exports: false });
    expect(d.rpc.some((r) => r.nom === "client_stripe_supprime")).toBe(false);
  });

  it("avertissements d'inactivité : aucun tant que la règle est inactive ; sinon envoyés puis consignés", async () => {
    const a = { account_id: "a2", email: "dormeur@example.invalid", etape: "j60", nature: "organisation", titulaire: true, organisation: "Espace", derniere_activite_le: "2024-12-21T10:00:00Z", suppression_le: "2026-12-23" };
    const inactive = fausseBase({ aPrevenir: [a] });
    const envoyer = vi.fn(async () => ({ id: "m" }));
    expect(await traiterSuitesComptes(inactive.db, { envoyer, site: null, versionMin: null, exports: false })).toMatchObject({ avertissements: 0 });
    expect(inactive.rpc.some((r) => r.nom === "comptes_inactifs_a_prevenir")).toBe(false);
    const active = fausseBase({ aPrevenir: [a, { ...a, account_id: "a3", email: "artisan@example.invalid", nature: "artisan", titulaire: false, organisation: null }] });
    expect(await traiterSuitesComptes(active.db, { envoyer, site: "https://site.example.com", versionMin: "2026-11-15", exports: false })).toMatchObject({ avertissements: 2, echecs: 0 });
    expect(active.rpc.find((r) => r.nom === "comptes_inactifs_a_prevenir")?.args).toEqual({ p_version_min: "2026-11-15", p_limite: 100 });
    expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({ to: "dormeur@example.invalid", subject: "Votre compte Gerimmo sera supprimé le 23 décembre 2026", cleIdempotence: "inactivite-a2-j60-2026-12-23" }));
    const artisan = lisible((envoyer.mock.calls[1] as unknown as [{ html: string }])[0].html);
    expect(artisan).toContain("https://site.example.com/api/artisan-prive/export");
    expect(active.rpc.find((r) => r.nom === "avertissement_inactivite_envoye")?.args).toEqual({ p_account: "a2", p_etape: "j60", p_derniere_activite_le: "2024-12-21T10:00:00Z", p_suppression_le: "2026-12-23" });
  });
});
