-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Solvabilité du locataire déjà retenu (pas de gestion de candidatures — décision projet)
create table public.controles_solvabilite (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  bail_id uuid references public.baux(id),
  revenus_mensuels numeric(10,2),
  loyer_cc numeric(10,2),
  taux_effort numeric(5,2), -- loyer CC / revenus, en %
  coherence text, -- ex. 'avis d''imposition ↔ fiches de paie : cohérents'
  resultat text not null default 'a_controler' check (resultat in ('a_controler','conforme','a_surveiller','incoherent')),
  controle_le timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.controles_solvabilite is 'Contrôle documentaire réservé au locataire retenu';
alter table public.controles_solvabilite enable row level security;
