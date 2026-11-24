/**
 * SECONDE REPRISE DU LOT D7 ET DES TEXTES T4 (24/11/2026) — relecture adverse T4R, sans base ni réseau.
 *
 *  T4R-02  vendre aux particuliers sans médiateur est une décision À PART de la levée du blocage : action dédiée, case
 *          « j'ai lu les deux articles », lecture séparée (colonne absente ou illisible : décision « non prise ») ; le
 *          journal écrit l'état réel du médiateur.
 *  T4R-05  /admin/sante et le message d'enregistrement de l'identité disent la même chose que la garde de paiement.
 *  T4R-06  article 15.3 : « sur le seul constat de l'impayé » corrigé ; phrase de réexamen par une personne retirée.
 *  T4R-07  article 17 : la promesse est celle que le code tient (réponse qui clôt une réclamation faite dans l'application).
 *
 * La règle de la garde, le type de vendeur (T4R-03), la mention « EI » (T4R-04) et la phrase servie au client (T4R-08)
 * sont dans tests/vendeur-mediateur-reprise-d7.test.ts ; la console dans tests/console-identite-mediateur.test.ts ; la
 * base dans tests/type-vendeur-vente-sans-mediateur-base.test.ts et tests/archive-compte-apres-client-stripe-base.test.ts.
 *
 * AUCUNE DONNÉE RÉELLE : un vendeur fictif.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MANQUE_MENTION_EI, MANQUE_TYPE_VENDEUR } from "../src/lib/editeur";
import { etatVendeurPourLaSante, lignesJournalReglage } from "../src/lib/garde-souscription";
import { PHRASE_MEDIATEUR_NON_DESIGNE, phraseMediateurReclamation } from "../src/lib/courriers-contrat";

const mocks = vi.hoisted(() => ({
  identite: { editeur: {} as Record<string, string | null>, indisponible: false },
  rpc: vi.fn(), update: vi.fn(), eq: vi.fn(), saved: vi.fn(), revalidate: vi.fn(),
  /** Réponses des lectures de `supervision_identite`, par liste de colonnes demandée. */
  lectures: {} as Record<string, { data: unknown; error: unknown }>,
  colonnesLues: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => mocks.identite }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: mocks.rpc,
  from: () => {
    let colonnes: string | null = null;
    const q = {
      update: (...a: unknown[]) => (mocks.update(...a), q),
      eq: (...a: unknown[]) => (mocks.eq(...a), q),
      select: (c: string) => { colonnes = c; mocks.colonnesLues.push(c); return q; },
      maybeSingle: async () => (colonnes !== null && mocks.lectures[colonnes] ? mocks.lectures[colonnes] : mocks.saved()),
    };
    return q;
  },
}) }));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import { reglerVenteSansMediateur } from "../src/app/actions/reglage-souscription";
import { enregistrerIdentite } from "../src/app/actions/identite-editeur";
import { lireReglageSouscription } from "../src/lib/reglage-souscription-serveur";
import Conditions from "../src/app/conditions/page";

const VENDEUR: Record<string, string | null> = {
  denomination: "MARTIN Camille EI", typeVendeur: "entrepreneur_individuel", forme: "Entrepreneur individuel", capital: null,
  siege: "1 rue de l'Exemple, 75000 Paris", rcs: "RNE 000 000 000", siret: "00000000000018", tvaIntracommunautaire: null,
  directeurPublication: "MARTIN Camille", email: "contact@example.test", telephone: "01 00 00 00 00",
  mediateurNom: null, mediateurAdresse: null, mediateurSite: null,
};
const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, 75000 Paris", mediateurSite: "https://example.test/mediation" };
const texte = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identite = { editeur: { ...VENDEUR }, indisponible: false };
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.saved.mockResolvedValue({ data: { revision: 5 }, error: null });
  mocks.lectures = {};
  mocks.colonnesLues = [];
});

describe("T4R-02 — l'action « vente aux particuliers sans médiateur » : une décision à part, case obligatoire", () => {
  const form = (choix: string, lecture: string | null, revision = "4") => {
    const f = new FormData(); f.set("vente_sans_mediateur", choix); f.set("revision", revision);
    if (lecture !== null) f.set("lecture", lecture);
    return f;
  };

  it("décider, case cochée, aucun médiateur saisi : seule la colonne de la décision est écrite (date non nulle), avec la révision", async () => {
    const r = await reglerVenteSansMediateur({}, form("decider", "oui"));
    expect(r.erreur).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("is_permanent_super_admin");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const ecrit = mocks.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(ecrit).sort()).toEqual(["revision", "vente_particuliers_sans_mediateur_le"]);
    expect(ecrit.revision).toBe(5);
    expect(Number.isNaN(Date.parse(String(ecrit.vente_particuliers_sans_mediateur_le)))).toBe(false);
    // Le réglage « blocage » n'est pas touché par cette décision.
    expect(ecrit).not.toHaveProperty("blocage_souscription_identite");
    expect(mocks.eq).toHaveBeenCalledWith("singleton", true);
    expect(mocks.eq).toHaveBeenCalledWith("revision", 4);
    expect(r.succes).toContain("la première souscription d’un particulier n’attend plus la saisie d’un médiateur de la consommation");
    expect(r.succes).toContain("Elle reste fermée tant que l’identité du vendeur est incomplète.");
    expect(r.succes).toContain("continuent de dire qu’aucun médiateur n’est désigné");
    expect(r.succes).toContain("datée et inscrite à l’historique des changements");
    expect(r.succes).not.toMatch(/conforme|autorisé/i);
    for (const chemin of ["/admin/parametres", "/admin/sante", "/admin/journaux"]) expect(mocks.revalidate).toHaveBeenCalledWith(chemin);
    expect(mocks.revalidate).toHaveBeenCalledWith("/agence/[orgId]/abonnement", "page");
  });

  it.each([null, "", "non", "on", "true"])("décider sans la case « j'ai lu les deux articles » (%s) : refusé, rien n'est écrit", async (lecture) => {
    const r = await reglerVenteSansMediateur({}, form("decider", lecture));
    expect(r.erreur).toBe("Cochez la case : vous confirmez avoir lu les deux articles du code de la consommation affichés sur cette carte.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("décider alors qu'un médiateur est saisi : sans objet, refusé — le journal ne peut donc pas porter une décision « sans médiateur » fausse", async () => {
    mocks.identite = { editeur: { ...VENDEUR, ...MEDIATEUR }, indisponible: false };
    expect((await reglerVenteSansMediateur({}, form("decider", "oui"))).erreur).toContain("Un médiateur de la consommation est saisi : cette décision est sans objet");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("décider alors que l'identité n'a pas pu être lue : refusé", async () => {
    mocks.identite = { editeur: {}, indisponible: true };
    expect((await reglerVenteSansMediateur({}, form("decider", "oui"))).erreur).toContain("n’a pas pu être lue");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("retirer : sans case, la colonne est vidée, médiateur saisi ou non", async () => {
    for (const editeur of [{ ...VENDEUR }, { ...VENDEUR, ...MEDIATEUR }]) {
      mocks.update.mockClear();
      mocks.identite = { editeur, indisponible: false };
      const r = await reglerVenteSansMediateur({}, form("retirer", null));
      expect(mocks.update).toHaveBeenCalledWith({ vente_particuliers_sans_mediateur_le: null, revision: 5 });
      expect(r.succes).toContain("Décision retirée : la première souscription d’un particulier attend de nouveau la saisie du médiateur de la consommation.");
    }
  });

  it.each([false, null, "true"])("compte qui n'est pas super-administrateur permanent (%s) : refusé avant toute lecture", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await reglerVenteSansMediateur({}, form("decider", "oui"))).erreur).toBe("Compte de supervision permanent requis.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([["ignorer", "4"], ["lever", "4"], ["decider", ""], ["decider", "-1"], ["decider", "4.5"], ["decider", "2147483647"]])("choix « %s », révision « %s » : refusé", async (choix, revision) => {
    expect((await reglerVenteSansMediateur({}, form(choix, "oui", revision))).erreur).toBe("Rechargez les paramètres avant de modifier ce réglage.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("page périmée, ou base sans la colonne : le message le dit, aucun succès", async () => {
    mocks.saved.mockResolvedValue({ data: null, error: null });
    expect((await reglerVenteSansMediateur({}, form("decider", "oui"))).erreur).toContain("Le réglage n’a pas été modifié.");
    mocks.saved.mockResolvedValue({ data: null, error: { code: "42703", message: "column does not exist" } });
    const r = await reglerVenteSansMediateur({}, form("decider", "oui"));
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toContain("n’a pas encore reçu sa mise à jour");
  });
});

describe("T4R-02 — lecture du réglage : la décision se lit à part, et vaut « non prise » dès qu'elle n'est pas lisible", () => {
  const REGLAGE = "blocage_souscription_identite,souscriptions_payantes_ouvertes,revision";
  const DECISION = "vente_particuliers_sans_mediateur_le";
  const base = (blocage: boolean) => ({ data: { blocage_souscription_identite: blocage, souscriptions_payantes_ouvertes: true, revision: 7 }, error: null });

  it("deux lectures distinctes : la colonne de la décision n'est pas dans la lecture des deux autres réglages", async () => {
    mocks.lectures = { [REGLAGE]: base(true), [DECISION]: { data: { [DECISION]: null }, error: null } };
    await lireReglageSouscription();
    expect([...mocks.colonnesLues].sort()).toEqual([REGLAGE, DECISION].sort());
  });

  it("blocage levé (levée d'avant le lot), décision jamais prise : `venteSansMediateurLe` est nul", async () => {
    mocks.lectures = { [REGLAGE]: base(false), [DECISION]: { data: { [DECISION]: null }, error: null } };
    expect(await lireReglageSouscription()).toMatchObject({ blocageIdentiteActif: false, ventesOuvertes: true, venteSansMediateurLe: null, revision: 7, indisponible: false });
  });

  it("décision prise : sa date est rendue, blocage actif ou levé", async () => {
    for (const blocage of [true, false]) {
      mocks.lectures = { [REGLAGE]: base(blocage), [DECISION]: { data: { [DECISION]: "2026-11-25T09:00:00+00:00" }, error: null } };
      expect(await lireReglageSouscription()).toMatchObject({ blocageIdentiteActif: blocage, venteSansMediateurLe: "2026-11-25T09:00:00+00:00" });
    }
  });

  it("colonne absente (code déployé avant la migration) ou lecture en échec : décision « non prise », sans fermer les deux autres réglages", async () => {
    for (const reponse of [
      { data: null, error: { code: "42703", message: "column supervision_identite.vente_particuliers_sans_mediateur_le does not exist" } },
      { data: null, error: { code: "42501", message: "permission denied" } },
      { data: null, error: null },
      { data: { [DECISION]: true }, error: null },
      { data: { [DECISION]: "bientôt" }, error: null },
      { data: { [DECISION]: 1764061200 }, error: null },
    ]) {
      mocks.lectures = { [REGLAGE]: base(false), [DECISION]: reponse };
      expect(await lireReglageSouscription(), JSON.stringify(reponse)).toMatchObject({ blocageIdentiteActif: false, ventesOuvertes: true, venteSansMediateurLe: null, indisponible: false });
    }
  });

  it("réglage principal illisible : tout est fermé, même si la décision se lit", async () => {
    mocks.lectures = { [REGLAGE]: { data: null, error: { message: "lecture impossible" } }, [DECISION]: { data: { [DECISION]: "2026-11-25T09:00:00+00:00" }, error: null } };
    expect(await lireReglageSouscription()).toMatchObject({ blocageIdentiteActif: true, ventesOuvertes: false, venteSansMediateurLe: null, revision: null, indisponible: true });
  });
});

describe("T4R-02 — le journal écrit ce qui a changé, et l'état réel du médiateur", () => {
  const ligne = (blocage: boolean, decision: string | null, valeurs: Record<string, unknown> = {}) =>
    ({ blocage_souscription_identite: blocage, vente_particuliers_sans_mediateur_le: decision, revision: 1, valeurs });

  it("levée ou réactivation du blocage : une ligne qui ne dit rien du médiateur, qu'il soit saisi ou non", () => {
    for (const valeurs of [{}, MEDIATEUR]) {
      expect(lignesJournalReglage(ligne(true, null, valeurs), ligne(false, null, valeurs))).toEqual(["Blocage des abonnements (identité du vendeur incomplète : augmentations payantes) : levé."]);
      expect(lignesJournalReglage(ligne(false, null, valeurs), ligne(true, null, valeurs))).toEqual(["Blocage des abonnements (identité du vendeur incomplète : augmentations payantes) : réactivé."]);
    }
  });

  it("décision prise ou retirée : la ligne dit si un médiateur était saisi à cette date", () => {
    const d = "2026-11-25T09:00:00+00:00";
    expect(lignesJournalReglage(ligne(true, null), ligne(true, d))).toEqual(["Vente aux particuliers sans médiateur de la consommation : décision prise (à cette date, aucun médiateur de la consommation n’était saisi)."]);
    expect(lignesJournalReglage(ligne(true, d, MEDIATEUR), ligne(true, null, MEDIATEUR))).toEqual(["Vente aux particuliers sans médiateur de la consommation : décision retirée (à cette date, un médiateur de la consommation était saisi)."]);
    // Un médiateur incomplet (nom seul) n'est pas un médiateur saisi.
    expect(lignesJournalReglage(ligne(true, null), ligne(true, d, { mediateurNom: "Médiateur fictif" }))[0]).toContain("aucun médiateur de la consommation n’était saisi");
  });

  it("une modification de l'identité seule n'écrit aucune de ces lignes ; une ligne d'avant la migration (sans la colonne) non plus", () => {
    expect(lignesJournalReglage(ligne(true, null, {}), ligne(true, null, MEDIATEUR))).toEqual([]);
    expect(lignesJournalReglage({ blocage_souscription_identite: true, valeurs: {} }, { blocage_souscription_identite: true, valeurs: {} })).toEqual([]);
    expect(lignesJournalReglage(null, null)).toEqual([]);
    // Le changement de date d'une décision déjà prise n'est pas une nouvelle décision.
    expect(lignesJournalReglage(ligne(true, "2026-11-25T09:00:00+00:00"), ligne(true, "2026-11-26T09:00:00+00:00"))).toEqual([]);
  });

  it("l'écran des journaux n'écrit plus « médiateur absent » en dur", () => {
    const ecran = readFileSync("src/app/admin/journaux/preuves.tsx", "utf8");
    expect(ecran).not.toContain("médiateur absent");
    expect(ecran).toContain("lignesJournalReglage(r.avant,r.apres)");
  });
});

describe("T4R-05 — /admin/sante et l'enregistrement de l'identité : la même vérité que la garde", () => {
  it("entrepreneur individuel sans « EI » : jamais « complète » ; la phrase nomme le manque et dit la vente fermée", () => {
    const e = etatVendeurPourLaSante({ ...VENDEUR, ...MEDIATEUR, denomination: "MARTIN Camille" }, { blocageIdentiteActif: true });
    expect(e.defauts).toEqual([MANQUE_MENTION_EI]);
    expect(e.horsFaits).toEqual([MANQUE_MENTION_EI]);
    expect(e.phrase).not.toContain("est complète");
    expect(e.phrase).toBe(`Les faits requis par les pages légales sont fournis, mais l’identité du vendeur n’est pas complète : il manque ${MANQUE_MENTION_EI}. Toute première souscription reste fermée, comme les augmentations payantes.`);
    // Blocage levé : les hausses ne sont plus fermées, la phrase ne le prétend pas.
    expect(etatVendeurPourLaSante({ ...VENDEUR, denomination: "MARTIN Camille" }, { blocageIdentiteActif: false }).phrase).toMatch(/Toute première souscription reste fermée\.$/);
  });

  it("type de vendeur non choisi : même traitement", () => {
    const e = etatVendeurPourLaSante({ ...VENDEUR, typeVendeur: null }, { blocageIdentiteActif: true });
    expect(e.horsFaits).toEqual([MANQUE_TYPE_VENDEUR]);
    expect(e.phrase).toContain(`il manque ${MANQUE_TYPE_VENDEUR}`);
  });

  it("vendeur complet : la phrase dit l'état du médiateur et de la décision, sans jamais citer la levée du blocage", () => {
    const sans = etatVendeurPourLaSante(VENDEUR, { blocageIdentiteActif: false });
    expect(sans.defauts).toEqual([]);
    expect(sans.phrase).toContain("L’identité du vendeur est complète. Reste le médiateur de la consommation");
    expect(sans.phrase).toContain("la première souscription d’un particulier reste fermée, sauf décision de votre part");
    const decidee = etatVendeurPourLaSante(VENDEUR, { blocageIdentiteActif: true, venteSansMediateurDecidee: true });
    expect(decidee.phrase).toContain("Vous avez décidé, dans les paramètres, de vendre quand même aux particuliers");
    expect(decidee.phrase).not.toContain("reste fermée");
    const avec = etatVendeurPourLaSante({ ...VENDEUR, ...MEDIATEUR }, { blocageIdentiteActif: true });
    expect(avec.phrase).toBe("L’identité du vendeur est complète. Le médiateur de la consommation est saisi.");
    for (const e of [sans, decidee, avec]) expect(e.phrase).not.toMatch(/blocage des abonnements est levé|conforme/i);
  });

  it("un fait requis manque : les phrases d'avant, selon le blocage", () => {
    expect(etatVendeurPourLaSante({ ...VENDEUR, telephone: null }, { blocageIdentiteActif: true }).phrase).toContain("le paiement en ligne reste fermé");
    expect(etatVendeurPourLaSante({ ...VENDEUR, telephone: null }, { blocageIdentiteActif: false }).phrase).toContain("ces manques ne ferment plus les augmentations payantes ; toute première souscription reste fermée.");
  });

  it("les deux écrans lisent la liste de la garde (`defautsVendeur`), pas les seuls faits requis", () => {
    const sante = readFileSync("src/app/admin/sante/page.tsx", "utf8");
    expect(sante).toContain("etatVendeurPourLaSante(");
    expect(sante).not.toContain("L’identité requise est complète");
    const parametres = readFileSync("src/app/admin/parametres/page.tsx", "utf8");
    expect(parametres).toContain("const defauts = defautsVendeur(editeur);");
    expect(parametres).toContain("defauts.length ? `${defauts.length} à fournir` : 'Identité du vendeur complète'");
    expect(parametres).not.toContain("Identité requise complète");
  });

  it("enregistrement de l'identité : « rien ne reste à compléter » ne se dit pas sans type de vendeur ni mention « EI »", async () => {
    const form = (valeurs: Record<string, string | null>) => { const f = new FormData(); f.set("revision", "0"); for (const [k, v] of Object.entries(valeurs)) if (v) f.set(k, v); return f; };
    const sansType = await enregistrerIdentite({}, form({ ...VENDEUR, typeVendeur: null }));
    expect(sansType.erreur).toBeUndefined();
    expect(sansType.succes).toContain(`Il reste à compléter : ${MANQUE_TYPE_VENDEUR}, le médiateur de la consommation`);
    expect(sansType.succes).not.toContain("rien ne reste à compléter");
    // Le type choisi, le manque disparaît du message.
    expect((await enregistrerIdentite({}, form(VENDEUR))).succes).not.toContain("le type de vendeur");
  });
});

describe("T4R-06 — article 15.3 : la lecture seule, sans promesse que le texte fourni n'impose pas", () => {
  const article15 = async () => {
    const html = renderToStaticMarkup(await Conditions());
    const debut = html.indexOf("15. Défaut de paiement, suspension et résiliation");
    return texte(html.slice(debut, html.indexOf("16. ", debut)));
  };

  it("« sur le seul constat de l'impayé » est corrigé : la lecture seule s'applique à l'échéance que l'article fixe", async () => {
    const t = await article15();
    expect(t).not.toContain("sur le seul constat");
    expect(t).toContain("les envois qui n'ont pas eu lieu pendant la lecture seule ne sont pas tous rattrapés. Le passage en lecture seule est appliqué automatiquement, à l'échéance prévue ci-dessus. 15.4 — Résiliation par l'Éditeur.");
    // L'échéance « ci-dessus » est bien dite dans le même article.
    expect(t).toContain("Si l'échéance reste impayée quinze jours après l'échec, le compte passe en lecture seule");
  });

  it("la phrase de réexamen par une personne, ajoutée sans décision du dirigeant, est retirée", async () => {
    const t = await article15();
    for (const retire of ["réexamine", "faire valoir son point de vue", "contester cette mesure", "intervention humaine"]) expect(t, retire).not.toContain(retire);
    // La page ne cite pas non plus l'article 22 du RGPD à ce sujet.
    expect(texte(renderToStaticMarkup(await Conditions()))).not.toMatch(/article 22 du RGPD/i);
  });
});

describe("T4R-07 — article 17 : la promesse est celle que le code tient", () => {
  it("le rappel du médiateur est promis pour la réponse qui clôt une réclamation faite depuis « Aide et retours », pas pour toute réponse", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const t = texte(html.slice(html.indexOf("17. Droit applicable et litiges")));
    expect(t).not.toContain("sont rappelés dans la réponse de l'Éditeur à la réclamation");
    expect(t).toContain("figurent aux mentions légales ; la réponse par laquelle l'Éditeur clôt une réclamation faite depuis la page « Aide et retours » les rappelle.");
    expect(t).toContain("Tant qu'aucun médiateur n'est désigné, les mentions légales et cette réponse l'indiquent expressément");
    // « Non-professionnel » n'est pas rétabli : l'article L. 612-1 du recueil ne vise que le consommateur.
    expect(t).toMatch(/^17\. Droit applicable et litiges.*Le Client consommateur a le droit de recourir gratuitement à un médiateur de la consommation/);
    expect(t.slice(0, t.indexOf("Annexe 1"))).not.toContain("non-professionnel");
  });

  it("le code la tient : clore une réclamation dans l'application ajoute la phrase du médiateur, désigné ou non ; « résolu » est le seul état de clôture d'une réclamation", () => {
    const action = readFileSync("src/app/actions/retours.ts", "utf8");
    expect(action).toContain("if(decision==='resolu'){");
    expect(action).toContain("?.nature==='reclamation'){");
    expect(action).toContain("const phrase=phraseMediateurReclamation((await lireEditeur()).editeur);");
    expect(action).toContain("if(!reponse.includes(phrase)){");
    expect(readFileSync("src/app/admin/retours/decisions-retour.tsx", "utf8")).toContain("retour.nature==='idee'?['en_examen','retenue','non_retenue','deja_couverte']:['en_examen','en_cours','resolu']");
    expect(phraseMediateurReclamation(VENDEUR)).toBe(PHRASE_MEDIATEUR_NON_DESIGNE);
    expect(phraseMediateurReclamation({ ...VENDEUR, ...MEDIATEUR })).toBe("Si cette réponse ne vous satisfait pas, vous pouvez saisir gratuitement le médiateur de la consommation : Médiateur fictif, 2 rue Exemple, 75000 Paris, https://example.test/mediation.");
  });
});
