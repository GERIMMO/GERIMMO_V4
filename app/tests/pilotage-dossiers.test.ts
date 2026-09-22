import { config } from "dotenv";
import { Client } from "pg";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:".env.local"});const DB_URL=process.env.SUPABASE_DB_URL;verifierBaseDeTest(DB_URL);
describe.skipIf(!DB_URL)("Pilotage des dossiers et continuité",()=>{
 let db:Client, org:string, autreOrg:string, admin:string, autreAdmin:string, sa:string, relais:string, relaisEmail:string, incident:string, incidentB:string, bail:string, appel:string;
 const id=async(sql:string,args:unknown[]=[]) => (await db.query<{id:string}>(sql,args)).rows[0].id;
 const utilisateur=()=>id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
 values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-pilotage-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
 const agir=async(compte:string|null,aal="aal2",role="authenticated")=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role,aal})]);await db.query(`set local role ${role}`);};
 const refus=async(sql:string,args:unknown[]=[])=>{await db.query("savepoint refus");try{await db.query(sql,args);return "";}catch(e){await db.query("rollback to savepoint refus");return (e as Error).message;}finally{await db.query("release savepoint refus");}};
 const lot=async(org:string)=>{const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien pilotage','appartement','1 rue du Test','75001','Paris') returning id",[org]);return id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot pilotage') returning id",[org,bien]);};
 const actualiser=()=>db.query("select public.actualiser_orchestration() n");
 beforeAll(async()=>{
  db=new Client({connectionString:DB_URL});await db.connect();await db.query("begin");
  org=await id("insert into public.organizations(name,status,type) values('Pilotage A','active','agence') returning id");autreOrg=await id("insert into public.organizations(name,status,type) values('Pilotage B','active','agence') returning id");
  [admin,autreAdmin,sa,relais]=[await utilisateur(),await utilisateur(),await utilisateur(),await utilisateur()];
  relaisEmail=(await db.query("select email from public.accounts where id=$1",[relais])).rows[0].email;
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,null,'super_admin')",[admin,org,autreAdmin,autreOrg,sa]);
  const lotA=await lot(org),lotB=await lot(autreOrg);
  const personne=await id("insert into public.persons(organization_id,nom) values($1,'Locataire fictif') returning id",[org]);
  bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon',current_date,700,50) returning id",[org,lotA,personne]);
  appel=await id("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,current_date,700,50,750,current_date) returning id",[org,bail]);
  const creerIncident=(org:string,lot:string)=>id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description) values($1,$2,'INC-PILOTAGE','agence','plomberie_canalisation','Incident fictif de pilotage') returning id",[org,lot]);
  incident=await creerIncident(org,lotA);incidentB=await creerIncident(autreOrg,lotB);
 });
 afterAll(async()=>{await db?.query("rollback");await db?.end();});beforeEach(async()=>{await db.query("savepoint cas");});afterEach(async()=>{await db.query("rollback to savepoint cas");await db.query("release savepoint cas");});
 it("est idempotent et retire la tâche active quand le dossier est clos",async()=>{
  await agir(null,"aal1","service_role");expect((await actualiser()).rows[0].n).toBeGreaterThan(0);expect((await actualiser()).rows[0].n).toBe(0);
  const avant=(await db.query("select id,updated_at from public.orchestration_cases where dossier_id=$1",[incident])).rows[0];await actualiser();expect((await db.query("select id,updated_at from public.orchestration_cases where dossier_id=$1",[incident])).rows[0]).toEqual(avant);
  await db.query("update public.incidents set etat='clos',clos_le=now(),cloture_motif='sans_suite' where id=$1",[incident]);await actualiser();expect((await db.query("select etat from public.orchestration_cases where dossier_id=$1",[incident])).rows[0].etat).toBe("termine");
 });
 it("refuse le moteur aux agences et ne montre que leur propre file",async()=>{
  await agir(null,"aal1","service_role");await actualiser();
  for(const acteur of [null,admin,autreAdmin]){await agir(acteur);expect(await refus("select public.actualiser_orchestration()")).toMatch(/supervision/i);}
  await agir(admin);expect((await db.query("select id from public.orchestration_cases where dossier_id=$1",[incident])).rows).toHaveLength(1);expect((await db.query("select id from public.orchestration_cases where dossier_id=$1",[incidentB])).rows).toHaveLength(0);
  await agir(sa,"aal1");expect(await refus("select public.actualiser_orchestration()")).toMatch(/supervision/i);
 });
 it("ne compte pas une origine inconnue et distingue action humaine, automatique et lecture",async()=>{
  expect((await db.query("select id from public.automation_events where dossier_id=$1",[bail])).rows).toHaveLength(0);
  const evenement="insert into public.incident_evenements(organization_id,incident_id,type,acteur_account_id) values($1,$2,'qualification',$3) returning id";
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:"authenticated",aal:"aal2"})]);await id(evenement,[org,incident,admin]);
  await agir(null,"aal1","service_role");await id(evenement,[org,incident,null]);
  const mesures=(await db.query("select origine,sans_appel,clics_evites from public.automation_events where dossier_id=$1 order by origine",[incident])).rows;
  expect(mesures).toEqual([{origine:"automatique",sans_appel:null,clics_evites:0},{origine:"humaine",sans_appel:null,clics_evites:0}]);
  await db.query("select * from public.incidents where id=$1",[incident]);expect((await db.query("select id from public.automation_events where dossier_id=$1",[incident])).rows).toHaveLength(2);
 });
 it("ne mesure qu’une fois la confirmation d’un avis de loyer envoyé",async()=>{
  await agir(null,"aal1","service_role");await db.query("update public.appels_loyer set email_envoye_at=now() where id=$1",[appel]);await db.query("update public.appels_loyer set email_envoye_at=now()+interval '1 minute' where id=$1",[appel]);
  const messages=(await db.query("select origine,messages_envoyes from public.automation_events where cle_unique=$1",[`appels_loyer:${appel}:premier_envoi`])).rows;expect(messages).toEqual([{origine:"automatique",messages_envoyes:1}]);
 });
 const mesurer=async(orgId:string|null=org)=>(await db.query("select public.mesures_automatisation($1) m",[orgId])).rows[0].m;
 it("agrège plus de mille résultats et exclut ceux de plus de trente jours",async()=>{
  await db.query("insert into public.automation_events(organization_id,origine,domaine,action,messages_envoyes) select $1,'automatique','message','Test',1 from generate_series(1,1001)",[org]);
  await db.query("insert into public.automation_events(organization_id,origine,domaine,action,created_at) values($1,'humaine','document','Ancien',now()-interval '31 days'),($1,'humaine','document','Récent',now())",[org]);
  await agir(admin);const m=await mesurer();expect(m.automatiques).toBe(1001);expect(m.humaines).toBe(1);expect(m.messages).toBe(1001);expect(m.organisations).toHaveLength(1);
 });
 it("ne révèle ni résultats ni noms des autres agences",async()=>{
  await db.query("insert into public.automation_events(organization_id,origine,domaine,action) values($1,'automatique','location','Test A'),($2,'automatique','location','Test B')",[org,autreOrg]);
  await agir(admin);expect((await mesurer(null)).organisations.map((o:{organization_id:string})=>o.organization_id)).toEqual([org]);const m=await mesurer(autreOrg);expect(m.automatiques).toBe(0);expect(m.organisations).toEqual([]);
 });
 it("ne compte que les confirmations de contact récentes",async()=>{
  await db.query("insert into public.dossier_contacts(organization_id,incident_id,appel_necessaire,note,cree_par,created_at) values($1,$2,false,'Sans appel test',$3,now()-interval '31 days'),($4,$5,true,'Appel test',$6,now())",[org,incident,admin,autreOrg,incidentB,autreAdmin]);
  await agir(sa);const m=await mesurer(null);expect(m.sans_appel).toBe(0);expect(m.avec_appel).toBe(1);
 });
 const quittance=async(mois:number)=>{
  const appelQ=await id("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,(date_trunc('month',now())-make_interval(months=>$3))::date,700,50,750,current_date) returning id",[org,bail,mois]);
  return id("insert into public.quittances(organization_id,bail_id,appel_id,montant) values($1,$2,$3,750) returning id",[org,bail,appelQ]);
 };
 it("compte un envoi groupé par mois terminé et exclut mois courant, trace absente et envoi humain",async()=>{
  const auto=await quittance(1),manuel=await quittance(2),absent=await quittance(3),courant=await quittance(0);
  const autreLot=await lot(org),personne=await id("insert into public.persons(organization_id,nom) values($1,'Second locataire fictif') returning id",[org]);
  const autreBail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon',current_date,700,50) returning id",[org,autreLot,personne]);
  const autreAppel=await id("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,(date_trunc('month',now())-interval '1 month')::date,700,50,750,current_date) returning id",[org,autreBail]);
  const seconde=await id("insert into public.quittances(organization_id,bail_id,appel_id,montant) values($1,$2,$3,750) returning id",[org,autreBail,autreAppel]);
  await agir(null,"aal1","service_role");await db.query("update public.quittances set email_envoye_at=now() where id=any($1::uuid[])",[[auto,courant,seconde]]);
  await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:'authenticated',aal:'aal2'})]);await db.query("update public.quittances set email_envoye_at=now() where id=$1",[manuel]);
  await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("update public.quittances set email_envoye_at=now() where id=$1",[absent]);
  await agir(admin);expect((await mesurer()).clics_minimum).toBe(1);
  await db.query("reset role");await db.query("update public.automation_events set created_at=now()-interval '31 days' where cle_unique=$1",[`quittances:${auto}:premier_envoi`]);await agir(admin);expect((await mesurer()).clics_minimum).toBe(0);
 });
 it("mesure un document sans conserver son titre ou son chemin",async()=>{
  await agir(null,"aal1","service_role");const doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,(select enum_range(null::public.document_type))[1],'Contenu privé','chemin-prive','application/pdf',100,gen_random_uuid()::text) returning id",[org]);
  const e=(await db.query("select origine,action,details from public.automation_events where cle_unique=$1",[`mesure:documents:${doc}:Document classé`])).rows;expect(e).toEqual([{origine:'automatique',action:'Document classé',details:{source:'resultat_metier'}}]);
 });
 it("prépare un rapport une seule fois après clôture, sans le valider ni l’envoyer",async()=>{
  const mandat=await id("insert into public.mandats(organization_id,person_id,etat,date_debut) select organization_id,locataire_principal,'actif',current_date-interval '2 months' from public.baux where id=$1 returning id",[bail]);
  await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part,date_debut) select organization_id,lot_id,locataire_principal,100,current_date-interval '2 months' from public.baux where id=$1",[bail]);
  await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,date_debut) select organization_id,$2,lot_id,current_date-interval '2 months' from public.baux where id=$1",[bail,mandat]);
  await agir(null,"aal1","service_role");expect((await db.query("select public.preparer_rapports_automatiques() n")).rows[0].n).toBe(0);
  await db.query("insert into public.clotures_comptables(organization_id,mois) values($1,(date_trunc('month',now())-interval '1 month')::date)",[org]);
  expect((await db.query("select public.preparer_rapports_automatiques() n")).rows[0].n).toBe(1);expect((await db.query("select public.preparer_rapports_automatiques() n")).rows[0].n).toBe(0);
  expect((await db.query("select statut,envoye_le,versement_date from public.rapports_gestion where mandat_id=$1",[mandat])).rows).toEqual([{statut:'a_valider',envoye_le:null,versement_date:null}]);
  await actualiser();expect((await db.query("select id from public.orchestration_cases where dossier_type='rapport' and organization_id=$1",[org])).rows).toHaveLength(1);
  await agir(admin);expect(await refus("select public.preparer_rapports_automatiques()")).toMatch(/permission|autorisation/i);
 });
 it("réserve les commandes à la supervision et empêche les passages concurrents",async()=>{
  await agir(admin);expect(await refus("select public.regler_mission('appels',false)")).toMatch(/supervision/i);
  await agir(sa,'aal1');expect(await refus("select public.regler_mission('appels',false)")).toMatch(/supervision/i);
  await agir(sa);await db.query("select public.regler_mission('appels',false)");
  await agir(null,'aal1','service_role');expect((await db.query("select public.commencer_mission('appels') id")).rows[0].id).toBeNull();
  await agir(sa);await db.query("select public.regler_mission('appels',true)");await agir(null,'aal1','service_role');const passage=await id("select public.commencer_mission('appels') id");expect((await db.query("select public.commencer_mission('appels') id")).rows[0].id).toBeNull();
  await db.query("update public.agent_passages set expiration=now()-interval '1 second' where id=$1",[passage]);const suivant=await id("select public.commencer_mission('appels') id");expect(suivant).not.toBe(passage);
  await db.query("select public.terminer_mission($1,true,1)",[passage]);expect((await db.query("select etat from public.agent_passages where id=$1",[passage])).rows[0].etat).toBe('interrompu');
  await db.query("select public.terminer_mission($1,true,2)",[suivant]);expect((await db.query("select etat,compte from public.agent_passages where id=$1",[suivant])).rows[0]).toEqual({etat:'reussi',compte:2});
  await agir(admin);expect((await db.query("select * from public.agent_passages")).rows).toEqual([]);
 });
 it("ne permet plus de contourner le devis structuré par l’ancien dépôt",async()=>{
  await agir(admin);expect((await db.query("select has_function_privilege(current_user,'public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)','execute') autorise")).rows[0].autorise).toBe(false);
 });
 it("le plan de continuité n’accorde jamais de nouveaux droits",async()=>{
  await agir(admin);expect(await refus("select public.enregistrer_plan_continuite($1,7,'Consignes')",[relaisEmail])).toMatch(/supervision/i);
  await agir(sa);expect(await refus("select public.enregistrer_plan_continuite($1,7,'Consignes')",[relaisEmail])).toMatch(/habilité/i);await db.query("select public.enregistrer_plan_continuite('',7,'Conserver les validations sensibles')");
  expect((await db.query("select public.etat_continuite() p")).rows[0].p.responsable_habilite).toBe(false);

 });
 it("prépare une seule idée territoriale sans diffusion ni budget",async()=>{
  await agir(admin);expect(await refus("select public.preparer_recrutement_territorial('75','artisans','Paris','Compléter les métiers disponibles')")).toMatch(/permission|autorisation/i);
  await agir(null,'aal1','service_role');const sql="select public.preparer_recrutement_territorial('75','artisans','Paris','Compléter les métiers disponibles') id";
  const proposition=await id(sql);expect(proposition).toBeTruthy();expect((await db.query(sql)).rows[0].id).toBeNull();
  expect((await db.query("select statut,budget_cents,meta_campaign_id,publication_prevue_le from public.marketing_campagnes where id=$1",[proposition])).rows[0]).toEqual({statut:'idee',budget_cents:0,meta_campaign_id:null,publication_prevue_le:null});
 });
 it("signale une absence une seule fois et exige un remplaçant encore habilité",async()=>{
  await db.query("insert into public.memberships(account_id,role,status) values($1,'super_admin','active')",[relais]);
  await agir(sa);await db.query("select public.enregistrer_plan_continuite($1,7,'Continuer les tâches autorisées')",[relaisEmail]);expect((await db.query("select public.etat_continuite() p")).rows[0].p.responsable_habilite).toBe(true);
  await db.query('reset role');await db.query("insert into public.supervision_presence(account_id,derniere_presence) values($1,now()-interval '8 days') on conflict(account_id) do update set derniere_presence=excluded.derniere_presence",[sa]);
  await db.query("update public.supervision_presence set derniere_presence=now()-interval '8 days'");
  await agir(null,'aal1','service_role');await db.query('select public.surveiller_continuite()');const premier=(await db.query('select absence_signalee_le from public.continuity_plan')).rows[0].absence_signalee_le;expect(premier).toBeTruthy();await db.query('select public.surveiller_continuite()');expect((await db.query('select absence_signalee_le from public.continuity_plan')).rows[0].absence_signalee_le).toEqual(premier);
  await db.query("update public.memberships set status='inactive' where account_id=$1 and role='super_admin'",[relais]);
  await agir(sa);expect((await db.query('select public.etat_continuite() p')).rows[0].p.responsable_habilite).toBe(false);
 });
 it("réserve création et révocation au permanent avec double vérification",async()=>{
  const sql="select public.creer_relais_supervision($1,7,'Absence temporaire test') id";
  for(const acteur of [null,admin,relais]){await agir(acteur);expect(await refus(sql,[relaisEmail])).toMatch(/permanent/i);}
  await agir(sa,"aal1");expect(await refus(sql,[relaisEmail])).toMatch(/permanent/i);
  await agir(sa);const delegation=await id(sql,[relaisEmail]);await agir(admin);expect(await refus("select public.revoquer_relais_supervision($1)",[delegation])).toMatch(/permanent/i);await agir(sa);await db.query("select public.revoquer_relais_supervision($1)",[delegation]);await agir(relais);expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
 });
 it("refuse les durées hors limites et le relais sur son propre compte",async()=>{
  await agir(sa);for(const jours of [null,0,91,-1])expect(await refus("select public.creer_relais_supervision($1,$2,'Absence temporaire')",[relaisEmail,jours])).toMatch(/1 à 90/i);
  const propre=(await db.query("select email from public.accounts where id=$1",[sa])).rows[0].email;expect(await refus("select public.creer_relais_supervision($1,1,'Absence temporaire')",[propre])).toMatch(/autre compte/i);
 });
 it("le relais consulte une synthèse sans accéder aux dossiers et expire effectivement",async()=>{
  await agir(null,"aal1","service_role");await actualiser();await agir(sa);const delegation=await id("select public.creer_relais_supervision($1,1,'Absence temporaire') id",[relaisEmail]);
  await agir(relais);const synthese=(await db.query("select * from public.resume_relais_supervision()")).rows;expect(synthese.length).toBeGreaterThan(0);expect(Object.keys(synthese[0]).sort()).toEqual(["a_traiter","en_attente","famille","urgents"]);
  expect((await db.query("select id from public.orchestration_cases where organization_id=$1",[org])).rows).toHaveLength(0);expect((await db.query("select public.is_super_admin() sa")).rows[0].sa).toBe(false);
  await agir(relais,"aal1");expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
  await agir(sa);await db.query("select public.revoquer_relais_supervision($1)",[delegation]);
  await db.query("insert into public.supervision_delegations(account_id,commence_le,termine_le,pouvoirs,motif,cree_par) values($1,now()-interval '2 days',now()-interval '1 day',array['lecture'],'Relais expiré de test',$2)",[relais,sa]);
  await agir(relais);expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
 });
});
