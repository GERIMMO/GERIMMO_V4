-- Invitation d'artisan : l'annulation reste possible quand l'abonnement de l'organisation est suspendu (relecture du
-- 15/10/2026 du lot « invitation-artisan »).
--
-- Constat : `annuler_invitation_artisan` (20261014840000) ne vérifiait pas l'état de l'abonnement, mais la garde de la
-- table (`refuser_ecriture_si_fermee`, déclencheur `abonnement_invitations_artisans` que pose
-- `poser_gardes_abonnement`) refusait la mise à jour : un propriétaire dont l'abonnement est suspendu ne pouvait plus
-- retirer une invitation envoyée par erreur, alors que l'artisan pouvait toujours l'accepter. Annuler est un geste
-- PROTECTEUR : il retire un accès, il n'en ouvre aucun.
--
-- Correctif : la garde de l'abonnement laisse passer, sur `invitations_artisans` seulement, la seule transition
-- « en attente » → « annulée », sans autre changement d'organisation, d'adresse, d'artisan ni d'échéance. Comme pour
-- `messages` (où le marquage « lu » n'est pas un geste de gestion), l'exception est écrite dans la garde, pas dans un
-- passe-droit : le drapeau `gerimmo.systeme` reste hors de portée de toute fonction appelable depuis un navigateur
-- (tests/abonnement-stripe.test.ts). La table reste fermée aux clients : seule `annuler_invitation_artisan` (le
-- propriétaire de l'organisation, une invitation en attente et non échue) écrit cette transition. Inviter et renvoyer
-- restent refusés quand l'abonnement est suspendu. Le déclencheur n'est pas touché : `poser_gardes_abonnement`, rejouée,
-- le repose à l'identique et l'exception tient.
--
-- Modèle de rejeu à marques (20261013120000) : la définition en vigueur de `refuser_ecriture_si_fermee` est RELUE
-- (pg_get_functiondef) ; l'ancre, UNE ligne (le calcul de l'organisation visée), est suivie du bloc du correctif, qui
-- porte la marque. Rejouée, la migration trouve sa marque et ne fait rien ; si l'ancre manque ou se répète, elle
-- s'arrête (dans la transaction de `migrations.yml`, rien ne subsiste). Aucune ligne n'est touchée.
-- Retour arrière : app/supabase/retours-arriere/20261014846000_invitation_artisan_annulation_suspendue.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;$ancre$;
  c_nouveau constant text := $nouveau$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  -- Relecture du 15/10 (annuler une invitation d'artisan, abonnement suspendu) : geste protecteur, voir 20261014846000.
  if tg_table_name = 'invitations_artisans' and tg_op = 'UPDATE' then
    if old.etat = 'en_attente' and new.etat = 'annulee'
       and new.organization_id = old.organization_id and new.email = old.email
       and new.artisan_id is not distinct from old.artisan_id and new.expire_le = old.expire_le then
      return new;
    end if;
  end if;$nouveau$;
begin
  select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (annuler une invitation d'artisan, abonnement suspendu)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014846000 : définition inattendue de refuser_ecriture_si_fermee (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites : fonction de déclencheur, aucun rôle client ne l'appelle.
revoke all on function public.refuser_ecriture_si_fermee() from public, anon, authenticated;

select public.fermer_fonctions_a_anon();
