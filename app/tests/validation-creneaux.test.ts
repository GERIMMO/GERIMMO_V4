/** Gardes SQL planning : appels réels sous RLS, scénarios indépendants, transaction finale annulée. */
import { readFileSync } from "node:fs";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Validation SQL des créneaux — mission du12/10", () => {
  let db: Client;
  let org = "", orgB = "";
  let gerant = "", cptArtisan = "", cptLoc = "", cptLocB = "", cptAutreLoc = "", sa = "";
  let artisan = "";
  let incident = "";

  const connecte = (id: string) =>
    db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [id]
    );
  const role = (r: string) =>
    db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await connecte(compte);
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");

  // Une tentative qu'on ATTEND refusée avorte la transaction si on la joue
  // nue : chacune se joue sous un point de reprise, qu'on annule.
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };

  // Trois créneaux, à N jours, 8 h – 12 h (heure de Paris approchée : le test
  // ne juge pas le fuseau, seulement le nombre et l'ordre).
  const creneauxA = (jours: number[]) =>
    JSON.stringify(
      jours.map((j) => ({
        debut: new Date(Date.now() + j * 86400000).toISOString(),
        fin: new Date(Date.now() + j * 86400000 + 4 * 3600000).toISOString(),
      }))
    );

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }

  /** Un lot loué, son bail actif, son locataire, et un incident qualifié. */
  async function parc(organisation: string, compte: string) {
    // Le décor se monte hors session : ces tests appellent `parc` entre deux
    // gestes d'utilisateur, et la RLS refuserait l'insertion.
    await enTantQuePostgres();
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
      [organisation]
    );
    const { rows: [unLot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat)
       values ($1,$2,'Lot 1','loue') returning id`,
      [bien.id, organisation]
    );
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`,
      [organisation, compte]
    );
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
         date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
      [organisation, unLot.id, personne.id]
    );
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id,
         declarant_person_id, canal, categorie, description, etat, imputation,
         imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
         'Joint usé par le temps') returning id`,
      [organisation, unLot.id, bail.id, personne.id]
    );
    return { lot: unLot.id as string, incident: inc.id as string, bail: bail.id as string };
  }

  /** Ouvre la consultation, sollicite, dépose le devis, le retient. */
  async function confierLaMission(inc: string): Promise<string> {
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) as id`,
      [org, inc]
    );
    const { rows: [{ id: sollicitation }] } = await db.query(
      `select public.solliciter_artisan($1,$2,$3) as id`,
      [org, consultation, artisan]
    );
    await agir(cptArtisan);
    const { rows: [{ id: devis }] } = await db.query(
      `select public.deposer_devis_structure($1, jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',48000,'tva_bps',0)), 'Diagnostic de test', 'Remplacement du joint et du siphon', 'Sous 7 jours', 'Une journée', null, null) as id`,
      [sollicitation]
    );
    await agir(gerant);
    const { rows: [{ id }] } = await db.query(
      `select public.retenir_devis($1,$2) as id`, [org, devis]
    );
    return id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    // Prévisualisation optionnelle : DDL et données restent dans cette même
    // transaction annulée en afterAll. Sans ce drapeau, tester la base déployée.
    if (process.env.PLANNING_MIGRATION_PREVIEW === "1") {
      await db.query(readFileSync(new URL("../supabase/migrations/20261012190000_validation_creneaux.sql", import.meta.url), "utf8"));
    }

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status)
       values ('Suivi LO — Agence A','active'), ('Suivi LO — Agence B','active')
       returning id, name`
    );
    org = orgs.find((o) => o.name.endsWith("A")).id;
    orgB = orgs.find((o) => o.name.endsWith("B")).id;

    gerant = await nouveauCompte("gerant");
    cptArtisan = await nouveauCompte("artisan");
    cptLoc = await nouveauCompte("loc");
    cptLocB = await nouveauCompte("loc-b");
    cptAutreLoc = await nouveauCompte("loc-voisin");
    sa = await nouveauCompte("sa");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
        ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$2,'locataire'),($5,$6,'locataire')`,
      [gerant, org, cptLoc, cptAutreLoc, cptLocB, orgB]
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, null, 'super_admin')`,
      [sa]
    );

    const decor = await parc(org, cptLoc);
    incident = decor.incident;
    // Un voisin de la même agence : son incident ne doit jamais entrer dans le
    // suivi du premier, ni ses photos dans ses fichiers.
    await parc(org, cptAutreLoc);
    await parc(orgB, cptLocB);

    // L'artisan : validé plateforme, SIRET vérifié, décennale à jour.
    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ('Plomberie Durand','12345678901234','0611111111','d@test.local',
         'valide','verifie','publique',$1) returning id`,
      [cptArtisan]
    );
    artisan = a.id;
    // Artisan personnel de cette agence ; la couverture commerciale est testée séparément.
    await db.query(`insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)`,[org,artisan]);
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisan]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [artisan]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,'emp-dec', current_date + 300)`,
      [artisan, `artisans/${artisan}/decennale.pdf`]
    );
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });


  beforeEach(async()=>{ await enTantQuePostgres(); await db.query("savepoint audit_scenario"); });
  afterEach(async()=>{ await db.query("rollback to savepoint audit_scenario"); });
  async function missionAvecCreneaux() {
    const mission = await confierLaMission(incident);
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`,[mission]);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([3,4,5])]);
    return mission;
  }

  async function etat(mission: string) {
    await enTantQuePostgres();
    return (await db.query(`select
      (select to_jsonb(i) from incident_interventions i where id=$1) mission,
      (select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from intervention_creneaux c where intervention_id=$1) creneaux,
      (select count(*)::int from incident_evenements where incident_id=$2) evenements,
      (select count(*)::int from alerts where origine_id=$1) alertes`,[mission,incident])).rows[0];
  }
  const bons = () => JSON.parse(creneauxA([10,11,12]));
  const variantes: [string, () => unknown][] = [
    ['SQL NULL',()=>undefined], ['JSON null',()=>null], ['objet',()=>({})],
    ['scalaire',()=>42], ['deux propositions',()=>bons().slice(0,2)],
    ['entrée null',()=>[null,...bons().slice(1)]],
    ['entrée tableau',()=>[[],...bons().slice(1)]],
    ['début manquant',()=>[{fin:bons()[0].fin},...bons().slice(1)]],
    ['début numérique',()=>[{...bons()[0],debut:123},...bons().slice(1)]],
    ['fin null',()=>[{...bons()[0],fin:null},...bons().slice(1)]],
    ['date impossible',()=>[{...bons()[0],debut:'2027-02-30T08:00:00Z'},...bons().slice(1)]],
    ['date vide',()=>[{...bons()[0],fin:''},...bons().slice(1)]],
    ['infini',()=>[{...bons()[0],fin:'infinity'},...bons().slice(1)]],
    ['moins infini',()=>[{...bons()[0],debut:'-infinity'},...bons().slice(1)]],
    ['fin avant début',()=>{const a=bons(); a[2].fin=a[0].debut;return a;}],
    ['durée nulle',()=>{const a=bons();a[1].fin=a[1].debut;return a;}],
    ['passé',()=>JSON.parse(creneauxA([-3,-2,-1]))],
    ['doublon',()=>{const a=bons();a[2]=a[0];return a;}],
    ['doublon autre fuseau',()=>{const a=bons();const decal=(s:string)=>new Date(Date.parse(s)+7200000).toISOString().replace('Z','+02:00');a[2]={debut:decal(a[0].debut),fin:decal(a[0].fin)};return a;}],
  ];
  for (const auteur of ['artisan','locataire'] as const) {
    for (const [nom,valeur] of variantes) {
      it(`${auteur} refuse ${nom} sans modifier les créneaux, la mission ni sa chronologie`,async()=>{
        const mission=await missionAvecCreneaux();const avant=await etat(mission);
        await agir(auteur==='artisan'?cptArtisan:cptLoc);
        const payload=valeur();
        const sql=auteur==='artisan'?`select public.proposer_creneaux($1,$2::jsonb)`:`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`;
        const args=auteur==='artisan'?[mission,payload===undefined?null:JSON.stringify(payload)]:[org,mission,payload===undefined?null:JSON.stringify(payload)];
        await expect(essai(sql,args)).rejects.toThrow();expect(await etat(mission)).toEqual(avant);
      });
    }
  }
  it('le nominal locataire accepte aussi plus de trois créneaux puis artisan confirme',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    expect((await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb) n`,[org,mission,creneauxA([10,11,12,13])])).rows[0].n).toBe(4);
    await agir(cptArtisan);
    const {rows}=await db.query(`select * from mes_creneaux_artisan($1) where propose_par='locataire' order by debut`,[mission]);
    await db.query(`select accepter_creneau_locataire($1)`,[rows[0].creneau_id]);
    expect((await etat(mission)).mission.statut).toBe('planifiee');
  });
  // Audit du 13/10/2026 (REP-01) : un second envoi (réponse perdue, double clic) marquait
  // refusées les propositions du locataire lui-même, portait le compte à six et ouvrait
  // une alerte d'arbitrage critique fantôme.
  const repartition=async(mission:string)=>{
    await enTantQuePostgres();
    const {rows}=await db.query(`select propose_par::text as par,statut::text as statut,count(*)::int as n from intervention_creneaux where intervention_id=$1 group by 1,2`,[mission]);
    return rows.sort((a:{par:string;statut:string},b:{par:string;statut:string})=>(a.par+a.statut).localeCompare(b.par+b.statut));
  };
  it('un second envoi de la même contre-proposition ne change rien : ni refus fantôme, ni arbitrage',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    const liste=creneauxA([10,11,12]);
    expect((await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb) n`,[org,mission,liste])).rows[0].n).toBe(3);
    // VER-SQL-03 : le second envoi dit qu'il n'a rien enregistré (0), pour que l'action ne prévienne pas l'artisan une deuxième fois.
    expect((await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb) n`,[org,mission,liste])).rows[0].n).toBe(0);
    expect(await repartition(mission)).toEqual([{par:'artisan',statut:'refuse',n:3},{par:'locataire',statut:'propose',n:3}]);
    expect((await db.query(`select id from alerts where type='creneaux_arbitrage' and origine_id=$1`,[mission])).rowCount).toBe(0);
    expect((await db.query(`select 1 from incident_evenements where type='creneaux_proposes' and details->>'intervention_id'=$1 and details->>'par'='locataire'`,[mission])).rowCount).toBe(1);
  });
  it('une liste corrigée remplace la précédente : l’ancienne devient caduque, elle n’est pas comptée comme refusée',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])]);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([14,15,16])]);
    expect(await repartition(mission)).toEqual([{par:'artisan',statut:'refuse',n:3},{par:'locataire',statut:'caduc',n:3},{par:'locataire',statut:'propose',n:3}]);
    expect((await db.query(`select id from alerts where type='creneaux_arbitrage' and origine_id=$1`,[mission])).rowCount).toBe(0);
    const {rows}=await db.query(`select (details->>'refuses_cumules')::int as refuses from incident_evenements where type='creneaux_proposes' and details->>'par'='locataire' and details->>'intervention_id'=$1 order by created_at`,[mission]);
    expect(rows.map((r:{refuses:number})=>r.refuses)).toEqual([3,3]);
  });
  it('report artisan : un rendez-vous planifié redevient accepté avec trois nouvelles dates',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    const {rows}=await db.query(`select * from mes_creneaux_locataire($1) where intervention_id=$2`,[org,mission]);
    await db.query(`select choisir_creneau($1,$2)`,[org,rows[0].creneau_id]);
    const avant=await etat(mission);expect(avant.mission.statut).toBe('planifiee');
    await agir(cptArtisan);
    await expect(essai(`select proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([-3,-2,-1])])).rejects.toThrow();
    expect(await etat(mission)).toEqual(avant);
    await agir(cptArtisan);await db.query(`select proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([10,11,12])]);
    const apres=await etat(mission);expect(apres.mission.statut).toBe('acceptee');expect(apres.mission.debut_prevu).toBeNull();
    expect(apres.creneaux.filter((c:{statut:string})=>c.statut==='retenu')).toHaveLength(0);
    expect(apres.creneaux.filter((c:{statut:string})=>c.statut==='propose')).toHaveLength(3);
  });
  it('contre-proposition refusée sur mission annulée, même avec trois dates valides',async()=>{
    const mission=await missionAvecCreneaux();await agir(gerant);
    await db.query(`select annuler_mission($1,$2,'Test annulation')`,[org,mission]);
    const avant=await etat(mission);await agir(cptLoc);
    await expect(essai(`select contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])])).rejects.toThrow(/contre-proposition/);
    expect(await etat(mission)).toEqual(avant);
  });
  it('contre-proposition refusée quand le rendez-vous est déjà retenu',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    const {rows}=await db.query(`select * from mes_creneaux_locataire($1) where intervention_id=$2`,[org,mission]);
    await db.query(`select choisir_creneau($1,$2)`,[org,rows[0].creneau_id]);
    const avant=await etat(mission);await agir(cptLoc);
    await expect(essai(`select contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])])).rejects.toThrow(/contre-proposition/);
    expect(await etat(mission)).toEqual(avant);
  });
  it('les refus conduisent toujours à l’arbitrage puis au rendez-vous fixé par le gérant',async()=>{
    const mission=await missionAvecCreneaux();await agir(cptLoc);
    await db.query(`select contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])]);
    await agir(cptArtisan);
    await expect(essai(`select proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([20,21,22])])).rejects.toThrow(/Le locataire vous a proposé/);
    await db.query(`select refuser_creneaux_locataire($1,'Dates incompatibles pour le test')`,[mission]);
    await enTantQuePostgres();
    expect((await db.query(`select id from alerts where type='creneaux_arbitrage' and origine_id=$1`,[mission])).rowCount).toBe(1);
    await agir(gerant);await db.query(`select fixer_creneau_arbitrage($1,$2,now()+interval '20 day',now()+interval '20 day 2 hour','Accord de test')`,[org,mission]);
    expect((await etat(mission)).mission.statut).toBe('planifiee');
  });

  it('une mission terminée refuse toute nouvelle négociation, côté locataire et artisan',async()=>{
    const mission=await missionAvecCreneaux();
    await agir(cptArtisan);await db.query(`select demarrer_intervention($1)`,[mission]);
    // Pièce de test locale : aucune photo réelle ni appel de stockage externe.
    await enTantQuePostgres();await db.query(`select set_config('request.jwt.claims','',true)`);
    const chemin=`${org}/planning-${mission}.jpg`;
    await db.query(`insert into storage.objects(bucket_id,name) values('documents',$1)`,[chemin]);
    const {rows:[doc]}=await db.query(`insert into documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/jpeg',10,$3) returning id`,[org,chemin,mission]);
    await db.query(`insert into intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')`,[org,mission,doc.id]);
    await agir(cptArtisan);await db.query(`select deposer_compte_rendu($1,'Travail fictif achevé',null,null,48000,false)`,[mission]);
    const avant=await etat(mission);expect(avant.mission.statut).toBe('terminee');
    await agir(cptLoc);
    await expect(essai(`select contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])])).rejects.toThrow(/contre-proposition/);
    await agir(cptArtisan);
    await expect(essai(`select proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([10,11,12])])).rejects.toThrow(/Acceptez la mission/);
    expect(await etat(mission)).toEqual(avant);
  });
  it('des fuseaux différents restent acceptés quand les instants proposés diffèrent',async()=>{
    const mission=await missionAvecCreneaux();const a=bons();
    const decal=(s:string)=>new Date(Date.parse(s)+7200000).toISOString().replace('Z','+02:00');
    a[1]={debut:decal(a[1].debut),fin:decal(a[1].fin)};
    await agir(cptLoc);
    expect((await db.query(`select contre_proposer_creneaux($1,$2,$3::jsonb) n`,[org,mission,JSON.stringify(a)])).rows[0].n).toBe(3);
  });
  it('les comptes voisins restent refusés dans les deux RPC',async()=>{
    const mission=await missionAvecCreneaux();const avant=await etat(mission);
    for(const compte of [cptLocB,cptAutreLoc]){
      await agir(compte);
      await expect(essai(`select contre_proposer_creneaux($1,$2,$3::jsonb)`,[org,mission,creneauxA([10,11,12])])).rejects.toThrow(/Accès refusé/);
      await expect(essai(`select proposer_creneaux($1,$2::jsonb)`,[mission,creneauxA([10,11,12])])).rejects.toThrow(/Accès refusé/);
    }
    expect(await etat(mission)).toEqual(avant);
  });
});
