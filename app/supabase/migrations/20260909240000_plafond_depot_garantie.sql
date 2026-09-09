-- Audit fonctionnel 09/09 (P2) : le plafond légal du dépôt de garantie
-- n'était contrôlé qu'à l'activation du bail (activer_bail) — un brouillon
-- créé, corrigé, ou une écriture directe pouvaient poser un dépôt hors
-- plafond sans avertissement. Le contrôle vit désormais au plus près de la
-- donnée : trigger BEFORE sur public.baux.
--
-- Règle (RM-2.1.1 / RM-2.1.2 — wiki « Dépôt de garantie », loi ALUR) :
--   nu / colocation → 1 mois de loyer HORS CHARGES ; meublé → 2 mois.
--
-- Voulu : le trigger ne porte que sur insert et update des colonnes
-- concernées (type, loyer_hc, depot_garantie) — les lignes déjà en place ne
-- sont pas re-vérifiées, et une mise à jour du cycle de vie (etat, dates)
-- passe sans re-contrôle. Rien à contrôler tant que loyer_hc ou
-- depot_garantie est vide.

create or replace function public.controler_plafond_depot_garantie()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mois integer;
  v_plafond numeric;
begin
  if new.loyer_hc is null or new.depot_garantie is null then
    return new;
  end if;
  v_mois := case when new.type = 'meuble' then 2 else 1 end;
  v_plafond := v_mois * new.loyer_hc;
  if new.depot_garantie > v_plafond then
    raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €) pour un bail %',
      v_mois, v_plafond, new.type;
  end if;
  return new;
end;
$$;

drop trigger if exists plafond_depot_garantie on public.baux;
create trigger plafond_depot_garantie
  before insert or update of type, loyer_hc, depot_garantie on public.baux
  for each row execute function public.controler_plafond_depot_garantie();
