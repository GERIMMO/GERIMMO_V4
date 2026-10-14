-- Les créneaux non retenus ne sont plus enregistrés « refusés » (audit du 13 octobre 2026, CHN-01,
-- décision D21, option A).
--
-- Constat : quand le locataire retient une date de l'artisan (choisir_creneau), ou quand l'artisan retient
-- une date du locataire (accepter_creneau_locataire), les autres dates encore en attente passaient à
-- « refuse ». Or personne ne les avait refusées : un choix écarte, il ne refuse pas. Après trois reports
-- du rendez-vous, six « refus » fantômes bloquaient l'artisan (« Six créneaux ont déjà été refusés »), et
-- l'écran du gérant écrivait « Refusé » en face de dates que le locataire n'avait jamais refusées.
--
-- Correction : ces deux fonctions passent les dates écartées à « caduc » (valeur d'énumération qui existe
-- déjà : aucune valeur nouvelle, aucune colonne nouvelle). `refuse_le` n'est plus posé pour elles.
-- Le décompte des six refus (proposer_creneaux, contre_proposer_creneaux, mon_suivi_intervention) et les
-- écrans de suivi lisent `statut = 'refuse'` : ils ne comptent désormais que des refus réels, puisque
-- seules deux fonctions écrivent encore « refuse » :
--   · contre_proposer_creneaux   : le locataire répond « Aucun ne me convient » (dates de l'artisan refusées) ;
--   · refuser_creneaux_locataire : l'artisan refuse les dates du locataire.
-- Leur texte n'est donc pas modifié.
--
-- NE REPREND PAS L'HISTORIQUE (option C de la décision, non retenue tant qu'un relevé de production en
-- lecture seule n'a pas trouvé de mission concernée) : aucune ligne existante n'est modifiée. Les créneaux
-- déjà enregistrés « refuse » par un ancien choix le restent et continuent de compter.
--
-- Les deux fonctions sont modifiées EN RELISANT leur définition en vigueur (pg_get_functiondef), comme
-- 20261013120000 : une fonction réécrite à la main écraserait les gardes injectées par les migrations
-- suivantes. Si la définition en vigueur n'est pas celle attendue, la migration s'arrête (dans la
-- transaction du chantier `migrations.yml`, rien ne subsiste). Elle se rejoue sans effet : chaque bloc
-- cherche la marque de son propre correctif et, si elle y est, ne fait rien.
--
-- Retour arrière : app/supabase/retours-arriere/20261014302000_creneaux_non_retenus_caducs.retour.sql

-- CHN-01 (1/2) : le locataire retient une date de l'artisan.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.choisir_creneau(uuid,uuid)'::regprocedure) into v_def;
  if position('Audit du 13/10 (CHN-01)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif CHN-01 (choisir_creneau) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Audit du 13/10 (CHN-01) : les autres dates ne sont pas refusées, elles sont écartées par
  -- ce choix. « caduc » ne compte pas dans les six refus qui déclenchent l'arbitrage.
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
$nouveau$);
  execute v_def;
end $correctif$;

-- CHN-01 (2/2) : l'artisan retient une date du locataire.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.accepter_creneau_locataire(uuid)'::regprocedure) into v_def;
  if position('Audit du 13/10 (CHN-01)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif CHN-01 (accepter_creneau_locataire) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Audit du 13/10 (CHN-01) : les autres dates du locataire ne sont pas refusées, elles sont
  -- écartées par ce choix. « caduc » ne compte pas dans les six refus qui déclenchent l'arbitrage.
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
$nouveau$);
  execute v_def;
end $correctif$;

-- Aucune fonction nouvelle, aucun droit modifié (create or replace conserve les droits) ; la fermeture
-- au rôle anonyme est rejouée par prudence, comme dans les migrations précédentes.
select public.fermer_fonctions_a_anon();
