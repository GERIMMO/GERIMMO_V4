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
-- La fonction org_suspendue_par_supervision (fin de fichier, DRT-04) dit aux gestionnaires si la fermeture vient de la
-- supervision plutôt que de l'impayé, pour que l'écran ne leur propose pas de « choisir une formule ».
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

-- ── Une suspension décidée par la supervision se dit comme telle (DRT-04) ─────────────────────────────────────────
-- Le statut « suspendue » sert aussi à l'impayé (abonnement_appliquer) : l'écran ne peut pas le lire seul. Une
-- suspension ou un archivage par la supervision (controler_organisation) laisse sa trace dans audit_log, que les
-- gestionnaires ne lisent pas ; cette fonction leur rend la seule réponse utile, oui ou non, pour LEUR organisation :
-- statut suspendu ou archivé ET dernier geste de contrôle (suspendre, archiver, réactiver) = suspendre ou archiver.
-- Même lecture que la réactivation de controler_organisation. Hors de l'organisation : faux, sans rien révéler.
create or replace function public.org_suspendue_par_supervision(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.status in ('suspendue', 'archivee')
       and (select l.action from public.audit_log l
             where l.organization_id = o.id
               and l.action in ('organisation_suspendue', 'organisation_archivee', 'organisation_reactivee')
             order by l.created_at desc limit 1) in ('organisation_suspendue', 'organisation_archivee')
      from public.organizations o
     where o.id = p_org
       and o.id in (select public.org_ids_avec_roles(
           array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  ), false);
$$;
comment on function public.org_suspendue_par_supervision(uuid) is
  'Vrai si l''organisation (dont l''appelant est gestionnaire) est suspendue ou archivée par la supervision, et non par l''impayé (audit final du 27/10/2026, DRT-04).';
revoke all on function public.org_suspendue_par_supervision(uuid) from public, anon;
grant execute on function public.org_suspendue_par_supervision(uuid) to authenticated;

select public.fermer_fonctions_a_anon();
