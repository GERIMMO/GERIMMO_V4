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
-- UNE SEULE INSTRUCTION (reprise de la relecture de la fusion, X-02) : la garde est la première étape du bloc qui rend
-- les fonctions. Elle était auparavant un bloc DO à part : joué par `psql -f` sans `-v ON_ERROR_STOP=1`, psql affichait
-- l'erreur « Rien n'est modifié », jouait quand même le bloc suivant (le terme du bail revenait à son texte d'avant)
-- et sortait avec le code 0. Le fichier entier réussit ou échoue d'un bloc, avec ou sans ON_ERROR_STOP.

do $$
declare
  r record;
  definition text;
  corps text;
begin
  -- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
  -- dans ce bloc unique, qui passe ou s'arrête d'un tenant (un refus ou une erreur plus bas l'y laisse) ; sans quoi le
  -- chantier « Migrations Supabase » refuserait de rejouer la migration (« version déjà enregistrée »).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125111000';
  end if;
  -- Garde de l'ordre (A-02), dans le même bloc que la restitution (X-02) : elle s'arrête avant toute modification.
  for r in select * from (values
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)'),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)')
  ) x(signature) loop
    if position('reprise T3R-1' in coalesce((select p.prosrc from pg_proc p where p.oid = to_regprocedure(r.signature)), '')) > 0 then
      raise exception 'Retour du lot T3 : % porte encore la reprise T3R-1 (migration 20261125151000) ; jouez d''abord le retour de 20261125151000, puis celui-ci. Rien n''est modifié', r.signature;
    end if;
  end loop;

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
