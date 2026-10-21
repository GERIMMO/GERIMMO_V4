/**
 * Liste d'attente des agences (20/10/2026), lot SITE — l'inscription d'une agence, de bout en bout.
 *
 * Le vrai chemin : l'action serveur `inscrireAgence` (code réel) → client de service (supabase-js) → l'API de test locale
 * (PostgREST simulé, rôles et privilèges de la vraie base) → table `liste_attente_agences`, son index d'unicité et son
 * déclencheur de plafond horaire. Aucun service externe : la base et l'API sont celles du banc jetable.
 *
 * Ce que le contrat commun garantit :
 *  1. une inscription valide est enregistrée en attente, avec sa page d'origine ;
 *  2. le pot de miel répond « merci » sans rien écrire ;
 *  3. un doublon (même adresse, casse différente) reçoit LE MÊME message de succès et ne crée pas de seconde ligne : la
 *     page ne révèle pas qu'une adresse est déjà connue ;
 *  4. la porte directe est fermée : la clé publique (anon) et un compte connecté ne peuvent pas insérer eux-mêmes (X02) ;
 *  5. sans clé de service, le formulaire le dit en français au lieu de planter ;
 *  6. le plafond de trente inscriptions par heure refuse la trente-et-unième, en français.
 *
 * Forme de l'état rendu (relecture adverse du 20/10) : un succès est EXACTEMENT `{ succes }` ; un refus est `{ erreur, valeurs }`,
 * `valeurs` étant la saisie soumise, que le formulaire repose dans les champs (convention valeursDuFormulaire du dépôt). Les
 * refus se comparent donc avec toMatchObject ; tests/liste-attente-agences-action.test.ts fixe cette forme sans base.
 *
 * Variables (comme les autres tests d'API) : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (affichée par l'émulateur au démarrage) et SUPALOCAL_DB. Sans elles, le fichier se saute.
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { inscrireAgence } from "../src/app/actions/liste-attente-agences";
import { MESSAGE_SUCCES_LISTE_ATTENTE } from "../src/lib/liste-attente-agences";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.SUPALOCAL_DB;
verifierBaseDeTest(base);
const actif = Boolean(url && cle && cleService && base);

const DOMAINE = "@agences-x.test";
const SUCCES = { succes: MESSAGE_SUCCES_LISTE_ATTENTE };
const REFUS_PLAFOND = "Le formulaire reçoit beaucoup d'inscriptions en ce moment : réessayez dans une heure.";
const INDISPONIBLE = "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes.";

function formulaire(valeurs: Record<string, string>) {
  const f = new FormData();
  const base = { agence: "Agence du Parc", contact: "Marie Durand", email: `marie${DOMAINE}`, telephone: "01 02 03 04 05", code_postal: "75 011", nb_lots: "50_a_199", message: "Nous gérons 120 lots.\r\nÀ bientôt." };
  for (const [k, v] of Object.entries({ ...base, ...valeurs })) f.set(k, v);
  return f;
}

describe.skipIf(!actif)("liste d'attente des agences — l'inscription de bout en bout (API de test locale)", () => {
  const sql = new Client({ connectionString: base });
  const clePublique = () => createClient(url!, cle!, { auth: { persistSession: false, autoRefreshToken: false } });
  const nettoyer = () => sql.query("delete from public.liste_attente_agences where lower(email) like $1", [`%${DOMAINE}`]);
  const lignes = async (email: string) =>
    (await sql.query(
      "select agence, contact, email, telephone, code_postal, nb_lots, message, source, statut, contactee_le from public.liste_attente_agences where lower(email) = lower($1) order by created_at",
      [email],
    )).rows;
  const sauvegardeCle = cleService;

  beforeAll(async () => {
    expect(new URL(url!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    await sql.connect();
    await nettoyer();
  });
  afterAll(async () => {
    await nettoyer();
    await sql.end();
  });
  beforeEach(async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = sauvegardeCle;
    await nettoyer();
  });
  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = sauvegardeCle;
  });

  it("1. une inscription valide est enregistrée en attente, normalisée, avec sa page d'origine", async () => {
    expect(await inscrireAgence({}, formulaire({}))).toEqual(SUCCES);
    expect(await lignes(`marie${DOMAINE}`)).toEqual([
      {
        agence: "Agence du Parc",
        contact: "Marie Durand",
        email: `marie${DOMAINE}`,
        telephone: "01 02 03 04 05",
        code_postal: "75011",
        nb_lots: "50_a_199",
        message: "Nous gérons 120 lots.\nÀ bientôt.",
        source: "/agences",
        statut: "en_attente",
        contactee_le: null,
      },
    ]);
  });

  it("2. le pot de miel répond « merci » sans rien écrire", async () => {
    expect(await inscrireAgence({}, formulaire({ site: "http://spam.example" }))).toEqual(SUCCES);
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });

  it("3. les champs invalides sont refusés avant toute écriture, en français", async () => {
    expect((await inscrireAgence({}, formulaire({ agence: "" }))).erreur).toBe("Indiquez le nom de votre agence.");
    expect((await inscrireAgence({}, formulaire({ email: "pas-une-adresse" }))).erreur).toMatch(/adresse e-mail valide/);
    expect((await inscrireAgence({}, formulaire({ code_postal: "7501" }))).erreur).toMatch(/cinq chiffres/);
    expect((await inscrireAgence({}, formulaire({ nb_lots: "beaucoup" }))).erreur).toMatch(/nombre de lots/);
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });

  it("4. un doublon, même en changeant la casse, reçoit le même message de succès et ne crée pas de seconde ligne", async () => {
    expect(await inscrireAgence({}, formulaire({ email: `Marie${DOMAINE}` }))).toEqual(SUCCES);
    const second = await inscrireAgence({}, formulaire({ email: `MARIE${DOMAINE.toUpperCase()}`, agence: "Une autre agence" }));
    expect(second).toEqual(SUCCES);
    expect(second.erreur).toBeUndefined();
    const enBase = await lignes(`marie${DOMAINE}`);
    expect(enBase).toHaveLength(1);
    expect(enBase[0]).toMatchObject({ agence: "Agence du Parc", email: `Marie${DOMAINE}` });
  });

  it("5. la porte directe est fermée : la clé publique ne peut pas insérer elle-même", async () => {
    const direct = await clePublique().from("liste_attente_agences").insert({ agence: "Robot", contact: "Robot", email: `robot${DOMAINE}`, code_postal: "75001", nb_lots: "moins_de_50" });
    expect(direct.error, "l'insertion directe par la clé publique aurait dû être refusée").not.toBeNull();
    expect(await lignes(`robot${DOMAINE}`)).toHaveLength(0);
  });

  it("6. la porte directe est aussi fermée à un compte connecté, qui ne lit pas la liste non plus", async () => {
    const connecte = clePublique();
    const session = await connecte.auth.signInWithPassword({ email: "admin.alpha@example.com", password: "Gerimmo-Demo-2026" });
    expect(session.error).toBeNull();
    const direct = await connecte.from("liste_attente_agences").insert({ agence: "Compte", contact: "Compte", email: `compte${DOMAINE}`, code_postal: "75001", nb_lots: "moins_de_50" });
    expect(direct.error).not.toBeNull();
    expect(await lignes(`compte${DOMAINE}`)).toHaveLength(0);
    // La lecture est réservée au super-administrateur (RLS) : un administrateur d'agence ne voit rien.
    await inscrireAgence({}, formulaire({}));
    const lecture = await connecte.from("liste_attente_agences").select("email");
    expect(lecture.data ?? []).toEqual([]);
    await connecte.auth.signOut();
  });

  it("7. sans clé de service, le formulaire le dit en français au lieu d'échouer, et repose la saisie", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await inscrireAgence({}, formulaire({}));
    expect(r).toMatchObject({ erreur: INDISPONIBLE });
    expect(r.succes).toBeUndefined();
    // La saisie refusée revient telle quelle (non normalisée : « 75 011 »), pour être reposée dans les champs.
    expect(r.valeurs).toMatchObject({ email: `marie${DOMAINE}`, code_postal: "75 011" });
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });

  it("8. le plafond : la trentième inscription de l'heure passe, la trente-et-unième est refusée en français", async () => {
    // On remplit le plafond horaire jusqu'à 29 inscriptions en tout (celles déjà en base comptent), par l'API des tests.
    const { rows: [{ n }] } = await sql.query("select count(*)::int n from public.liste_attente_agences where created_at > now() - interval '1 hour'");
    // Garde : si le banc partagé porte déjà 30 lignes de l'heure (restes d'un autre parcours), la boucle n'insérerait rien et la
    // « trentième » échouerait sur le plafond sans dire pourquoi.
    expect(n, "le banc porte déjà 30 inscriptions dans l'heure : nettoyez public.liste_attente_agences avant de rejouer ce cas").toBeLessThanOrEqual(29);
    for (let i = 0; i < 29 - n; i++) {
      await sql.query(
        "insert into public.liste_attente_agences (agence, contact, email, code_postal, nb_lots) values ('Charge', 'Charge', $1, '75001', 'moins_de_50')",
        [`charge${i}${DOMAINE}`],
      );
    }
    expect(await inscrireAgence({}, formulaire({ email: `trentieme${DOMAINE}` }))).toEqual(SUCCES);
    const refus = await inscrireAgence({}, formulaire({ email: `trente-et-unieme${DOMAINE}` }));
    expect(refus).toMatchObject({ erreur: REFUS_PLAFOND });
    expect(refus.succes).toBeUndefined();
    expect(refus.valeurs).toMatchObject({ email: `trente-et-unieme${DOMAINE}` });
    expect(await lignes(`trente-et-unieme${DOMAINE}`)).toHaveLength(0);
  });
});
