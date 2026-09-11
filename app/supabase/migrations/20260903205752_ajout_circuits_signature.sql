-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Signature électronique (Yousign) : circuits séquentiels et signataires
create table public.signature_circuits (
  id uuid primary key default gen_random_uuid(),
  bail_id uuid references public.baux(id),
  document_id uuid references public.documents(id), -- PDF généré ; le PDF signé sera un second document
  fournisseur text not null default 'yousign',
  statut text not null default 'en_cours' check (statut in ('en_cours','termine','expire','refuse','annule')),
  cree_le timestamptz not null default now(),
  expire_le timestamptz, -- expiration à 30 jours (spec)
  created_at timestamptz not null default now()
);
comment on table public.signature_circuits is 'Circuit séquentiel — sous mandat, l''agence signe à la place du propriétaire';
alter table public.signature_circuits enable row level security;

create table public.signature_signataires (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.signature_circuits(id) on delete cascade,
  ordre int not null,
  qualite text not null, -- ex. 'Agence pour le propriétaire (mandat)', 'locataire', 'garant'
  person_id uuid references public.persons(id),
  nom text not null,
  email text,
  statut text not null default 'en_attente' check (statut in ('en_attente','notifie','signe','refuse')),
  signe_le timestamptz,
  refus_motif text, -- refus explicite motivé (spec)
  relance_j7_le timestamptz,
  relance_j21_le timestamptz,
  alerte_j28_le timestamptz,
  created_at timestamptz not null default now()
);
alter table public.signature_signataires enable row level security;
