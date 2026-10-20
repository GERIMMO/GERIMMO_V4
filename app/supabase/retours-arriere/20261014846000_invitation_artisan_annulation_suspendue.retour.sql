-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014846000_invitation_artisan_annulation_suspendue.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : l'annulation d'une invitation reste possible quand l'abonnement est suspendu).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la définition EN VIGUEUR de `refuser_ecriture_si_fermee` est relue, et le seul morceau posé par la
-- migration (l'exception « en attente » → « annulée » de `invitations_artisans`, avec sa marque, après sa ligne
-- d'ancre) est retiré : la ligne d'ancre reste seule, comme avant. Un correctif posé depuis par une autre migration
-- ailleurs dans la fonction est conservé. Rejouable : sans le morceau de la migration, rien n'est fait. Droits
-- inchangés (fonction de déclencheur, aucun rôle client).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014846000_invitation_artisan_annulation_suspendue.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un propriétaire dont l'abonnement est suspendu ne peut plus annuler une invitation en
-- attente (l'artisan peut toujours l'accepter). Ordre indifférent avec le code et avec le retour de 20261014840000.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  -- Relecture du 15/10 (annuler une invitation d'artisan, abonnement suspendu) : geste protecteur, voir 20261014846000.
  if tg_table_name = 'invitations_artisans' and tg_op = 'UPDATE' then
    if old.etat = 'en_attente' and new.etat = 'annulee'
       and new.organization_id = old.organization_id and new.email = old.email
       and new.artisan_id is not distinct from old.artisan_id and new.expire_le = old.expire_le then
      return new;
    end if;
  end if;$nouveau$;
  c_ancre constant text := $ancre$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;$ancre$;
begin
  select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'refuser_ecriture_si_fermee : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'refuser_ecriture_si_fermee : exception de l''annulation d''une invitation d''artisan retirée';
end $retour_arriere$;

revoke all on function public.refuser_ecriture_si_fermee() from public, anon, authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014846000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'refuser_ecriture_si_fermee' as objet,
       case when position('Relecture du 15/10 (annuler une invitation d''artisan, abonnement suspendu)'
                          in pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
$instructions_retour$;
end $retour_atomique$;
