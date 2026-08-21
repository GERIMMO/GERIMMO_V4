-- Sprint 7 — optimisation : le comptage de photos de mes_incidents_locataire
-- filtrait document_liens sur (entite, entite_id) sans organization_id — or
-- l'index document_liens_entite_idx commence par organization_id et restait
-- donc inutilisé. On ajoute le filtre : l'index porte la requête et le
-- périmètre est plus strict (défense en profondeur).

create or replace function public.mes_incidents_locataire(p_org uuid)
returns table (
  id uuid, numero text, categorie text, piece text, description text,
  anciennete text, urgence public.incident_urgence, etat public.incident_etat,
  imputation public.incident_imputation, imputation_justification text,
  imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
  clos_le timestamptz, declare_le timestamptz, lot_nom text, nb_photos bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.organization_id = p_org
            and dl.entite = 'incident' and dl.entite_id = i.id)
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.lot_id in (
           select b.lot_id from public.baux b
           where b.organization_id = p_org and b.etat in ('actif', 'preavis')
             and (b.locataire_principal in (select id from mes_fiches)
                  or exists (select 1 from public.bail_personnes bp
                             where bp.bail_id = b.id and bp.role = 'colocataire'
                               and bp.person_id in (select id from mes_fiches)))))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
