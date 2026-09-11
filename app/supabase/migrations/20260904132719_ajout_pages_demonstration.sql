-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Pages de démonstration (maquettes) servies par la fonction "site" — additif, rien d'existant touché
create table public.site_pages (
  slug text primary key,
  html text not null default '',
  mis_a_jour timestamptz not null default now()
);
comment on table public.site_pages is 'Maquettes de démonstration Gerimmo — contenu servi par l''edge function site';
alter table public.site_pages enable row level security;
-- Lecture publique volontaire : ce sont des pages de démonstration destinées à être vues
create policy "lecture publique des maquettes" on public.site_pages for select using (true);
