/** Le réseau est fermé par défaut ; seuls commune ET métier décident de l'ouverture.
 * Chaque cas agit avec les droits réels du profil, dans une base isolée annulée. */
import { config } from "dotenv";
import { Client } from "pg";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);
describe.skipIf(!DB)("Réseau communal — gestion nationale et décisions explicites", () => {
  let db: Client;
  let org: string, autreOrg: string, owner: string, sa: string, etranger: string, agent: string, locataire: string, artisanCompte: string;
  let artisan: string, secondArtisan: string;
  let paris: { bien: string; incident: string }, lyon: { bien: string; incident: string }, massy: { bien: string; incident: string };
  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (nom: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [nom]);
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
  const ouvrir = async (code="75056",metier="plomberie",art=artisan) => { await devenir(sa); await db.query("select public.reseau_rattacher_artisan($1,array[$2]::text[],$3,true)", [art,code,metier]); await db.query("select public.reseau_regler_ouverture(array[$1]::text[],$2,true,true)", [code,metier]); };
  const dispo = async (bien=paris.bien,metier="plomberie",nature="entretien_courant") => (await db.query("select * from public.reseau_disponibilite($1,$2,$3,$4)",[org,bien,metier,nature])).rows[0];
  const consultation = async (incident=paris.incident) => id("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) id", [org,incident]);
  const interet = async (bien=paris.bien,metier="plomberie") => (await db.query("select public.reseau_signaler_interet($1,$2,$3) nouveau",[org,bien,metier])).rows[0].nouveau;
  beforeAll(async () => {
    db = new Client({ connectionString: DB }); await db.connect(); await db.query("begin");
    org = await id("insert into public.organizations(name,type,status,postal_code) values('Bailleur national','proprietaire_direct','active','91300') returning id");
    autreOrg = await id("insert into public.organizations(name,status) values('Autre agence','active') returning id");
    [owner,sa,etranger,agent,locataire,artisanCompte] = [await compte('bailleur'),await compte('sa'),await compte('etranger'),await compte('agent'),await compte('locataire'),await compte('artisan')];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,null,'super_admin'),($4,$5,'admin_agence'),($6,$2,'agent'),($7,$2,'locataire')",[owner,org,sa,etranger,autreOrg,agent,locataire]);
    paris=await propriete('Bien à Paris','75011','Paris'); lyon=await propriete('Bien à Lyon','69003','Lyon'); massy=await propriete('Bien à Massy','91300','Massy');
    artisan=await id("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('Artisan du réseau','12456789012345','0600000000',$1,'publique','valide','verifie') returning id", [artisanCompte]);
    secondArtisan=await id("insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values('Second artisan réseau','22456789012345','0600000000',$1,'publique','valide','verifie') returning id", [await compte('second')]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie'),($1,'electricite'),($2,'plomberie')",[artisan,secondArtisan]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011'),($2,'75011')",[artisan,secondArtisan]);
    await confirmer(paris.bien,'75056'); await confirmer(lyon.bien,'69123'); await confirmer(massy.bien,'91377'); await postgres();
  });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("la validation et le code postal d’un artisan n’ouvrent ni Paris ni l’Essonne", async () => {
    await devenir(owner); expect((await dispo()).etat).toBe('fermee'); expect((await dispo(massy.bien)).etat).toBe('fermee');
    expect((await db.query("select * from public.artisans_affectables($1,'plomberie','entretien_courant',null)",[org])).rows).toHaveLength(0);
    expect((await db.query("select id from public.artisans where id=$1",[artisan])).rows).toHaveLength(0);
  });
  it("le bailleur domicilié en Essonne gère ses biens et incidents à Lyon et Paris sans réseau", async () => {
    await devenir(owner);
    expect((await db.query("select id from public.biens where organization_id=$1",[org])).rows).toHaveLength(3);
    expect((await db.query("select id from public.baux where organization_id=$1",[org])).rows).toHaveLength(3);
    expect((await db.query("update public.biens set nom='Bien lyonnais renommé' where id=$1 returning id",[lyon.bien])).rows).toHaveLength(1);
    expect((await db.query("select id from public.incidents where id=$1",[lyon.incident])).rows).toHaveLength(1);
  });
  it("le rattachement à une commune est distinct de l’ouverture", async () => {
    await devenir(sa); await db.query("select public.reseau_rattacher_artisan($1,array['75056'],'plomberie',true)",[artisan]);
    await devenir(owner); expect((await dispo()).etat).toBe('fermee');
  });
  it("une décision exige un artisan éligible et une confirmation explicite", async () => {
    await devenir(sa);
    await expect(essai("select public.reseau_regler_ouverture(array['75056'],'plomberie',true,true)")).rejects.toThrow(/aucun artisan/);
    await db.query("select public.reseau_rattacher_artisan($1,array['75056'],'plomberie',true)",[artisan]);
    await expect(essai("select public.reseau_regler_ouverture(array['75056'],'plomberie',true,false)")).rejects.toThrow(/Confirmez/);
  });
  it("une ouverture groupée est atomique si une des communes n’a pas d’artisan", async () => {
    await devenir(sa); await db.query("select public.reseau_rattacher_artisan($1,array['75056'],'plomberie',true)",[artisan]);
    await expect(essai("select public.reseau_regler_ouverture(array['75056','91377'],'plomberie',true,true)")).rejects.toThrow(/aucun artisan/);
    await devenir(owner); expect((await dispo()).etat).toBe('fermee');
  });
  it("la plomberie ouverte n’ouvre ni l’électricité de la même commune ni un autre bien", async () => {
    await ouvrir(); await devenir(owner);
    expect((await dispo()).etat).toBe('ouverte'); expect((await dispo(paris.bien,'electricite')).etat).toBe('fermee');
    expect((await dispo(lyon.bien)).etat).toBe('fermee'); expect((await dispo(massy.bien)).etat).toBe('fermee');
    const tous=(await db.query("select * from public.reseau_etats_bien($1,$2)",[org,paris.bien])).rows;
    expect(tous).toHaveLength(35); expect(tous.find(d=>d.metier==='plomberie' && d.nature==='entretien_courant').etat).toBe('ouverte');
  });
  it("un intérêt est dédoublonné par utilisateur, bien, commune et métier, sans intervention", async () => {
    await devenir(owner); expect(await interet()).toBe(true); expect(await interet()).toBe(false);
    expect(await interet(paris.bien,'electricite')).toBe(true); expect(await interet(lyon.bien)).toBe(true);
    expect((await dispo()).interet_enregistre).toBe(true);
    const interesses=(await db.query("select account_id,bien_id,commune_code,metier from public.reseau_interets")).rows;
    expect(interesses).toHaveLength(3); expect(interesses.every(i=>i.account_id===owner)).toBe(true);
    for (const table of ['incident_consultations','incident_sollicitations','incident_interventions']) expect((await db.query(`select id from public.${table} where organization_id=$1`,[org])).rows).toHaveLength(0);
    await devenir(sa); const lignes=(await db.query("select * from public.reseau_pilotage('75','plomberie')")).rows;
    expect(lignes.find(x=>x.commune_code==='75056')).toMatchObject({interets:'1',biens_interesses:'1',demandes:'0'});
  });
  it("l’intérêt ne remplace pas une demande dans une zone déjà ouverte", async () => {
    await ouvrir(); await devenir(owner); await expect(essai("select public.reseau_signaler_interet($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/réseau est disponible/);
  });
  it("une commune non confirmée bloque le réseau et l’intérêt, sans empêcher la gestion", async () => {
    await postgres(); await db.query("update public.biens set commune_insee=null where id=$1",[paris.bien]); await devenir(owner);
    expect((await dispo()).etat).toBe('adresse_incomplete');
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
  it("une correction d’adresse invalide la confirmation antérieure", async () => {
    await postgres(); const b=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien vide','appartement','1 rue Test','91300','Massy','91377') returning id",[org]);
    await devenir(owner); await db.query("update public.biens set address_line1='2 rue Test' where id=$1",[b]); expect((await dispo(b)).etat).toBe('adresse_incomplete');
  });
  it("un appel direct ne crée ni consultation ni sollicitation dans une zone fermée", async () => {
    await devenir(owner); await expect(essai("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant')",[org,paris.incident])).rejects.toThrow(/pas encore disponible/);
    expect((await db.query("select id from public.incident_consultations where organization_id=$1",[org])).rows).toHaveLength(0);
    await postgres(); const c=await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,paris.incident]);
    await devenir(owner); await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/pas encore disponible/);
  });
  it("un artisan du carnet peut intervenir via le réseau dans une nouvelle commune confirmée", async () => {
    await postgres(); await db.query("insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)",[org,artisan]);
    await ouvrir('69123'); await devenir(owner);
    const proposes=(await db.query("select * from public.artisans_disponibles_bien($1,$2,'plomberie','entretien_courant')",[org,lyon.bien])).rows;
    expect(proposes).toHaveLength(1); expect(proposes[0].rattache).toBe(false);
    const c=await consultation(lyon.incident); const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    expect((await db.query("select origine_reseau,commune_reseau from public.incident_sollicitations where id=$1",[s])).rows[0]).toEqual({origine_reseau:'reseau',commune_reseau:'69123'});
  });
  it("la nouvelle demande a un destinataire validé de la bonne commune et conserve son origine", async () => {
    await ouvrir(); await devenir(owner);
    const proposes=(await db.query("select * from public.artisans_disponibles_bien($1,$2,'plomberie','entretien_courant')",[org,paris.bien])).rows;
    expect(proposes.map(a=>a.artisan_id)).toEqual([artisan]); const c=await consultation();
    const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    expect((await db.query("select artisan_id,origine_reseau,commune_reseau from public.incident_sollicitations where id=$1",[s])).rows[0]).toEqual({artisan_id:artisan,origine_reseau:'reseau',commune_reseau:'75056'});
    await devenir(sa); expect((await db.query("select demandes from public.reseau_pilotage('75','plomberie') where commune_code='75056'")).rows[0].demandes).toBe('1');
  });
  it.each(['privee','refuse','blacklist','sans_compte','sans_rattachement'])("si le dernier artisan devient %s, la zone ne reçoit plus de nouvelle demande", async (cause) => {
    await ouvrir(); await devenir(owner); const c=await consultation(); await postgres();
    if(cause==='privee') await db.query("update public.artisans set visibilite='privee' where id=$1",[artisan]);
    if(cause==='refuse') await db.query("update public.artisans set statut_plateforme='refuse',statut_motif='Refus de test motivé' where id=$1",[artisan]);
    if(cause==='blacklist') await db.query("update public.artisans set blacklist_globale_le=now(),blacklist_globale_motif='Test exclusion' where id=$1",[artisan]);
    if(cause==='sans_compte') await db.query("update public.artisans set account_id=null where id=$1",[artisan]);
    if(cause==='sans_rattachement') await db.query("delete from public.reseau_artisan_communes where artisan_id=$1",[artisan]);
    await devenir(owner); expect((await dispo()).etat).toBe('sans_artisan');
    await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,artisan])).rejects.toThrow(/plus disponible/);
    expect(await interet()).toBe(true);
  });
  it("l’assurance obligatoire reste un filtre : aucun destinataire pour des travaux non couverts", async () => {
    await ouvrir(); await devenir(owner); expect((await dispo(paris.bien,'plomberie','gros_oeuvre')).etat).toBe('sans_artisan');
    await expect(essai("select public.ouvrir_consultation($1,$2,'plomberie','gros_oeuvre')",[org,paris.incident])).rejects.toThrow(/Aucun artisan/);
  });
  it("la fermeture conserve demandes, accès artisan et dépôt d’un devis, mais bloque les suivantes", async () => {
    await ouvrir(); await ouvrir('75056','plomberie',secondArtisan); await devenir(owner); const c=await consultation();
    const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    await devenir(sa); await db.query("select public.reseau_regler_ouverture(array['75056'],'plomberie',false,false)");
    await devenir(owner); expect((await db.query("select id from public.incident_sollicitations where id=$1",[s])).rows).toHaveLength(1);
    expect((await db.query("select id from public.artisans where id=$1",[artisan])).rows).toHaveLength(1);
    await expect(essai("select public.solliciter_artisan($1,$2,$3)",[org,c,secondArtisan])).rejects.toThrow(/pas encore disponible/);
    await devenir(artisanCompte); expect((await db.query("select * from public.mes_sollicitations()")).rows.some(r=>r.sollicitation_id===s)).toBe(true);
    const devis=await id("select public.deposer_devis_structure($1,jsonb_build_array(jsonb_build_object('libelle','Réparation','quantite',1,'prix_unitaire_ht_cents',10000,'tva_bps',0)),'Joint usé','Changer le joint','Sous 7 jours','Une heure',null,null,null,null,null,null,null) id",[s]);
    await devenir(owner); expect(await id("select public.retenir_devis($1,$2) id",[org,devis])).toBeTruthy();
  });
  it("le carnet personnel fonctionne dans une commune fermée et garde son suivi", async () => {
    await postgres(); await db.query("insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)",[org,artisan]); await devenir(owner);
    expect((await dispo()).etat).toBe('fermee'); expect((await dispo()).nb_contacts).toBe('1');
    const c=await consultation(); const s=await id("select public.solliciter_artisan($1,$2,$3) id",[org,c,artisan]);
    expect((await db.query("select origine_reseau,commune_reseau from public.incident_sollicitations where id=$1",[s])).rows[0]).toEqual({origine_reseau:'carnet',commune_reseau:null});
  });
  it.each(['etranger','agent','locataire','artisan'])("%s ne peut pas consulter le réseau d’un bien hors de son périmètre ni y déposer un intérêt", async profil => {
    await devenir({etranger,agent,locataire,artisan:artisanCompte}[profil]!);
    await expect(essai("select * from public.reseau_disponibilite($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/Accès refusé/);
    await expect(essai("select public.reseau_signaler_interet($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/Accès refusé/);
    await expect(essai("select public.reseau_regler_ouverture(array['75056'],'plomberie',true,true)")).rejects.toThrow(/supervision/);
  });
  it("les fonctions internes et écritures directes ne sont pas accessibles à un utilisateur", async () => {
    await devenir(owner);
    for(const nom of ['artisans_affectables_interne','ouvrir_consultation_interne','solliciter_artisan_interne','reseau_artisan_eligible','reseau_verifier_acces_bien']) {
      const droits=(await db.query("select has_function_privilege('authenticated',p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[nom])).rows;
      expect(droits).not.toHaveLength(0); expect(droits.every(x=>!x.allowed)).toBe(true);
    }
    await expect(essai("insert into public.reseau_ouvertures(commune_code,metier,ouverte) values('75056','plomberie',true)")).rejects.toThrow(/permission denied/);
    await expect(essai("insert into public.reseau_interets(account_id,organization_id,bien_id,commune_code,metier) values($1,$2,$3,'75056','plomberie')",[owner,org,paris.bien])).rejects.toThrow(/permission denied/);
    await db.query("reset role"); await db.query("set local role anon"); await expect(essai("select * from public.reseau_disponibilite($1,$2,'plomberie')",[org,paris.bien])).rejects.toThrow(/permission denied/);
  });
});
