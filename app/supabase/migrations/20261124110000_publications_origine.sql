-- Décisions du dirigeant du 24/11/2026, lot D1 (reprise), Q13 — l'origine d'un article du Journal.
--
-- CE QUI EXISTAIT. Depuis le lot D1, chaque article affiche « Rédigé avec l'aide de l'IA ». Or la supervision peut
-- écrire un article entièrement à la main (brouillon vierge, interrupteur IA du 22/11) : la mention y serait fausse,
-- et une mention fausse est pire que pas de mention.
--
-- CE QUE POSE CETTE MIGRATION (additive : aucune ligne modifiée, rien de supprimé).
--   1. `publications.origine` : « ia » (rédigé avec l'aide de l'IA) ou « manuel » (écrit à la main). Valeur par
--      défaut « ia » : les articles existants viennent de la parution automatique ; l'application pose « manuel »
--      quand la supervision crée un brouillon vierge. La mention ne s'affiche que pour « ia ».
--   2. Un article « ia » le reste : un déclencheur refuse le passage de « ia » à « manuel ». Le sens inverse est
--      permis (un article écrit à la main qui reçoit ensuite une aide de l'IA devient « ia »).
--   3. Le site public lit cette colonne pour savoir s'il affiche la mention : elle rejoint la liste des colonnes
--      que le visiteur peut lire (même mécanisme que 20261019121000 ; la politique `publications_lecture_publique`,
--      qui ne montre que les articles parus, n'est pas touchée). Elle ne contient que « ia » ou « manuel ».
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124110000_publications_origine.retour.sql
set local lock_timeout = '10s';

alter table public.publications add column if not exists origine text not null default 'ia';
do $origine$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.publications'::regclass and conname = 'publications_origine_check') then
    alter table public.publications add constraint publications_origine_check check (origine in ('ia', 'manuel'));
  end if;
end $origine$;
comment on column public.publications.origine is
  'Origine de l''article : « ia » (rédigé avec l''aide de l''IA, mention affichée) ou « manuel » (écrit à la main, sans mention). Un article « ia » ne redevient jamais « manuel ».';

create or replace function public.publications_origine_ia_definitive()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.origine = 'ia' and new.origine is distinct from 'ia' then
    raise exception 'Un article rédigé avec l''aide de l''IA garde cette origine : elle ne revient pas à « manuel »';
  end if;
  return new;
end;
$$;
revoke all on function public.publications_origine_ia_definitive() from public, anon, authenticated;
drop trigger if exists publications_origine_ia_definitive on public.publications;
create trigger publications_origine_ia_definitive
  before update of origine on public.publications
  for each row execute function public.publications_origine_ia_definitive();

-- Le site public (journal/[slug]) lit l'origine pour afficher ou non la mention.
grant select (origine) on table public.publications to anon;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
