import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("Départ SI-06 — congé saisi après le dernier appel", () => {
  it("rend 188,67 € sur les 600 € de dépôt après 198 € de retenue et 213,33 € de dernier loyer", async () => {
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      await db.query("begin");
      const id = async (query: string, args: unknown[] = []): Promise<string> => (await db.query(query,args)).rows[0].id;
      const compte = await id("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(gen_random_uuid(),$1,'{}','{}') returning id",[randomUUID()+"@example.invalid"]);
      const org = await id("insert into organizations(name,type,status) values('SCI SI-06 fictive','proprietaire_direct','active') returning id");
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[compte,org]);
      const bien = await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble test','immeuble','Rue fictive','45000','Orléans',false) returning id",[org]);
      const lot = await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Appartement','loue') returning id",[org,bien]);
      // La personne morale est le bailleur juridique du lot, distinct du compte gestionnaire.
      const sci = await id("insert into persons(organization_id,nom,qualite,siren) values($1,'SCI SI-06','SCI','012345678') returning id",[org]);
      await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2026-01-01')",[org,lot,sci]);
      const personne = await id("insert into persons(organization_id,nom) values($1,'Locataire fictif') returning id",[org]);
      const bail = await id("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue,charges_mode) values($1,$2,$3,'nu','actif','2026-08-01',600,40,600,1,false,'provision') returning id",[org,lot,personne]);
      await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) select $1,$2,m,m,600,40,640 from generate_series('2026-08-01'::date,'2026-11-01'::date,interval '1 month') m",[org,bail]);
      await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) select organization_id,bail_id,montant_du,periode,'virement' from appels_loyer where bail_id=$1 and periode<'2026-11-01'",[bail]);
      const compteLocataire = await id("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(gen_random_uuid(),$1,'{}','{}') returning id",[randomUUID()+"@example.invalid"]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[compteLocataire,org]);
      await db.query("update persons set account_id=$1 where id=$2",[compteLocataire,personne]);
      const secondLot = await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Second logement','loue') returning id",[org,bien]);
      const secondBail = await id("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'nu','actif',current_date-60,410,0) returning id",[org,secondLot,personne]);
      await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,date_trunc('month',current_date-31),current_date-31,410,0,410)",[org,secondBail]);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role:"authenticated",aal:"aal2"})]);
      await db.query("set local role authenticated");
      // Actions du gestionnaire sur le même immeuble avant le congé.
      const incident = await id("select declarer_incident_bien_simple($1,$2,null,'Fuite des parties communes',current_date,'Essai local',gen_random_uuid()) id",[org,bien]);
      expect((await db.query("select bien_id from incidents where id=$1",[incident])).rows[0].bien_id).toBe(bien);
      const compteur = await id("insert into compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande) values($1,$2,$3,'eau_froide','m3','Eau SI-06',100,'2026-08-01','2026-09-01') returning id",[org,bien,lot]);
      const remplacer = () => id("select remplacer_compteur($1,$2,'2026-08-15',110,300,'NEUF-06') id",[org,compteur]);
      const neuf = await remplacer();
      expect(await remplacer()).toBe(neuf);
      await db.query("select enregistrer_releve_compteur($1,$2,315,'2026-09-01')",[org,neuf]);
      expect((await db.query("select ancien_id,nouveau_id from remplacements_compteur where ancien_id=$1",[compteur])).rows).toEqual([{ancien_id:compteur,nouveau_id:neuf}]);
      const contrat = await id("insert into contrats_fourniture(organization_id,bien_id,lot_id,fournisseur,categorie) values($1,$2,$3,'Eau fictive SI-06','eau') returning id",[org,bien,lot]);
      const justificatif = await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Facture SI-06',$1::uuid::text||'/si06.pdf','application/pdf',123,repeat('a',64)) returning id",[org]);
      const facture = await id("insert into factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents,consommation,unite_consommation) values($1,$2,$3,'EAU-SI06','2026-08-01','2026-09-01',6000,25,'m3') returning id",[org,contrat,justificatif]);
      const repartition = await id("select preparer_repartition_fourniture($1,$2,'Consommation relevée du lot SI-06','consommations') id", [facture, JSON.stringify([[compteur,"2026-08-01","2026-08-15"],[neuf,"2026-08-15","2026-09-01"]].map(([compteur_id,periode_debut,periode_fin])=>({lot_id:lot,bail_id:bail,compteur_id,periode_debut,periode_fin,poids:1,poids_fixe:1,recuperable:true})))]);
      const calcul = (await db.query("select statut,empreinte,total_recuperable_cents from repartitions_fourniture where id=$1",[repartition])).rows[0];
      expect(Number(calcul.total_recuperable_cents)).toBe(6000);
      expect(calcul.statut).not.toBe("validee");
      await db.query("select valider_repartition_fourniture($1,$2)",[repartition,calcul.empreinte]);
      const paiement = await id("select payer_facture_fourniture($1,$2,'2026-09-05') id",[org,facture]);
      expect(await id("select payer_facture_fourniture($1,$2,'2026-09-05') id",[org,facture])).toBe(paiement);
      await db.query("select public.encaisser_depot($1,600,'2026-08-01','virement',null,null)",[bail]);
      const edl=await id("insert into etats_des_lieux(organization_id,bail_id,type) values($1,$2,'entree') returning id",[org,bail]);
      await db.query("select generer_grille_edl($1)",[edl]);
      await db.query("update edl_lignes set etat='bon' where edl_id=$1",[edl]);
      await db.query("select signer_edl_avec_preuve($1,'pdf_signe',$2,'application/pdf',1000,gen_random_uuid()::text)",[edl,org+"/edl-test.pdf"]);
      await db.query("select enregistrer_conge($1,'locataire','2026-08-10',3::smallint)",[bail]);
      const restitution=await id("select demarrer_restitution($1,'2026-11-10',false) id",[bail]);
      await db.query("select ajouter_retenue($1,'Retenue fictive',198,10,0,null)",[restitution]);
      const dette = async (idBail: string) => (await db.query("select public.dette_recommande_ar24($1) dette",[idBail])).rows[0].dette;
      const avant = await dette(bail);
      expect(avant.total_centimes).toBe(21333);
      expect((await db.query("select bail_id from public.rappels_loyers_proprietaire($1)",[org])).rows.map(r=>r.bail_id)).toContain(bail);
      const appel = await id("select id from appels_loyer where bail_id=$1 and periode='2026-11-01'", [bail]);
      await db.query("select public.declarer_reception_loyer($1,$2,'non_recu',null,current_date,'virement',gen_random_uuid(),213.33)", [org,appel]);
      await db.query("reset role");
      const confirmation = async () => (await db.query("select public.confirmation_relance_proprietaire($1,'relance_1','2026-11-01') autorisee",[bail])).rows[0].autorisee;
      expect(await confirmation()).toBe(true);
      await db.query("set local role authenticated");
      const solde=(await db.query("select finaliser_decompte($1) solde",[restitution])).rows[0].solde;
      expect(Number(solde)).toBe(188.67);
      expect(Number((await db.query("select montant_du from appels_loyer where bail_id=$1 and periode='2026-11-01'",[bail])).rows[0].montant_du)).toBe(213.33);
      expect(Number((await db.query("select sum(montant) total from ecritures where bail_id=$1 and categorie='depot_garantie' and sens='depense'",[bail])).rows[0].total)).toBe(188.67);
      const demande = randomUUID();
      const nombreEncaissements = async () => (await db.query("select count(*) from encaissements where bail_id=$1",[bail])).rows[0].count;
      const encaissementsAvant = await nombreEncaissements();
      for (let tentative = 0; tentative < 2; tentative++) {
        const quittancement = await db.query("select public.encaisser_reste_atomique($1,$2,$3,$4,213.33,0) resultat",[org,bail,appel,demande]);
        expect(quittancement.rows[0].resultat.statut).toBe("au_decompte");
      }
      expect(await nombreEncaissements()).toBe(encaissementsAvant);
      expect(await dette(bail)).toEqual({total_centimes:0,echeances:[]});
      expect((await dette(secondBail)).total_centimes).toBe(41000);
      expect((await db.query("select bail_id from public.rappels_loyers_proprietaire($1)",[org])).rows).toEqual([{bail_id:secondBail}]);
      await db.query("reset role");
      expect(await confirmation()).toBe(false);
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compteLocataire,role:"authenticated"})]);
      const echeances = (await db.query("select montant_du::float8 montant,statut from mon_echeancier_locataire($1) where montant_couvert<montant_du",[org])).rows;
      expect(echeances).toHaveLength(2);
      expect(echeances).toEqual(expect.arrayContaining([{montant:213.33,statut:"au_decompte"},{montant:410,statut:"impaye"}]));
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role:"authenticated",aal:"aal2"})]);
      await expect(db.query("select finaliser_decompte($1)",[restitution])).rejects.toThrow(/déjà finalisé/);
    } finally { await db.query("rollback"); await db.end(); }
  });
});
