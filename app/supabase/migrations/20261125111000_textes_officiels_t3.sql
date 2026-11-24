-- Textes officiels, lot T3 (25/11/2026) — complément de charges d'un exercice ancien (R16-A1) et terme d'un bail commencé
-- un jour qui n'existe pas dans le mois d'arrivée (reprise T1R-2). Texte de référence : recueil fourni par le dirigeant
-- (article 7-1 de la loi du 6 juillet 1989), source et version déclarées, non recontrôlé.
--
-- 1. COMPLÉMENT DE CHARGES « PRESCRIT » (R16-A1). Article 7-1 : « Toutes actions dérivant d'un contrat de bail sont
--    prescrites par trois ans à compter du jour où le titulaire d'un droit a connu ou aurait dû connaître les faits lui
--    permettant d'exercer ce droit. » Les deux fonctions qui enregistrent une régularisation REFUSAIENT tout complément
--    dès que le 31 décembre de l'exercice avait plus de trois ans, en le disant « prescrit ». Le texte ne fait pas partir
--    le délai de la fin de l'exercice, et la base ne connaît pas le jour où le bailleur a connu les dépenses (comptes de
--    copropriété approuvés plus tard, délai interrompu) : elle pouvait refuser un complément encore dû.
--    Maintenant : la base ne refuse plus. L'application avertit (« peut-être prescrit ») et exige une confirmation
--    explicite avant d'appeler ces fonctions (actions/loyers.ts et actions/regularisation-fournitures.ts), comme elle le
--    fait déjà pour un exercice non terminé. Rien d'autre ne change dans ces fonctions : mêmes calculs, mêmes montants,
--    mêmes autres refus, même signature, mêmes droits.
--    Le commentaire laissé dans `regulariser_charges` garde l'ancienne condition écrite en toutes lettres : le retour de
--    20261014821000 compte les citations du jour de Paris dans cette fonction, leur nombre ne change pas.
--
-- 2. TERME DU BAIL (T1R-2). `terme_bail_calcule` rend le DERNIER JOUR du bail : « début + durée − 1 jour ». Quand le
--    quantième du début n'existe pas dans le mois d'arrivée, « début + durée » est déjà ramené au dernier jour de ce
--    mois ; en retirant encore un jour, un bail commencé le 29 février 2024 pour trois ans finissait le 27 février 2027
--    au lieu du 28 (l'anniversaire serait le 1er mars). La date limite du congé du bailleur tombait alors au 27 août au
--    lieu du 31 août. Maintenant : quand l'addition a ramené le jour en arrière, ce jour EST le dernier jour du bail.
--    Tous les autres baux gardent exactement le même terme.
--
-- CE QUI NE CHANGE PAS. Aucune donnée n'est écrite, modifiée ni supprimée : régularisations, montants, congés enregistrés
-- et dates d'effet restent ce qu'ils sont. Aucun droit n'est ouvert, aucune règle de lecture (RLS) n'est touchée.
-- Les trois fonctions sont reprises telles qu'installées ; seule la ligne visée est remplacée. Une définition inattendue
-- fait échouer la migration entière (rien n'est appliqué à moitié).
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125111000_textes_officiels_t3.retour.sql

do $$
declare
  r record;
  definition text;
  corps text;
  nouveau text;
  occurrences integer;
begin
  for r in select * from (values
    -- (fonction, motif de l'ancien texte, texte de remplacement, repère du nouveau texte)
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)',
     $m$if v_ecart < 0 and make_date\(p_annee, 12, 31\) < \(public\.aujourdhui_paris\(\) - interval '3 years'\)::date then\s+raise exception 'Exercice % prescrit[^;]*;\s+end if;$m$,
     $n$-- Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici quand make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date. Article 7-1 : le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas ; l'application avertit et fait confirmer.$n$,
     'Lot T3 (R16-A1)'),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)',
     $m$if v_ecart<0 and make_date\(d\.annee,12,31\)<\(public\.aujourdhui_paris\(\)-interval '3 years'\)::date then raise exception 'Exercice prescrit[^;]*; end if;$m$,
     $n$/* Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici ; l'application avertit et fait confirmer. */$n$,
     'Lot T3 (R16-A1)'),
    ('public.terme_bail_calcule(uuid,date)',
     $m$v_terme := \(v_debut \+ v_duree \+ coalesce\(v_reconduction \* v_k, interval '0'\)\)::date - 1;$m$,
     $n$v_terme := (v_debut + v_duree + coalesce(v_reconduction * v_k, interval '0'))::date; if extract(day from v_terme) >= extract(day from v_debut) then v_terme := v_terme - 1; end if; -- Lot T3 (T1R-2) : jour ramené en fin de mois = dernier jour du bail$n$,
     'Lot T3 (T1R-2)')
  ) x(signature, motif, remplacement, repere) loop
    select pg_get_functiondef(p.oid), p.prosrc into definition, corps
      from pg_proc p where p.oid = r.signature::regprocedure and p.prosecdef;
    if corps is null then
      raise exception 'Lot T3 : fonction % introuvable ou inattendue', r.signature;
    end if;
    -- Déjà appliquée (rejeu) : rien à faire.
    continue when position(r.repere in corps) > 0;
    select count(*) into occurrences from regexp_matches(corps, r.motif, 'g');
    if occurrences <> 1 then
      raise exception 'Lot T3 : définition inattendue pour % (% occurrence(s) de la ligne à remplacer)', r.signature, occurrences;
    end if;
    -- Le remplacement est inséré tel quel (aucun « \ » ni « & » interprété).
    nouveau := regexp_replace(corps, r.motif, replace(r.remplacement, '\', '\\'));
    execute replace(definition, corps, nouveau);
  end loop;
end $$;
