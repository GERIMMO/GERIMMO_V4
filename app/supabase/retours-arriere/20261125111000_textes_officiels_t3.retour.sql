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
