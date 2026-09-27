-- Audit agence du 27/09 — deux incohérences de mandat.
--
-- 1. TITULAIRE D'UNE AUTRE ORGANISATION. `changerTitulaireMandat` écrivait
--    `agent_account_id` sans contrôle : rejoué en admin (transaction annulée),
--    un mandat d'Agence Alpha se confiait au compte de l'admin d'Agence Beta.
--    Aucun accès n'en découlait (le portefeuille filtre par adhésion), mais la
--    donnée mentait — et l'écran Administration comptait ce lot « à
--    confier ». Règle : le titulaire est un membre ACTIF de l'agence, agent ou
--    admin d'agence (RM-18.1.3/18.1.4). Un titulaire parti reste possible sur
--    les mandats déjà confiés (l'admin les voit « à confier ») : on ne contrôle
--    que les nouvelles affectations.
--
-- 2. MANDAT ACTIF SANS DATE DE DÉBUT. « Mandats & rapports » affichait un
--    mandat actif sans « depuis le » : rien ne renseigne `date_debut`, l'écran
--    n'a pas de champ pour elle. Au passage en « actif » (le mandat signé), la
--    date de début vide prend le jour de ce passage — la date à laquelle le
--    mandat a été constaté signé dans Gerimmo ; une date déjà saisie n'est pas
--    touchée.
--
-- Idempotent : create or replace, triggers recréés.

create or replace function public.controler_titulaire_mandat()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.agent_account_id is not null
     and (tg_op = 'INSERT' or new.agent_account_id is distinct from old.agent_account_id)
     and not exists (
       select 1 from public.memberships m
        where m.account_id = new.agent_account_id
          and m.organization_id = new.organization_id
          and m.status = 'active'
          and m.role in ('agent', 'admin_agence')) then
    raise exception 'Un mandat se confie à un agent ou à l''admin de l''agence : ce compte n''en fait pas partie';
  end if;

  if tg_op = 'UPDATE' and new.etat = 'actif' and old.etat is distinct from new.etat
     and new.date_debut is null then
    new.date_debut := current_date;
  end if;
  return new;
end $function$;

revoke execute on function public.controler_titulaire_mandat() from public, anon, authenticated;

drop trigger if exists mandats_titulaire_de_l_agence on public.mandats;
create trigger mandats_titulaire_de_l_agence
  before insert or update of agent_account_id, etat on public.mandats
  for each row execute function public.controler_titulaire_mandat();

select public.fermer_fonctions_a_anon();
