/**
 * « Être rappelé » (20/11/2026), de bout en bout : l'action serveur réelle → client de service → API de test locale
 * (PostgREST simulé, rôles et privilèges de la vraie base) → table `demandes_devis`, ses contraintes et son déclencheur
 * de limite. Aucun service externe.
 *
 * Ce que l'on vérifie ici, et que les tests unitaires ne peuvent pas voir :
 *  1. la demande passe les contraintes réelles de la table (longueurs, champs obligatoires) ;
 *  2. elle compte pour le passage de 5 h : elle est « non traitée » comme toute demande de contact ;
 *  3. la limite de débit de la base s'applique aussi aux demandes de rappel (3 par adresse et par heure) ;
 *  4. un double clic n'enregistre qu'une demande (doublon exact ignoré par la base).
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY et SUPALOCAL_DB.
 * Sans elles, le fichier se saute.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { demanderRappel } from "../src/app/actions/devis";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.SUPALOCAL_DB;
verifierBaseDeTest(base);
const actif = Boolean(url && cle && cleService && base);

const DOMAINE = "@rappel-20261120.test";
const REFUS_ADRESSE = "Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.";

function formulaire(valeurs: Record<string, string> = {}) {
  const f = new FormData();
  const defauts = { nom: "Camille Test", telephone: "06 12 34 56 78", email: `camille${DOMAINE}`, accord: "oui", creneau: "soir", origine: "/outils/calcul-irl" };
  for (const [k, v] of Object.entries({ ...defauts, ...valeurs })) f.set(k, v);
  return f;
}

describe.skipIf(!actif)("« Être rappelé » — de bout en bout (API de test locale)", () => {
  const sql = new Client({ connectionString: base });
  const nettoyer = () => sql.query("delete from public.demandes_devis where email like $1", [`%${DOMAINE}`]);
  const lignes = async (email: string) =>
    (await sql.query("select nom, email, telephone, message, traitee_le from public.demandes_devis where email = $1 order by created_at", [email])).rows;

  beforeAll(async () => {
    expect(new URL(url!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    await sql.connect();
    await nettoyer();
  });
  afterAll(async () => {
    await nettoyer();
    await sql.end();
  });
  beforeEach(nettoyer);

  it("1. la demande est enregistrée, non traitée, avec le numéro normalisé et un message reconnaissable", async () => {
    const r = await demanderRappel({}, formulaire({ telephone: "+33612345678" }));
    expect(r.succes).toBe("Merci ! Nous vous rappelons au +33 6 12 34 56 78 sous un jour ouvré, en fin de journée (18 h – 20 h).");
    expect(await lignes(`camille${DOMAINE}`)).toEqual([{
      nom: "Camille Test",
      email: `camille${DOMAINE}`,
      telephone: "+33 6 12 34 56 78",
      message: "Demande de rappel au +33 6 12 34 56 78. Créneau souhaité : en fin de journée (18 h – 20 h). Page d'origine : /outils/calcul-irl.",
      traitee_le: null,
    }]);
  });

  it("2. un double clic n'enregistre qu'une demande", async () => {
    expect((await demanderRappel({}, formulaire())).succes).toMatch(/^Merci/);
    expect((await demanderRappel({}, formulaire())).succes).toMatch(/^Merci/);
    expect(await lignes(`camille${DOMAINE}`)).toHaveLength(1);
  });

  it("3. la limite de débit de la base s'applique : la quatrième demande de l'heure d'une même adresse est refusée", async () => {
    for (const creneau of ["matin", "midi", "apres_midi"]) expect((await demanderRappel({}, formulaire({ creneau }))).succes).toMatch(/^Merci/);
    expect(await demanderRappel({}, formulaire({ creneau: "soir" }))).toEqual({ erreur: REFUS_ADRESSE });
    expect(await lignes(`camille${DOMAINE}`)).toHaveLength(3);
  });

  it("4. le pot de miel et un numéro invalide n'écrivent rien", async () => {
    await demanderRappel({}, formulaire({ site: "http://spam.example" }));
    await demanderRappel({}, formulaire({ telephone: "123" }));
    expect(await lignes(`camille${DOMAINE}`)).toHaveLength(0);
  });
});
