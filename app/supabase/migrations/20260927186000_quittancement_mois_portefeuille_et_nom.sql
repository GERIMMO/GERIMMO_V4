-- Audit agence du 27/09 — le tableau du mois : portefeuille et nom affiché.
--
-- 1. CLOISON PERDUE. Le 09/09 (20260909230000) avait réduit `quittancement_mois`
--    aux baux du portefeuille de l'agent (`bail_hors_portefeuille`). La
--    réécriture du 11/09 (20260911121000, dette antérieure) a repris la
--    fonction sans ce filtre : un agent relisait, par la RPC, le quittancement
--    de toute l'agence (l'écran filtrait ensuite côté serveur, la base non).
--    Le filtre revient.
--
-- 2. NOM AFFICHÉ. Le même locataire s'appelait « E2E Locataire » (prénom nom)
--    sur Loyers & charges et dans la comptabilité, « Locataire E2E » (nom
--    prénom) sur le bail, l'accueil et le fil d'activité — la convention de
--    l'application (`nomComplet`, lib/roles-personnes.ts). La fonction suit
--    la convention.
--
-- Le reste du corps est inchangé. Idempotent : create or replace.

create or replace function public.quittancement_mois(p_org uuid, p_mois date)
 returns table(bail_id uuid, appel_id uuid, lot_id uuid, lot_nom text, locataire text, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid, est_quittance boolean, email_envoye_at timestamp with time zone, dette_anterieure_periode date, dette_anterieure_reste numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    b.id, e.appel_id, l.id, l.nom,
    -- « Nom Prénom », comme `nomComplet` partout ailleurs (audit 27/09).
    nullif(trim(coalesce(p.nom, '') || coalesce(' ' || p.prenom, '')), ''),
    e.montant_du, e.montant_couvert, e.statut,
    q.id, q.est_quittance, q.email_envoye_at,
    case when e.dette_anterieure > 0 then e.terme_impute end,
    case when e.dette_anterieure > 0 then e.dette_anterieure end
  from public.baux b
  join public.lots l on l.id = b.lot_id
  left join public.persons p on p.id = b.locataire_principal
  cross join lateral (
    select
      x.appel_id, x.periode, x.montant_du, x.montant_couvert, x.statut,
      min(x.periode) filter (where x.montant_couvert < x.montant_du)
        over () as terme_impute,
      round(coalesce(sum(x.montant_du - x.montant_couvert) over (
        order by x.periode rows between unbounded preceding and 1 preceding
      ), 0), 2) as dette_anterieure
    from public.etat_loyers_bail(b.id) x
  ) e
  left join public.quittances q on q.appel_id = e.appel_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and e.periode = date_trunc('month', p_mois)::date
    and b.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    -- RM-18.1.3 : l'agent ne lit que les baux de son portefeuille.
    and not public.bail_hors_portefeuille(p_org, b.id)
  order by 5 nulls last, 4;
$function$;

select public.fermer_fonctions_a_anon();
