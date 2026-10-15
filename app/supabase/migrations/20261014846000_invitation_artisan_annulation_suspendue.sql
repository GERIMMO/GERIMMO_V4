-- Invitation d'artisan : l'annulation reste possible quand l'abonnement de l'organisation est suspendu (relecture du
-- 15/10/2026 du lot « invitation-artisan »).
--
-- Constat : `annuler_invitation_artisan` (20261014840000) ne vérifiait pas l'état de l'abonnement, mais la garde de la
-- table (`refuser_ecriture_si_fermee`, déclencheur `abonnement_invitations_artisans`) refusait la mise à jour : un
-- propriétaire dont l'abonnement est suspendu ne pouvait plus retirer une invitation envoyée par erreur, alors que
-- l'artisan pouvait toujours l'accepter. Annuler est un geste PROTECTEUR (il retire un accès, il n'en ouvre aucun).
--
-- Correctif : autour de la seule mise à jour qui note l'invitation « annulée », la fonction lève la garde de
-- l'abonnement le temps de cette instruction (`gerimmo.systeme`, comme les fonctions de facturation de
-- 20260928090000 et 20260929100000), puis rétablit la valeur d'avant. Tous les contrôles restent en amont : seul le
-- propriétaire de l'organisation annule, et seulement une invitation en attente et non échue. Inviter et renvoyer
-- restent refusés quand l'abonnement est suspendu.
--
-- Modèle de rejeu à marques (20261013120000) : la définition en vigueur est RELUE (pg_get_functiondef) ; l'ancre, UNE
-- ligne (la mise à jour « annulée »), est entourée du bloc du correctif, qui porte la marque. Rejouée, la migration
-- trouve sa marque et ne fait rien ; si l'ancre manque ou se répète, elle s'arrête (dans la transaction de
-- `migrations.yml`, rien ne subsiste). Aucune ligne n'est touchée.
-- Retour arrière : app/supabase/retours-arriere/20261014846000_invitation_artisan_annulation_suspendue.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  update public.invitations_artisans set etat = 'annulee', repondu_le = now() where id = p_id;$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (annuler, abonnement suspendu) : geste protecteur, garde de l'abonnement levée pour cette seule mise à jour, voir 20261014846000.
  declare v_systeme text := current_setting('gerimmo.systeme', true);
  begin
    perform set_config('gerimmo.systeme', 'on', true);
    update public.invitations_artisans set etat = 'annulee', repondu_le = now() where id = p_id;
    perform set_config('gerimmo.systeme', coalesce(v_systeme, ''), true);
  end;$nouveau$;
begin
  select pg_get_functiondef('public.annuler_invitation_artisan(uuid)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (annuler, abonnement suspendu)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014846000 : définition inattendue de annuler_invitation_artisan (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : les clients connectés, jamais `anon` ni PUBLIC.
revoke all on function public.annuler_invitation_artisan(uuid) from public, anon;
grant execute on function public.annuler_invitation_artisan(uuid) to authenticated;

select public.fermer_fonctions_a_anon();
