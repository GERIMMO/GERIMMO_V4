-- Même singleton, RLS, second facteur et historique que les autres paramètres.
alter table public.supervision_identite
  add column souscriptions_payantes_ouvertes boolean not null default false;
grant select(souscriptions_payantes_ouvertes), update(souscriptions_payantes_ouvertes)
  on public.supervision_identite to authenticated;
