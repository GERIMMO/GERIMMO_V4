-- LE PARRAINAGE RÉACTIVÉ SUR LA GRILLE DU 28/09/2026 — décision du porteur
-- du 30/09/2026 : « un mois offert au parrain à la conversion du filleul ».
--
-- Jusqu'ici (20260928090000_tarification_2026, § 11) une organisation de la
-- nouvelle grille enregistrait ses parrainages sans aucun avantage : « pas de
-- cumul ». La règle est levée pour le SEUL avantage du parrain :
--
--  · LE PARRAIN reçoit un mois quand son filleul devient client PAYANT —
--    c'est-à-dire à la PREMIÈRE FACTURE NON NULLE PAYÉE du filleul
--    (`abonnements.premiere_facture_payee`, posé par le webhook invoice.paid,
--    20260929100000_audit_facturation). Jamais à l'inscription, jamais au
--    passage en `active` : sur la nouvelle grille une souscription en essai
--    Stripe (`trialing`) rend l'organisation `active` alors que rien n'a été
--    prélevé — la facture à 0 € d'un essai ne compte pas.
--      – parrain déjà abonné → un AVOIR de son mensuel courant (annuel : le
--        montant annuel ÷ 12, arrondi au centime), porté à son solde client
--        Stripe par la tâche planifiée (/api/cron/abonnements), de façon
--        idempotente (clé = identifiant de l'avantage) ;
--      – parrain encore en essai → son essai est prolongé d'UN MOIS
--        (interval '1 month') ;
--      – parrain archivé → rien ; sans montant facturé → « sans objet ».
--    Une récompense par filleul : l'unicité (parrainage, nature) et le
--    contrôle en tête de `parrainage_recompenser` restent la garde.
--
--  · LE FILLEUL n'a aucun avantage supplémentaire : il garde l'essai
--    ordinaire (2 mois jusqu'au 31/12/2026, puis 1 mois). Les trente jours
--    du filleul (grille historique) ne s'appliquent pas à la nouvelle grille ;
--    la ligne est inscrite « sans objet » — ce que fait déjà
--    `parrainage_avantage_filleul` (20260930100000_essai_deux_mois), inchangée.
--
-- La grille HISTORIQUE garde sa mécanique d'origine (19/09) : récompense au
-- passage du filleul en `active`, trente jours d'essai au parrain en essai.
--
-- Idempotent.

-- ── 1. La récompense du parrain ────────────────────────────────────────────
-- Reprise de 20260928090000_tarification_2026 (dernière définition) : la
-- branche « nouvelle grille » ne pose plus « sans objet » mais le mois offert.
create or replace function public.parrainage_recompenser(p_filleul uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parrainage uuid;
  v_parrain uuid;
  v_statut public.organization_status;
  v_essai date;
  v_grille text;
  v_mensuel bigint;
  v_nouvel_essai date;
begin
  select p.id, p.parrain_organization_id into v_parrainage, v_parrain
  from public.parrainages p where p.filleul_organization_id = p_filleul;
  if v_parrainage is null then return; end if;

  -- Déjà récompensé (ou déjà jugé sans objet) : une seule fois par filleul.
  if exists (
    select 1 from public.avantages_parrainage a
    where a.parrainage_id = v_parrainage and a.nature in ('essai_parrain', 'avoir_parrain')
  ) then
    return;
  end if;

  select o.status, o.essai_fin, o.grille_tarifaire into v_statut, v_essai, v_grille
  from public.organizations o where o.id = v_parrain;
  if v_statut is null or v_statut = 'archivee' then return; end if;

  if v_grille = '2026-09-28' then
    if v_statut = 'essai' then
      -- Un mois d'essai de plus, compté depuis la fin d'essai en cours (ou
      -- aujourd'hui si elle est passée).
      v_nouvel_essai := (greatest(coalesce(v_essai, current_date), current_date)
                         + interval '1 month')::date;
      perform set_config('gerimmo.systeme', 'on', true);
      update public.organizations
         set essai_fin = v_nouvel_essai, updated_at = now()
       where id = v_parrain;
      perform set_config('gerimmo.systeme', '', true);

      insert into public.avantages_parrainage
        (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
      values (v_parrainage, v_parrain, 'essai_parrain',
              v_nouvel_essai - greatest(coalesce(v_essai, current_date), current_date),
              'applique', now())
      on conflict (parrainage_id, nature) do nothing;
    else
      -- Un mois vaut ce qu'il paie : le montant d'une période, ramené au
      -- mois pour un abonnement annuel (÷ 12, arrondi au centime), figé au
      -- moment où l'avantage est acquis.
      select coalesce(
               case when a.montant_periode_cents is null then null
                    when a.periodicite = 'annuel' then round(a.montant_periode_cents / 12.0)::bigint
                    else a.montant_periode_cents end,
               a.montant_mensuel_cents)
        into v_mensuel
      from public.abonnements a where a.organization_id = v_parrain;

      insert into public.avantages_parrainage
        (parrainage_id, beneficiaire_organization_id, nature, montant_cents, etat, applique_le)
      values (v_parrainage, v_parrain, 'avoir_parrain', coalesce(v_mensuel, 0),
              case when coalesce(v_mensuel, 0) > 0 then 'a_appliquer' else 'sans_objet' end,
              case when coalesce(v_mensuel, 0) > 0 then null else now() end)
      on conflict (parrainage_id, nature) do nothing;
    end if;
  elsif v_statut = 'essai' then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations
       set essai_fin = greatest(coalesce(v_essai, current_date), current_date)
                       + public.parrainage_jours_parrain(),
           updated_at = now()
     where id = v_parrain;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (v_parrainage, v_parrain, 'essai_parrain',
            public.parrainage_jours_parrain(), 'applique', now())
    on conflict (parrainage_id, nature) do nothing;
  else
    select a.montant_mensuel_cents into v_mensuel
    from public.abonnements a where a.organization_id = v_parrain;

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, montant_cents, etat, applique_le)
    values (v_parrainage, v_parrain, 'avoir_parrain', coalesce(v_mensuel, 0),
            case when coalesce(v_mensuel, 0) > 0 then 'a_appliquer' else 'sans_objet' end,
            case when coalesce(v_mensuel, 0) > 0 then null else now() end)
    on conflict (parrainage_id, nature) do nothing;
  end if;

  insert into public.audit_log (organization_id, action, details)
  values (v_parrain, 'avantage_parrainage',
          jsonb_build_object('filleul', p_filleul, 'parrainage', v_parrainage, 'grille', v_grille));
end $$;
revoke execute on function public.parrainage_recompenser(uuid) from public, anon, authenticated;

-- ── 2. Le moment de la conversion ──────────────────────────────────────────
-- Grille historique : le passage en `active` (inchangé). Nouvelle grille :
-- PAS le passage en `active` (un essai Stripe y mène sans rien prélever) —
-- la première facture non nulle payée, ci-dessous.
create or replace function public.organizations_parrainage_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active'
     and new.grille_tarifaire is distinct from '2026-09-28' then
    perform public.parrainage_recompenser(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.organizations_parrainage_conversion() from public, anon, authenticated;

-- La première facture non nulle payée. `premiere_facture_payee` n'est posé
-- que par `abonnement_facture_payee`, que le webhook n'appelle que pour une
-- facture d'un montant > 0 (une facture d'essai à 0 € est ignorée) ; il ne
-- repasse jamais à faux : la récompense ne peut pas se rejouer par là, et
-- l'unicité du registre la garde de toute façon.
create or replace function public.abonnements_parrainage_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.premiere_facture_payee
     and (tg_op = 'INSERT' or not coalesce(old.premiere_facture_payee, false))
     and exists (
       select 1 from public.organizations o
        where o.id = new.organization_id and o.grille_tarifaire = '2026-09-28'
     ) then
    perform public.parrainage_recompenser(new.organization_id);
  end if;
  return null;
end $$;
revoke execute on function public.abonnements_parrainage_conversion() from public, anon, authenticated;

drop trigger if exists abonnements_parrainage_conversion_trg on public.abonnements;
create trigger abonnements_parrainage_conversion_trg
  after insert or update of premiere_facture_payee on public.abonnements
  for each row execute function public.abonnements_parrainage_conversion();

comment on function public.abonnements_parrainage_conversion() is
  'Grille du 28/09/2026 : recompense le parrain a la premiere facture non nulle payee du filleul (decision du 30/09/2026).';

-- Aucune fonction de `public` ne reste exécutable par `anon`.
select public.fermer_fonctions_a_anon();
