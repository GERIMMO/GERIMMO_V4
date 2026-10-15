-- Décision X13 du 14 octobre 2026 (fiche FIN-13), recommandation suivie : « Encaisser » date le règlement du jour de Paris.
--
-- Avant : encaisser_reste_atomique insérait l'encaissement SANS date ; la base posait CURRENT_DATE, le jour du fuseau de la
-- session (UTC chez Supabase). Entre minuit et 2 h à Paris, le règlement et la pièce comptable que son déclencheur écrit portaient
-- donc la veille — et, le 1er janvier, l'année précédente du récapitulatif 2044 et du livre.
-- Maintenant : date_paiement = (now() at time zone 'Europe/Paris')::date, comme ARC-10 l'a fait pour les clients externes
-- de l'artisan (20261013120000). Le déclencheur ecrire_encaissement reprend cette date pour la pièce et l'imputation.
--
-- Cette migration NE TOUCHE AUCUN ENCAISSEMENT EXISTANT : la fonction ne datera que les règlements à venir. Les règlements
-- déjà enregistrés la veille d'un jour de création entre 22 h et 24 h UTC se repèrent par la requête de contrôle de la fiche FIN-13
-- (lecture seule) ; les corriger, s'il y en a, relève d'une décision écrite du dirigeant.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 et 20261014120000 :
-- une définition recopiée à la main écraserait ce que d'autres migrations y auraient ajouté. Si la définition n'est pas celle
-- attendue, la migration s'arrête. Elle se rejoue sans effet : la marque du correctif, présente dans la définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014410000_encaissement_reste_jour_de_paris.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure) into v_def;
  if position('Décision X13 du 15/10 (FIN-13)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$insert into public.encaissements(organization_id,bail_id,montant,mode,note)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X13 (encaissement) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision X13 du 15/10 (FIN-13) : le règlement est daté du jour de Paris, pas du jour du fuseau de la session
   -- (UTC chez Supabase) : entre minuit et 2 h à Paris, le règlement et la pièce comptable portaient la veille.
   insert into public.encaissements(organization_id,bail_id,montant,date_paiement,mode,note)$nouveau$);

  v_ancre := $ancre$values(p_org,p_bail,round(v_reste,2),'virement',$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X13 (encaissement) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$values(p_org,p_bail,round(v_reste,2),(now() at time zone 'Europe/Paris')::date,'virement',$nouveau$);

  execute v_def;
end $correctif$;

-- Droits : inchangés (authenticated exécute ; anon et PUBLIC non). `create or replace` conserve les droits en vigueur ;
-- on les redit ici pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric) to authenticated;

select public.fermer_fonctions_a_anon();
