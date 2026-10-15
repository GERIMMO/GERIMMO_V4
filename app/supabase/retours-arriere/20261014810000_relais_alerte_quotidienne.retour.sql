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
-- RÉINTRODUIT le défaut corrigé (IA-02, IA-03) : plus aucune alerte e-mail quotidienne ; les urgences du mode vacances, les
-- tâches en échec ou absentes et l'arrêt d'urgence ne se voient de nouveau que si la console est ouverte.
-- ATTENTION : l'application candidate appelle ces fonctions (route /api/cron/relais, appelée par Vercel à 03 h et 04 h UTC)
-- et lit la table (écran « Relais et arrêts ») : sans elles, la route répond « contrôle indisponible » (503, aucun e-mail) et
-- l'écran dit « Le dernier passage du relais n'a pas pu être lu ». À retirer AVEC le code (route, entrées de vercel.json,
-- textes de la console), ou bien vider la variable GERIMMO_RELAIS_EMAILS d'abord pour que rien ne parte.
--
-- NE DÉFAIT PAS : les e-mails déjà envoyés. PERD : l'historique des passages (une ligne par jour, des nombres seulement), qui
-- disparaît avec la table ; il le dit en nombre avant de la supprimer.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

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

commit;
