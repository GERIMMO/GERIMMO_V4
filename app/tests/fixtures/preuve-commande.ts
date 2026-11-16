import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";

/** Rejoue la preuve de Checkout avec la version explicitement choisie par le signataire. */
export async function lierCommandeFictive(db: Client, org: string, compte: string, sub: string, version: string) {
  const commande = randomUUID();
  await db.query(`insert into public.intentions_souscription(id,organization_id,empreinte,expire_le)
    values ($1,$2,repeat('a',64),now()+interval '1 hour')`, [commande,org]);
  await db.query(`insert into public.audit_log(organization_id,account_id,action,details,created_at)
    select $1,$2,'abonnement_commande_confirmee', jsonb_build_object(
      'commande',$3::text,'acceptation',c.id,'conditions_acceptees',c.version),a.souscrit_le
    from public.acceptations_cgu c join public.abonnements a on a.organization_id=$1
    where c.account_id=$2 and c.version=$4`, [org, compte, commande, version]);
  await db.query("select public.lier_preuve_commande($1,$2,$3,id) from acceptations_cgu where account_id=$4 and version=$5", [org, sub, commande, compte, version]);
}

/** Texte archivé du scénario. L’insertion passe par la vérification d’empreinte de PostgreSQL. */
export async function archiverConditionsFictives(db: Client, version: string) {
  const texte = `<p>Conditions du contrat fictif, version ${version}.</p>`;
  const empreinte = createHash("sha256").update(texte).digest("hex");
  await db.query(`insert into public.versions_conditions(document,version,date_effet,nature,texte_html,identite_editeur,empreinte_sha256,resume_modifications)
    values ('conditions_clients',$1,'2026-10-01','technique',$2,'{}',$3,'Version de recette')`, [version, texte, empreinte]);
}
