-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Reprise de portefeuille : bascule d'une agence existante avec soldes d'ouverture
create table public.reprises_portefeuille (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  source text, -- fichier export, lecture IA des baux PDF, saisie guidée
  date_bascule date,
  statut text not null default 'en_cours' check (statut in ('en_cours','controle','basculee','abandonnee')),
  totaux jsonb not null default '{}'::jsonb, -- balance d'ouverture (écart zéro exigé avant bascule)
  cree_le timestamptz not null default now()
);
comment on table public.reprises_portefeuille is 'Bascule définitive — corrections ultérieures par écritures rectificatives';
alter table public.reprises_portefeuille enable row level security;

create table public.reprise_soldes (
  id uuid primary key default gen_random_uuid(),
  reprise_id uuid not null references public.reprises_portefeuille(id) on delete cascade,
  bail_id uuid references public.baux(id),
  person_id uuid references public.persons(id),
  type text not null, -- solde_locataire | depot_garantie | provision_charges | fonds_mandant
  montant numeric(12,2) not null,
  detenteur text check (detenteur in ('agence','proprietaire') or detenteur is null), -- pour les DG
  anomalie text, -- ex. 'DG sans détenteur', 'bail sans date IRL'
  statut text not null default 'a_valider' check (statut in ('a_valider','valide','corrige')),
  created_at timestamptz not null default now()
);
alter table public.reprise_soldes enable row level security;
