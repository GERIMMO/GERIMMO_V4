// Fixtures exclusivement dans les deux organisations et cinq comptes du
// chantier autonome. Les tests manuels ne peuvent pas ouvrir cette connexion.
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lireComptes, type Comptes } from './cible';

export type BaseRecette = {
  db: Client; comptes: Comptes; artisanId: string; artisanCompteId: string;
  locataireId: string; locataireCompteId: string; gerantId: string;
};
export async function avecBaseRecette<T>(faire: (base: BaseRecette) => Promise<T>): Promise<T> {
  const comptes = lireComptes(), env = process.env, url = new URL(env.RECETTE_URL ?? '');
  const local = ['127.0.0.1', 'localhost'].includes(env.PGHOST ?? '')
    && /^gerimmo_ci_[a-z_]+$/.test(env.PGDATABASE ?? '')
    && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  const production = env.PGHOST === 'aws-0-eu-west-3.pooler.supabase.com'
    && env.PGUSER === 'postgres.rddlxunppddzpsaatdaz' && env.PGDATABASE === 'postgres'
    && url.href === 'https://www.gerimmo.app/' && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_WORKFLOW === 'Recette de production avec nettoyage';
  if (env.RECETTE_AUTONOME !== '1' || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(comptes.suffixe) || !(local || production)) throw new Error('Fixtures réservées au chantier autonome isolé.');
  const db = new Client(production ? { ssl: { ca: fs.readFileSync(path.join(__dirname, 'supabase-ca.crt'), 'utf8'), rejectUnauthorized: true } } : {});
  await db.connect();
  try {
    await db.query('begin');
    const { rows: organisations } = await db.query('select id,name from public.organizations where id=any($1::uuid[])', [[comptes.orgAgence, comptes.orgProprietaire]]);
    if (organisations.length !== 2 || organisations.some(o => !new RegExp(`(^|[ -])${comptes.suffixe}$`).test(o.name))) throw new Error('Organisation extérieure au passage.');
    const { rows: utilisateurs } = await db.query('select id,email from auth.users where lower(email)=any($1::text[])', [Object.values(comptes.emails)]);
    if (utilisateurs.length !== 5) throw new Error('Comptes temporaires incomplets.');
    const uid = (persona: keyof Comptes['emails']) => utilisateurs.find(u => u.email === comptes.emails[persona])?.id as string;
    const gerantId = uid('admin'), artisanCompteId = uid('artisan'), locataireCompteId = uid('locataire');
    const { rows: adhesions } = await db.query("select account_id from public.memberships where organization_id=$1 and status='active' and ((account_id=$2 and role='admin_agence') or (account_id=$3 and role='locataire'))", [comptes.orgAgence, gerantId, locataireCompteId]);
    const { rows: artisans } = await db.query('select id from public.artisans where account_id=$1 and email=$2', [artisanCompteId, comptes.emails.artisan]);
    const { rows: personnes } = await db.query('select id from public.persons where account_id=$1 and organization_id=$2', [locataireCompteId, comptes.orgAgence]);
    if (adhesions.length !== 2 || artisans.length !== 1 || personnes.length !== 1) throw new Error('Périmètre métier temporaire incomplet.');
    const resultat = await faire({ db, comptes, gerantId, artisanCompteId, locataireCompteId, artisanId: artisans[0].id, locataireId: personnes[0].id });
    await db.query('commit');
    return resultat;
  } catch (erreur) { await db.query('rollback'); throw erreur; }
  finally { await db.end(); }
}

export async function preparerDossierIncident(base: BaseRecette, scenario: string) {
  if (!/^[a-z][a-z0-9-]{1,24}$/.test(scenario)) throw new Error('Scénario fictif invalide.');
  const { db, comptes, locataireId, gerantId, artisanId } = base;
  const orgId = comptes.orgAgence;
  const identifiant = async (sql: string, args: unknown[]) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const nom = `Recette ${scenario} ${comptes.suffixe}`;
  const mandant = await identifiant('insert into public.persons(organization_id,nom) values($1,$2) returning id', [orgId, nom]);
  const bienId = await identifiant("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'appartement','1 rue de la Recette','69001','Lyon') returning id", [orgId, nom]);
  const lotId = await identifiant("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id", [orgId, bienId, nom]);
  await db.query('insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)', [orgId, lotId, mandant]);
  const mandat = await identifiant("insert into public.mandats(organization_id,person_id,etat,date_debut,agent_account_id) values($1,$2,'brouillon',current_date-30,$3) returning id", [orgId, mandant, gerantId]);
  await db.query('insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,current_date-30)', [orgId, mandat, lotId]);
  await db.query("update public.mandats set etat='actif' where id=$1", [mandat]);
  const bailId = await identifiant("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [orgId, lotId, locataireId]);
  const numero = `INC-${scenario}-${randomUUID().slice(0,8)}`;
  const incidentId = await identifiant("insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation',$6,'qualifie','proprietaire','Vétusté fictive de recette') returning id", [orgId, numero, lotId, bailId, locataireId, nom]);
  return { orgId, bienId, lotId, bailId, incidentId, artisanId, numero };
}
