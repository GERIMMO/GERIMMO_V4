-- La fiche de l'organisation suit la lecture seule — audit final du 27/10/2026 (DRT-V01)
--
-- LE DÉFAUT. `refuser_ecriture_si_fermee` (20260911190000) garde les 84 tables qui portent `organization_id`, mais pas
-- `organizations` elle-même (sa colonne est `id`) : pendant la suspension prononcée par la supervision, ou une fois
-- l'écriture fermée pour impayé, l'administrateur modifiait encore l'IBAN, l'adresse d'expédition des courriers et les
-- envois automatiques par l'API REST, sous le bandeau « lecture seule » (PATCH → 204).
--
-- LA CORRECTION. Un déclencheur propre à la table, dans l'esprit de la garde des autres tables (même code d'erreur
-- 23514) : la mise à jour est refusée quand l'écriture de l'organisation est fermée (`org_ecriture_ouverte`) ET que
-- l'auteur est un gestionnaire de cette organisation (admin d'agence, agent, propriétaire direct) qui n'est pas la
-- supervision. Tout le reste passe comme avant : les tâches du service (`gerimmo.systeme = on`), Stripe et la
-- supervision (`controler_organisation`, `abonnement_appliquer`, `offrir_mois_abonnement`…, exécutés sous une identité
-- qui n'est pas membre gestionnaire ou qui est super-administrateur), et les colonnes de plateforme (statut, type,
-- essai, grille) restent réservées au super-administrateur par `organizations_champs_reserves_sa`.
--
-- Rejouable (create or replace, drop trigger if exists) ; aucune donnée lue ni réécrite.
-- Retour arrière : supabase/retours-arriere/20261028100000_organizations_lecture_seule.retour.sql

create or replace function public.organizations_refuser_ecriture_si_fermee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les tâches planifiées et le service se signalent par un réglage local à leur transaction (20260911190000).
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return new;
  end if;
  if not public.org_ecriture_ouverte(new.id)
     and not public.is_super_admin()
     and new.id in (select public.org_ids_avec_roles(
         array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) then
    raise exception
      'Votre espace est en lecture seule : la fiche de l''organisation ne se modifie pas pour le moment. Vos données restent consultables et exportables.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
comment on function public.organizations_refuser_ecriture_si_fermee() is
  'Garde de lecture seule de la table organizations (audit final du 27/10/2026, DRT-V01) : un gestionnaire ne modifie pas la fiche quand l''écriture est fermée ; service, Stripe et supervision passent.';
-- Comme pour la garde des autres tables : jamais exécutable ni posable par anon ou authenticated.
revoke all on function public.organizations_refuser_ecriture_si_fermee() from public, anon, authenticated;

drop trigger if exists abonnement_organizations on public.organizations;
create trigger abonnement_organizations before update on public.organizations
  for each row execute function public.organizations_refuser_ecriture_si_fermee();

select public.fermer_fonctions_a_anon();
