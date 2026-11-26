/**
 * Plan de corrections du 26/11/2026, lot L4 (écrans justes), parties propriétaire et locataire. Quatre défauts relevés
 * dans 1dca28b, chacun tenu ici sans base ; chaque cas échouait avant sa correction, sauf les témoins signalés.
 *  - E049, E160 : « Mettre en location » restait cliquable sur un lot que la base refusera de passer en disponible.
 *    Choix d'affichage délégué (plan, § L4) : bouton désactivé, la raison écrite dessous.
 *  - E026 : l'aide du propriétaire disait que son locataire écrit depuis « Mon gestionnaire » ; il lit « Mon bailleur ».
 *  - Profil, relances : envoi automatique fermé, l'écran disait « suspendus » puis décrivait les relances du matin.
 *  - E132 : la FAQ du locataire promettait « jamais de surprise sur la facture ».
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/parc", () => ({ changerEtatLot: vi.fn() }));
vi.mock("@/app/actions/organisation", () => ({ modifierProfilOrganisation: vi.fn() }));
// La page est « prête » : le bouton d'envoi n'est plus désactivé par l'attente du script (lib/use-hydrate.ts), seul
// l'état du lot compte dans ce qui est rendu.
vi.mock("@/lib/use-hydrate", () => ({ useHydrate: () => true, AIDE_BOUTON_EN_ATTENTE: "La page finit de se charger." }));
vi.mock("@/app/locataire/[orgId]/identite-contact", () => ({
  lireIdentiteContact: async () => ({ nom: "Camille Bailleur", titre: "Mon bailleur", agence: false }),
}));

import { BoutonsEtatLot } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/boutons-etat-lot";
import { QUESTIONS } from "@/app/agence/[orgId]/faq/questions";
import { identiteContactLocataire } from "@/lib/identite-contact-locataire";
import { FormulaireProfilOrganisation } from "@/app/agence/[orgId]/profil/formulaire-profil";
import PageFaqLocataire from "@/app/locataire/[orgId]/faq/page";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const texteDe = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** La balise ouvrante du bouton dont le texte est `libelle`. */
const bouton = (html: string, libelle: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].find((m) => texteDe(m[1]).trim() === libelle)?.[0].match(/^<button\b[^>]*>/)?.[0] ?? "";

describe("E049, E160 — un lot bloqué ne propose plus « Mettre en location » comme un geste possible", () => {
  const rendre = (props: { bloque?: boolean; compact?: boolean }) =>
    renderToStaticMarkup(createElement(BoutonsEtatLot, { orgId: "o", bienId: "b", lotId: "l", etat: "brouillon", ...props }));

  it("bloqué : le bouton est désactivé, et la raison écrite dessous lui est rattachée", () => {
    const html = rendre({ bloque: true });
    const miseEnLocation = bouton(html, "Mettre en location");
    expect(miseEnLocation).toMatch(/\sdisabled=""/);
    const id = /aria-describedby="([^"]+)"/.exec(miseEnLocation)?.[1];
    expect(id).toBeTruthy();
    const raison = new RegExp(`<p id="${id}"[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1] ?? "";
    expect(texteDe(raison)).toContain("Mise en location impossible pour l'instant : réglez d'abord ce qui bloque ce lot, listé plus haut.");
    // L'autre geste reste offert, et la phrase « vérifie une dernière fois » ne promet plus un contrôle qui n'aura pas lieu.
    expect(bouton(html, "Archiver")).not.toMatch(/\sdisabled=""/);
    expect(html).not.toContain("La mise en location vérifie une dernière fois");
  });

  it("bloqué, dans la liste des lots de la fiche bien (présentation compacte) : même refus, même raison", () => {
    const html = rendre({ bloque: true, compact: true });
    expect(bouton(html, "Mettre en location")).toMatch(/\sdisabled=""/);
    expect(html).toContain("data-raison-blocage");
  });

  it("témoin (passait déjà) : rien ne bloque, le bouton reste le geste principal, sans raison affichée", () => {
    const html = rendre({ bloque: false });
    expect(bouton(html, "Mettre en location")).not.toMatch(/\sdisabled=""/);
    expect(bouton(html, "Mettre en location")).not.toContain("aria-describedby");
    expect(html).not.toContain("data-raison-blocage");
    expect(html).toContain("La mise en location vérifie une dernière fois");
  });

  it("la fiche du lot passe ses blocages au bouton (elle ne le faisait pas) ; lecture en échec : le bouton reste cliquable", () => {
    const page = lire("src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx");
    expect(page).toMatch(/<BoutonsEtatLot [^>]*bloque=\{!erreurBlocages && \(\(blocages \?\? \[\]\) as string\[\]\)\.length > 0\}/);
    // La fiche bien le faisait déjà, à partir de la même lecture (`lots_blocages_location`).
    expect(lire("src/app/agence/[orgId]/parc/[bienId]/fiche-bien.tsx")).toContain("bloque={blocages.length > 0}");
  });
});

describe("E026 — l'aide du propriétaire nomme la rubrique que son locataire voit", () => {
  const reponse = QUESTIONS.find((q) => q.question === "Comment mes locataires me joignent-ils ?")?.reponse ?? "";

  it("« Mon bailleur », le titre de l'espace locataire d'un propriétaire direct, plus « Mon gestionnaire »", () => {
    const titre = identiteContactLocataire({ type: "proprietaire_direct", bailleurs: [] }).titre;
    expect(titre).toBe("Mon bailleur");
    expect(reponse).toContain(`« ${titre} »`);
    expect(reponse).not.toContain("Mon gestionnaire");
  });
});

describe("profil, relances d'impayé : envoi fermé, l'écran ne décrit plus des relances qui partent", () => {
  const organisation = {
    name: "SCI du Tilleul", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", telephone: "0400000000", email_contact: "camille@exemple.fr",
    siret: null, carte_pro: null, garantie_financiere: null, iban: null, tva_intracom: null, tva_franchise: true,
    // Une ancienne préférence restée en base : la fermeture du superviseur l'emporte (P1-08).
    quittances_envoi_auto: true, appels_envoi_auto: false, relances_envoi_auto: true, relance_1_jours: 5, relance_2_jours: 15, relance_seuil_montant: 0,
    logo_url: null, couleur_primaire: null, couleur_secondaire: null, domaine_personnalise: null, email_expediteur: null, nom_portail: null,
  } as unknown as Parameters<typeof FormulaireProfilOrganisation>[0]["organisation"];
  const rendre = (props: Partial<Parameters<typeof FormulaireProfilOrganisation>[0]> = {}) =>
    texteDe(renderToStaticMarkup(createElement(FormulaireProfilOrganisation, { orgId: "org", organisation, lectureSeule: false, estProprietaire: true, ...props })));
  const CAUTION = "Caution : Gerimmo ne l’informe par e-mail qu’avec la seconde relance.";

  it.each([["propriétaire", true], ["agence", false]])("fermé (%s) : « suspendus », puis le fonctionnement au futur ; la phrase sur la caution reste", (_qui, estProprietaire) => {
    const texte = rendre({ estProprietaire });
    expect(texte).toContain("Les courriers de relance automatiques sont suspendus.");
    expect(texte).toContain("Aucune relance ne part d’elle-même tant que l’envoi automatique est suspendu.");
    // Relecture du lot L4 : « Quand il vous sera proposé » promettait une ouverture que rien ne garantit.
    expect(texte).toContain("S’il vous est proposé, vous pourrez l’activer ici : la première relance suivra alors le premier délai");
    expect(texte).not.toContain("Quand il vous sera proposé");
    expect(texte).not.toContain("Chaque matin");
    expect(texte).toContain(CAUTION);
  });

  it.each([["propriétaire", true], ["agence", false]])("témoin (passait déjà) : ouvert (%s), le fonctionnement reste décrit au présent", (_qui, estProprietaire) => {
    const texte = rendre({ estProprietaire, envoisProposes: { avis: false, relances: true } });
    expect(texte).toContain("Chaque matin");
    expect(texte).not.toContain("Aucune relance ne part d’elle-même");
    expect(texte).toContain(CAUTION);
  });

  it("fiche en lecture seule, fermé : « Envoi suspendu », sans les délais de l'ancienne préférence", () => {
    const ferme = rendre({ lectureSeule: true });
    expect(ferme).toMatch(/Relances d'impayé par e-mail\s+Envoi suspendu/);
    expect(ferme).not.toContain("jours après l'échéance");
    // Témoin : ouvert et activé, les délais s'affichent.
    expect(rendre({ lectureSeule: true, envoisProposes: { avis: false, relances: true } })).toContain("à 5 puis 15 jours après l'échéance");
  });
});

describe("E132 — la FAQ du locataire ne promet plus « jamais de surprise »", () => {
  it("la réponse sur les réparations dit qui décide et quand, sans garantir la facture", async () => {
    const html = renderToStaticMarkup(await PageFaqLocataire({ params: Promise.resolve({ orgId: "org" }) } as Parameters<typeof PageFaqLocataire>[0]));
    const texte = texteDe(html);
    expect(texte).not.toMatch(/surprise/i);
    expect(texte).toContain("Avant toute intervention, votre bailleur examine votre demande et vous dit qui paie");
    expect(texte).toMatch(/un siphon à déboucher\)\. Vous suivez chaque étape dans Mes demandes \./);
    expect(html).toContain('href="/locataire/org/demandes"');
  });
});
