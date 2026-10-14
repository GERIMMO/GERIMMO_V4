/**
 * Lot « fiscal-charges », D40 (CHF-06, option A) : la phrase « ce solde sera repris au décompte de sortie » n'est vraie que tant que le
 * décompte de sortie n'est pas finalisé. Ce fichier établit, EN BASE, le fait qui rend la phrase fausse après la finalisation
 * (constat de relecture, reproduit ici) :
 *  · la base accepte une régularisation sur un bail dont le décompte de sortie est finalisé (aucun contrôle, ni sur l'état du bail ni sur
 *    la restitution) ;
 *  · le décompte finalisé est figé : ses montants (impayés, trop-perçu, solde) ne bougent pas, et il ne se réarrête plus ;
 *  · la réalité du bail, elle, a changé (`montants_restitution_a_jour`) : le solde de la régularisation n'est repris nulle part.
 * Aucun décompte rectificatif n'existe (la base le dit elle-même dans son message) : le texte de l'application doit donc le dire.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Régularisation après un décompte de sortie finalisé — ce que la base fait réellement", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let proprietaire: string;
  let locataire: string;
  const annee = new Date().getFullYear();

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    org = (await un(`insert into public.organizations (name, status) values ('Décompte finalisé','active') returning id`)).id;
    gerant = (
      await un(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
           'decompte-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
         returning id`
      )
    ).id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [gerant, org]);
    const personnes = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [org]
    );
    proprietaire = personnes.rows.find((p) => p.nom === "Prop")!.id;
    locataire = personnes.rows.find((p) => p.nom === "Loc")!.id;
  });

  async function un(sql: string, params: unknown[] = []): Promise<Record<string, string>> {
    const { rows } = await db.query(sql, params);
    return rows[0];
  }

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  // Un bail commencé l'an dernier, 50 € de provisions de charges appelées sur l'exercice de l'an dernier.
  async function bailAvecProvisions(): Promise<string> {
    await enGerant();
    const { id: bien } = await un(
      `select public.creer_bien_avec_lot($1,'8 rue du Décompte','appartement'::public.bien_type,
        '8 rue du Décompte',null,'75011','Paris',1990,false,45,2) as id`,
      [org]
    );
    const { id: lot } = await un(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(`insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`, [lot, org, proprietaire]);
    const { id: bail } = await un(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc, charges, date_debut)
       values ($1,$2,$3,0,600,50,$4) returning id`,
      [org, lot, locataire, `${annee - 1}-01-01`]
    );
    await db.query("reset role");
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
       values ($1,$2,$3,600,50,650,$3)`,
      [org, bail, `${annee - 1}-03-01`]
    );
    // Le loyer appelé est réglé : le seul solde du bail est celui de la régularisation.
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,650,$3)`,
      [org, bail, `${annee - 1}-03-05`]
    );
    return bail;
  }

  async function regulariser(bail: string, chargesReelles: number): Promise<number> {
    await enGerant();
    const { ecart } = await un(
      `select public.regulariser_charges_avec_justificatif($1,$2,$3,null,$4::uuid::text||'/decompte-'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) as ecart`,
      [bail, annee - 1, chargesReelles, org]
    );
    return Number(ecart);
  }

  async function restitution(bail: string) {
    await db.query("reset role");
    return un(`select id, statut, depot, impayes, trop_percu, solde, montants_arretes_le from public.restitutions where bail_id=$1`, [bail]);
  }

  it("le décompte de sortie est finalisé, puis la base accepte encore une régularisation : son solde n'entre dans aucun décompte", async () => {
    const bail = await bailAvecProvisions();
    await enGerant();
    const { id: rst } = await un(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    await db.query(`select public.finaliser_decompte($1)`, [rst]);
    const figee = await restitution(bail);
    expect(figee.statut).toBe("finalise");
    expect(Number(figee.impayes)).toBe(0);
    expect(Number(figee.trop_percu)).toBe(0);
    expect(Number(figee.solde)).toBe(0);

    // 90 € de charges réelles contre 50 € de provisions : 40 € dus par le locataire. La base ne s'y oppose pas.
    expect(await regulariser(bail, 90)).toBe(-40);

    // Le décompte finalisé ne bouge pas…
    const apres = await restitution(bail);
    expect(apres).toEqual(figee);
    // …et il ne se réarrête plus : le seul chemin qui reprendrait la régularisation est fermé.
    await enGerant();
    await db.query("savepoint essai");
    await expect(db.query(`select public.rafraichir_montants_restitution($1)`, [rst])).rejects.toThrow(/Décompte finalisé/);
    await db.query("rollback to savepoint essai");
    // Aucun décompte rectificatif n'existe : le message de la base le renvoie à une fonction qui n'est pas là.
    const { n } = await un(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname ilike '%rectificatif%'`);
    expect(Number(n)).toBe(0);

    // Ce que l'action lit puis écrit après l'enregistrement, avec les droits du gérant (et non ceux de l'administrateur de la base) :
    // l'état du décompte de CE bail dans CETTE organisation, puis l'alerte du solde non appelé.
    await enGerant();
    const lu = await db.query(`select statut from public.restitutions where organization_id=$1 and bail_id=$2`, [org, bail]);
    expect(lu.rows).toEqual([{ statut: "finalise" }]);
    await db.query(
      `insert into public.alerts (organization_id, type, criticite, titre, details) values ($1,'regularisation_non_appelee','normale',$2,$3::jsonb)`,
      [org, `Régularisation des charges ${annee - 1} : complément de 40,00 € dû par le locataire, décompte de sortie déjà finalisé`, JSON.stringify({ bail_id: bail, annee: annee - 1, ecart: -40 })]
    );

    // La réalité du bail, elle, a bougé : 40 € sont dus. Le décompte finalisé ne les porte pas.
    const { impayes } = await un(`select impayes from public.montants_restitution_a_jour($1)`, [bail]);
    expect(Number(impayes)).toBe(40);
    expect(Number(apres.impayes)).toBe(0);
  });

  it("à l'inverse, tant que le décompte n'est pas finalisé, le réarrêté reprend bien le solde de la régularisation", async () => {
    const bail = await bailAvecProvisions();
    await enGerant();
    const { id: rst } = await un(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    expect(await regulariser(bail, 90)).toBe(-40);
    // Pas encore repris : le décompte garde l'instantané du démarrage jusqu'au réarrêté…
    expect(Number((await restitution(bail)).impayes)).toBe(0);
    await db.query(`select public.rafraichir_montants_restitution($1)`, [rst]);
    // …puis le solde y entre, et la finalisation le porte.
    expect(Number((await restitution(bail)).impayes)).toBe(40);
    await enGerant();
    const { solde } = await un(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBe(-40);
  });
});
