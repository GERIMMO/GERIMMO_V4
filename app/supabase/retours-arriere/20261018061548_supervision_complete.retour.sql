-- RETOUR ARRIÈRE de 20261018061548_supervision_complete.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #202 : coûts déclarés, journal immuable, exécutions de décisions, identité de l'éditeur, prospects, annuaire).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #202 : commit 4466ad4) : les pages /admin (trésorerie, personnes, prospects, paramètres,
-- preuves, suivi des décisions) et les pages légales publiques (src/lib/editeur-serveur.ts lit supervision_identite
-- en anon) tombent tant que ce code est en place.
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018061548_supervision_complete.retour.sql
-- Ordre : après le retour de 20261018071556 (garde ci-dessous), avant celui de 20261017180829. Les retours du 19/10 le
-- précèdent (chaîne « Ordre complet » du LISEZ-MOI) : 20261019123000 a réécrit deux contraintes de supervision_identite,
-- 20261019121000 la fonction supervision_tracer_modification et la clé supervision_prospects.demande_id (gardes ci-dessous).
--
-- CONSERVE (preuves et registres : aucun `drop table`, aucun `drop column`) : les cinq tables supervision_couts
-- (registre comptable immuable), supervision_registre (journal avant/après), supervision_executions_decisions (trace des
-- exécutions), supervision_prospects (suivi commercial : données personnelles, sort à décider par le dirigeant, voir
-- LISEZ-MOI) et supervision_identite (réglage singleton), avec leurs lignes, PK, unicités, clés étrangères et CHECK
-- (dont identite_champs_connus), fermées à anon, authenticated et service_role (droits de table ET par colonne), RLS
-- activé sans politique ; la colonne development_proposals.preuve_publication (preuve : sa suppression n'est à faire que
-- sur décision écrite, hors de ce script).
-- RETIRE : la fonction de déclencheur supervision_tracer_modification et ses trois déclencheurs, la fonction
-- supervision_total_couts, la vue supervision_utilisateurs (sans donnée), les douze politiques, tous les droits des
-- cinq tables, les cinq index posés par la migration.
-- RÉINTRODUIT : plus de console de supervision complète ; les pages légales ne lisent plus l'identité de l'éditeur en
-- base.
-- Rejouable : chaque retrait utilise `if exists`.
--
-- Historique : en production (relevé en lecture seule du 19/10/2026), cette migration est inscrite sous la version
-- 20261018071200 (nom de fichier d'avant la fusion de la PR #202) ; le dépôt la nomme 20261018061548. Les deux versions
-- sont retirées, pour que l'historique ne dise plus « appliquée » sous aucun des deux noms.

set local lock_timeout = '10s';

-- Gardes d'ordre du 19/10, dans l'ordre de la chaîne du LISEZ-MOI (20261019123000 puis 20261019121000) : ce retour
-- conserve les contraintes de supervision_identite et la clé supervision_prospects.demande_id, et retire
-- supervision_tracer_modification ; sans ces deux retours, l'état « d'avant le lot » laissé ici ne serait pas celui du 18/10
-- (clés des prestataires admises, borne de 40 000 octets, action référentielle `on delete set null`).
do $ordre_1910$
begin
  if exists(select 1 from pg_constraint where conrelid = to_regclass('public.supervision_identite') and conname = 'identite_champs_connus' and pg_get_constraintdef(oid) like '%''localisationBan''%')
     or exists(select 1 from pg_constraint where conrelid = to_regclass('public.supervision_identite') and conname = 'supervision_identite_valeurs_check' and pg_get_constraintdef(oid) like '%< 40000%') then
    raise exception 'Retour 20261018061548 refusé : les contraintes de supervision_identite admettent encore les clés des prestataires ou la borne de 40 000 octets (19/10) ; jouer d''abord le retour 20261019123000';
  end if;
  if coalesce(strpos(pg_get_functiondef(to_regprocedure('public.supervision_tracer_modification()')), 'pg_trigger_depth') > 0, false)
     or exists(select 1 from pg_constraint where conrelid = to_regclass('public.supervision_prospects') and conname = 'supervision_prospects_demande_id_fkey' and confdeltype = 'n') then
    raise exception 'Retour 20261018061548 refusé : supervision_tracer_modification porte encore le chemin système du 19/10 (pg_trigger_depth) ou la clé supervision_prospects_demande_id_fkey son action référentielle (on delete set null) ; jouer d''abord le retour 20261019121000';
  end if;
end $ordre_1910$;

-- Garde d'ordre : 20261018071556 indexe ces tables.
do $ordre$
begin
  if to_regclass('public.supervision_couts_auteur_idx') is not null then
    raise exception 'Retour 20261018061548 refusé : jouer d''abord le retour de 20261018071556';
  end if;
end $ordre$;

-- (a) Journal des modifications : les déclencheurs, puis la fonction.
drop trigger if exists supervision_identite_trace on public.supervision_identite;
drop trigger if exists supervision_prospect_trace on public.supervision_prospects;
drop trigger if exists supervision_cout_trace on public.supervision_couts;
drop function if exists public.supervision_tracer_modification();

-- (b) Total des coûts.
drop function if exists public.supervision_total_couts(date,date);

-- (c) Annuaire : vue sans donnée.
drop view if exists public.supervision_utilisateurs;

-- (d) Politiques.
drop policy if exists couts_superviseur on public.supervision_couts;
drop policy if exists couts_ajout on public.supervision_couts;
drop policy if exists executions_lecture on public.supervision_executions_decisions;
drop policy if exists executions_creation on public.supervision_executions_decisions;
drop policy if exists executions_resultat on public.supervision_executions_decisions;
drop policy if exists identite_publique on public.supervision_identite;
drop policy if exists identite_admin on public.supervision_identite;
drop policy if exists prospects_lecture on public.supervision_prospects;
drop policy if exists prospects_creation on public.supervision_prospects;
drop policy if exists prospects_modification on public.supervision_prospects;
drop policy if exists registre_lecture on public.supervision_registre;
drop policy if exists registre_ajout on public.supervision_registre;

-- (e) et (g) Droits et commentaires : un REVOKE de table retire aussi les droits accordés par colonne (anon et
-- authenticated sur supervision_identite ; UPDATE par colonne sur executions et prospects). RLS reste activé.
do $conserve$
declare
  t record;
begin
  for t in select * from (values
    ('supervision_couts', 'Conservée après le retour de 20261018061548 : registre immuable des coûts déclarés (preuve comptable) ; aucune fonction, politique ni droit API.'),
    ('supervision_registre', 'Conservée après le retour de 20261018061548 : journal immuable avant/après des écritures de supervision (preuve) ; aucune fonction, politique ni droit API.'),
    ('supervision_executions_decisions', 'Conservée après le retour de 20261018061548 : trace des exécutions de décisions du matin (preuve) ; aucune fonction, politique ni droit API.'),
    ('supervision_prospects', 'Conservée après le retour de 20261018061548 : suivi commercial (données personnelles de prospects : sort à décider par le dirigeant, voir LISEZ-MOI) ; aucune fonction, politique ni droit API.'),
    ('supervision_identite', 'Conservée après le retour de 20261018061548 : identité légale de l''éditeur (réglage singleton) ; aucune fonction, politique ni droit API.')
  ) as v(nom, commentaire) loop
    if to_regclass('public.' || t.nom) is not null then
      execute format('revoke all on public.%I from anon, authenticated, service_role', t.nom);
      execute format('comment on table public.%I is %L', t.nom, t.commentaire);
    end if;
  end loop;
end $conserve$;

-- (f) Index posés par la migration.
drop index if exists
  public.supervision_couts_jour,
  public.supervision_decision_en_cours,
  public.supervision_execution_decision_date,
  public.supervision_prospects_echeance,
  public.supervision_registre_objet_date;

-- (h) Colonne conservée : dit en base ce qui est gardé et pourquoi.
do $preuve$
begin
  if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'development_proposals' and column_name = 'preuve_publication') then
    execute $c$comment on column public.development_proposals.preuve_publication is 'Conservée après le retour de 20261018061548 : preuve de publication (sa suppression relève d''une décision écrite).'$c$;
  end if;
end $preuve$;

-- (i) Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- (j) Même transaction externe que le retour : la version n'est plus « appliquée » (version du fichier ET version
-- enregistrée en production), migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018061548', '20261018071200');
  end if;
end $historique$;
