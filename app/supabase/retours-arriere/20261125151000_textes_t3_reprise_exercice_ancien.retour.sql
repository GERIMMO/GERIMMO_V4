-- RETOUR ARRIÈRE de 20261125151000_textes_t3_reprise_exercice_ancien.sql (reprise du lot T3, T3R-1 : confirmation d'un
-- complément de charges d'un exercice ancien exigée par la base).
--
-- Supprime les quatre secondes signatures (avec `p_exercice_ancien`) et rend à `regulariser_charges` et à
-- `consommations_interne.emettre_regularisation` la ligne du lot T3, à l'identique. RÉINTRODUIT le défaut corrigé : un
-- appel direct de ces fonctions enregistre de nouveau un complément d'un exercice clos depuis plus de trois ans sans
-- aucune confirmation (seule l'application la demande).
-- À SAVOIR : si le code de l'application n'est pas revenu en arrière lui aussi, il appelle les secondes signatures,
-- qui n'existent plus : la régularisation est refusée (fonction introuvable), jamais enregistrée avec un montant faux.
-- Aucune donnée modifiée ni supprimée : les régularisations enregistrées entre-temps restent telles quelles. Droits des
-- deux fonctions inchangés. À jouer AVANT le retour de 20261125111000 (lot T3), qui attend la ligne du lot T3. Rejouable.

do $retour_reprise_t3$
declare
  r record;
  definition text;
  corps text;
  debut integer;
  fin integer;
begin
  -- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
  -- dans ce bloc unique, qui passe ou s'arrête d'un tenant (un refus ou une erreur plus bas l'y laisse) ; sans quoi le
  -- chantier « Migrations Supabase » refuserait de rejouer la migration (« version déjà enregistrée »).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125151000';
  end if;
  for r in select * from (values
    -- (fonction, début du texte de la reprise, fin du texte de la reprise, ligne du lot T3 à rendre)
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)',
     '-- Lot T3 (R16-A1), reprise T3R-1 :',
     'à la charge du locataire'', p_annee;
  end if;',
     $a$-- Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici quand make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date. Article 7-1 : le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas ; l'application avertit et fait confirmer.$a$),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)',
     '/* Lot T3 (R16-A1), reprise T3R-1 :',
     'à la charge du locataire'', d.annee; end if;',
     $a$/* Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici ; l'application avertit et fait confirmer. */$a$)
  ) x(signature, ouverture, fermeture, ancien) loop
    select pg_get_functiondef(p.oid), p.prosrc into definition, corps
      from pg_proc p where p.oid = to_regprocedure(r.signature) and p.prosecdef;
    if corps is null then
      raise exception 'Retour de la reprise du lot T3 : fonction % introuvable ou inattendue ; rien n''est modifié', r.signature;
    end if;
    debut := position(r.ouverture in corps);
    -- Déjà revenue (rejeu), ou migration jamais appliquée : rien à faire.
    continue when debut = 0;
    fin := position(r.fermeture in substr(corps, debut));
    if fin = 0 then
      raise exception 'Retour de la reprise du lot T3 : texte de la reprise incomplet dans % ; rien n''est modifié', r.signature;
    end if;
    execute replace(definition, corps,
      substr(corps, 1, debut - 1) || r.ancien || substr(corps, debut + fin - 1 + length(r.fermeture)));
  end loop;

  -- Les secondes signatures (`p_exercice_ancien`) : dans le même bloc (reprise de la relecture de la fusion, X-02). Elles
  -- suivaient le bloc, en instructions à part : joué par `psql -f` sans ON_ERROR_STOP, un arrêt du bloc ci-dessus les
  -- laissait supprimer quand même, et les deux fonctions gardaient la reprise sans plus offrir la confirmation.
  drop function if exists public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean,boolean);
  drop function if exists public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean,boolean);
  drop function if exists public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean);
  drop function if exists consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean);
end $retour_reprise_t3$;
