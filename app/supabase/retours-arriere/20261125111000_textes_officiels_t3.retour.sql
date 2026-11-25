-- RETOUR ARRIÈRE de 20261125111000_textes_officiels_t3.sql (textes officiels, lot T3 : complément de charges d'un exercice
-- ancien, terme d'un bail commencé un 29 février).
--
-- Rend aux trois fonctions leur ligne d'avant, à l'identique. RÉINTRODUIT les défauts corrigés : la base refuse de
-- nouveau, en le disant « prescrit », tout complément de charges d'un exercice clos depuis plus de trois ans ; un bail
-- commencé un 29 février finit de nouveau un jour trop tôt (27 février).
-- À SAVOIR : si le code de l'application n'est pas revenu en arrière lui aussi, l'écran propose encore de confirmer un
-- exercice ancien, et la base refuse ensuite : c'est un refus, jamais un montant faux.
-- Aucune donnée n'est modifiée ni supprimée : les régularisations et les congés enregistrés entre-temps restent tels quels.
-- Droits inchangés. Rejouable.
-- ORDRE (relecture de la fusion du 25/11, A-02) : la reprise du lot T3 (20261125151000) a remplacé, dans
-- `regulariser_charges` et `consommations_interne.emettre_regularisation`, la ligne du lot T3 par la confirmation
-- « reprise T3R-1 ». Ce retour se joue APRÈS celui de 20261125151000. Joué avant, il ne trouvait plus sa ligne, passait
-- sans rien dire, et la base restait dans l'état du lot T3 : il s'arrête désormais, avec une erreur qui le dit, sans rien
-- modifier (comme le retour de 20261125152000 devant une fonction réécrite depuis).

do $$
declare
  r record;
begin
  for r in select * from (values
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)'),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)')
  ) x(signature) loop
    if position('reprise T3R-1' in coalesce((select p.prosrc from pg_proc p where p.oid = to_regprocedure(r.signature)), '')) > 0 then
      raise exception 'Retour du lot T3 : % porte encore la reprise T3R-1 (migration 20261125151000) ; jouez d''abord le retour de 20261125151000, puis celui-ci. Rien n''est modifié', r.signature;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
  definition text;
  corps text;
begin
  for r in select * from (values
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)',
     $n$-- Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici quand make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date. Article 7-1 : le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas ; l'application avertit et fait confirmer.$n$,
     $a$if v_ecart < 0 and make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date then
    raise exception 'Exercice % prescrit : un complément de charges ne se réclame plus au-delà de trois ans (art. 7-1 loi du 6 juillet 1989). Seul un trop-perçu peut encore être rendu au locataire', p_annee;
  end if;$a$),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)',
     $n$/* Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici ; l'application avertit et fait confirmer. */$n$,
     $a$if v_ecart<0 and make_date(d.annee,12,31)<(public.aujourdhui_paris()-interval '3 years')::date then raise exception 'Exercice prescrit : aucun complément ne peut être réclamé au-delà de trois ans'; end if;$a$),
    ('public.terme_bail_calcule(uuid,date)',
     $n$v_terme := (v_debut + v_duree + coalesce(v_reconduction * v_k, interval '0'))::date; if extract(day from v_terme) >= extract(day from v_debut) then v_terme := v_terme - 1; end if; -- Lot T3 (T1R-2) : jour ramené en fin de mois = dernier jour du bail$n$,
     $a$v_terme := (v_debut + v_duree + coalesce(v_reconduction * v_k, interval '0'))::date - 1;$a$)
  ) x(signature, nouveau, ancien) loop
    select pg_get_functiondef(p.oid), p.prosrc into definition, corps
      from pg_proc p where p.oid = r.signature::regprocedure and p.prosecdef;
    if corps is null then
      raise exception 'Retour du lot T3 : fonction % introuvable ou inattendue', r.signature;
    end if;
    -- Déjà revenue (rejeu), ou migration jamais appliquée : rien à faire.
    continue when position(r.nouveau in corps) = 0;
    execute replace(definition, corps, replace(corps, r.nouveau, r.ancien));
  end loop;
end $$;
