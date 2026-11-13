-- Une annulation porte la référence exacte de son écriture fiscale d’origine.
-- La vue respecte les droits de lecture des deux écritures et ne modifie pas le journal.
create or replace view public.journal_par_bien with (security_invoker=true) as
select e.id,e.organization_id,e.categorie,e.sens,e.montant,e.date_piece,e.date_imputation,
  e.avis_fiscal_id,e.libelle,e.lot_id,e.bail_id,e.encaissement_id,e.contre_ecriture_de,coalesce(e.bien_source_id,p.bien_id,l.bien_id,source.bien_source_id) as bien_id
from public.ecritures e
left join public.ecritures source on source.id=e.contre_ecriture_de and source.organization_id=e.organization_id
left join public.ecritures_factures_fourniture f on f.ecriture_id=e.id
left join public.paiements_factures_fourniture p on p.id=f.paiement_id and p.organization_id=e.organization_id
left join public.lots l on l.id=e.lot_id and l.organization_id=e.organization_id;
