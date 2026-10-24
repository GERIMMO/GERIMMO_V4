/**
 * Plan de conformité du 23/10/2026, lot 1A (R10, R60, R19) — sans base.
 *
 *  - La case des conditions suit l'espace : conditions générales pour le propriétaire, conditions de l'espace artisan
 *    DÈS LEUR PUBLICATION (les deux états sont éprouvés), règles des espaces invités pour la personne invitée.
 *  - L'écran « Nos conditions générales évoluent » : il ne s'affiche pour personne aujourd'hui (dernière acceptation sur
 *    la version en vigueur, ou aucune acceptation) ; ses textes pour une version future ; la phrase de non-reconduction
 *    seulement pour une version substantielle publiée avec la règle de l'accord exprès et un abonnement en cours.
 *  - La non-reconduction : jamais pour la version en vigueur (2026-09-30), jamais avant la date d'effet ; à la date,
 *    `cancel_at_period_end` sous le verrou, consigné ; un arrêt d'urgence interrompt la passe.
 *  - La garde de l'espace artisan : inactive (aucune lecture) tant que les conditions ne sont pas publiées.
 *  - « Mon compte » : texte et lien de la version acceptée.
 */
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CASE_CONDITIONS_ARTISANS,
  CASE_CONDITIONS_CLIENTS,
  CASE_REGLES_INVITES,
  caseConditions,
  documentAffiche,
  libelleCase,
  valeurReport,
  versionArtisansPubliee,
} from "../src/lib/conditions-acceptation";
import { conditionsArtisansAAccepter } from "../src/lib/conditions-acceptation-serveur";
import { CONDITIONS_ARTISANS_DATE, CONDITIONS_ARTISANS_VERSION, CONDITIONS_DATE, CONDITIONS_VERSION } from "../src/lib/editeur";
import {
  VERSIONS_SANS_ACCORD_EXPRES,
  accordExpresRequis,
  messageAccordEnregistre,
  nouvelleVersionAAccepter,
} from "../src/lib/nouvelle-version-conditions";
import { motifPreavis, motifSansObjet, poserNonReconductionsConditions, unMoisApres } from "../src/lib/non-reconduction-conditions";
import { ArretSupervision } from "../src/lib/controle-effets";
import { versionDeclaree } from "../src/lib/conditions-versions";
import { lienVersionAcceptee, texteAcceptation } from "../src/app/compte/conditions-acceptees";
import { EcranNouvelleVersionConditions } from "../src/components/ecran-nouvelle-version-conditions";

const PUBLIEES = { version: "2026-11-15", date: "15 novembre 2026" };
const NON_PUBLIEES = { version: null, date: null };
/** Une future version substantielle, publiée avec la règle de l'accord exprès (fictive). */
const V1 = { date_effet: "2026-11-15", nature: "substantielle" as const, resume_modifications: "Offre aux seuls propriétaires, rétractation en ligne.", empreinte_reference: "0".repeat(64) };

describe("la case des conditions selon l'espace (R10, R60)", () => {
  it("aujourd'hui, les conditions de l'espace artisan ne sont pas publiées : tout le mécanisme artisan est inactif", () => {
    expect(CONDITIONS_ARTISANS_VERSION).toBeNull();
    expect(CONDITIONS_ARTISANS_DATE).toBeNull();
    expect(versionArtisansPubliee()).toBeNull();
    // L'artisan accepte les conditions clients, comme avant.
    expect(caseConditions("artisan")).toEqual({ ...CASE_CONDITIONS_CLIENTS, version: CONDITIONS_VERSION });
  });

  it("le propriétaire accepte les conditions générales d'utilisation et de vente, version en vigueur", () => {
    const c = caseConditions("proprietaire_direct", PUBLIEES);
    expect(c).toMatchObject({ document: "conditions_clients", version: CONDITIONS_VERSION, href: "/conditions" });
    expect(libelleCase(c)).toBe("J’accepte les conditions générales d’utilisation et de vente.");
    expect(c.refus).toBe("Acceptez les conditions générales d’utilisation et de vente pour continuer.");
  });

  it("publiées, les conditions de l'espace artisan s'acceptent sous leur document et leur version, avec leur lien", () => {
    const c = caseConditions("artisan", PUBLIEES);
    expect(c).toEqual({ ...CASE_CONDITIONS_ARTISANS, version: "2026-11-15" });
    expect(libelleCase(c)).toBe("J’accepte les conditions de l’espace artisan.");
    expect(c.href).toBe("/conditions/artisans");
    // Une version vide ou blanche ne compte pas comme publiée.
    expect(caseConditions("artisan", { version: "  ", date: null }).document).toBe("conditions_clients");
    expect(caseConditions("artisan", NON_PUBLIEES).document).toBe("conditions_clients");
  });

  it("la personne invitée prend connaissance des règles des espaces invités (article 7), sans accepter les conditions de vente", () => {
    for (const artisans of [PUBLIEES, NON_PUBLIEES]) {
      const c = caseConditions("invite", artisans);
      expect(c).toEqual({ ...CASE_REGLES_INVITES, version: CONDITIONS_VERSION });
      expect(libelleCase(c)).toBe("J’ai pris connaissance des règles d’utilisation des espaces invités (article 7 des conditions générales).");
    }
  });

  it("l'article 7 de la version en vigueur porte bien sur les espaces des personnes invitées", () => {
    const cgu = readFileSync("src/app/conditions/page.tsx", "utf8");
    const article = cgu.slice(cgu.indexOf('<Article titre="7.'), cgu.indexOf('<Article titre="8.'));
    expect(article).toContain("7. Espaces des locataires et des propriétaires mandants");
    expect(article).toContain("ouvrir un espace de consultation");
    expect(article).toContain("ne contractent pas");
  });

  it("un usage inconnu reçoit la case la plus engageante (le serveur le refuse de toute façon)", () => {
    expect(caseConditions("autre").document).toBe("conditions_clients");
  });

  it("le document affiché à l'envoi : absent (page d'avant le 24/10) = conditions clients ; inconnu = refusé", () => {
    expect(documentAffiche(null)).toBe("conditions_clients");
    expect(documentAffiche("regles_invites")).toBe("regles_invites");
    expect(documentAffiche("conditions_artisans")).toBe("conditions_artisans");
    expect(documentAffiche("autre")).toBeNull();
  });

  it("dès que la version artisan est renseignée, sa page publiée doit exister", () => {
    if (CONDITIONS_ARTISANS_VERSION) expect(existsSync("src/app/conditions/artisans/page.tsx")).toBe(true);
  });
});

describe("la garde de l'espace artisan (R10)", () => {
  /** `supervise` : ce que rend `artisan_supervise()` (l'artisan d'un diagnostic du super-administrateur, sinon null). */
  const db = (accepte: boolean, supervise: { data: string | null; error: { message: string } | null } = { data: null, error: null }) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: accepte ? { id: "a" } : null, error: null });
    const chaine = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle };
    chaine.select.mockReturnValue(chaine);
    chaine.eq.mockReturnValue(chaine);
    chaine.limit.mockReturnValue(chaine);
    const from = vi.fn().mockReturnValue(chaine);
    const rpc = vi.fn().mockResolvedValue(supervise);
    return { client: { from, rpc } as never, from, rpc, chaine };
  };

  it("non publiées : rien n'est exigé, rien n'est lu", async () => {
    const { client, from, rpc } = db(false);
    expect(await conditionsArtisansAAccepter(client, "compte-1", NON_PUBLIEES)).toBeNull();
    expect(await conditionsArtisansAAccepter(client, "compte-1")).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  // Relecture adverse du 24/10 (défaut 2) : en diagnostic, `mon_artisan_id()` rend l'artisan supervisé, mais le compte
  // connecté est le super-administrateur. La garde lisait SON acceptation (aucune), posait la case à la place de chaque
  // page, et le clic échouait (diagnostic en lecture seule) : le diagnostic des espaces artisans devenait impossible.
  it("diagnostic du super-administrateur (lecture seule) : jamais la garde, aucune acceptation lue", async () => {
    const { client, from, rpc } = db(false, { data: "artisan-supervise", error: null });
    expect(await conditionsArtisansAAccepter(client, "super-admin", PUBLIEES)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("artisan_supervise");
    expect(from).not.toHaveBeenCalled();
  });

  it("contexte de diagnostic illisible : la garde s'applique au compte connecté (jamais ouverte par défaut)", async () => {
    const { client, chaine } = db(false, { data: null, error: { message: "indisponible" } });
    expect(await conditionsArtisansAAccepter(client, "compte-1", PUBLIEES)).toEqual({ version: "2026-11-15", date: "15 novembre 2026" });
    expect(chaine.eq).toHaveBeenCalledWith("account_id", "compte-1");
  });

  it("publiées et non acceptées : la version à accepter, lue pour ce compte et ce document", async () => {
    const { client, chaine } = db(false);
    expect(await conditionsArtisansAAccepter(client, "compte-1", PUBLIEES)).toEqual({ version: "2026-11-15", date: "15 novembre 2026" });
    expect(chaine.eq).toHaveBeenCalledWith("account_id", "compte-1");
    expect(chaine.eq).toHaveBeenCalledWith("document", "conditions_artisans");
    expect(chaine.eq).toHaveBeenCalledWith("version", "2026-11-15");
  });

  it("publiées et acceptées : l'espace s'ouvre", async () => {
    const { client } = db(true);
    expect(await conditionsArtisansAAccepter(client, "compte-1", PUBLIEES)).toBeNull();
  });

  it("le gabarit de l'espace artisan pose la case à la place de la page demandée", () => {
    const gabarit = readFileSync("src/app/artisan/layout.tsx", "utf8");
    expect(gabarit).toContain("conditionsArtisansAAccepter(supabase, user.id)");
    expect(gabarit).toContain(
      "{conditionsAAccepter ? <AcceptationConditionsArtisans version={conditionsAAccepter.version} date={conditionsAAccepter.date} /> : children}"
    );
  });
});

describe("l'écran « Nos conditions générales évoluent » (R19)", () => {
  it("aujourd'hui, il ne s'affiche pour personne : dernière acceptation sur la version en vigueur, ou aucune", () => {
    expect(CONDITIONS_VERSION).toBe("2026-09-30");
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: CONDITIONS_VERSION })).toBeNull();
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: null })).toBeNull();
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: CONDITIONS_VERSION, abonnement: { souscrit: true, periode_fin: "2026-12-01T00:00:00Z", annulation_demandee: false } })).toBeNull();
  });

  it("la version en vigueur n'exige pas l'accord exprès : son article 16 ne prévoit pas la non-reconduction", () => {
    expect(VERSIONS_SANS_ACCORD_EXPRES).toContain(CONDITIONS_VERSION);
    expect(accordExpresRequis(CONDITIONS_VERSION, versionDeclaree("conditions_clients", CONDITIONS_VERSION))).toBe(false);
    // Une ancienne acceptation montre l'écran, sans la phrase de non-reconduction.
    const ecran = nouvelleVersionAAccepter({ derniereVersionAcceptee: "2026-09-29", abonnement: { souscrit: true, periode_fin: "2026-12-01T00:00:00Z", annulation_demandee: false } });
    expect(ecran?.accordExpres).toBe(false);
    expect(ecran?.paragraphes).toHaveLength(1);
    expect(ecran?.paragraphes[0]).toBe(
      "Une nouvelle version des conditions générales d’utilisation et de vente s’applique à compter du 30 septembre 2026. Résumé des changements : Essai gratuit porté de 14 jours à 2 mois pour toute inscription jusqu’au 31/12/2026 (offre de lancement), 1 mois ensuite (article 8.2)."
    );
    expect(ecran?.dateVersion).toBe(CONDITIONS_DATE);
  });

  it("une version substantielle future : la phrase de non-reconduction, avec la fin de la période en cours à la date d'effet", () => {
    const base = { derniereVersionAcceptee: CONDITIONS_VERSION, version: "2026-11-15", dateVersion: "15 novembre 2026", declaree: V1 };
    const ecran = nouvelleVersionAAccepter({ ...base, abonnement: { souscrit: true, periode_fin: "2027-03-01T10:00:00Z", annulation_demandee: false } });
    expect(ecran?.accordExpres).toBe(true);
    expect(ecran?.paragraphes).toEqual([
      "Une nouvelle version des conditions générales d’utilisation et de vente s’applique à compter du 15 novembre 2026. Résumé des changements : Offre aux seuls propriétaires, rétractation en ligne.",
      "Sans votre accord à cette date, la version précédente continue de s’appliquer jusqu’au 1 mars 2027, puis votre abonnement n’est pas reconduit ; vos données restent consultables et exportables.",
    ]);
    // Période qui finit avant la date d'effet (mensuel renouvelé d'ici là) : la phrase ne donne pas une date fausse.
    const mensuel = nouvelleVersionAAccepter({ ...base, abonnement: { souscrit: true, periode_fin: "2026-11-01T00:00:00Z", annulation_demandee: false } });
    expect(mensuel?.paragraphes[1]).toContain("jusqu’au terme de la période en cours à cette date");
    // Sans abonnement : pas de phrase. Version technique : pas de phrase.
    expect(nouvelleVersionAAccepter({ ...base, abonnement: null })?.paragraphes).toHaveLength(1);
    expect(nouvelleVersionAAccepter({ ...base, declaree: { ...V1, nature: "technique" }, abonnement: { souscrit: true, periode_fin: null, annulation_demandee: false } })?.paragraphes).toHaveLength(1);
    // Version non déclarée : l'écran ne s'invente pas.
    expect(nouvelleVersionAAccepter({ ...base, declaree: null })).toBeNull();
  });

  it("la confirmation de l'accord dit quand l'abonnement est programmé pour finir", () => {
    expect(messageAccordEnregistre("15 novembre 2026", null)).toBe("Votre acceptation de la version du 15 novembre 2026 des conditions générales est enregistrée.");
    expect(messageAccordEnregistre("15 novembre 2026", { souscrit: true, periode_fin: "2027-03-01T10:00:00Z", annulation_demandee: true })).toBe(
      "Votre acceptation de la version du 15 novembre 2026 des conditions générales est enregistrée. Votre abonnement est programmé pour prendre fin le 1 mars 2027 : vous pouvez le poursuivre depuis « Mon abonnement »."
    );
  });

  it("l'encart : titre, textes, lecture de la version, « J'accepte la nouvelle version » et « Plus tard », sans rien bloquer", () => {
    const html = renderToStaticMarkup(
      createElement(EcranNouvelleVersionConditions, {
        orgId: "11111111-1111-4111-8111-111111111111",
        version: "2026-11-15",
        dateVersion: "15 novembre 2026",
        paragraphes: ["Premier.", "Second."],
        report: valeurReport("2026-11-15", "2026-11-20T08:00:00Z"),
      })
    );
    expect(html).toContain("Nos conditions générales évoluent");
    expect(html).toContain("<p>Premier.</p><p>Second.</p>");
    expect(html).toContain('href="/conditions"');
    expect(html).toContain('name="cgu_version" value="2026-11-15"');
    expect(html).toContain("J’accepte la nouvelle version");
    expect(html).toContain("Plus tard");
    expect(html).not.toContain('role="dialog"');
  });

  it("« Plus tard » vaut jusqu'à la prochaine connexion : la valeur change avec l'heure de connexion", () => {
    expect(valeurReport("2026-11-15", "2026-11-20T08:00:00Z")).not.toBe(valeurReport("2026-11-15", "2026-11-21T08:00:00Z"));
    expect(valeurReport("2026-11-15", null)).toBe("2026-11-15|-");
  });

  it("la coquille de l'espace le pose pour le seul responsable, hors traversée de supervision", () => {
    const gabarit = readFileSync("src/app/agence/[orgId]/layout.tsx", "utf8");
    expect(gabarit).toMatch(/\{estResponsable && !traverseeLectureSeule && \(\s*<NouvelleVersionConditions /);
  });
});

describe("la non-reconduction faute d'accord (R19)", () => {
  it("jamais pour la version en vigueur ; jamais avant la date d'effet ; jamais pour une version technique ou non déclarée", () => {
    expect(motifSansObjet(CONDITIONS_VERSION, versionDeclaree("conditions_clients", CONDITIONS_VERSION), "2027-01-01")).toBe("sans_accord_expres");
    expect(motifSansObjet("2026-11-15", V1, "2026-11-14")).toBe("avant_date_effet");
    expect(motifSansObjet("2026-11-15", V1, "2026-11-15")).toBeNull();
    expect(motifSansObjet("2026-11-15", { ...V1, nature: "technique" }, "2027-01-01")).toBe("sans_accord_expres");
    expect(motifSansObjet("2026-11-15", null, "2027-01-01")).toBe("version_non_declaree");
  });

  type Appel = [string, Record<string, unknown> | undefined];
  function banc(options: { lignes?: unknown[]; verrouTenu?: boolean; echec?: boolean; libere?: boolean; arret?: boolean; archive?: string | null } = {}) {
    const appels: Appel[] = [];
    // L'archive de la version : publiée le 1er octobre par défaut, donc un mois plein avant le 15 novembre.
    const archive = options.archive === undefined ? "2026-10-01T10:00:00Z" : options.archive;
    const lectures: string[] = [];
    const maybeSingle = vi.fn(async () => ({ data: archive ? { publiee_le: archive } : null, error: null }));
    const filtre = { eq: vi.fn(), maybeSingle };
    filtre.eq.mockImplementation((colonne: string, valeur: string) => {
      lectures.push(`${colonne}=${valeur}`);
      return filtre;
    });
    const from = vi.fn((table: string) => {
      lectures.push(table);
      return { select: vi.fn(() => filtre) };
    });
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      appels.push([fn, args]);
      if (fn === "verrou_facturation_prendre") return { data: !options.verrouTenu, error: null };
      if (fn === "verrou_facturation_rendre") return { data: true, error: null };
      if (fn === "abonnements_sans_accord_conditions") {
        return { data: options.lignes ?? [{ organization_id: "org-1", organisation: "Parc", stripe_subscription_id: "sub_1", periode_fin: "2027-03-01T00:00:00Z" }], error: null };
      }
      return { data: null, error: null };
    });
    const update = vi.fn(async () => {
      if (options.arret) throw new ArretSupervision();
      if (options.echec) throw new Error("carte refusée");
      return { id: "sub_1", cancel_at_period_end: true };
    });
    const retrieve = vi.fn(async () => ({ id: "sub_1", schedule: options.libere ? "sub_sched_1" : null }));
    const release = vi.fn(async () => ({}));
    const stripe = { subscriptions: { retrieve, update }, subscriptionSchedules: { release, retrieve: vi.fn(async () => ({ id: "sub_sched_1", status: "active" })) } };
    return { supabase: { rpc, from } as never, stripe: stripe as never, appels, update, lectures };
  }

  it("la version en vigueur ne lit ni n'écrit rien", async () => {
    const b = banc();
    expect(await poserNonReconductionsConditions(b.supabase, b.stripe)).toEqual({ motif: "sans_accord_expres", examinees: 0, posees: 0, echecs: [] });
    expect(b.appels).toEqual([]);
    expect(b.lectures).toEqual([]);
  });

  it("garde du préavis : version archivée depuis un mois plein au moins (jour de Paris), sinon rien", async () => {
    expect(unMoisApres("2026-10-01")).toBe("2026-11-01");
    expect(unMoisApres("2026-01-31")).toBe("2026-02-28");
    expect(unMoisApres("2026-12-15")).toBe("2027-01-15");
    expect(motifPreavis("2026-11-15", null)).toBe("version_non_archivee");
    expect(motifPreavis("2026-11-15", "2026-10-20T08:00:00Z")).toBe("preavis_en_cours");
    // Archivée le 15 octobre à 23 h 30 de Paris (21 h 30 UTC) : le préavis court jusqu'au 14 novembre inclus.
    expect(motifPreavis("2026-11-14", "2026-10-15T21:30:00Z")).toBe("preavis_en_cours");
    expect(motifPreavis("2026-11-15", "2026-10-15T21:30:00Z")).toBeNull();
    // Version non archivée : rien n'est lu au-delà de l'archive, rien n'est écrit.
    const sansArchive = banc({ archive: null });
    expect(await poserNonReconductionsConditions(sansArchive.supabase, sansArchive.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" }))
      .toEqual({ motif: "version_non_archivee", examinees: 0, posees: 0, echecs: [] });
    expect(sansArchive.lectures).toEqual(["versions_conditions", "document=conditions_clients", "version=2026-11-15"]);
    expect(sansArchive.appels).toEqual([]);
    // Archivée tard (le 10 novembre) : la date d'effet du 15 novembre ne suffit pas, le préavis d'un mois court encore.
    const tardive = banc({ archive: "2026-11-10T09:00:00Z" });
    expect((await poserNonReconductionsConditions(tardive.supabase, tardive.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-11-15" })).motif).toBe("preavis_en_cours");
    expect(tardive.appels).toEqual([]);
  });

  it("à la date d'effet : cancel_at_period_end sous le verrou « resiliation », puis consigné", async () => {
    const b = banc();
    const bilan = await poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-11-15" });
    expect(bilan).toEqual({ motif: null, examinees: 1, posees: 1, echecs: [] });
    // Finitions du 24/10 (M1) : marquée, pour que le webhook n'envoie pas d'accusé d'une résiliation non notifiée.
    expect(b.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true, metadata: { gerimmo_non_reconduction: "2026-11-15" } });
    expect(b.appels.map(([fn]) => fn)).toEqual([
      "abonnements_sans_accord_conditions",
      "verrou_facturation_prendre",
      "abonnement_non_reconduction_conditions",
      "verrou_facturation_rendre",
    ]);
    expect(b.appels[0][1]).toEqual({ p_version: "2026-11-15" });
    expect(b.appels[1][1]).toMatchObject({ p_org: "org-1", p_operation: "resiliation" });
    expect(b.appels[2][1]).toEqual({ p_org: "org-1", p_subscription: "sub_1", p_version: "2026-11-15", p_echeancier_libere: false, p_posee: true });
  });

  it("verrou tenu par un autre geste : rien chez Stripe, un échec compté, la ligne repassera", async () => {
    const b = banc({ verrouTenu: true });
    const bilan = await poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" });
    expect(bilan.posees).toBe(0);
    expect(bilan.echecs).toHaveLength(1);
    expect(b.update).not.toHaveBeenCalled();
  });

  it("refus de Stripe : rien de consigné comme posé, verrou rendu", async () => {
    const b = banc({ echec: true });
    const bilan = await poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" });
    expect(bilan).toMatchObject({ examinees: 1, posees: 0 });
    expect(bilan.echecs).toHaveLength(1);
    expect(b.appels.map(([fn]) => fn)).not.toContain("abonnement_non_reconduction_conditions");
    expect(b.appels.at(-1)?.[0]).toBe("verrou_facturation_rendre");
  });

  it("échéancier libéré puis échec : l'échéance redevient « à préparer », rien n'est consigné comme posé", async () => {
    const b = banc({ echec: true, libere: true });
    const bilan = await poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" });
    expect(bilan.posees).toBe(0);
    const trace = b.appels.find(([fn]) => fn === "abonnement_non_reconduction_conditions");
    expect(trace?.[1]).toEqual({ p_org: "org-1", p_subscription: "sub_1", p_version: "2026-11-15", p_echeancier_libere: true, p_posee: false });
  });

  it("succès avec échéancier libéré : consigné posé, échéance à préparer", async () => {
    const b = banc({ libere: true });
    const bilan = await poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" });
    expect(bilan.posees).toBe(1);
    expect(b.appels.find(([fn]) => fn === "abonnement_non_reconduction_conditions")?.[1]).toMatchObject({ p_echeancier_libere: true, p_posee: true });
  });

  it("un arrêt d'urgence interrompt la passe (et le verrou est rendu)", async () => {
    const b = banc({ arret: true });
    await expect(poserNonReconductionsConditions(b.supabase, b.stripe, { version: "2026-11-15", declaree: V1, aujourdhui: "2026-12-01" })).rejects.toBeInstanceOf(ArretSupervision);
    expect(b.appels.at(-1)?.[0]).toBe("verrou_facturation_rendre");
  });

  it("la tâche quotidienne des abonnements porte l'étape, après les échéances et avant l'avis de reconduction", () => {
    const tache = readFileSync("src/lib/missions-planifiees/abonnements.ts", "utf8");
    const echeances = tache.indexOf("const echeances = await preparerEcheances(supabase, stripe);");
    const etape = tache.indexOf("await poserNonReconductionsConditions(supabase, stripe)");
    const avis = tache.indexOf("reconduction = await envoyerAvisReconduction(");
    expect(echeances).toBeGreaterThan(0);
    expect(etape).toBeGreaterThan(echeances);
    expect(avis).toBeGreaterThan(etape);
    expect(tache).toContain("if (e instanceof ArretSupervision) throw e;");
  });
});

describe("« Mon compte » : la version acceptée (lot 1A)", () => {
  const acceptation = { document: "conditions_clients" as const, version: "2026-09-30", acceptee_le: "2026-10-01T22:30:00Z" };

  it("« Conditions acceptées : version du …, le … » au jour de Paris", () => {
    expect(texteAcceptation(acceptation)).toBe("Conditions acceptées : version du 30 septembre 2026, le 2 octobre 2026");
    expect(texteAcceptation({ ...acceptation, document: "regles_invites" })).toBe(
      "Règles des espaces invités (article 7 des conditions générales) prises en compte : version du 30 septembre 2026, le 2 octobre 2026"
    );
  });

  it("le lien « consulter » : la version archivée, sinon la page en vigueur pour la même version, sinon la liste", () => {
    expect(lienVersionAcceptee(acceptation, new Set(["conditions_clients/2026-09-30"]))).toBe("/conditions/versions/conditions_clients/2026-09-30");
    expect(lienVersionAcceptee(acceptation, new Set())).toBe("/conditions");
    expect(lienVersionAcceptee({ ...acceptation, version: "2026-09-24" }, new Set())).toBe("/conditions/versions");
    // Les règles des invités se relisent dans les conditions générales de leur version.
    expect(lienVersionAcceptee({ ...acceptation, document: "regles_invites" }, new Set(["conditions_clients/2026-09-30"]))).toBe("/conditions/versions/conditions_clients/2026-09-30");
    expect(lienVersionAcceptee({ document: "conditions_artisans", version: "2026-11-15" }, new Set(["conditions_artisans/2026-11-15"]))).toBe("/conditions/versions/conditions_artisans/2026-11-15");
  });

  it("la page « Sécurité du compte » pose la carte", () => {
    expect(readFileSync("src/app/compte/page.tsx", "utf8")).toContain("<ConditionsAcceptees supabase={supabase} compteId={user.id} />");
  });
});
