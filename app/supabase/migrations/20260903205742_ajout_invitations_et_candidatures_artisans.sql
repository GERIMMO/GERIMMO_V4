-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Parcours d'entrée : invitations locataire/agent + candidatures artisans (additif, ne touche rien d'existant)
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  person_id uuid references public.persons(id),
  email text not null,
  role text not null check (role in ('locataire','agent')),
  token text not null unique,
  statut text not null default 'envoyee' check (statut in ('envoyee','acceptee','expiree','annulee')),
  envoyee_le timestamptz not null default now(),
  expire_le timestamptz not null,
  renvois jsonb not null default '[]'::jsonb, -- journal des renvois (date, auteur), exigé par les specs
  created_at timestamptz not null default now()
);
comment on table public.invitations is 'Invitations locataires/agents — seul le propriétaire bailleur s''auto-inscrit';
alter table public.invitations enable row level security;

create table public.artisan_candidatures (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.persons(id),
  entreprise text not null,
  siret text not null,
  metier text not null,
  email text not null,
  telephone text not null,
  statut text not null default 'en_attente' check (statut in ('en_attente','documents_recus','validee','refusee','purgee')),
  cree_le timestamptz not null default now(),
  valide_le timestamptz,
  purge_prevue_le date, -- purge à 6 mois sans documents (spec)
  created_at timestamptz not null default now()
);
comment on table public.artisan_candidatures is 'Inscription artisan validée par le super admin avant affectation';
alter table public.artisan_candidatures enable row level security;
