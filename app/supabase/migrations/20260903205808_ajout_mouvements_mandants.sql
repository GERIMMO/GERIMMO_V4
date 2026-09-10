-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Fonds mandants : mouvements du compte mandant, ventilation « à qui appartient chaque euro », TVA sur honoraires
create table public.mouvements_mandants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id), -- l'agence
  mandant_person_id uuid references public.persons(id),     -- le propriétaire mandant
  mandat_id uuid references public.mandats(id),
  type text not null, -- encaissement_loyer | versement_proprietaire | honoraires | reglement_artisan | provision_travaux | depot_garantie | transfert_dg | tva
  sens text not null check (sens in ('credit','debit')),
  montant numeric(12,2) not null check (montant >= 0),
  tva numeric(12,2) not null default 0, -- TVA 20 % sur honoraires
  appartient_a text not null default 'proprietaire' check (appartient_a in ('proprietaire','locataire','etat','agence')),
  piece text,
  date_mouvement date not null,
  ecriture_id uuid references public.ecritures(id),
  cree_le timestamptz not null default now()
);
comment on table public.mouvements_mandants is 'Chaque euro détenu est dû à un propriétaire, un locataire ou l''État — ventilation contrôlée par le garant financier';
alter table public.mouvements_mandants enable row level security;
