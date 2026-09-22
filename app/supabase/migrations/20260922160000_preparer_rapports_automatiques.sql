-- Préparation seulement : aucun envoi, versement, clôture ou validation automatique.
create function public.preparer_rapports_automatiques()
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement automatique'; end if;
 if not pg_try_advisory_xact_lock(72192216) then return 0; end if;
 with candidats as (
  select m.id,m.organization_id,c.mois from public.mandats m
  join public.organizations o on o.id=m.organization_id and o.status::text='active'
  join public.clotures_comptables c on c.organization_id=m.organization_id
    and c.mois=(date_trunc('month',now())-interval '1 month')::date
  where m.etat::text in ('actif','preavis','resilie') and m.date_debut is not null
    and m.date_debut<(c.mois+interval '1 month') and (m.date_fin is null or m.date_fin>=c.mois)
    and exists(select 1 from public.mandat_lignes l where l.mandat_id=m.id and l.organization_id=m.organization_id
      and l.date_debut<c.mois+interval '1 month' and (l.date_fin is null or l.date_fin>=c.mois))
    and not exists(select 1 from public.rapports_gestion r where r.mandat_id=m.id and r.mois=c.mois)
  order by m.id limit 1000
 ), crees as (
  insert into public.rapports_gestion(organization_id,mandat_id,mois,statut,net)
  select c.organization_id,c.id,c.mois,'a_valider',coalesce((
    select sum(case when e.sens='recette' then e.montant else -e.montant end) from public.ecritures e
    where e.organization_id=c.organization_id and e.date_imputation>=c.mois and e.date_imputation<c.mois+interval '1 month'
      and exists(select 1 from public.mandat_lignes l where l.mandat_id=c.id and l.organization_id=c.organization_id
        and l.lot_id=e.lot_id and l.date_debut<c.mois+interval '1 month' and (l.date_fin is null or l.date_fin>=c.mois))
  ),0) from candidats c on conflict(mandat_id,mois) do nothing returning id,organization_id
 )
 insert into public.automation_events(organization_id,origine,domaine,action,dossier_type,dossier_id,cle_unique)
 select organization_id,'automatique','finance','Compte rendu mensuel préparé','rapport',id,'rapport_prepare:'||id from crees;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.preparer_rapports_automatiques() from public,anon,authenticated;
grant execute on function public.preparer_rapports_automatiques() to service_role;
