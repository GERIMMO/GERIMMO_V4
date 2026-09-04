-- Périmètre « mon portefeuille » (maquette v3, RM-18.1.3) : chaque mandat
-- porte son agent titulaire. Null = mandat suivi par toute l'agence (état de
-- reprise : rien ne change tant que l'admin n'affecte pas). La réaffectation
-- change ce champ (RM-18.1.4) ; la suppléance temporaire (RM-18.1.6/7) reste
-- à modéliser (transfert sans changer le titulaire).
alter table public.mandats
  add column agent_account_id uuid references public.accounts (id);
comment on column public.mandats.agent_account_id is
  'Agent titulaire du mandat (RM-18.1.3) — null : suivi par toute l''agence.';
create index mandats_agent_idx on public.mandats (agent_account_id);
