-- Compléments explicites du contrat type. Aucune valeur locative existante
-- n'est recalculée ; NULL signifie « à renseigner », jamais « non ».
alter table public.baux
  add column date_conclusion_prevue date,
  add column servitude_residence_principale boolean,
  add column encadrement_loyer boolean,
  add column zone_honoraires text check (zone_honoraires in ('tres_tendue', 'tendue', 'autre')),
  add column honoraires_edl_bailleur numeric(10,2) check (honoraires_edl_bailleur >= 0),
  add column honoraires_edl_locataire numeric(10,2) check (honoraires_edl_locataire >= 0),
  add column dpe_depenses_min numeric(10,2) check (dpe_depenses_min >= 0),
  add column dpe_depenses_max numeric(10,2) check (dpe_depenses_max >= 0),
  add column dpe_annees_reference text check (length(dpe_annees_reference) <= 100),
  -- Ces deux clauses figuraient déjà dans le modèle. Choix désormais visible.
  add column clause_resolutoire_assurance boolean not null default true,
  add column clause_resolutoire_troubles boolean not null default true,
  add column clause_resolutoire_servitude boolean not null default false,
  add constraint baux_depenses_dpe_ordre check (dpe_depenses_max >= dpe_depenses_min),
  add constraint baux_clause_servitude_coherente check
    (not clause_resolutoire_servitude or servitude_residence_principale is true);

-- Les nouveaux champs sont figés dès la sortie du brouillon, y compris via
-- un appel direct à la base. Les transitions et révisions existantes restent possibles.
create function public.proteger_mentions_contrat_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.etat <> 'brouillon' and row(
    new.date_conclusion_prevue, new.servitude_residence_principale, new.encadrement_loyer,
    new.zone_honoraires, new.honoraires_edl_bailleur, new.honoraires_edl_locataire,
    new.dpe_depenses_min, new.dpe_depenses_max, new.dpe_annees_reference,
    new.clause_resolutoire_assurance, new.clause_resolutoire_troubles, new.clause_resolutoire_servitude
  ) is distinct from row(
    old.date_conclusion_prevue, old.servitude_residence_principale, old.encadrement_loyer,
    old.zone_honoraires, old.honoraires_edl_bailleur, old.honoraires_edl_locataire,
    old.dpe_depenses_min, old.dpe_depenses_max, old.dpe_annees_reference,
    old.clause_resolutoire_assurance, old.clause_resolutoire_troubles, old.clause_resolutoire_servitude
  ) then
    raise exception 'Les mentions du contrat sont figées : seul un brouillon peut être corrigé';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_mentions_contrat_location() from public, anon, authenticated;
create trigger baux_proteger_mentions_contrat_location
before update on public.baux for each row
execute function public.proteger_mentions_contrat_location();
