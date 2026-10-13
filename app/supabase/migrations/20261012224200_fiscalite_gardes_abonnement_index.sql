-- Complément FISC01–03 : mêmes gardes d’abonnement que les autres tables
-- d’organisation, posées uniquement sur les trois tables fiscales nouvelles.
-- Aucune donnée, fonction de calcul, politique RLS ou attribution de droit modifiée.
create trigger abonnement_fiscal_encaissements_composantes
 before insert or update or delete on public.fiscal_encaissements_composantes
 for each row execute function public.refuser_ecriture_si_fermee();
create trigger abonnement_fiscal_qualifications_ecritures
 before insert or update or delete on public.fiscal_qualifications_ecritures
 for each row execute function public.refuser_ecriture_si_fermee();
create trigger abonnement_fiscal_exercices_lots
 before insert or update or delete on public.fiscal_exercices_lots
 for each row execute function public.refuser_ecriture_si_fermee();

create index fiscal_encaissements_composantes_org_idx
 on public.fiscal_encaissements_composantes(organization_id);
create index fiscal_qualifications_ecritures_org_idx
 on public.fiscal_qualifications_ecritures(organization_id);
create index fiscal_qualifications_ecritures_lot_idx
 on public.fiscal_qualifications_ecritures(lot_id);
create index fiscal_qualifications_ecritures_auteur_idx
 on public.fiscal_qualifications_ecritures(auteur);
create index fiscal_exercices_lots_org_idx
 on public.fiscal_exercices_lots(organization_id);
create index fiscal_exercices_lots_auteur_idx
 on public.fiscal_exercices_lots(auteur);
