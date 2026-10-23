/** Réseau d'artisans : décision du dirigeant du 23/10/2026 (migration 20261023180000). L'artisan choisit sa zone
 * (codes postaux ou départements) et ses métiers ; il est proposé dès que Gerimmo l'a validé (SIRET vérifié), que son
 * profil est public et qu'il a son compte. Plus d'ouverture commune × métier par la supervision. Décennale, listes
 * noires, adresse confirmée du bien et carnet personnel inchangés.
 * Chaque cas agit avec les droits réels du profil, dans une transaction annulée. */
import { config } from "dotenv";
import { Client } from "pg";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);
const SIRET_RESEAU = "12456789012345";
describe.skipIf(!DB)("Réseau d'artisans — zone et métiers choisis par l'artisan", () => {
  let db: Client;
  let org: string, autreOrg: string, owner: string, sa: string, etranger: string, agent: string, locataire: string, artisanCompte: string, secondCompte: string;
  let artisan: string, secondArtisan: string;
  let paris: { bien: string; incident: string }, lyon: { bien: string; incident: string }, massy: { bien: string; incident: string };
  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (nom: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [nom]);
  const devenir = async (qui: string) => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]); await db.query("set local role authenticated"); };
  const postgres = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const essai = async (sql: string, params: unknown[] = []) => { await db.query("savepoint essai"); try { const r = await db.query(sql, params); await db.query("release savepoint essai"); return r; } catch (e) { await db.query("rollback to savepoint essai"); await db.query("release savepoint essai"); throw e; } };
  const propriete = async (nom: string, cp: string, commune: string) => {
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'appartement','1 rue du Test',$3,$4) returning id", [org, nom, cp, commune]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot réseau','loue') returning id", [org,bien]);
    const personne = await id("insert into public.persons(organization_id,nom) values($1,'Locataire réseau') returning id", [org]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-100,600,40) returning id", [org,lot,personne]);
    const incident = await id("insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,'RES-'||substr(gen_random_uuid()::text,1,8),$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite test réseau','qualifie','proprietaire','Usure') returning id", [org,lot,bail,personne]);
    return { bien, incident };
  };
  const confirmer = async (bien: string, code: string) => { await devenir(owner); await db.query("select public.reseau_confirmer_commune($1,$2,$3)", [org,bien,code]); };
  /** L'artisan lui-même, depuis son espace (« Mes métiers et ma zone »). */
  const choisir = async (metiers: string[], zones: string[], qui = artisanCompte, art = artisan) => { await devenir(qui); await db.query("select public.artisan_definir_metiers_zones($1,$2::public.artisan_metier[],$3::text[])", [art, metiers, zones]); };
  const dispo = async (bien=paris.bien,metier="plomberie",nature="entretien_courant") => (await db.query("select * from public.reseau_disponibilite($1,$2,$3,$4)",[org,bien,metier,nature])).rows[0];
  const proposes = async (bien=paris.bien,metier="plomberie",nature="entretien_courant") => (await db.query("select * from public.artisans_disponibles_bien($1,$2,$3,$4)",[org,bien,metier,nature])).rows;
  const consultation = async (incident=paris.incident) => id("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) id", [org,incident]);
  const interet = async (bien=paris.bien,metier="plomberie") => (await db.query("select public.reseau_signaler_interet($1,$2,$3) nouveau",[org,bien,metier])).rows[0].nouveau;
  const profil = async (art = artisan) => { await postgres(); return (await db.query("select (select array_agg(metier::text order by metier::text) from public.artisan_metiers where artisan_id=$1) metiers,(select array_agg(code_postal order by code_postal) from public.artisan_zones where artisan_id=$1) zones",[art])).rows[0]; };
  beforeAll(async () => {
    db = new Client({ connectionString: DB }); await db.connect(); await db.query("begin");
    org = await id("insert into public.organizations(name,type,status,postal_code) values('Bailleur national','proprietaire_direct','active','91300') returning id");
    autreOrg = await id("insert into public.organizations(name,type,status) values('Autre agence','agence','active') returning id");
    [owner,sa,etranger,agent,locataire,artisanCompte,secondCompte] = [await compte('bailleur'),await compte('sa'),await compte('etranger'),await compte('agent'),await compte('locataire'),await compte('artisan'),await compte('second')];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,null,'super_admin'),($4,$5,'admin_agence'),($6,$2,'agent'),($7,$2,'locataire')",[owner,org,sa,etranger,autreOrg,agent,locataire]);
    paris=await propriete('Bien à Paris','75011','Paris'); lyon=await propriete('Bien à Lyon','69003','Lyon'); massy=await propriete('Bien à Massy','91300','Massy');
    artisan=await id("insert into public.artisans(raison_sociale,siret,telephone,email,account_id,visibilite,statut_plateforme,siret_etat) values('Artisan du réseau',$1,'0600000000','artisan-reseau@example.invalid',$2,'publique','valide','verifie') returning id", [SIRET_RESEAU, artisanCompte]);
    secondArtisan=await id("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('Second artisan réseau','22456789012345','0600000000',$1,'publique','valide','verifie') returning id", [secondCompte]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie'),($1,'electricite'),($2,'plomberie')",[artisan,secondArtisan]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011'),($2,'75011')",[artisan,secondArtisan]);
    await confirmer(paris.bien,'75056'); await confirmer(lyon.bien,'69123'); await confirmer(massy.bien,'91377'); await postgres();
  });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("validé, SIRET vérifié, public, avec compte : proposé dans sa zone pour ses métiers, sans aucune décision de la supervision", async () => {
    await postgres();
    expect((await db.query("select (select count(*) from public.reseau_ouvertures)::int o,(select count(*) from public.reseau_artisan_communes where artisan_id in ($1,$2))::int r",[artisan,secondArtisan])).rows[0]).toEqual({o:0,r:0});
    await devenir(owner);
    expect(await dispo()).toMatchObject({etat:'ouverte',commune_code:'75056',nb_artisans:'2',nb_contacts:'0'});
    expect(await dispo(paris.bien,'electricite')).toMatchObject({etat:'ouverte',nb_artisans:'1'});
    expect((await dispo(paris.bien,'serrurerie')).etat).toBe('sans_artisan');
    expect((await dispo(lyon.bien)).etat).toBe('sans_artisan'); expect((await dispo(massy.bien)).etat).toBe('sans_artisan');
    expect((await proposes()).map(a=>a.artisan_id).sort()).toEqual([artisan,secondArtisan].sort());
    expect((await proposes(paris.bien,'electricite')).map(a=>a.artisan_id)).toEqual([artisan]);
  });
  it("aucun état « fermée » ne subsiste : 35 états pour le bien, décennale comprise", async () => {
    await devenir(owner);
    const tous=(await db.query("select * from public.reseau_etats_bien($1,$2)",[org,paris.bien])).rows;
    expect(tous).toHaveLength(35); expect(tous.some(d=>d.etat==='fermee')).toBe(false);
    expect(tous.find(d=>d.metier==='plomberie' && d.nature==='entretien_courant').etat).toBe('ouverte');
    // Gros œuvre : décennale exigée, aucun des deux n'en a.
    expect(tous.find(d=>d.metier==='plomberie' && d.nature==='gros_oeuvre').etat).toBe('sans_artisan');
  });
  it("un département entier couvre toutes ses communes ; l'artisan le choisit lui-même depuis son espace", async () => {
    await choisir(['plomberie','electricite'],['75011','91']);
    expect(await profil()).toEqual({metiers:['electricite','plomberie'],zones:['75011','91']});
    await devenir(owner);
    expect(await dispo(massy.bien)).toMatchObject({etat:'ouverte',nb_artisans:'1'}); expect((await dispo(lyon.bien)).etat).toBe('sans_artisan');
    // Un métier ajouté plus tard vaut aussitôt pour toute sa zone.
    await choisir(['plomberie','electricite','serrurerie'],['75011','91']);
    await devenir(owner); expect((await dispo(massy.bien,'serrurerie')).etat).toBe('ouverte');
  });
  it("la zone se compare au code postal du BIEN : un code postal de Paris ne couvre pas tout Paris", async () => {
    await postgres(); const p12=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien Paris 12','appartement','1 rue Test','75012','Paris','75056') returning id",[org]);
    await devenir(owner); expect((await dispo(p12)).etat).toBe('sans_artisan'); expect(await proposes(p12)).toHaveLength(0);
    await devenir(sa); expect((await db.query("select ouverte,eligibles from public.reseau_pilotage('75','plomberie') where commune_code='75056'")).rows[0]).toEqual({ouverte:true,eligibles:'2'});
  });
  it("aides de pré-filtre : les zones candidates d'un code postal sont exactement celles que zone_artisan_couvre accepte", async () => {
    await postgres();
    const ecarts=(await db.query(`with cps as (select distinct cp from public.reseau_communes, unnest(codes_postaux) cp),
      zones as (select z from (select lpad(g::text,2,'0') z from generate_series(0,99) g union all select unnest(array['2A','2B','971','972','973','974','975','976'])) x)
      select cp, z from cps cross join lateral (select z from zones union all select cp) zs
      where public.zone_artisan_couvre(zs.z,cp) <> (zs.z = any(public.zones_couvrant_code_postal(cp))) limit 5`)).rows;
    expect(ecarts).toEqual([]);
    expect((await db.query("select public.zones_couvrant_code_postal('20000') a, public.zones_couvrant_code_postal('20200') b, public.zones_couvrant_code_postal('97400') c, public.zones_couvrant_code_postal(null) d")).rows[0]).toEqual({a:['20000','20','2A'],b:['20200','20','2B'],c:['97400','974'],d:[]});
  });
  it("le bailleur domicilié en Essonne gère ses biens et incidents à Lyon et Paris, réseau ou pas", async () => {
    await devenir(owner);
    expect((await db.query("select id from public.biens where organization_id=$1",[org])).rows).toHaveLength(3);
    expect((await db.query("select id from public.baux where organization_id=$1",[org])).rows).toHaveLength(3);
    expect((await db.query("update public.biens set nom='Bien lyonnais renommé' where id=$1 returning id",[lyon.bien])).rows).toHaveLength(1);
    expect((await db.query("select id from public.incidents where id=$1",[lyon.incident])).rows).toHaveLength(1);
  });
  it("un nouvel inscrit domicilié à Lyon ouvre son espace et crée son premier bien hors Essonne", async () => {
    await postgres(); const nouveau=await compte('inscription-nationale');
    await db.query("update auth.users set raw_user_meta_data=jsonb_build_object('espace','proprietaire_direct','nom','National','prenom','Test','adresse','1 rue de la République','code_postal','69003','ville','Lyon','telephone','0600000000','qualite','personne_physique') where id=$1",[nouveau]);
    await devenir(nouveau); const espace=await id("select public.initialiser_espace_proprietaire() id");
    expect((await db.query("select city,postal_code from public.organizations where id=$1",[espace])).rows[0]).toEqual({city:'Lyon',postal_code:'69003'});
    const bien=await id("select public.creer_bien_avec_lot($1,'Premier bien national','appartement','2 rue Test',null,'33000','Bordeaux',2000,false,40,2) id",[espace]);
    expect((await db.query("select id from public.lots where bien_id=$1",[bien])).rows).toHaveLength(1);
    await db.query("select public.reseau_confirmer_commune($1,$2,'33063')",[espace,bien]);
    expect((await db.query("select etat from public.reseau_disponibilite($1,$2,'plomberie')",[espace,bien])).rows[0].etat).toBe('sans_artisan');
  });
  it("un intérêt se signale là où aucun artisan n'intervient, dédoublonné, sans intervention ; refusé là où le réseau est disponible", async () => {
    await devenir(owner); expect(await interet(lyon.bien)).toBe(true); expect(await interet(lyon.bien)).toBe(false);
    expect(await interet(lyon.bien,'electricite')).toBe(true); expect(await interet(paris.bien,'serrurerie')).toBe(true);
    expect((await dispo(lyon.bien)).interet_enregistre).toBe(true);
    await expect(essai("select public.reseau_signaler_interet($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/réseau est disponible/);
    for (const table of ['incident_consultations','incident_sollicitations','incident_interventions']) expect((await db.query(`select id from public.${table} where organization_id=$1`,[org])).rows).toHaveLength(0);
    await devenir(sa); expect((await db.query("select * from public.reseau_pilotage('69','plomberie') where commune_code='69123'")).rows[0]).toMatchObject({ouverte:false,preparee:false,interets:'1',biens_interesses:'1',demandes:'0'});
    const national=(await db.query("select * from public.reseau_interets_pilotage(0,30)")).rows;
    expect(national).toHaveLength(3); expect(national.map(x=>x.departement).sort()).toEqual(['69','69','75']);
    await devenir(owner); await expect(essai("select * from public.reseau_interets_pilotage()")).rejects.toThrow(/supervision/);
  });
  it("une commune non confirmée bloque le réseau et l’intérêt, sans empêcher la gestion", async () => {
    await postgres(); await db.query("update public.biens set commune_insee=null where id=$1",[paris.bien]); await devenir(owner);
    expect((await dispo()).etat).toBe('adresse_incomplete'); expect(await proposes()).toHaveLength(0);
    await expect(essai("select public.reseau_signaler_interet($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/Complétez/);
    await expect(essai("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant')",[org,paris.incident])).rejects.toThrow(/Complétez/);
    expect((await db.query("select id from public.baux where organization_id=$1",[org])).rows).toHaveLength(3);
  });
  it("un code INSEE forgé ne peut remplacer la ville réelle même si le code postal est partagé", async () => {
    await postgres(); const paire=(await db.query("select a.code,a.nom,cp,a2.code autre from public.reseau_communes a cross join lateral unnest(a.codes_postaux) cp join public.reseau_communes a2 on cp=any(a2.codes_postaux) and a2.code<>a.code and a2.nom<>a.nom limit 1")).rows[0];
    const b=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Adresse partagée','appartement','1 rue Test',$2,$3) returning id",[org,paire.cp,paire.nom]);
    await devenir(owner); await expect(essai("select public.reseau_confirmer_commune($1,$2,$3)",[org,b,paire.autre])).rejects.toThrow(/adresse du bien/);
    await db.query("select public.reseau_confirmer_commune($1,$2,$3)",[org,b,paire.code]); expect((await dispo(b)).commune_code).toBe(paire.code);
  });
  it("une correction d’adresse ne garde la confirmation que si la commune reste la même", async () => {
    await postgres(); const b=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien vide','appartement','1 rue Test','91300','Massy','91377') returning id",[org]);
    await devenir(owner); await db.query("update public.biens set address_line1='2 rue Test', city='MASSY' where id=$1",[b]);
    expect((await dispo(b)).commune_code).toBe('91377');
    await db.query("update public.biens set postal_code='91120', city='Palaiseau' where id=$1",[b]); expect((await dispo(b)).etat).toBe('adresse_incomplete');
  });
  it("le nom de la ville tolère casse, accents, tirets, arrondissement et « St » pour « Saint »", async () => {
    await postgres(); const b=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien Saint-Étienne','appartement','1 rue Test','42000','ST ETIENNE') returning id",[org]);
    await devenir(owner); await db.query("select public.reseau_confirmer_commune($1,$2,'42218')",[org,b]);
    expect((await dispo(b)).commune_code).toBe('42218');
    await postgres(); const p=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien Paris 12','appartement','1 rue Test','75012','Paris 12e arrondissement') returning id",[org]);
    await devenir(owner); await db.query("select public.reseau_confirmer_commune($1,$2,'75056')",[org,p]);
    expect((await dispo(p)).commune_code).toBe('75056');
  });
  it("sans artisan dans la zone : un appel direct ne crée ni consultation ni sollicitation", async () => {
    await devenir(owner); await expect(essai("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant')",[org,lyon.incident])).rejects.toThrow(/Aucun artisan du réseau/);
    expect((await db.query("select id from public.incident_consultations where organization_id=$1",[org])).rows).toHaveLength(0);
    await postgres(); const c=await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,lyon.incident]);
    await devenir(owner); await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/plus disponible/);
    expect((await db.query("select id from public.incident_sollicitations where organization_id=$1",[org])).rows).toHaveLength(0);
  });
  it("la nouvelle demande a un destinataire de la bonne zone et conserve son origine", async () => {
    await devenir(owner); const c=await consultation();
    const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    expect((await db.query("select artisan_id,origine_reseau,commune_reseau from public.incident_sollicitations where id=$1",[s])).rows[0]).toEqual({artisan_id:artisan,origine_reseau:'reseau',commune_reseau:'75056'});
    await devenir(sa); expect((await db.query("select demandes from public.reseau_pilotage('75','plomberie') where commune_code='75056'")).rows[0].demandes).toBe('1');
  });
  it("ni l’e-mail ni le téléphone d’un artisan du réseau ne sont rendus avant toute relation ; ceux d’un contact du carnet le sont", async () => {
    await devenir(owner);
    expect((await proposes()).find(a=>a.artisan_id===artisan)).toMatchObject({telephone:null,email:null,rattache:false});
    // Relecture sécurité du 23/10 (constat 1) : un bien dans une autre zone (ou une adresse déplacée) ne livre plus
    // les numéros des artisans qui y interviennent.
    await postgres(); await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'69003')",[secondArtisan]);
    await devenir(owner); expect((await proposes(lyon.bien)).map(a=>[a.artisan_id,a.telephone,a.email])).toEqual([[secondArtisan,null,null]]);
    await postgres(); await db.query("insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)",[org,artisan]);
    await devenir(owner); expect((await proposes()).find(a=>a.artisan_id===artisan)).toMatchObject({telephone:'0600000000',email:'artisan-reseau@example.invalid',rattache:true});
  });
  it("une fois la demande envoyée, le propriétaire lit les coordonnées de l’artisan sollicité", async () => {
    await devenir(owner);
    expect((await db.query("select telephone from public.artisans where id=$1",[artisan])).rows).toHaveLength(0);
    const c=await consultation(); await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    expect((await db.query("select telephone,email from public.artisans where id=$1",[artisan])).rows).toEqual([{telephone:'0600000000',email:'artisan-reseau@example.invalid'}]);
  });
  it.each(['privee','refuse','en_attente','siret_non_verifie','blacklist','sans_compte','hors_zone','sans_metier'])("si le dernier artisan devient « %s », la zone ne reçoit plus de nouvelle demande", async (cause) => {
    await postgres(); await db.query("delete from public.artisan_zones where artisan_id=$1",[secondArtisan]);
    await devenir(owner); const c=await consultation(); await postgres();
    if(cause==='privee') await db.query("update public.artisans set visibilite='privee' where id=$1",[artisan]);
    if(cause==='refuse') await db.query("update public.artisans set statut_plateforme='refuse',statut_motif='Refus de test motivé' where id=$1",[artisan]);
    if(cause==='en_attente') await db.query("update public.artisans set statut_plateforme='en_attente' where id=$1",[artisan]);
    if(cause==='siret_non_verifie') await db.query("update public.artisans set visibilite='privee',siret_etat='non_verifie' where id=$1",[artisan]);
    if(cause==='blacklist') await db.query("update public.artisans set blacklist_globale_le=now(),blacklist_globale_motif='Test exclusion' where id=$1",[artisan]);
    if(cause==='sans_compte') await db.query("update public.artisans set account_id=null where id=$1",[artisan]);
    if(cause==='hors_zone') await choisir(['plomberie','electricite'],['69003']);
    if(cause==='sans_metier') await choisir(['electricite'],['75011']);
    await devenir(owner); expect((await dispo()).etat).toBe('sans_artisan'); expect(await proposes()).toHaveLength(0);
    await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/plus disponible/);
    expect(await interet()).toBe(true);
  });
  it("une liste noire locale écarte l’artisan pour cette organisation seulement", async () => {
    await postgres(); await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut,blacklist_le,blacklist_motif,blacklist_par) values($1,$2,'desactive',now(),'Retards',$3)",[org,artisan,owner]);
    await devenir(owner); expect(await dispo()).toMatchObject({etat:'ouverte',nb_artisans:'1'}); expect((await proposes()).map(a=>a.artisan_id)).toEqual([secondArtisan]);
    const c=await consultation(); await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/écarté/);
  });
  it("l’assurance obligatoire reste un filtre : aucun destinataire pour des travaux non couverts", async () => {
    await devenir(owner); expect((await dispo(paris.bien,'plomberie','gros_oeuvre')).etat).toBe('sans_artisan');
    await expect(essai("select public.ouvrir_consultation($1,$2,'plomberie','gros_oeuvre')",[org,paris.incident])).rejects.toThrow(/Aucun artisan/);
  });
  it("la zone se revérifie à l’envoi sur le code postal du bien : un artisan du 75012 n’est pas sollicitable pour un bien du 75011", async () => {
    // Relecture « tests et migration » du 23/10 (constat 2) : l'éligibilité par commune accepte n'importe quel code postal
    // de Paris ; seul le contrôle de zone de solliciter_artisan sur le code postal du BIEN écarte cet artisan.
    await postgres(); await db.query("delete from public.artisan_zones where artisan_id=$1",[secondArtisan]);
    await choisir(['plomberie','electricite'],['75012']);
    await devenir(owner); expect((await dispo()).etat).toBe('sans_artisan'); expect(await proposes()).toHaveLength(0);
    await devenir(sa); expect((await db.query("select eligibles from public.reseau_pilotage('75','plomberie') where commune_code='75056'")).rows[0].eligibles).toBe('1');
    await postgres(); const c=await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,paris.incident]);
    await devenir(owner); await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/plus disponible/);
    expect((await db.query("select id from public.incident_sollicitations where organization_id=$1",[org])).rows).toHaveLength(0);
  });
  it("chaque ajout ou retrait de zone ou de métier est journalisé : auteur, avant, après, état de la fiche", async () => {
    await postgres(); const deja=(await db.query("select coalesce(array_agg(id),'{}') ids from public.audit_log where details->>'artisan'=$1",[artisan])).rows[0].ids;
    const debut=deja.length;
    await choisir(['plomberie'],['75011','91']);
    await postgres();
    const lignes=(await db.query("select action,account_id,details from public.audit_log where details->>'artisan'=$1 and id<>all($2::uuid[]) order by action",[artisan,deja])).rows;
    expect(lignes.map(l=>[l.action,l.account_id,l.details.auteur,l.details.avant,l.details.apres,l.details.ajoutes??null,l.details.retires??null,l.details.statut_plateforme,l.details.visibilite])).toEqual([
      ['artisan_metiers_modifies',artisanCompte,artisanCompte,['electricite','plomberie'],['plomberie'],null,['electricite'],'valide','publique'],
      ['artisan_zone_modifiee',artisanCompte,artisanCompte,['75011'],['75011','91'],['91'],null,'valide','publique'],
    ]);
    // Un appel sans effet (mêmes métiers, même zone) et un appel refusé n'écrivent rien.
    await choisir(['plomberie'],['75011','91']);
    await devenir(etranger); await expect(essai("select public.artisan_definir_metiers_zones($1,array['autre']::public.artisan_metier[],array['13'])",[artisan])).rejects.toThrow(/Accès refusé/);
    await postgres(); expect((await db.query("select count(*)::int n from public.audit_log where details->>'artisan'=$1",[artisan])).rows[0].n).toBe(debut+2);
    // Le journal n'est lisible que par la supervision.
    await devenir(artisanCompte); expect((await db.query("select id from public.audit_log where details->>'artisan'=$1",[artisan])).rows).toHaveLength(0);
    await devenir(sa); expect((await db.query("select id from public.audit_log where details->>'artisan'=$1",[artisan])).rows.length).toBe(debut+2);
  });
  it("un retrait de zone par l’artisan conserve la demande engagée, son accès et son devis, mais bloque les suivantes", async () => {
    await devenir(owner); const c=await consultation();
    const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    await choisir(['plomberie','electricite'],['69003']);
    await devenir(owner); expect((await db.query("select id from public.incident_sollicitations where id=$1",[s])).rows).toHaveLength(1);
    // Nouvelle demande au même artisan, hors de sa zone désormais : refusée avant tout envoi (contrôle du réseau d'abord).
    await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/plus disponible/);
    await devenir(artisanCompte); expect((await db.query("select * from public.mes_sollicitations()")).rows.some(r=>r.sollicitation_id===s)).toBe(true);
    const devis=await id("select public.deposer_devis_structure($1,jsonb_build_array(jsonb_build_object('libelle','Réparation','quantite',1,'prix_unitaire_ht_cents',10000,'tva_bps',0)),'Joint usé','Changer le joint','Sous 7 jours','Une heure',null,null,null,null,null,null,null) id",[s]);
    await devenir(owner); expect(await id("select public.retenir_devis($1,$2) id",[org,devis])).toBeTruthy();
  });
  it("le carnet personnel fonctionne sans réseau et garde son suivi", async () => {
    await postgres();
    const prive=await id("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('Artisan privé du carnet','32456789012345','0600000000',$1,'privee','valide','verifie') returning id",[await compte('prive')]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')",[prive]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'69003')",[prive]);
    await db.query("insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)",[org,prive]);
    await devenir(owner); expect(await dispo(lyon.bien)).toMatchObject({etat:'sans_artisan',nb_contacts:'1'});
    const c=await consultation(lyon.incident); const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,prive]);
    expect((await db.query("select origine_reseau,commune_reseau from public.incident_sollicitations where id=$1",[s])).rows[0]).toEqual({origine_reseau:'carnet',commune_reseau:null});
  });
  it("pilotage : déclarés et proposés par commune, sans décision à prendre", async () => {
    await postgres(); await db.query("update public.artisans set visibilite='privee' where id=$1",[secondArtisan]);
    const attente=await id("insert into public.artisans(raison_sociale,siret,telephone,account_id) values('Artisan en attente','42456789012345','0600000000',$1) returning id",[await compte('attente')]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')",[attente]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75')",[attente]);
    // Une fiche SANS compte (créée par une agence) n'est jamais comptée.
    const fiche=await id("insert into public.artisans(raison_sociale,siret,telephone,visibilite,statut_plateforme,siret_etat) values('Fiche sans compte','52456789012345','0600000000','publique','valide','verifie') returning id");
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')",[fiche]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')",[fiche]);
    await devenir(sa);
    expect((await db.query("select ouverte,preparee,artisans,eligibles from public.reseau_pilotage('75','plomberie') where commune_code='75056'")).rows[0]).toEqual({ouverte:true,preparee:true,artisans:'3',eligibles:'1'});
    expect((await db.query("select ouverte,preparee,artisans,eligibles from public.reseau_pilotage('75','serrurerie') where commune_code='75056'")).rows[0]).toEqual({ouverte:false,preparee:false,artisans:'0',eligibles:'0'});
  });
  it("la supervision n’ouvre ni ne rattache plus rien : refus qui disent pourquoi, rien d’écrit", async () => {
    await devenir(sa);
    await expect(essai("select public.reseau_regler_ouverture(array['75056'],'plomberie',false,true)")).rejects.toThrow(/ne s’ouvre plus commune par commune/);
    await expect(essai("select public.reseau_regler_ouverture(array['69123'],'plomberie',true,true)")).rejects.toThrow(/choisit sa zone et ses métiers/);
    await expect(essai("select public.reseau_rattacher_artisan($1,array['75056'],'plomberie',false)",[artisan])).rejects.toThrow(/suspendez la validation de son inscription depuis sa fiche/);
    await expect(essai("select public.reseau_rattacher_artisan($1,array['69123'],'plomberie',true)",[artisan])).rejects.toThrow(/choisit lui-même sa zone/);
    await postgres(); expect((await db.query("select (select count(*) from public.reseau_ouvertures)::int o,(select count(*) from public.reseau_artisan_communes)::int r")).rows[0]).toEqual({o:0,r:0});
    await devenir(owner); expect((await dispo()).etat).toBe('ouverte');
  });
  it("une agence rattachée par le seul SIRET ne peut ni retirer les métiers ni étendre la zone d’un artisan qui a son compte", async () => {
    await devenir(etranger);
    expect(await id("select public.artisan_creer_ou_rattacher($1,'x',$2,'0600000000',null,array['autre']::public.artisan_metier[],null) id",[autreOrg,SIRET_RESEAU])).toBe(artisan);
    await expect(essai("select public.artisan_definir_metiers_zones($1,array['autre']::public.artisan_metier[],array['75011'])",[artisan])).rejects.toThrow(/lui appartiennent/);
    await expect(essai("select public.artisan_definir_metiers_zones($1,array['plomberie','electricite']::public.artisan_metier[],array['75011','13','69'])",[artisan])).rejects.toThrow(/lui appartiennent/);
    expect(await profil()).toEqual({metiers:['electricite','plomberie'],zones:['75011']});
    await devenir(owner); expect(await dispo()).toMatchObject({etat:'ouverte',nb_artisans:'2'}); expect((await dispo(lyon.bien)).etat).toBe('sans_artisan');
    // Ni le propriétaire direct, ni la supervision en dehors de son rôle : le propriétaire est refusé.
    await expect(essai("select public.artisan_definir_metiers_zones($1,array['plomberie']::public.artisan_metier[],array['69003'])",[artisan])).rejects.toThrow(/Accès refusé/);
  });
  it("une agence garde la main sur la fiche SANS compte de son carnet actif, plus par une relation désactivée", async () => {
    await devenir(etranger);
    const fiche=await id("select public.artisan_creer_ou_rattacher($1,'Fiche agence','62456789012345','0600000000',null,array['plomberie']::public.artisan_metier[],array['75011']) id",[autreOrg]);
    await db.query("select public.artisan_definir_metiers_zones($1,array['plomberie','serrurerie']::public.artisan_metier[],array['75011','75012'])",[fiche]);
    expect(await profil(fiche)).toEqual({metiers:['plomberie','serrurerie'],zones:['75011','75012']});
    // Jamais au réseau : pas de compte.
    await devenir(owner); expect((await proposes()).map(a=>a.artisan_id)).not.toContain(fiche);
    await postgres(); await db.query("update public.artisan_agences set statut='desactive' where organization_id=$1 and artisan_id=$2",[autreOrg,fiche]);
    await devenir(etranger); await expect(essai("select public.artisan_definir_metiers_zones($1,array['plomberie']::public.artisan_metier[],array['13'])",[fiche])).rejects.toThrow(/Accès refusé/);
    expect(await profil(fiche)).toEqual({metiers:['plomberie','serrurerie'],zones:['75011','75012']});
  });
  it.each(['etranger','agent','locataire','artisan'])("%s ne peut pas consulter le réseau d’un bien hors de son périmètre ni y déposer un intérêt", async profilTest => {
    await devenir({etranger,agent,locataire,artisan:artisanCompte}[profilTest]!);
    await expect(essai("select * from public.reseau_disponibilite($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/Accès refusé/);
    await expect(essai("select * from public.artisans_disponibles_bien($1,$2,'plomberie','entretien_courant')",[org,paris.bien])).rejects.toThrow(/Accès refusé/);
    await expect(essai("select public.reseau_signaler_interet($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/Accès refusé/);
    await expect(essai("select public.reseau_regler_ouverture(array['75056'],'plomberie',true,true)")).rejects.toThrow(/supervision/);
    await expect(essai("select public.reseau_rattacher_artisan($1,array['75056'],'plomberie',true)",[artisan])).rejects.toThrow(/supervision/);
  });
  it("les fonctions internes et écritures directes ne sont pas accessibles à un utilisateur", async () => {
    await devenir(owner);
    for(const nom of ['artisans_affectables_interne','ouvrir_consultation_interne','solliciter_artisan_interne','reseau_artisan_eligible','reseau_verifier_acces_bien','zones_couvrant_code_postal']) {
      const droits=(await db.query("select has_function_privilege('authenticated',p.oid,'execute') allowed, has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[nom])).rows;
      expect(droits, nom).not.toHaveLength(0); expect(droits.every(x=>!x.allowed && !x.anon), nom).toBe(true);
    }
    await expect(essai("insert into public.reseau_ouvertures(commune_code,metier,ouverte) values('75056','plomberie',true)")).rejects.toThrow(/permission denied/);
    await expect(essai("insert into public.artisan_zones(artisan_id,code_postal) values($1,'69003')",[artisan])).rejects.toThrow(/permission denied/);
    await expect(essai("insert into public.reseau_interets(account_id,organization_id,bien_id,commune_code,metier) values($1,$2,$3,'75056','plomberie')",[owner,org,paris.bien])).rejects.toThrow(/permission denied/);
    await db.query("reset role"); await db.query("set local role anon"); await expect(essai("select * from public.reseau_disponibilite($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/permission denied/);
  });
});
