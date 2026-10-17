// Les tâches planifiées de la base (pg_cron) dans la sauvegarde (D07, AUD-C-02).
//
// POURQUOI. Les dix tâches SQL de Gerimmo (cycle mensuel des appels de loyer, alertes d'impayés, rétention,
// publications, caducité des devis, passage des urgences du relais) vivent dans `cron.job`, schéma `cron` : la sauvegarde ne copie que public, auth, storage et support_interne, et la
// procédure de reprise n'en parlait pas. Une restauration dans un projet neuf ne relançait donc ni les appels de
// loyer, ni les alertes, ni la rétention, ni le marketing — sans aucun signal.
//
// CE QUE FAIT CE FICHIER. Il lit `cron.job` avec psql (même mécanisme que pg_dump : mot de passe dans l'environnement
// du seul processus enfant, jamais en argument, même réglage TLS), valide la liste, et génère le script SQL qui
// recrée les tâches. Il n'écrit rien dans la base et n'exécute rien dessus.
//
// Ce qu'il ne fait PAS : il ne restaure pas pg_cron (extension de la plateforme), il n'active pas pg_net.
import { spawn } from 'node:child_process';

/** Le fichier chiffré de l'archive qui porte la liste des tâches. */
export const FICHIER_TACHES = 'taches-pg-cron.gcm';
/** Le script de rejeu, produit à l'extraction (en clair, dans le dossier privé de la reprise). */
export const FICHIER_REJEU = 'rejouer-pg-cron.sql';
/** La liste en clair, produite à l'extraction. */
export const FICHIER_TACHES_CLAIR = 'taches-pg-cron.json';

const SQL_PRESENCE = "select (to_regclass('cron.job') is not null)::text";
// to_jsonb(j) : les colonnes présentes sur la plateforme (jobid, database, username, active…) comme sur le banc local.
const SQL_TACHES = "select coalesce(jsonb_agg(to_jsonb(j) order by j.jobname), '[]'::jsonb)::text from cron.job j";

/** Lance psql sur une requête en lecture et rend sa sortie brute. Le message d'erreur ne cite jamais le mot de passe. */
export function lancerPsql({ args, env }, sql, commande = 'psql') {
  return new Promise((resoudre, rejeter) => {
    const enfant = spawn(commande, ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', ...args, '-c', sql],
      { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '', erreurs = '';
    enfant.stdout.on('data', m => { sortie += m.toString(); if (sortie.length > 16 * 1024 * 1024) { enfant.kill(); rejeter(new Error('Liste des tâches planifiées trop volumineuse.')); } });
    enfant.stderr.on('data', m => { erreurs += m.toString().slice(0, 2000); });
    enfant.on('error', () => rejeter(new Error('psql introuvable ou non exécutable.')));
    enfant.on('close', code => {
      if (code !== 0) return rejeter(new Error(`psql a échoué (code ${code}) : ${erreurs.trim().split('\n')[0] || 'sans message'}`));
      resoudre(sortie.trim());
    });
  });
}

/** Ne garde que ce qui sert à recréer une tâche, et refuse une liste invalide plutôt que de la sauvegarder de travers. */
export function normaliserTaches(brut) {
  if (!Array.isArray(brut)) throw new Error('Liste des tâches planifiées invalide.');
  const vues = new Set();
  const taches = brut.map(ligne => {
    const { jobname, schedule, command, active } = ligne ?? {};
    if (typeof jobname !== 'string' || !jobname || jobname.length > 200) throw new Error('Une tâche planifiée n’a pas de nom valide : sauvegarde interrompue.');
    if (typeof schedule !== 'string' || !schedule || schedule.length > 200) throw new Error('Une tâche planifiée n’a pas d’horaire valide : sauvegarde interrompue.');
    if (typeof command !== 'string' || !command || command.length > 100_000) throw new Error('Une tâche planifiée n’a pas de commande valide : sauvegarde interrompue.');
    if (vues.has(jobname)) throw new Error('Deux tâches planifiées portent le même nom : sauvegarde interrompue.');
    vues.add(jobname);
    return { jobname, schedule, command, active: active !== false };
  });
  return taches.sort((a, b) => (a.jobname < b.jobname ? -1 : a.jobname > b.jobname ? 1 : 0));
}

/**
 * Lit `cron.job`. Sans schéma `cron` (projet sans pg_cron), la liste est vide et le dit (`pg_cron: false`) ; toute autre
 * difficulté (droit refusé, connexion) interrompt la sauvegarde : une copie qui omet les tâches sans le dire recréerait
 * exactement le défaut que cette étape corrige.
 */
export async function exporterTachesPlanifiees(connexion, options = {}) {
  const present = await lancerPsql(connexion, SQL_PRESENCE, options.psql);
  if (present !== 'true') return { pg_cron: false, taches: [] };
  let brut;
  try { brut = JSON.parse(await lancerPsql(connexion, SQL_TACHES, options.psql)); }
  catch (e) { throw e instanceof SyntaxError ? new Error('Réponse illisible pour la liste des tâches planifiées.') : e; }
  return { pg_cron: true, taches: normaliserTaches(brut) };
}

const litteral = texte => `'${String(texte).replaceAll("'", "''")}'`;

/**
 * Le script SQL qui recrée les tâches sur une base restaurée. `verifierExtensions: false` (exercice de restauration, sur un
 * planificateur de façade) en retire la garde sur pg_cron et pg_net.
 */
export function genererRejeu(taches, { verifierExtensions = true } = {}) {
  const lignes = [
    '-- Rejeu des tâches planifiées (pg_cron) de Gerimmo, généré depuis la sauvegarde.',
    '-- À jouer sur le projet restauré, APRÈS la restauration et APRÈS avoir activé les extensions pg_cron et pg_net',
    '-- (Supabase : Database → Extensions), au moment de la reprise des traitements — pas avant : dès qu’elles existent,',
    '-- le cycle mensuel génère des appels de loyer, et le déclencheur marketing comme le passage des urgences du relais',
    '-- appellent le site enregistré en base.',
    '-- Chaque tâche est (re)créée sous son nom ; rejouer ce script ne crée pas de doublon.',
  ];
  if (verifierExtensions) {
    lignes.push(
      'do $rejeu$ begin',
      "  if not exists (select from pg_catalog.pg_extension where extname = 'pg_cron') then",
      "    raise exception 'pg_cron n''est pas activée : l''activer avant de rejouer les tâches planifiées';",
      '  end if;',
      "  if not exists (select from pg_catalog.pg_extension where extname = 'pg_net') then",
      "    raise warning 'pg_net n''est pas activée : le déclencheur marketing et le passage des urgences du relais ne partiront pas tant qu''elle ne l''est pas';",
      '  end if;',
      'end $rejeu$;'
    );
  }
  for (const t of taches) {
    lignes.push(`select cron.schedule(${litteral(t.jobname)}, ${litteral(t.schedule)}, ${litteral(t.command)});`);
    if (t.active === false) lignes.push(`select cron.alter_job((select jobid from cron.job where jobname = ${litteral(t.jobname)}), active := false);`);
  }
  return lignes.join('\n') + '\n';
}
