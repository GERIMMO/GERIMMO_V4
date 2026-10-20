-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014810000_relais_alerte_quotidienne.sql (D46-B, partie « alerte e-mail du relais »)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- La migration ne fait que CRÉER : une table (`relais_alertes_envois`, sa politique de lecture) et cinq fonctions
-- (`reserver_alerte_relais`, `terminer_alerte_relais`, `sentinelle_relais`, `cron_valeurs_champ`, `cron_derniere_echeance`).
-- Aucune fonction existante n'a été modifiée, aucune tâche pg_cron ajoutée : rien d'antérieur n'est à rétablir. Le retour les
-- supprime, sans cascade. Rejouable : `drop … if exists`.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014810000_relais_alerte_quotidienne.retour.sql
--
-- ORDRE : se joue le DERNIER du lot, après les retours de 20261014812000 puis de 20261014811000. Il REFUSE tant que le jeton
-- ou la tâche pg_cron `relais-urgences` de 812000 existe, ou tant que la file `relais_urgences` de 811000 existe.
--
-- RÉINTRODUIT le défaut corrigé (IA-02, IA-03) : plus aucune alerte e-mail quotidienne ; les urgences du mode vacances, les
-- tâches en échec ou absentes et l'arrêt d'urgence ne se voient de nouveau que si la console est ouverte.
-- ATTENTION : l'application candidate appelle ces fonctions (route /api/cron/relais, appelée par Vercel à 03 h et 04 h UTC)
-- et lit la table (écran « Relais et arrêts ») : sans elles, la route répond « contrôle indisponible » (503, aucun e-mail) et
-- l'écran dit « Le dernier passage du relais n'a pas pu être lu ». À retirer AVEC le code (route, entrées de vercel.json,
-- textes de la console), ou bien vider la variable GERIMMO_RELAIS_EMAILS d'abord pour que rien ne parte.
--
-- NE DÉFAIT PAS : les e-mails déjà envoyés. PERD : l'historique des passages (une ligne par jour, des nombres seulement), qui
-- disparaît avec la table ; il le dit en nombre avant de la supprimer.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Refus si le passage fréquent des urgences (20261014812000) est encore en place, par son jeton OU par sa tâche pg_cron :
-- il a complété des fonctions de ce lot. Défait après celui-ci, sa tâche `relais-urgences` resterait planifiée et appellerait
-- la route toutes les 10 minutes sans rien pouvoir envoyer, et son propre retour ne trouverait plus ces fonctions (« base
-- inattendue ») : on resterait bloqué. Son retour se joue d'abord.
do $retour_arriere$
declare v_tache boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists (select from cron.job where jobname = ''relais-urgences'')' into v_tache;
  end if;
  if to_regclass('public.declencheur_relais_urgences') is not null or v_tache then
    raise exception 'Retour arrière refusé : la migration 20261014812000 (passage fréquent des urgences du relais) est encore appliquée. Jouez d''abord son retour.';
  end if;
end $retour_arriere$;

-- Refus si l'e-mail immédiat des urgences (20261014811000) est encore en place : le lot se défait dans l'ordre inverse du
-- manifeste (812000, 811000, puis celui-ci). Son retour se joue d'abord.
do $retour_arriere$
begin
  if to_regclass('public.relais_urgences') is not null then
    raise exception 'Retour arrière refusé : la migration 20261014811000 (e-mail immédiat des urgences du relais) est encore appliquée. Jouez d''abord son retour.';
  end if;
end $retour_arriere$;

do $retour_arriere$
declare v_n bigint;
begin
  if to_regclass('public.relais_alertes_envois') is not null then
    execute 'select count(*) from public.relais_alertes_envois' into v_n;
    raise notice 'Retour arrière : % passage(s) du relais retiré(s) avec la table relais_alertes_envois.', v_n;
  end if;
end $retour_arriere$;

-- Les fonctions d'abord (la sentinelle appelle le calcul d'échéance, qui appelle la lecture des champs), puis la table.
-- SANS cascade : une dépendance inattendue arrête tout.
drop function if exists public.sentinelle_relais();
drop function if exists public.terminer_alerte_relais(date, text, integer, integer, integer, jsonb);
drop function if exists public.reserver_alerte_relais();
drop function if exists public.cron_derniere_echeance(text, timestamptz, interval, text);
drop function if exists public.cron_valeurs_champ(text, integer, integer);
drop table if exists public.relais_alertes_envois;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014810000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
