-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Documents à collecter : demandes de pièces aux personnes (dossier versionné, relances)
create table public.demandes_pieces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  person_id uuid not null references public.persons(id),
  type_piece text not null,
  statut text not null default 'en_attente' check (statut in ('en_attente','recue','annulee')),
  demandee_le timestamptz not null default now(),
  relancee_le timestamptz,
  recue_le timestamptz,
  document_id uuid references public.documents(id), -- pièce reçue (nouvelle version)
  remplace_document_id uuid references public.documents(id), -- version précédente conservée, seule la dernière affichée
  version int not null default 1,
  canal text not null default 'email_whatsapp',
  created_at timestamptz not null default now()
);
comment on table public.demandes_pieces is 'Demande de pièce au locataire/garant — le dossier suit la personne, pas le bail';
alter table public.demandes_pieces enable row level security;
