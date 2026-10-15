-- RETOUR ARRIÈRE de 20261014811000_relais_urgences_immediates.sql (D46-B, « envoi immédiat pour les urgences », 15/10/2026)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- La migration ne fait que CRÉER : deux tables (`relais_urgences`, la file ; `relais_urgences_envois`, les envois), leurs
-- politiques de lecture, six fonctions (`nature_urgence_relais`, `relais_urgence_a_envoyer`, `prendre_urgences_relais`,
-- `terminer_urgences_relais`, `urgences_relais_recentes`, `urgences_relais_au_quotidien`) et un déclencheur AFTER INSERT
-- (`relais_urgence_a_envoyer`) sur `supervision_alertes_internes`. Aucune fonction existante n'a été modifiée, aucune tâche
-- pg_cron ajoutée : rien d'antérieur n'est à rétablir. Le retour les supprime, sans cascade. Rejouable : `drop … if exists`.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014811000_relais_urgences_immediates.retour.sql
--
-- RÉINTRODUIT ce que la décision du 15/10 corrigeait : une urgence du mode vacances n'est plus envoyée sur le moment ; elle
-- n'est plus signalée que par l'e-mail quotidien de 5 h (20261014810000), s'il reste en place, et par la console.
-- ATTENTION : l'application candidate appelle ces fonctions (chaque passage de mission, le passage de 5 h, les gestes
-- « Actualiser » et « Signaler une urgence interne » de la console). Sans elles, l'envoi immédiat échoue en silence (il est
-- conçu pour ne jamais bloquer : la mission, le passage de 5 h et le geste continuent), et l'e-mail de 5 h dit que « les
-- urgences des dernières 24 h n'ont pas pu être lues ». À retirer AVEC le code, ou vider d'abord GERIMMO_RELAIS_EMAILS.
-- À jouer AVANT le retour de 20261014810000 si les deux doivent être défaits (même lot).
--
-- NE DÉFAIT PAS : les e-mails déjà envoyés ; les alertes de la console (`supervision_alertes_internes`, intactes). PERD :
-- la file et l'historique des envois immédiats (des natures, des heures et des nombres), qui disparaissent avec les tables ;
-- il le dit en nombre avant de les supprimer, dont les urgences qui attendaient encore leur e-mail immédiat.

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
declare v_file bigint; v_attente bigint; v_envois bigint;
begin
  if to_regclass('public.relais_urgences') is not null then
    execute 'select count(*), count(*) filter (where statut in (''a_envoyer'', ''en_envoi'')) from public.relais_urgences' into v_file, v_attente;
    raise notice 'Retour arrière : % urgence(s) retirée(s) de la file, dont % qui attendai(en)t encore leur e-mail immédiat (elles restent dans la console).', v_file, v_attente;
  end if;
  if to_regclass('public.relais_urgences_envois') is not null then
    execute 'select count(*) from public.relais_urgences_envois' into v_envois;
    raise notice 'Retour arrière : % envoi(s) immédiat(s) retiré(s) avec la table relais_urgences_envois.', v_envois;
  end if;
end $retour_arriere$;

-- Le déclencheur d'abord (plus rien n'entre dans la file), puis les fonctions, puis les tables (la file cite les envois).
-- SANS cascade : une dépendance inattendue arrête tout.
drop trigger if exists relais_urgence_a_envoyer on public.supervision_alertes_internes;
drop function if exists public.relais_urgence_a_envoyer();
drop function if exists public.urgences_relais_au_quotidien(uuid[]);
drop function if exists public.urgences_relais_recentes();
drop function if exists public.terminer_urgences_relais(uuid, integer, integer);
drop function if exists public.prendre_urgences_relais(integer);
drop function if exists public.nature_urgence_relais(text);
drop table if exists public.relais_urgences;
drop table if exists public.relais_urgences_envois;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014811000';
  end if;
end $retour_arriere$;

commit;
