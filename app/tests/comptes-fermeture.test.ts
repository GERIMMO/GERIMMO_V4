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
  jourParisPlus,
  minuitParisEnSecondes,
  remboursementProrata,
  sujetAvertissementInactivite,
  versionInactiviteValide,
} from "../src/lib/comptes-fermeture";
import { annulerStripeFermeture, preparerStripeFermeture, rembourserFermeture, traiterSuitesComptes } from "../src/lib/comptes-fermeture-serveur";

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
    expect(perso).toContain("ce compte et les données qui y sont attachées seront supprimés le 23 décembre 2026");
    expect(perso).not.toMatch(/article\s+\d/i);
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
    expect(html).toContain("Nous avons effacé : votre compte et vos accès ; votre espace « Espace Martin », avec ses dossiers, ses documents et ses fichiers ; vos accès aux espaces où vous étiez invité.");
    expect(html).toContain("jusqu'au 5 novembre 2036");
    expect(html).toContain("les références de vos factures d'abonnement, jusqu'au 1 octobre 2032");
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
    expect(html).not.toContain("à votre demande");
    expect(elementsConserves(f)).toEqual([
      "la trace de votre demande et de son traitement",
      "les journaux de sécurité, jusqu'au terme de leur durée de conservation indiquée dans notre page confidentialité",
      "l'identifiant technique de votre compte, sans adresse électronique ni mot de passe, tant que ces journaux ou votre demande y font référence",
    ]);
    expect(elementsEffaces({ artisan: { id: "a", fiche: "detachee" } })).toEqual(["votre compte et vos accès", "vos zones, vos métiers et vos registres privés d'artisan"]);
  });
});

/** Une doublure de Stripe : rien ne part, chaque appel est relevé. */
function fauxStripe(o: { echoue?: boolean; factures?: { id: string; amount_paid: number }[]; paiement?: Record<string, unknown> } = {}) {
  const appels: { methode: string; args: unknown[] }[] = [];
  const note = (methode: string) => async (...args: unknown[]) => {
    appels.push({ methode, args });
    if (o.echoue) throw new Error("Stripe indisponible");
    if (methode === "subscriptions.retrieve") return { id: args[0], schedule: null, cancel_at_period_end: false };
    if (methode === "invoices.list") return { data: o.factures ?? [{ id: "in_essai1", amount_paid: 3000 }] };
    if (methode === "invoicePayments.list") return { data: [{ payment: o.paiement ?? { payment_intent: "pi_essai1" } }] };
    if (methode === "refunds.create") return { id: "re_essai1", amount: (args[0] as { amount: number }).amount };
    return { id: "sub_essai1" };
  };
  const stripe = {
    subscriptions: { retrieve: note("subscriptions.retrieve"), update: note("subscriptions.update") },
    subscriptionSchedules: { release: note("subscriptionSchedules.release") },
    invoices: { list: note("invoices.list") },
    invoicePayments: { list: note("invoicePayments.list") },
    refunds: { create: note("refunds.create") },
  } as unknown as Stripe;
  return { stripe, appels };
}

describe("gestes Stripe de la fermeture (doublure)", () => {
  const abo = { stripe_subscription_id: "sub_essai1", vivante: true, payee_en_cours: true, periode_debut: "2026-10-20T00:00:00Z", periode_fin: "2026-11-20T00:00:00Z" };

  it("fin de période : résiliation à l'échéance, aucun remboursement", async () => {
    const f = fauxStripe();
    expect(await preparerStripeFermeture(f.stripe, abo, "fin_periode")).toEqual({ ok: true, remboursement: null, arret: abo.periode_fin });
    expect(f.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at_period_end: true }]);
  });

  it("J+14 : arrêt à minuit de Paris du quatorzième jour, sans avoir Stripe, remboursement calculé sur la dernière facture payée", async () => {
    const f = fauxStripe({ factures: [{ id: "in_essai1", amount_paid: 3000 }] });
    const r = await preparerStripeFermeture(f.stripe, abo, "j14_prorata", new Date("2026-10-24T10:00:00Z"));
    const arret = minuitParisEnSecondes("2026-11-07");
    expect(f.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at: arret, proration_behavior: "none" }]);
    expect(r).toEqual({ ok: true, arret: new Date(arret * 1000).toISOString(), remboursement: { facture: "in_essai1", montant_cents: remboursementProrata({ payeCents: 3000, debut: new Date(abo.periode_debut), fin: new Date(abo.periode_fin), arret: new Date(arret * 1000) }) } });
    expect(r.ok && r.remboursement!.montant_cents).toBeGreaterThan(1000);
  });

  it("souscription vivante non payée (essai) : arrêt au quatorzième jour, rien à rembourser ; sans souscription : rien chez Stripe", async () => {
    const f = fauxStripe();
    expect(await preparerStripeFermeture(f.stripe, { ...abo, payee_en_cours: false, stripe_statut: "trialing" }, null)).toMatchObject({ ok: true, remboursement: null });
    expect(f.appels.some((a) => a.methode === "invoices.list")).toBe(false);
    const g = fauxStripe();
    expect(await preparerStripeFermeture(g.stripe, { vivante: false }, null)).toEqual({ ok: true, remboursement: null, arret: null });
    expect(g.appels).toEqual([]);
  });

  it("abonnement payé sans choix : refus ; Stripe en panne : refus net, rien de programmé", async () => {
    expect(await preparerStripeFermeture(fauxStripe().stripe, abo, null)).toMatchObject({ ok: false });
    expect(await preparerStripeFermeture(fauxStripe({ echoue: true }).stripe, abo, "j14_prorata")).toMatchObject({ ok: false });
  });

  it("annulation : la résiliation à l'échéance est levée, ou la date d'arrêt retirée", async () => {
    const f = fauxStripe();
    expect(await annulerStripeFermeture(f.stripe, abo, "fin_periode")).toEqual({ ok: true });
    expect(f.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at_period_end: false }]);
    const g = fauxStripe();
    expect(await annulerStripeFermeture(g.stripe, abo, "j14_prorata")).toEqual({ ok: true });
    expect(g.appels.find((a) => a.methode === "subscriptions.update")?.args).toEqual(["sub_essai1", { cancel_at: "" }]);
  });

  it("remboursement : sur le paiement de la facture, une seule fois (clé d'idempotence de la fermeture)", async () => {
    const f = fauxStripe();
    expect(await rembourserFermeture(f.stripe, { fermetureId: "f1", factureId: "in_essai1", montantCents: 420 })).toEqual({ ok: true, id: "re_essai1", montant: 420 });
    expect(f.appels.find((a) => a.methode === "refunds.create")?.args).toEqual([
      { payment_intent: "pi_essai1", amount: 420, reason: "requested_by_customer", metadata: { fermeture: "f1" } },
      { idempotencyKey: "fermeture-f1-remboursement" },
    ]);
    expect(await rembourserFermeture(fauxStripe({ paiement: {} }).stripe, { fermetureId: "f1", factureId: "in_x", montantCents: 1 })).toMatchObject({ ok: false });
    expect(await rembourserFermeture(f.stripe, { fermetureId: "f1", factureId: "in_x", montantCents: 0 })).toMatchObject({ ok: false });
  });
});

describe("suites de nuit (doublures de la base, de Stripe et de l'envoi)", () => {
  function fausseBase(o: { suites?: unknown[]; aPrevenir?: unknown[]; panneSuites?: boolean } = {}) {
    const rpc: { nom: string; args: Record<string, unknown> }[] = [];
    const retraits: { compartiment: string; chemins: string[] }[] = [];
    const db = {
      rpc: async (nom: string, args: Record<string, unknown>) => {
        rpc.push({ nom, args });
        if (nom === "exports_complets_a_supprimer") return { data: [], error: null };
        if (nom === "fermetures_suites_a_faire") return o.panneSuites ? { data: null, error: { message: "panne" } } : { data: o.suites ?? [], error: null };
        if (nom === "comptes_inactifs_a_prevenir") return { data: o.aPrevenir ?? [], error: null };
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
      fichiers_hors_documents: [{ compartiment: "artisan-prive", chemin: "a1/x.pdf" }, { compartiment: "documents", chemin: "o1/y.pdf" }],
    },
    abonnement: {}, remboursement_prevu_cents: 420, stripe_facture_id: "in_essai1", rembourse_le: null,
    archives: [{ preuve_conservee_jusqu_au: "2036-11-05", factures_conservees_jusqu_au: null }],
  };

  it("fichiers hors `documents` retirés (jamais `documents`), remboursement, puis courriel et solde", async () => {
    const b = fausseBase({ suites: [suite] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    const f = fauxStripe();
    const bilan = await traiterSuitesComptes(b.db, { stripe: f.stripe, envoyer, site: "https://site.example.com", versionMin: null, exports: false });
    expect(bilan).toMatchObject({ courriels_fermeture: 1, remboursements: 1, echecs: 0 });
    expect(b.retraits).toEqual([{ compartiment: "artisan-prive", chemins: ["a1/x.pdf"] }]);
    expect(b.rpc.filter((r) => r.nom === "fermeture_suites_faites").map((r) => r.args)).toEqual([
      { p_fermeture: "f1", p_remboursement_cents: 420, p_stripe_remboursement_id: "re_essai1", p_courriel_envoye: false },
      { p_fermeture: "f1", p_remboursement_cents: null, p_stripe_remboursement_id: null, p_courriel_envoye: true },
    ]);
    expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({ to: "titulaire@example.invalid", subject: "Votre compte Gerimmo est fermé", cleIdempotence: "fermeture-f1" }));
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("Nous vous avons remboursé 4,20 €");
    expect(html).toContain("https://site.example.com/confidentialite");
  });

  it("fermeture pour inactivité : le courriel dit la dernière activité, pas une demande", async () => {
    const b = fausseBase({ suites: [{ ...suite, origine: "inactivite", choix: null, remboursement_prevu_cents: null, stripe_facture_id: null, derniere_activite_le: "2024-12-21T10:00:00Z" }] });
    const envoyer = vi.fn(async () => ({ id: "m1" }));
    expect(await traiterSuitesComptes(b.db, { stripe: null, envoyer, site: null, versionMin: null, exports: false })).toMatchObject({ courriels_fermeture: 1, echecs: 0 });
    const html = lisible((envoyer.mock.calls[0] as unknown as [{ html: string }])[0].html);
    expect(html).toContain("faute de connexion depuis le 21 décembre 2024");
    expect(html).not.toContain("à votre demande");
  });

  it("sans Stripe, ou envoi refusé : rien n'est soldé, la nuit suivante reprend ; panne de lecture comptée", async () => {
    const b = fausseBase({ suites: [suite] });
    expect(await traiterSuitesComptes(b.db, { stripe: null, envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ echecs: 1, courriels_fermeture: 0 });
    expect(b.rpc.some((r) => r.nom === "fermeture_suites_faites")).toBe(false);
    const c = fausseBase({ suites: [{ ...suite, choix: null, remboursement_prevu_cents: null }] });
    const refus = vi.fn(async () => ({ erreur: "refus" }));
    expect(await traiterSuitesComptes(c.db, { stripe: null, envoyer: refus, site: null, versionMin: null, exports: false })).toMatchObject({ echecs: 1 });
    expect(c.rpc.some((r) => r.nom === "fermeture_suites_faites")).toBe(false);
    expect(await traiterSuitesComptes(fausseBase({ panneSuites: true }).db, { envoyer: vi.fn(), site: null, versionMin: null, exports: false })).toMatchObject({ echecs: 1 });
  });

  it("avertissements d'inactivité : aucun tant que la règle est inactive ; sinon envoyés puis consignés", async () => {
    const a = { account_id: "a2", email: "dormeur@example.invalid", etape: "j60", nature: "organisation", organisation: "Espace", derniere_activite_le: "2024-12-21T10:00:00Z", suppression_le: "2026-12-23" };
    const inactive = fausseBase({ aPrevenir: [a] });
    const envoyer = vi.fn(async () => ({ id: "m" }));
    expect(await traiterSuitesComptes(inactive.db, { envoyer, site: null, versionMin: null, exports: false })).toMatchObject({ avertissements: 0 });
    expect(inactive.rpc.some((r) => r.nom === "comptes_inactifs_a_prevenir")).toBe(false);
    const active = fausseBase({ aPrevenir: [a] });
    expect(await traiterSuitesComptes(active.db, { envoyer, site: "https://site.example.com", versionMin: "2026-11-15", exports: false })).toMatchObject({ avertissements: 1, echecs: 0 });
    expect(active.rpc.find((r) => r.nom === "comptes_inactifs_a_prevenir")?.args).toEqual({ p_version_min: "2026-11-15", p_limite: 100 });
    expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({ to: "dormeur@example.invalid", subject: "Votre compte Gerimmo sera supprimé le 23 décembre 2026", cleIdempotence: "inactivite-a2-j60-2026-12-23" }));
    expect(active.rpc.find((r) => r.nom === "avertissement_inactivite_envoye")?.args).toEqual({ p_account: "a2", p_etape: "j60", p_derniere_activite_le: "2024-12-21T10:00:00Z", p_suppression_le: "2026-12-23" });
  });
});
