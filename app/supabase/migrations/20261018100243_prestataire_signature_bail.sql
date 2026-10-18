-- Conserve l'origine des circuits existants ; les nouveaux baux choisissent Zoho explicitement.
alter table public.bail_signature_circuits
  add column prestataire text not null default 'youtrust'
  check (prestataire in ('youtrust','zoho'));
alter table public.bail_signature_circuits drop constraint bail_signature_circuits_external_request_id_key;
create unique index bail_signature_reference_prestataire
  on public.bail_signature_circuits(prestataire,external_request_id);
