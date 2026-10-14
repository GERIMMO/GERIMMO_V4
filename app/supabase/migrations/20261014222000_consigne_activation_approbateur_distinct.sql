-- D10 (audit du 13 octobre 2026, fiche SUP-04), option C : l'« approbation » d'une consigne est une
-- ACTIVATION tant que la consigne ne peut que lire deux compteurs ; un approbateur DISTINCT du
-- rédacteur est exigé dès qu'elle peut envoyer ou toucher un droit.
--
-- Constat (code lu le 14/10) : une consigne ne peut faire que deux choses, lire l'état d'une mission
-- (`lecture_missions`) et compter des passages (`lecture_passages`). La contrainte de
-- `supervision_consignes_taches.type`, `enregistrer_consigne` et `executer_tache_consigne` n'en
-- connaissent pas d'autre ; le texte de la consigne n'est jamais exécuté. Le rédacteur peut donc, pour
-- l'instant, activer sa propre consigne : rien ne change pour lui (un seul superviseur permanent rendrait
-- l'approbateur distinct impraticable). L'écran dit désormais « activation », pas « approbation ».
--
-- Pour le jour où un type de tâche agira : `tache_consigne_lecture_seule(type)` classe les types. Elle
-- ne dit « vrai » que pour les deux lectures ; un type nouveau ou inconnu est supposé pouvoir agir.
-- `decider_consigne` refuse alors qu'une version qui en porte au moins un soit approuvée par son
-- rédacteur. Refuser sa propre version reste permis (rien n'est activé). Aucune table, aucun droit, aucune
-- ligne existante n'est modifiée ; la règle ne s'applique à aucune consigne d'aujourd'hui.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme le fait
-- 20261013120000 : une réécriture à la main écraserait une garde qu'une autre migration y aurait injectée.
-- Si la définition n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet : le bloc
-- cherche la marque de son correctif dans la définition en vigueur et ne fait alors rien.
--
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Retour arrière :
-- app/supabase/retours-arriere/20261014222000_consigne_activation_approbateur_distinct.retour.sql.

-- Les types de tâche qui ne font que lire un compteur interne. Interne : appelée par decider_consigne
-- (security definer), jamais par un client. Miroir : src/lib/consignes-regles.ts.
create or replace function public.tache_consigne_lecture_seule(p_type text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_type in ('lecture_passages', 'lecture_missions'), false);
$$;
revoke all on function public.tache_consigne_lecture_seule(text) from public, anon, authenticated;

do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.decider_consigne(uuid,boolean)'::regprocedure) into v_def;
  if position('Audit du 14/10 (SUP-04)' in v_def) > 0 then return; end if;

  if (length(v_def) - length(replace(v_def, $ancre$if p_accepter is null then raise exception 'Décision requise'; end if;$ancre$, '')))
     <> length($ancre$if p_accepter is null then raise exception 'Décision requise'; end if;$ancre$) then
    raise exception 'Correctif SUP-04 : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$if p_accepter is null then raise exception 'Décision requise'; end if;$ancre$, $nouveau$if p_accepter is null then raise exception 'Décision requise'; end if;
 -- Audit du 14/10 (SUP-04) : décision D10, option C. Tant que toutes les tâches de la version ne font que
 -- lire, « approuver » est une activation et le rédacteur peut la faire. Dès qu'une tâche peut agir (envoyer,
 -- toucher un droit : tout type non classé « lecture seule »), l'approbation vient d'une autre personne.
 if p_accepter and v.auteur is not distinct from auth.uid()
    and exists(select 1 from public.supervision_consignes_taches z where z.version_id=p_version and not public.tache_consigne_lecture_seule(z.type)) then
  raise exception 'Cette consigne peut agir au-delà de la lecture : son approbation doit venir d’une autre personne que son rédacteur';
 end if;$nouveau$);

  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
