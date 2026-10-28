-- Relecture de la reconstruction neuve : les FK composites doivent disposer
-- d'un index dans le même ordre, pas seulement d'un index sur leur première clé.
create index if not exists compteurs_conso_bien_org_fk on public.compteurs_consommation(bien_id,organization_id);
create index if not exists compteurs_conso_lot_org_fk on public.compteurs_consommation(lot_id,organization_id);
create index if not exists compteurs_conso_bail_org_fk on public.compteurs_consommation(bail_referent,organization_id);
create index if not exists compteurs_conso_personne_org_fk on public.compteurs_consommation(personne_referente,organization_id);
create index if not exists consentements_documents_personne_org_fk on public.consentements_documents_locataire(person_id,organization_id);
create index if not exists consentements_documents_account_fk on public.consentements_documents_locataire(account_id);
create index if not exists contrats_fourniture_bien_org_fk on public.contrats_fourniture(bien_id,organization_id);
create index if not exists contrats_fourniture_lot_org_fk on public.contrats_fourniture(lot_id,organization_id);
create index if not exists demandes_releves_bail_org_fk on public.demandes_releves(bail_id,organization_id);
create index if not exists demandes_releves_compteur_org_fk on public.demandes_releves(compteur_id,organization_id);
create index if not exists demandes_releves_personne_org_fk on public.demandes_releves(personne_id,organization_id);
create index if not exists depots_releve_demande_org_fk on public.depots_photos_releve(demande_id,organization_id);
create index if not exists depots_releve_document_org_fk on public.depots_photos_releve(document_id,organization_id);
create index if not exists factures_fourniture_contrat_org_fk on public.factures_fourniture(contrat_id,organization_id);
create index if not exists factures_fourniture_document_org_fk on public.factures_fourniture(document_id,organization_id);
create index if not exists recommandes_ar24_auteur_fk on public.recommandes_ar24(auteur);
create index if not exists recommandes_ar24_bail_org_fk on public.recommandes_ar24(bail_id,organization_id);
create index if not exists recommandes_ar24_personne_org_fk on public.recommandes_ar24(personne_id,organization_id);
create index if not exists recommandes_ar24_remplace_fk on public.recommandes_ar24(remplace_id);
create index if not exists releves_conso_compteur_org_fk on public.releves_consommation(compteur_id,organization_id);
create index if not exists releves_conso_demande_org_fk on public.releves_consommation(demande_id,organization_id);
create index if not exists releves_conso_photo_org_fk on public.releves_consommation(photo_document_id,organization_id);
