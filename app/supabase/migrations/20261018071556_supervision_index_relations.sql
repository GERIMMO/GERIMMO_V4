-- Index des relations de supervision : aucun changement des données ou des droits.
create index supervision_couts_auteur_idx on public.supervision_couts(auteur);
create index supervision_executions_decisions_auteur_idx on public.supervision_executions_decisions(auteur);
create index supervision_identite_modifie_par_idx on public.supervision_identite(modifie_par);
create index supervision_prospects_auteur_idx on public.supervision_prospects(auteur);
create index supervision_prospects_organisation_id_idx on public.supervision_prospects(organisation_id);
create index supervision_prospects_responsable_idx on public.supervision_prospects(responsable);
create index supervision_registre_auteur_idx on public.supervision_registre(auteur);
