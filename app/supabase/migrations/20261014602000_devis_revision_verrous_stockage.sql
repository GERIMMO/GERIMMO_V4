-- Devis révisable (décision D18 du 14/10/2026) : reprise du 15/10 après relecture indépendante de la livraison 2
-- (20261014601000). Deux défauts reproduits, corrigés ici sans toucher aucune ligne existante.
--
-- 1. La version 2 ne pouvait pas partir de l'écran de l'artisan. Le serveur classe le PDF validé dans l'espace de
--    l'agence (`documents`, `<organisation>/devis-gerimmo/…`) avec le client de l'artisan ; la règle de stockage
--    `ged_insert_artisan` n'accepte cet emplacement que pour les agences de `orgs_de_mes_missions()` ou de
--    `orgs_de_mes_sollicitations_ouvertes()`, et cette dernière ne retenait que les demandes « envoyée ». Pendant une
--    révision (« revision_demandee »), le dépôt était refusé et l'envoi échouait (« Le PDF n'a pas pu être classé »).
--    Correction : la fonction compte aussi les demandes en révision. La valeur `revision_demandee` est comparée par le
--    texte (règle du lot : une valeur d'énumération nouvelle ne s'emploie pas comme littéral typé dans le même lot).
--
-- 2. Interblocage entre « retenir le devis A » et « demander une révision » (ou « refuser ») du devis B du même dossier :
--    retenir_devis verrouillait A puis le dossier, puis écrivait sur B ; les deux autres verrouillaient B puis le
--    dossier. La base tuait l'une des deux sessions (« deadlock detected », 40P01). Correction : les trois décisions
--    verrouillent le DOSSIER en premier ; elles se succèdent. Ancre d'UNE ligne, au nombre d'occurrences contrôlé, dans
--    la définition en vigueur (pg_get_functiondef) ; marque « Décision D18 du 14/10 (reprise du 15/10) ».
--
-- Se rejoue sans effet. Préalable : 20261014601000.
-- Retour arrière : app/supabase/retours-arriere/20261014602000_devis_revision_verrous_stockage.retour.sql

-- 0. Préalable.
do $correctif$
begin
  if to_regprocedure('public.demander_revision_devis(uuid,uuid,text,uuid)') is null then
    raise exception 'Décision D18 (reprise du 15/10) : la livraison 2 (20261014601000, demander_revision_devis) doit être appliquée d''abord';
  end if;
end $correctif$;

-- 1. Pendant une révision, l'artisan classe le PDF de sa version suivante dans l'espace de l'agence.
create or replace function public.orgs_de_mes_sollicitations_ouvertes()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Décision D18 du 14/10 (reprise du 15/10) : une demande en révision attend, elle aussi, un devis de l'artisan.
  select distinct s.organization_id
  from public.incident_sollicitations s
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and s.statut::text in ('envoyee', 'revision_demandee');
$$;
revoke all on function public.orgs_de_mes_sollicitations_ouvertes() from public, anon;
grant execute on function public.orgs_de_mes_sollicitations_ouvertes() to authenticated, service_role;

-- 2. Les trois décisions sur un devis verrouillent le dossier en premier.
do $correctif$
declare
  v_sig text;
  v_def text;
  v_ancre constant text := 'select * into d from public.incident_devis';
  v_commentaire constant text[] := array[
    '-- Ordre de verrou fixe, le même pour toute décision sur un devis : devis, puis sollicitation, puis incident.',
    '-- Ordre de verrou fixe, le même que le refus : devis, puis sollicitation, puis incident.'];
  v_c text;
begin
  foreach v_sig in array array['public.retenir_devis(uuid,uuid)',
                               'public.refuser_devis(uuid,uuid,text,uuid)',
                               'public.demander_revision_devis(uuid,uuid,text,uuid)'] loop
    select pg_get_functiondef(v_sig::regprocedure) into v_def;
    if position('Décision D18 du 14/10 (reprise du 15/10)' in v_def) > 0 then continue; end if;
    if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
      raise exception 'Décision D18 reprise du 15/10 (%) : définition inattendue (ancre absente ou répétée)', v_sig;
    end if;
    -- Le commentaire d'origine décrivait l'ancien ordre : il est retiré là où il figure (une fois au plus).
    foreach v_c in array v_commentaire loop
      if (length(v_def) - length(replace(v_def, v_c, ''))) > length(v_c) then
        raise exception 'Décision D18 reprise du 15/10 (%) : définition inattendue (commentaire répété)', v_sig;
      end if;
      v_def := replace(v_def, v_c, '-- Ordre de verrou : dossier, puis devis, puis demande (voir plus haut).');
    end loop;
    v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (reprise du 15/10) : le dossier est verrouillé EN PREMIER, avant tout devis. Toute
  -- décision sur un devis du même dossier attend ici : « retenir A » (qui écrit aussi sur B) ne croise plus « réviser B »
  -- ni « refuser B » (interblocage 40P01 reproduit le 15/10).
  perform 1 from public.incidents
  where organization_id = p_org
    and id = (select x.incident_id from public.incident_devis x where x.id = p_devis and x.organization_id = p_org)
  for update;
  select * into d from public.incident_devis$nouveau$);
    execute v_def;
  end loop;
end $correctif$;

select public.fermer_fonctions_a_anon();
