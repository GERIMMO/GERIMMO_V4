-- « Mes paiements » détaille le terme appelé, pas le bail — audit du 27/09
--
-- LE DÉFAUT. Sous le montant à régler, l'écran écrivait « 650 € de loyer +
-- 50 € de provision », lus sur le BAIL. Pour un mois au prorata (entrée ou
-- sortie en cours de mois), le détail ne correspondait plus au montant
-- affiché juste au-dessus. Et la phrase « le premier loyer d'un bail est
-- quittancé au prorata » s'affichait tous les mois.
--
-- LA CORRECTION. L'échéancier du locataire rend, pour chaque terme, le loyer
-- et les charges APPELÉS (figés à l'échéance, [[Quittance conforme]]) et s'il
-- est au prorata. Trois colonnes ajoutées en fin de table : les appelants
-- existants (qui lisent par nom) ne changent pas. Corps et contrôles d'accès
-- repris à l'identique de 20260912180000.
-- Idempotent : drop if exists + create (le type de retour change).

drop function if exists public.mon_echeancier_locataire(uuid);

create function public.mon_echeancier_locataire(p_org uuid)
returns table(periode date, montant_du numeric, montant_couvert numeric, statut text,
              quittance_id uuid, loyer_hc numeric, charges numeric, prorata boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id,
    a.loyer_hc, a.charges, coalesce(a.prorata, false)
  from public.baux b
  cross join lateral public.etat_loyers_bail_brut(b.id) e
  left join public.appels_loyer a on a.id = e.appel_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis', 'termine')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by e.periode;
$function$;

revoke execute on function public.mon_echeancier_locataire(uuid) from public, anon;
grant execute on function public.mon_echeancier_locataire(uuid) to authenticated, service_role;
