// LA CHAÎNE DE PREUVE DES E-MAILS ET SES MAILLONS REJOUABLES.
//
// `empreinte_metier_courriel` et `finaliser_courriel_metier` sont des têtes de chaîne : chaque migration qui admet un
// nouveau type d'e-mail renomme la tête (« …_avant_<maillon> ») et pose la sienne, qui lui délègue tout autre type.
// Un maillon ne se défait donc que s'il est en tête : son retour se REFUSE tant qu'un maillon plus récent s'appuie
// sur lui (les retours se jouent du plus récent au plus ancien).
//
// Cette liste donne les maillons rejouables dans l'ordre du manifeste. Le test de chaque maillon s'en sert pour
// défaire d'abord les plus récents, puis les reposer — sans connaître leurs noms. Un maillon de plus = une ligne ici.
import { readFileSync } from "node:fs";
import type { Client } from "pg";

export const MAILLONS_CHAINE_COURRIELS = [
  "20261122130000_lien_garant_admis",
  "20261122200000_envois_automatiques_reglage",
] as const;

export type MaillonChaineCourriels = (typeof MAILLONS_CHAINE_COURRIELS)[number];

export const REFUS_RETOUR_HORS_ORDRE = /Retour refusé : une migration plus récente prolonge la chaîne des e-mails/;

/** Les maillons posés APRÈS celui-ci, dans l'ordre du manifeste. */
export function maillonsPlusRecents(nom: MaillonChaineCourriels): MaillonChaineCourriels[] {
  return MAILLONS_CHAINE_COURRIELS.slice(MAILLONS_CHAINE_COURRIELS.indexOf(nom) + 1);
}

const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");

/** Joue les retours des maillons plus récents, du plus récent au plus ancien : celui-ci redevient la tête. */
export async function defaireMaillonsPlusRecents(db: Client, nom: MaillonChaineCourriels): Promise<void> {
  for (const m of [...maillonsPlusRecents(nom)].reverse()) await db.query(retour(m));
}

/** Repose les maillons plus récents, dans l'ordre du manifeste. */
export async function reposerMaillonsPlusRecents(db: Client, nom: MaillonChaineCourriels): Promise<void> {
  for (const m of maillonsPlusRecents(nom)) await db.query(migration(m));
}

/** Les fonctions « …_maillon_… » ne vivent que le temps d'une migration : il n'en reste jamais. */
export async function maillonsEnAttente(db: Client): Promise<string[]> {
  const { rows } = await db.query<{ f: string }>(
    "select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' where p.proname ~ '^(empreinte|finaliser)_maillon_' order by 1",
  );
  return rows.map((r) => r.f);
}
