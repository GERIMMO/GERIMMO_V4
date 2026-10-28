-- Retour à la lecture avant conservation des baux terminés.
create or replace function public.mes_incidents_locataire(p_org uuid)
returns table (id uuid, numero text, categorie text, piece text, description text,
               anciennete text, urgence public.incident_urgence, etat public.incident_etat,
               imputation public.incident_imputation, imputation_justification text,
               imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
               clos_le timestamptz, declare_le timestamptz, lot_nom text,
               nb_photos bigint, est_declarant boolean)
language sql stable security definer set search_path to '' as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  mes_baux as (
    select b.id from public.baux b
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal in (select id from mes_fiches)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id in (select id from mes_fiches)))
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.organization_id = p_org
            and dl.entite = 'incident' and dl.entite_id = i.id),
         -- FL-01 : le déclarant, ou le locataire principal du bail rattaché à un incident ouvert par le gérant.
         coalesce(public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id) in (select id from mes_fiches), false)
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.bail_id in (select id from mes_baux))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

