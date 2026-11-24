-- RETOUR ARRIÈRE de 20261124130000_revision_loyer_reprise_d2.sql (décisions du dirigeant du 24/11/2026, lot D2, reprise).
--
-- Rend à `reviser_loyer(uuid,numeric,text,date)` sa définition d'avant (mêmes six endroits, relus dans la définition EN
-- VIGUEUR et attendus une seule fois chacun), supprime la seconde signature à cinq paramètres, rend au déclencheur
-- `a_revision_du_bail` sa fonction du 24/11 (migration 20261124100000) et retire la fonction de lecture du locataire.
-- Une base déjà revenue, ou qui n'a jamais reçu la reprise, est laissée telle quelle (rejouable) ; une fonction qui ne
-- porte qu'une partie de la reprise (réécrite depuis) arrête le script sans rien modifier. Un seul bloc (fonction du déclencheur comprise) : atomique.
--
-- RÉINTRODUIT l'état d'avant : une révision non faite est rattrapée l'année suivante (700 → 742 € dans l'exemple de la
-- migration) ; une demande antidatée fait gagner un terme ; un bail terminé se révise ; un terme d'avant un avenant,
-- appelé en retard entre deux révisions, prend le loyer de l'avenant ; l'espace du locataire n'annonce plus le loyer à venir.
-- AUCUNE DONNÉE N'EST MODIFIÉE NI SUPPRIMÉE : la colonne `revisions_loyer.irl_reference_trimestre` et ses valeurs sont
-- gardées (les lettres déjà établies restent exactes). Les révisions et les appels de loyer ne sont pas recalculés.
-- À jouer AVANT le retour de 20261124100000 : les lignes de la reprise se servent des variables de ce lot ; joué en
-- premier, le retour de ce lot s'arrête sur une erreur de PostgreSQL (variable inconnue) sans rien modifier. Et APRÈS le retour du code
-- (le code de la reprise appelle la signature à cinq paramètres pour le cas de l'année non faite, et la fonction de
-- lecture du locataire ; sans elle, l'espace du locataire affiche le loyer du bail comme avant, sans annonce).
do $retour$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les six endroits complétés : [texte d'avant, texte de la reprise]. Mêmes textes que la migration.
  c_endroits constant text[][] := array[
    -- 1. Deux variables : l'indice de l'année précédente reçu, et son trimestre.
    [E'declare\n  v record;\n',
     E'declare\n  v record;\n  v_irl_precedent numeric;\n  v_reference_trimestre text;\n'],
    -- 2. Bail terminé : refus, après le contrôle de l'appelant.
    [E'  if not v.revision_irl then\n',
     $bloc$  -- Reprise du lot D2 (24/11/2026) : un bail terminé ne se révise plus. Un bail en préavis reste révisable.
  if v.etat = 'termine' then
    raise exception 'Révision refusée : ce bail est terminé, son loyer ne se révise plus';
  end if;
  if not v.revision_irl then
$bloc$],
    -- 3. Le premier terme révisé ne se gagne pas en antidatant la demande.
    [E'    from public.appels_loyer a where a.bail_id = p_bail;\n',
     $bloc$    from public.appels_loyer a where a.bail_id = p_bail;
  -- Reprise du lot D2 : antidater la demande ne fait pas gagner un terme. Le premier terme révisé suit aussi le jour de
  -- l'enregistrement (jour de Paris) : c'est le plus tardif des deux.
  v_premier_terme := greatest(v_premier_terme, (date_trunc('month', v_aujourdhui) + interval '1 month')::date);
$bloc$],
    -- 4. Révision d'une année non faite : calcul sur un an, avec l'indice de l'année précédente.
    [E'  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);\n',
     $bloc$  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);

  -- Reprise du lot D2 (décision du 24/11/2026). La formule de la fiche officielle lue porte sur UN an : indice du
  -- trimestre de référence de l'année en cours / indice du même trimestre de l'année précédente. Quand l'indice nouveau
  -- est postérieur de plus d'un an à l'indice de référence, la révision d'une année au moins n'a pas été faite : elle
  -- n'est pas rattrapée. Le calcul prend l'indice du même trimestre de l'année précédente.
  -- Cet indice est le paramètre p_irl_precedent de reviser_loyer à CINQ paramètres, qui le dépose pour cette fonction
  -- dans le réglage « gerimmo.irl_precedent », le temps de l'appel. Appelée directement (quatre paramètres), cette
  -- fonction ne le reçoit pas et refuse donc ce cas.
  -- Écart d'un an (cas normal) : rien ne change, l'indice de l'année précédente n'est pas lu.
  if v_annee_ref is not null and v_annee > v_annee_ref + 1 then
    v_irl_precedent := nullif(current_setting('gerimmo.irl_precedent', true), '')::numeric;
    if v_irl_precedent is null or v_irl_precedent <= 0 then
      raise exception 'Indice du T% % obligatoire : l''indice de référence de ce bail est celui de %, la révision d''une année au moins n''a pas été faite. Elle n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_annee_ref, v_trim, v_annee - 1;
    end if;
    v_reference := v_irl_precedent;
    v_reference_trimestre := 'T' || v_trim || ' ' || (v_annee - 1);
  end if;
$bloc$],
    -- 5 et 6. Le trimestre de cet indice est écrit sur la révision.
    ['nouveau_loyer, irl_reference, irl_nouveau,',
     'nouveau_loyer, irl_reference, irl_reference_trimestre, irl_nouveau,'],
    ['v_nouveau, v_reference, p_irl_nouveau,',
     'v_nouveau, v_reference, v_reference_trimestre, p_irl_nouveau,']
  ];
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Combien des six ajouts de la reprise se lisent (une fois chacun) dans la définition en vigueur.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    end if;
  end loop;
  if v_apres = 6 then
    foreach paire slice 1 in array c_endroits loop
      v_def := replace(v_def, paire[2], paire[1]);
    end loop;
    execute v_def;
    raise notice '% : définition d''avant rétablie', c_signature;
  elsif v_apres = 0 then
    -- Déjà revenue, ou base qui n'a jamais reçu la reprise : aucun de ses ajouts ne s'y lit.
    raise notice '% : aucun ajout de la reprise, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % ne porte qu''une partie de la reprise (% endroit(s) sur 6) : définition réécrite depuis, rien n''est modifié.',
      c_signature, v_apres;
  end if;

  drop function if exists public.reviser_loyer(uuid, numeric, text, date, numeric);
  drop function if exists public.revisions_de_mon_loyer_locataire(uuid);

  -- Le déclencheur retrouve sa fonction du 24/11 (migration 20261124100000), recopiée telle quelle. Sur une base qui n'a
  -- pas cette fonction (lot D2 jamais appliqué ou déjà défait), rien n'est créé.
  if to_regprocedure('public.appliquer_revision_a_l_appel()') is not null then
  create or replace function public.appliquer_revision_a_l_appel()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $fonction$
declare
  r record;
  m record;
begin
  -- La révision dont le premier terme révisé suit ce terme ; s'il y en a plusieurs, la plus ancienne : son « ancien
  -- loyer » est celui qui valait pour ce terme.
  select rv.ancien_loyer, rv.created_at into r
    from public.revisions_loyer rv
   where rv.bail_id = new.bail_id and rv.premier_terme is not null and rv.premier_terme > new.periode
   order by rv.premier_terme, rv.created_at
   limit 1;
  if not found then return new; end if;
  if exists (select 1 from public.avenants_bail av
              where av.bail_id = new.bail_id and av.annule_le is null and av.date_effet <= new.periode
                and av.applique_le >= r.created_at) then
    return new;
  end if;
  select * into m from public.montants_appel_loyer(new.bail_id, new.periode, r.ancien_loyer, 0);
  new.loyer_hc := m.loyer_hc;
  new.base_loyer_hc := r.ancien_loyer;
  new.montant_du := new.loyer_hc + new.charges;
  return new;
end;
$fonction$;
  revoke all on function public.appliquer_revision_a_l_appel() from public, anon, authenticated, service_role;
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261124130000';
end $retour$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
