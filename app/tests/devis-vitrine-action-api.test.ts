/**
 * X02 (AUD-A-06, décision du 14/10/2026) — le formulaire de contact du site vitrine, de bout en bout.
 *
 * Le vrai chemin : l'action serveur `demanderDevis` (code réel) → client de service (supabase-js) → l'API de test
 * locale (PostgREST simulé, rôles et privilèges de la vraie base) → table `demandes_devis` et son déclencheur de limite.
 * Aucun service externe : la base et l'API sont celles du banc jetable.
 *
 * Ce que la décision garantit :
 *  1. le formulaire CONTINUE de fonctionner (succès, pot de miel, doublon) ;
 *  2. la limite de débit refuse proprement, avec un message clair en français (3 par adresse, 30 par heure) ;
 *  3. la porte directe est fermée : la clé publique (anon) et un compte connecté ne peuvent plus insérer eux-mêmes ;
 *  4. sans clé de service, le formulaire le dit en français au lieu de planter.
 *
 * Variables (comme les autres tests d'API) : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (affichée par l'émulateur au démarrage) et SUPALOCAL_DB. Sans elles, le fichier se saute.
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { demanderDevis } from "../src/app/actions/devis";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.SUPALOCAL_DB;
verifierBaseDeTest(base);
const actif = Boolean(url && cle && cleService && base);

const DOMAINE = "@devis-x02.test";
const REFUS_ADRESSE = "Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.";
const REFUS_TOTAL = "Le formulaire reçoit beaucoup de demandes en ce moment : réessayez dans une heure.";
const SUCCES = "Merci ! Votre message est bien transmis — nous revenons vers vous sous 48 h ouvrées.";

function formulaire(valeurs: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ nom: "Marie Durand", email: `marie${DOMAINE}`, message: "Bonjour, je souhaite en savoir plus.", ...valeurs })) f.set(k, v);
  return f;
}

describe.skipIf(!actif)("X02 — formulaire de contact du site vitrine, de bout en bout (API de test locale)", () => {
  const sql = new Client({ connectionString: base });
  const clePublique = () => createClient(url!, cle!, { auth: { persistSession: false, autoRefreshToken: false } });
  const nettoyer = () => sql.query("delete from public.demandes_devis where email like $1", [`%${DOMAINE}`]);
  const lignes = async (email: string) => (await sql.query("select nom, email, agence, message, traitee_le from public.demandes_devis where email = $1 order by created_at", [email])).rows;
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

  it("1. une demande valide est enregistrée et le visiteur reçoit la confirmation", async () => {
    const r = await demanderDevis({}, formulaire({ agence: "Agence du Parc", telephone: "0102030405", nb_lots: "12" }));
    expect(r).toEqual({ succes: SUCCES });
    const [ligne] = await lignes(`marie${DOMAINE}`);
    expect(ligne).toMatchObject({ nom: "Marie Durand", agence: "Agence du Parc", traitee_le: null });
  });

  it("2. le pot de miel répond « merci » sans rien écrire", async () => {
    const r = await demanderDevis({}, formulaire({ site: "http://spam.example" }));
    expect(r).toEqual({ succes: SUCCES });
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });

  it("3. les champs invalides sont refusés avant toute écriture, en français", async () => {
    expect((await demanderDevis({}, formulaire({ nom: "" }))).erreur).toBe("Indiquez votre nom.");
    expect((await demanderDevis({}, formulaire({ email: "pas-une-adresse" }))).erreur).toMatch(/adresse email valide/);
    expect((await demanderDevis({}, formulaire({ message: "" }))).erreur).toMatch(/Écrivez votre message/);
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });

  it("4. le même message envoyé deux fois (double clic) n'est enregistré qu'une fois", async () => {
    expect(await demanderDevis({}, formulaire({}))).toEqual({ succes: SUCCES });
    expect(await demanderDevis({}, formulaire({}))).toEqual({ succes: SUCCES });
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(1);
  });

  it("5. cas refusé par la limite : la quatrième demande de l'heure d'une même adresse reçoit un message clair", async () => {
    for (const n of [1, 2, 3]) expect(await demanderDevis({}, formulaire({ message: `Message ${n}` }))).toEqual({ succes: SUCCES });
    const refus = await demanderDevis({}, formulaire({ message: "Message 4" }));
    expect(refus).toEqual({ erreur: REFUS_ADRESSE });
    expect(refus.succes).toBeUndefined();
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(3);
  });

  it("6. cas refusé par la limite : au-delà de 30 demandes par heure, le visiteur est invité à réessayer plus tard", async () => {
    // On remplit le plafond horaire jusqu'à 29 demandes en tout (celles déjà en base comptent), par l'API des tests.
    const { rows: [{ n }] } = await sql.query("select count(*)::int n from public.demandes_devis where created_at > now() - interval '1 hour'");
    for (let i = 0; i < 29 - n; i++) await sql.query("insert into public.demandes_devis (nom, email, message) values ('Charge', $1, 'charge')", [`charge${i}${DOMAINE}`]);
    expect(await demanderDevis({}, formulaire({ email: `trentieme${DOMAINE}` }))).toEqual({ succes: SUCCES });
    const refus = await demanderDevis({}, formulaire({ email: `trente-et-unieme${DOMAINE}` }));
    expect(refus).toEqual({ erreur: REFUS_TOTAL });
    expect(await lignes(`trente-et-unieme${DOMAINE}`)).toHaveLength(0);
  });

  it("7. la porte directe est fermée : la clé publique ne peut plus insérer elle-même", async () => {
    const direct = await clePublique().from("demandes_devis").insert({ nom: "Robot", email: `robot${DOMAINE}`, message: "direct" });
    expect(direct.error, "l'insertion directe par la clé publique aurait dû être refusée").not.toBeNull();
    expect(await lignes(`robot${DOMAINE}`)).toHaveLength(0);
  });

  it("8. la porte directe est aussi fermée à un compte connecté", async () => {
    const connecte = clePublique();
    const session = await connecte.auth.signInWithPassword({ email: "admin.alpha@example.com", password: "Gerimmo-Demo-2026" });
    expect(session.error).toBeNull();
    const direct = await connecte.from("demandes_devis").insert({ nom: "Compte", email: `compte${DOMAINE}`, message: "direct" });
    expect(direct.error).not.toBeNull();
    expect(await lignes(`compte${DOMAINE}`)).toHaveLength(0);
    await connecte.auth.signOut({ scope: "local" });
  });

  it("9. sans clé de service, le formulaire le dit en français au lieu d'échouer", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await demanderDevis({}, formulaire({}));
    expect(r).toEqual({ erreur: "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes." });
    expect(await lignes(`marie${DOMAINE}`)).toHaveLength(0);
  });
});
