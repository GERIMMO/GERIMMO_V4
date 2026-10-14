-- RETOUR ARRIÈRE de 20261014222000_consigne_activation_approbateur_distinct.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014222000_consigne_activation_approbateur_distinct.retour.sql
--
-- RÉINTRODUIT le comportement d'avant (SUP-04, décision D10) : decider_consigne n'exige plus jamais un approbateur distinct du
-- rédacteur. Sans effet visible aujourd'hui (une consigne ne peut que lire deux compteurs) ; mais le jour où un type de tâche
-- agira, plus rien dans la base n'empêchera le rédacteur de l'approuver lui-même. Aucune donnée n'est défaite (accords inchangés).
-- La fonction interne tache_consigne_lecture_seule() est supprimée SANS cascade (une dépendance inattendue arrête tout).

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

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- decider_consigne (SUP-04)
select pg_temp.restaurer_fonction('public.decider_consigne(uuid,boolean)',
  $marque$Audit du 14/10 (SUP-04)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.decider_consigne(p_version uuid, p_accepter boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.supervision_consignes_versions;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 select v1.* into v from public.supervision_consignes_versions v1 join public.supervision_consignes c on c.id=v1.consigne_id where v1.id=p_version and c.version_courante=v1.numero and not c.suspendue for update of c;
 if v.id is null or v.fin<=now() or not public.responsable_supervision_habilite(v.responsable) then raise exception 'Version remplacée, suspendue, expirée ou responsable non habilité'; end if;
 if p_accepter is null then raise exception 'Décision requise'; end if;
 if exists(select 1 from public.supervision_consignes_accords where version_id=p_version and accepte is distinct from p_accepter) then raise exception 'Décision déjà enregistrée ; créez une nouvelle version'; end if;
 insert into public.supervision_consignes_accords(version_id,accepte,auteur) values(p_version,p_accepter,auth.uid()) on conflict do nothing;
 update public.supervision_consignes_taches set etat=case when p_accepter then 'approuvee' else 'annulee' end where version_id=p_version and etat='proposee';
 insert into public.supervision_operations(objet,action,auteur,details) values(p_version,'consigne_decision',auth.uid(),jsonb_build_object('accepte',p_accepter));
end $function$
$definition_anterieure$);

-- La fonction de classement n'est plus appelée par personne : on la retire, SANS cascade (une dépendance inattendue arrête tout).
drop function if exists public.tache_consigne_lecture_seule(text);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014222000';
  end if;
end $retour_arriere$;

commit;
