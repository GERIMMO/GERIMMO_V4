-- Index des références et consultations de supervision ; aucun changement de droits.
create index supervision_consignes_createur_idx on public.supervision_consignes(cree_par);
create index supervision_versions_auteur_idx on public.supervision_consignes_versions(auteur);
create index supervision_versions_mission_idx on public.supervision_consignes_versions(mission);
create index supervision_versions_responsable_idx on public.supervision_consignes_versions(responsable);
create index supervision_accords_auteur_idx on public.supervision_consignes_accords(auteur);
create index supervision_taches_executant_idx on public.supervision_consignes_taches(executee_par);
create index supervision_operations_auteur_idx on public.supervision_operations(auteur);
create index supervision_vacances_precedent_idx on public.supervision_vacances(precedent);
create index supervision_vacances_consigne_idx on public.supervision_vacances(consigne_version);
create index supervision_vacances_responsable_idx on public.supervision_vacances(responsable);
create index supervision_vacances_createur_idx on public.supervision_vacances(cree_par);
create index supervision_arrets_auteur_idx on public.supervision_arrets(auteur);
create index supervision_alertes_destinataire_idx on public.supervision_alertes_internes(destinataire);
create index supervision_alertes_accuse_idx on public.supervision_alertes_internes(accusee_par);
-- Le journal est consulté par date et la preuve d'exécution par objet.
create index supervision_operations_date_idx on public.supervision_operations(cree_le desc);
create index supervision_operations_objet_action_idx on public.supervision_operations(objet,action);
