-- RETOUR ARRIÈRE de 20261014846000_invitation_artisan_annulation_suspendue.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : l'annulation d'une invitation reste possible quand l'abonnement est suspendu).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la définition EN VIGUEUR de `annuler_invitation_artisan` est relue, et le seul morceau posé par la
-- migration (le bloc qui lève la garde de l'abonnement autour de la mise à jour, avec sa marque) redevient la seule
-- ligne de la mise à jour. Rejouable : sans le morceau de la migration (ou sans la fonction), rien n'est fait. Droits
-- inchangés.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014846000_invitation_artisan_annulation_suspendue.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un propriétaire dont l'abonnement est suspendu ne peut plus annuler une invitation en
-- attente (l'artisan peut toujours l'accepter). Ordre indifférent avec le code. À jouer AVANT le retour de
-- 20261014840000 (qui supprime la fonction ; joué après, ce script ne trouve rien à faire et le dit).

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
declare
  v_def text;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (annuler, abonnement suspendu) : geste protecteur, garde de l'abonnement levée pour cette seule mise à jour, voir 20261014846000.
  declare v_systeme text := current_setting('gerimmo.systeme', true);
  begin
    perform set_config('gerimmo.systeme', 'on', true);
    update public.invitations_artisans set etat = 'annulee', repondu_le = now() where id = p_id;
    perform set_config('gerimmo.systeme', coalesce(v_systeme, ''), true);
  end;$nouveau$;
  c_ancre constant text := $ancre$  update public.invitations_artisans set etat = 'annulee', repondu_le = now() where id = p_id;$ancre$;
begin
  if to_regprocedure('public.annuler_invitation_artisan(uuid)') is null then
    raise notice 'annuler_invitation_artisan : fonction absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.annuler_invitation_artisan(uuid)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'annuler_invitation_artisan : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'annuler_invitation_artisan : garde de l''abonnement rétablie pour l''annulation';
end $retour_arriere$;

do $retour_arriere$
begin
  if to_regprocedure('public.annuler_invitation_artisan(uuid)') is not null then
    revoke all on function public.annuler_invitation_artisan(uuid) from public, anon;
    grant execute on function public.annuler_invitation_artisan(uuid) to authenticated;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014846000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'annuler_invitation_artisan' as objet,
       case when to_regprocedure('public.annuler_invitation_artisan(uuid)') is null then 'absente'
            when position('Relecture du 15/10 (annuler, abonnement suspendu)'
                          in pg_get_functiondef('public.annuler_invitation_artisan(uuid)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
