-- Site vitrine : demandes de devis des agences (avant toute connexion).
-- Écriture ouverte au visiteur (formulaire public — insert seul, jamais de
-- lecture) ; lecture réservée au super admin (le circuit commercial est à lui,
-- module 16). Un fanion anti-robot est vérifié côté serveur applicatif.
create table public.demandes_devis (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  agence text check (char_length(agence) <= 200),
  telephone text check (char_length(telephone) <= 40),
  nb_lots text check (char_length(nb_lots) <= 40),
  message text check (char_length(message) <= 4000),
  created_at timestamptz not null default now(),
  traitee_le timestamptz
);
alter table public.demandes_devis enable row level security;

create policy demandes_devis_insert_public on public.demandes_devis
  for insert to anon, authenticated
  with check (true);
create policy demandes_devis_select_sa on public.demandes_devis
  for select using ((select public.is_super_admin()));
create policy demandes_devis_update_sa on public.demandes_devis
  for update using ((select public.is_super_admin()));
