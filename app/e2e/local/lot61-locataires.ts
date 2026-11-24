import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { baseApiFictive } from "./base-api-fictive";

// PHASE 3, LOT 61 (REPRISE) — LES DOSSIERS FICTIFS DU PARCOURS « ESPACE DU LOCATAIRE ».
//
// Le parcours du lot 61 lisait l'état laissé par les autres parcours et sautait son contrôle quand cet état manquait
// (M6). Il pose désormais LUI-MÊME ce qu'il vérifie : un espace fictif neuf par cas (jamais un espace partagé avec un
// autre parcours), avec son logement, son bailleur et son locataire. Base fictive locale uniquement ; rien n'est
// envoyé (aucun e-mail, aucun paiement réel) ; rien n'est supprimé à la fin : chaque espace porte une marque unique.

export type EspaceLot61 = { org: string; lot: string; bailleur: string; marque: string };
export type LocataireLot61 = { compte: string; personne: string; bail: string; email: string; mot: string };

const un = async (db: Client, sql: string, args: unknown[]) => String((await db.query(sql, args)).rows[0].id);

/**
 * Un espace fictif : une agence ou un propriétaire qui gère lui-même, avec un logement et son bailleur.
 * `profilComplet` faux : l'adresse de l'espace n'est pas renseignée — ses quittances sont retenues (« en préparation »).
 */
export async function creerEspaceLot61(db: Client, type: "agence" | "proprietaire_direct", profilComplet: boolean): Promise<EspaceLot61> {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const org = randomUUID(), marque = org.slice(0, 8);
  await db.query("begin");
  try {
    await db.query("select public.tache_systeme()");
    await db.query(
      `insert into organizations(id,name,type,status,address_line1,postal_code,city,telephone,email_contact)
       values($1,$2,$3,'active',$4,$5,$6,'0400000000',$7)`,
      [org, `${type === "agence" ? "ESSAI Agence" : "ESSAI Parc"} lot 61 ${marque}`, type,
        profilComplet ? "12 rue des Essais" : null, profilComplet ? "69003" : null, profilComplet ? "Lyon" : null, `lot61-${marque}@example.invalid`]);
    const bien = await un(db, "insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'appartement','8 avenue des Essais','69003','Lyon') returning id", [org, `ESSAI lot 61 ${marque}`]);
    const lot = await un(db, "insert into lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'disponible') returning id", [org, bien, `ESSAI lot 61 ${marque} — T2`]);
    const bailleur = await un(db, "insert into persons(organization_id,nom,prenom,qualite,address_line1,postal_code,city) values($1,'Fictive','Jeanne','Personne physique','12 rue des Essais','69003','Lyon') returning id", [org]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, bailleur]);
    await db.query("commit");
    return { org, lot, bailleur, marque };
  } catch (erreur) {
    await db.query("rollback");
    throw erreur;
  }
}

/** Le profil de l'espace est complété (ou vidé) : ce que fait le gestionnaire depuis ses réglages. */
export async function reglerAdresseEspaceLot61(db: Client, org: string, complet: boolean) {
  await db.query("begin");
  try {
    await db.query("select public.tache_systeme()");
    await db.query("update organizations set address_line1=$2, postal_code=$3, city=$4 where id=$1",
      [org, complet ? "12 rue des Essais" : null, complet ? "69003" : null, complet ? "Lyon" : null]);
    await db.query("commit");
  } catch (erreur) {
    await db.query("rollback");
    throw erreur;
  }
}

/** Un compte fictif, sa fiche dans l'espace et son adhésion de locataire (active, ou inactive pour un ancien locataire). */
async function creerOccupant(db: Client, espace: EspaceLot61, prenom: string, adhesion: "active" | "inactive") {
  const email = `lot61-${prenom.toLowerCase()}-${randomUUID()}@example.invalid`, mot = `${randomUUID()}!A`;
  const compte = await un(db,
    `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
       created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,
       extensions.crypt($2,extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','') returning id`, [email, mot]);
  await db.query("insert into memberships(organization_id,account_id,role,status) values($1,$2,'locataire',$3)", [espace.org, compte, adhesion]);
  const personne = await un(db, "insert into persons(organization_id,account_id,nom,prenom,email) values($1,$2,'Essai',$3,$4) returning id", [espace.org, compte, prenom, email]);
  return { compte, personne, email, mot };
}

/**
 * Le locataire du logement de l'espace. `bail` : « actif » (bail en cours depuis trois mois, aucun terme appelé, aucun
 * reçu) ou « termine » (bail fini le mois dernier, adhésion inactive : un ancien locataire).
 */
export async function creerLocataireLot61(db: Client, espace: EspaceLot61, bail: "actif" | "termine"): Promise<LocataireLot61> {
  await db.query("begin");
  try {
    await db.query("select public.tache_systeme()");
    const occupant = await creerOccupant(db, espace, bail === "actif" ? "Zoe" : "Ancien", bail === "actif" ? "active" : "inactive");
    const id = bail === "actif"
      ? await un(db, "insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'actif',current_date-90,600,40,1) returning id", [espace.org, espace.lot, occupant.personne])
      : await un(db, "insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,date_fin,loyer_hc,charges,jour_echeance) values($1,$2,$3,'termine',current_date-400,current_date-30,600,40,1) returning id", [espace.org, espace.lot, occupant.personne]);
    if (bail === "actif") await db.query("update lots set etat='loue' where id=$1", [espace.lot]);
    await db.query("commit");
    return { ...occupant, bail: id };
  } catch (erreur) {
    await db.query("rollback");
    throw erreur;
  }
}

/**
 * Le terme du mois en cours, appelé pour une échéance qui n'est PAS ENCORE ARRIVÉE (dans trois jours) : 640 € (600 € de
 * loyer, 40 € de charges). `verse` : ce que le locataire a déjà payé sur ce terme (0 : rien, donc aucun reçu).
 */
export async function appelerTermeNonEchu(db: Client, espace: EspaceLot61, bail: string, verse: number) {
  await db.query("begin");
  try {
    await db.query("select public.tache_systeme()");
    await db.query(
      `insert into appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance)
       values($1,$2,date_trunc('month',public.aujourdhui_paris())::date,600,40,640,public.aujourdhui_paris()+3)`, [espace.org, bail]);
    if (verse > 0) await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,$3,public.aujourdhui_paris(),'virement')", [espace.org, bail, verse]);
    await db.query("commit");
  } catch (erreur) {
    await db.query("rollback");
    throw erreur;
  }
}

/**
 * Un colocataire du même bail (cotitulaire), et une demande déclarée par le locataire PRINCIPAL, avec une intervention
 * acceptée par l'artisan fictif et un message de l'artisan dans la discussion. Le colocataire n'est pas le déclarant.
 */
export async function creerColocataireEtDemande(db: Client, espace: EspaceLot61, principal: LocataireLot61) {
  await db.query("begin");
  try {
    await db.query("select public.tache_systeme()");
    const colocataire = await creerOccupant(db, espace, "Colocataire", "active");
    await db.query("insert into bail_personnes(organization_id,bail_id,person_id,role) values($1,$2,$3,'colocataire')", [espace.org, principal.bail, colocataire.personne]);
    const { rows: [artisan] } = await db.query("select a.id, a.account_id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    await db.query("insert into artisan_agences(organization_id,artisan_id) values($1,$2) on conflict do nothing", [espace.org, artisan.id]);
    const incident = randomUUID(), intervention = randomUUID();
    await db.query(
      `insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
       values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation','ESSAI lot 61 : évier bouché','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')`,
      [incident, espace.org, espace.lot, principal.bail, principal.personne, `INC-${espace.marque}`]);
    await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [intervention, espace.org, incident, artisan.id]);
    await db.query("insert into intervention_messages(intervention_id,auteur_id,auteur_role,texte,commande) values($1,$2,'artisan','ESSAI lot 61 : je passe jeudi matin, qui sera présent ?',gen_random_uuid())", [intervention, artisan.account_id]);
    await db.query("commit");
    return { ...colocataire, incident, intervention };
  } catch (erreur) {
    await db.query("rollback");
    throw erreur;
  }
}
