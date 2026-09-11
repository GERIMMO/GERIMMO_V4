-- Encaisser : le bouton promettait le mauvais terme.
--
-- Constat : dans « Quittancement du mois », le bouton s'intitule
-- « Encaisser {reste de CET appel} ». L'imputation, elle, va du terme le plus
-- ancien au plus récent (RM-3.3.2, règle légale de l'ancienneté de la dette —
-- wiki/processus/Quittancement des loyers.md). Quand le bail traîne un impayé
-- antérieur, l'argent part là-bas et la ligne cliquée ne bouge pas : l'agent
-- reclique, croyant que rien ne s'est passé.
--
-- La règle NE CHANGE PAS. C'est l'écran qui doit cesser de mentir, et pour
-- cela il lui faut la seule information qui lui manque : ce bail a-t-il une
-- dette ANTÉRIEURE au terme affiché, et sur quel terme commence-t-elle ?
-- quittancement_mois ne rend qu'une ligne par bail (le mois affiché) : sans
-- ces deux colonnes, le client ne peut pas le savoir.
--
-- Calculé en une seule passe d'etat_loyers_bail par bail, par fenêtrage :
--   · terme_impute      = le plus ancien terme du bail non intégralement
--                         couvert — celui que la règle servira en premier ;
--   · dette_anterieure  = ce qui reste dû sur les termes qui PRÉCÈDENT la
--                         ligne affichée (cumul, bornes ouvertes à droite).
-- Le couple ne parle que lorsque la dette est ailleurs : sinon la colonne est
-- nulle et le bouton garde son libellé simple.

drop function if exists public.quittancement_mois(uuid, date);

create function public.quittancement_mois(p_org uuid, p_mois date)
returns table (
  bail_id uuid, appel_id uuid, lot_id uuid, lot_nom text, locataire text,
  montant_du numeric, montant_couvert numeric, statut text,
  quittance_id uuid, est_quittance boolean, email_envoye_at timestamptz,
  dette_anterieure_periode date, dette_anterieure_reste numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, e.appel_id, l.id, l.nom,
    nullif(trim(coalesce(p.prenom || ' ', '') || coalesce(p.nom, '')), ''),
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
  order by 5 nulls last, 4;
$$;
revoke execute on function public.quittancement_mois(uuid, date) from public, anon;
