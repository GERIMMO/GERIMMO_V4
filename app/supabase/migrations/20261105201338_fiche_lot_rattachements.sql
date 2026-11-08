alter table public.contrats_fourniture
  add column souscripteur varchar(150),
  add column payeur varchar(150);

-- La clé composée protège aussi les divisionnaires lors de la modification du principal.
alter table public.compteurs_consommation
  add column compteur_principal_id uuid,
  add column commun boolean generated always as (lot_id is null) stored,
  add column principal_commun boolean generated always as (true) stored,
  add constraint compteur_divisionnaire_du_lot check (compteur_principal_id is null or lot_id is not null),
  add unique (id, organization_id, bien_id, type, unite, commun),
  add foreign key (compteur_principal_id, organization_id, bien_id, type, unite, principal_commun)
    references public.compteurs_consommation (id, organization_id, bien_id, type, unite, commun);
create index compteurs_principal_idx on public.compteurs_consommation(compteur_principal_id)
  where compteur_principal_id is not null;

create view public.incidents_resume_lot with (security_invoker = true) as
select i.id, i.organization_id, i.lot_id, i.numero, i.categorie, i.piece, i.description,
  i.urgence, i.etat, i.created_at, i.imputation, i.imputation_contestation,
  m.id as mission_id, m.statut as mission_statut, m.debut_prevu,
  a.raison_sociale as artisan, c.propose_par
from public.incidents i
left join lateral (
  select t.id, t.artisan_id, t.statut, t.debut_prevu
  from public.incident_interventions t
  where t.organization_id = i.organization_id and t.incident_id = i.id
  order by (t.statut::text in ('proposee','acceptee','planifiee','en_cours')) desc, t.confiee_le desc, t.id
  limit 1
) m on true
left join public.artisans a on a.id = m.artisan_id
left join lateral (
  select r.propose_par from public.intervention_creneaux r
  where r.organization_id = i.organization_id and r.intervention_id = m.id and r.statut = 'propose'
  order by r.debut, r.id limit 1
) c on true;
revoke all on public.incidents_resume_lot from public, anon;
grant select on public.incidents_resume_lot to authenticated;
