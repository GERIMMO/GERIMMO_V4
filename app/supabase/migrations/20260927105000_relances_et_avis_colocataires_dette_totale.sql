-- Audit métier du 27/09 — relances et avis d'échéance automatiques.
--
-- 1. COLOCATION : l'avis d'échéance et les relances ne partaient qu'au
--    locataire principal. Wiki [[Relances et mise en demeure]] : « Colocation
--    solidaire : la relance vise TOUS les colocataires ». Les deux fonctions
--    rendent désormais `autres_destinataires` (colocataires titulaires du bail,
--    solidarité en cours, e-mail renseigné) ; la tâche écrit à chacun.
--
-- 2. DETTE TOTALE : la relance ne citait que le terme impayé le plus ancien
--    (« le loyer de juillet reste dû à hauteur de 700 € » quand juillet, août et
--    septembre sont impayés). L'avis d'échéance annonce déjà l'arriéré, par
--    principe documenté (wiki [[Quittancement des loyers]] § 18/09) ;
--    `relances_loyer_dues` rend désormais `total_du`, la dette échue totale.
--
-- Changer le type de retour impose drop/create : droits réappliqués
-- (service_role seul, comme 20260918050000 et 20260920030000).

drop function if exists public.relances_loyer_dues(integer);
drop function if exists public.appels_a_envoyer(integer);

create function public.relances_loyer_dues(p_limite integer DEFAULT 200)
 RETURNS TABLE(bail_id uuid, organization_id uuid, niveau text, destinataire text, prenom text, emetteur text, lot text, periode date, date_echeance date, reste numeric, jours_retard integer, total_du numeric, autres_destinataires text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with candidats as (
    select
      b.id as bail_id,
      b.organization_id,
      o.name as emetteur,
      o.relance_1_jours,
      o.relance_2_jours,
      l.nom as lot,
      loc.email as destinataire,
      loc.prenom,
      -- Audit 27/09 : en colocation, chaque colocataire titulaire reçoit le
      -- courrier (wiki [[Relances et mise en demeure]] : « la relance vise tous
      -- les colocataires »). Le principal reste le premier destinataire.
      array(
        select distinct btrim(p.email)
          from public.bail_personnes bp join public.persons p on p.id = bp.person_id
         where bp.bail_id = b.id and bp.role = 'colocataire'
           and p.id is distinct from b.locataire_principal
           and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= current_date)
           and p.email is not null and length(btrim(p.email)) > 0
           and lower(btrim(p.email)) <> lower(btrim(loc.email))
      ) as autres_destinataires,
      x.periode,
      x.date_echeance,
      round(x.montant_du - x.montant_couvert, 2) as reste,
      (current_date - x.date_echeance)::integer as jours_retard,
      -- Audit 27/09 : la dette TOTALE échue, pas seulement le terme relancé
      -- (même principe que l'avis d'échéance, wiki [[Quittancement des
      -- loyers]] § 18/09 et [[Relances et mise en demeure]] RM-3.6.3).
      (select round(coalesce(sum(t.montant_du - t.montant_couvert), 0), 2)
         from public.etat_loyers_bail_brut(b.id) t
        where t.montant_couvert < t.montant_du and t.date_echeance < current_date) as total_du
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    join public.lots l on l.id = b.lot_id
    join public.persons loc on loc.id = b.locataire_principal
    cross join lateral (
      -- Le terme impayé le plus ancien : c'est lui qu'on relance.
      select e.periode, e.date_echeance, e.montant_du, e.montant_couvert
      from public.etat_loyers_bail_brut(b.id) e
      where e.montant_couvert < e.montant_du
        and e.date_echeance < current_date
      order by e.periode
      limit 1
    ) x
    where b.etat in ('actif', 'preavis')
      and o.relances_envoi_auto
      -- Une organisation suspendue n'écrit plus rien en son nom.
      and public.org_ecriture_ouverte(o.id)
      and loc.email is not null and length(btrim(loc.email)) > 0
  ), niveaux as (
    select
      c.*,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau = 'relance_1'
      ) as a_relance_1,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau in ('relance_2', 'mise_en_demeure')
      ) as a_relance_2,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi = current_date
      ) as relance_du_jour
    from candidats c
  )
  select
    n.bail_id,
    n.organization_id,
    case when not n.a_relance_1 then 'relance_1' else 'relance_2' end as niveau,
    n.destinataire,
    n.prenom,
    n.emetteur,
    n.lot,
    n.periode,
    n.date_echeance,
    n.reste,
    n.jours_retard,
    n.total_du,
    n.autres_destinataires
  from niveaux n
  where not n.relance_du_jour
    and (
      (not n.a_relance_1 and n.jours_retard >= n.relance_1_jours)
      or (n.a_relance_1 and not n.a_relance_2 and n.jours_retard >= n.relance_2_jours)
    )
  order by n.date_echeance, n.bail_id
  limit greatest(1, least(p_limite, 500));
end;
$function$;

create function public.appels_a_envoyer(p_limite integer DEFAULT 200)
 RETURNS TABLE(appel_id uuid, organization_id uuid, bail_id uuid, destinataire text, prenom text, emetteur text, periode date, loyer_hc numeric, charges numeric, montant_du numeric, reste_du numeric, date_echeance date, prorata boolean, arriere numeric, autres_destinataires text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin. Un compte d'agence n'a rien à faire ici : la fonction traverse
  -- TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appels_a_envoyer: reserve a la tache d''envoi';
  end if;

  return query
  select a.id, a.organization_id, a.bail_id,
         loc.email, loc.prenom, o.name,
         a.periode, a.loyer_hc, a.charges, a.montant_du,
         etat.reste_appel, a.date_echeance, a.prorata, etat.arriere,
      -- Audit 27/09 : en colocation, chaque colocataire titulaire reçoit le
      -- courrier (wiki [[Relances et mise en demeure]] : « la relance vise tous
      -- les colocataires »). Le principal reste le premier destinataire.
      array(
        select distinct btrim(p.email)
          from public.bail_personnes bp join public.persons p on p.id = bp.person_id
         where bp.bail_id = b.id and bp.role = 'colocataire'
           and p.id is distinct from b.locataire_principal
           and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= current_date)
           and p.email is not null and length(btrim(p.email)) > 0
           and lower(btrim(p.email)) <> lower(btrim(loc.email))
      ) as autres_destinataires
  from public.appels_loyer a
  join public.baux b on b.id = a.bail_id
  join public.organizations o on o.id = a.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  -- Un seul parcours de l'échéancier du bail par appel candidat : ce qui reste
  -- dû sur CET appel, et ce qui traînait sur les termes antérieurs. Le second
  -- n'est pas de la décoration : un avis qui tait une dette en cours laisse
  -- croire au locataire qu'il est à jour dès qu'il aura payé le mois.
  join lateral (
    select
      coalesce(max(e.montant_du - e.montant_couvert)
               filter (where e.appel_id = a.id), 0) as reste_appel,
      coalesce(sum(e.montant_du - e.montant_couvert)
               filter (where e.periode < a.periode
                         and e.montant_du > e.montant_couvert), 0) as arriere
    from public.etat_loyers_bail_brut(a.bail_id) e
  ) etat on true
  where a.email_envoye_at is null
    and o.appels_envoi_auto
    -- Une organisation suspendue n'écrit plus en son nom.
    and public.org_ecriture_ouverte(a.organization_id)
    and loc.email is not null and length(btrim(loc.email)) > 0
    -- Pas d'arriéré d'envoi : cocher la case n'expédie pas l'historique.
    and a.created_at >= now() - interval '45 days'
    -- Et surtout : jamais un appel déjà soldé.
    and etat.reste_appel > 0
  order by a.date_echeance, a.id
  limit greatest(1, least(p_limite, 500));
end;
$function$;

revoke execute on function public.relances_loyer_dues(integer) from public, anon, authenticated;
grant execute on function public.relances_loyer_dues(integer) to service_role;
revoke execute on function public.appels_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.appels_a_envoyer(integer) to service_role;

select public.fermer_fonctions_a_anon();
