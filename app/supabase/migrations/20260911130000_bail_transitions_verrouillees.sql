-- Un bail ne se blanchit pas par un détour — vérification du 2026-09-11.
--
-- CE QUI RESTAIT OUVERT. La garde du 2026-09-11 (20260911120000) exige les
-- mentions obligatoires sur la seule transition « brouillon → actif ». Rejoué
-- en base locale sous l'identité d'un admin d'agence, avec la seule policy
-- `baux_update` (aucune fonction, deux requêtes PostgREST) :
--
--   update public.baux set etat = 'preavis' where id = …;   -- passe
--   update public.baux set etat = 'actif'   where id = …;   -- passe
--   -> etat = actif, loyer_hc = NULL, date_debut = NULL, lot = loué
--
-- Le détour par « terminé » donne le même résultat. La garde ne regarde que
-- l'état PRÉCÉDENT : un saut supplémentaire lui fait oublier que ce bail était
-- un brouillon. Le défaut d'origine était donc reproductible à l'identique.
--
-- LA RÈGLE. Ces deux sauts ne sont pas des trous à boucher au cas par cas :
-- ce sont des transitions que le référentiel interdit déjà.
--   · wiki « Machines à états et événements », RM-A5.1 — « toute transition
--     non listée est interdite » ; la machine du bail liste
--     « brouillon → à signer → actif → préavis → terminé » : « brouillon →
--     préavis » n'y figure pas, et de fait `enregistrer_conge` refuse déjà
--     « Seul un bail actif peut recevoir un congé ».
--   · RM-A5.2 — « un état terminal n'a aucune sortie » ; wiki « Bail », machine
--     à états : « Interdits : … terminé → actif (nouveau bail requis) ».
-- Les deux pages nomment le second cas mot pour mot ; le contrôle manquait.
--
-- ET LA SECONDE PORTE. Une mention obligatoire déjà portée par un bail VIVANT
-- pouvait lui être retirée après coup, par la même policy :
--
--   select public.activer_bail(…);                                -- bail complet
--   update public.baux set loyer_hc = null where id = …;          -- passait
--   select public.generer_appels_loyer(…);  -> appel à 0,00 €
--
-- soit l'état de fin que la garde du 2026-09-11 visait, atteint par l'autre
-- bout. Le produit ne corrige un bail signé qu'en le ramenant en brouillon
-- (`devalider_bail`, wiki « Bail ») ; l'écriture directe court-circuitait
-- « seul un brouillon se corrige ». On n'interdit que le RETRAIT : compléter
-- un bail ancien à qui la mention manque reste possible — c'est ainsi que le
-- pilote répare les baux d'avant la règle.

-- ---------------------------------------------------------------------------
-- 1. Les transitions que le référentiel interdit.
-- ---------------------------------------------------------------------------
-- Volontairement limité aux deux sauts qui blanchissent un brouillon : les
-- ENTRÉES en « terminé » (y compris « actif → terminé », hors machine mais
-- utilisée comme reprise d'historique) ne sont pas touchées, et « préavis →
-- actif » reste ouvert (`annuler_conge` : le locataire se rétracte).
create or replace function public.controler_transitions_du_bail()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.etat is not distinct from old.etat then
    return new;   -- l'état n'a pas bougé : rien à contrôler
  end if;

  -- RM-A5.2 : un état terminal n'a aucune sortie. Wiki « Bail » :
  -- « terminé → actif (nouveau bail requis) ».
  if old.etat = 'termine' then
    raise exception 'Un bail terminé ne revit pas : pour reloger, créez un nouveau bail (transition « terminé → % » interdite)',
      new.etat;
  end if;

  -- RM-A5.1 : toute transition non listée est interdite. Un congé se prend sur
  -- un bail actif, jamais sur un brouillon — sans quoi le brouillon revient en
  -- « actif » par la porte du préavis, sans ses mentions obligatoires.
  if old.etat = 'brouillon' and new.etat = 'preavis' then
    raise exception 'Un brouillon ne passe pas en préavis : un congé se prend sur un bail actif';
  end if;

  return new;
end;
$$;
revoke execute on function public.controler_transitions_du_bail() from public, anon, authenticated;

comment on function public.controler_transitions_du_bail() is
  'Transitions d''état du bail interdites par le référentiel (RM-A5.1 / RM-A5.2, wiki « Machines à états et événements » et « Bail »).';

drop trigger if exists baux_transitions_verrouillees on public.baux;
create trigger baux_transitions_verrouillees
  before update of etat on public.baux
  for each row execute function public.controler_transitions_du_bail();

-- ---------------------------------------------------------------------------
-- 2. Un bail vivant ne perd pas une mention qu'il porte.
-- ---------------------------------------------------------------------------
-- Delta par rapport au 2026-09-11 : la fonction garde son contrôle d'activation
-- mot pour mot, et refuse en plus le retrait. Le déclencheur écoute désormais
-- les trois colonnes de mentions, pas seulement `etat`.
create or replace function public.controler_mentions_a_l_activation()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_manquantes text[];
  v_retirees text[];
begin
  if old.etat = 'brouillon' and new.etat = 'actif' then
    v_manquantes := public.bail_mentions_manquantes_valeurs(
      new.locataire_principal, new.date_debut, new.loyer_hc);
    if array_length(v_manquantes, 1) > 0 then
      raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
        array_to_string(v_manquantes, ' ; ');
    end if;
  end if;

  -- Retrait sur un bail vivant : on compare ce qui manque APRÈS à ce qui
  -- manquait AVANT. Ne mord donc que sur ce que le bail portait déjà — un bail
  -- d'avant la règle se complète toujours, il ne se vide plus.
  if old.etat in ('actif', 'preavis') then
    v_retirees := array(
      select m from unnest(public.bail_mentions_manquantes_valeurs(
               new.locataire_principal, new.date_debut, new.loyer_hc)) as m
      except all
      select m from unnest(public.bail_mentions_manquantes_valeurs(
               old.locataire_principal, old.date_debut, old.loyer_hc)) as m);
    if array_length(v_retirees, 1) > 0 then
      raise exception 'Mentions obligatoires du bail : % — un bail en cours ne les perd pas ; corrigez-le en le ramenant en brouillon',
        array_to_string(v_retirees, ' ; ');
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.controler_mentions_a_l_activation() from public, anon, authenticated;

drop trigger if exists baux_mentions_a_l_activation on public.baux;
create trigger baux_mentions_a_l_activation
  before update of etat, locataire_principal, date_debut, loyer_hc on public.baux
  for each row execute function public.controler_mentions_a_l_activation();
