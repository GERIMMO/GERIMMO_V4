-- Correctifs de l'audit du 13 octobre 2026 (registre des anomalies) : traces,
-- portefeuille, reprise et arrêt d'urgence.
--
-- Rien ici ne touche une ligne existante. Sept fonctions sont modifiées EN
-- RELISANT leur définition en vigueur (pg_get_functiondef) puis en y ajoutant
-- un morceau, comme le fait déjà 20260913150000 pour les gardes de portefeuille :
-- une fonction réécrite à la main écraserait les gardes injectées par les
-- migrations suivantes (c'est ce que le test « incidents dans le portefeuille
-- de l'agent » a montré pour annuler_mission). Si la définition en vigueur n'est
-- pas celle attendue, la migration s'arrête et ne change rien.
-- La liste des types d'événement d'incident gagne une valeur.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.
--
--   AUD-A-01  definir_equipements_lot : un agent restreint ne touche que son portefeuille
--   AUD-A-02  contre_ecriture         : l'annulation d'une écriture garde son auteur
--   AUD-A-03  annuler_mission         : l'annulation d'une mission laisse un événement d'incident
--   AUD-A-04  supprimer_detention     : la suppression d'une détention laisse une trace
--   SUP-02    poser_gardes_diagnostic_artisan : l'arrêt d'urgence reste possible pendant un diagnostic
--   SUP-08    traiter_vacances        : une alerte déjà escaladée n'est pas requalifiée
--   REP-01    contre_proposer_creneaux : un second envoi ne refuse pas les créneaux du locataire

-- AUD-A-03 (1/2) : le fil de l'incident sait dire l'annulation d'une mission.
alter table public.incident_evenements drop constraint if exists incident_evenements_type_check;
alter table public.incident_evenements add constraint incident_evenements_type_check
  check (type = any (array[
    'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
    'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
    'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
    'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
    'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
    'creneaux_refuses', 'facture_deposee', 'facture_validee', 'mission_annulee'
  ]::text[]));

-- AUD-A-01
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.definir_equipements_lot(uuid,uuid[])'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$    raise exception 'Accès refusé';
  end if;
  if exists ($ancre$, ''))) <> length($ancre$    raise exception 'Accès refusé';
  end if;
  if exists ($ancre$) then
    raise exception 'Correctif AUD-A-01 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$    raise exception 'Accès refusé';
  end if;
  if exists ($ancre$, $nouveau$    raise exception 'Accès refusé';
  end if;
  -- Audit du 13/10 (AUD-A-01) : un agent restreint ne modifie que les lots de
  -- son portefeuille, comme partout ailleurs dans la gestion du parc.
  if public.lot_hors_portefeuille(v_org, p_lot) then
    raise exception 'Accès refusé';
  end if;
  if exists ($nouveau$);
  execute v_def;
end $correctif$;

-- AUD-A-02
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.contre_ecriture(uuid,text)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$  returning id into v_new;
  return v_new;$ancre$, ''))) <> length($ancre$  returning id into v_new;
  return v_new;$ancre$) then
    raise exception 'Correctif AUD-A-02 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$  returning id into v_new;
  return v_new;$ancre$, $nouveau$  returning id into v_new;
  -- Audit du 13/10 (AUD-A-02) : qui a annulé quelle écriture, et laquelle l'annule.
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), v.organization_id, 'contre_ecriture',
          jsonb_build_object('ecriture_annulee', v.id, 'contre_ecriture', v_new,
                             'categorie', v.categorie, 'sens', v.sens, 'montant', v.montant));
  return v_new;$nouveau$);
  execute v_def;
end $correctif$;

-- AUD-A-03 (2/2)
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.annuler_mission(uuid,uuid,text)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$  where id = v.incident_id and etat in ('affecte', 'en_cours');
$ancre$, ''))) <> length($ancre$  where id = v.incident_id and etat in ('affecte', 'en_cours');
$ancre$) then
    raise exception 'Correctif AUD-A-03 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$  where id = v.incident_id and etat in ('affecte', 'en_cours');
$ancre$, $nouveau$  where id = v.incident_id and etat in ('affecte', 'en_cours');
  -- Audit du 13/10 (AUD-A-03) : qui a annulé la mission, et quand. Le motif
  -- reste sur l'intervention (annulation_motif) : le fil de l'incident est lu
  -- par le locataire et l'artisan, il ne porte pas de remarque interne.
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'mission_annulee', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention));
$nouveau$);
  execute v_def;
end $correctif$;

-- AUD-A-04
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.supprimer_detention(uuid)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$  delete from public.detentions where id = p_detention;
$ancre$, ''))) <> length($ancre$  delete from public.detentions where id = p_detention;
$ancre$) then
    raise exception 'Correctif AUD-A-04 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$  delete from public.detentions where id = p_detention;
$ancre$, $nouveau$  -- Audit du 13/10 (AUD-A-04) : une quote-part de propriété qui disparaît laisse
  -- une trace (identifiants seulement : aucun nom, aucune adresse).
  insert into public.audit_log (account_id, organization_id, action, details)
  select (select auth.uid()), d.organization_id, 'detention_supprimee',
         jsonb_build_object('detention_id', d.id, 'lot_id', d.lot_id, 'person_id', d.person_id,
                            'quote_part', d.quote_part, 'date_debut', d.date_debut, 'date_fin', d.date_fin)
  from public.detentions d where d.id = p_detention;
  delete from public.detentions where id = p_detention;
$nouveau$);
  execute v_def;
end $correctif$;

-- SUP-02 : l'arrêt d'urgence (supervision_arrets, ses plans de vacances et son
-- journal) ne dépend jamais d'une session de diagnostic ouverte. La lecture
-- seule continue de couvrir toutes les données des artisans et des clients.
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.poser_gardes_diagnostic_artisan()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$tablename not in ('supervision_sessions_artisan','audit_log')$ancre$, ''))) <> length($ancre$tablename not in ('supervision_sessions_artisan','audit_log')$ancre$) then
    raise exception 'Correctif SUP-02 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$tablename not in ('supervision_sessions_artisan','audit_log')$ancre$, $nouveau$tablename not in ('supervision_sessions_artisan','audit_log','supervision_arrets','supervision_operations','supervision_vacances')$nouveau$);
  execute v_def;
end $correctif$;
drop trigger if exists diagnostic_artisan_lecture on public.supervision_arrets;
drop trigger if exists diagnostic_artisan_lecture on public.supervision_operations;
drop trigger if exists diagnostic_artisan_lecture on public.supervision_vacances;

-- SUP-08
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.traiter_vacances()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade');continue;$ancre$, ''))) <> length($ancre$update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade');continue;$ancre$) then
    raise exception 'Correctif SUP-08 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade');continue;$ancre$, $nouveau$-- Audit du 13/10 (SUP-08) : seules les alertes adressées au responsable qui a
   -- perdu son habilitation ; une alerte déjà escaladée vers le créateur du plan,
   -- lui habilité, garde son statut.
   update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade') and destinataire is not distinct from p.responsable;continue;$nouveau$);
  execute v_def;
end $correctif$;

-- REP-01
do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.contre_proposer_creneaux(uuid,uuid,jsonb)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, $ancre$  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';
$ancre$, ''))) <> length($ancre$  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';
$ancre$) then
    raise exception 'Correctif REP-01 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';
$ancre$, $nouveau$  -- Audit du 13/10 (REP-01) : la même liste déjà en attente (réponse perdue,
  -- double envoi) ne change rien : ni refus fantôme, ni alerte d'arbitrage.
  if exists (select 1 from public.intervention_creneaux
             where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose')
     and not exists (
       (select debut, fin from public.intervention_creneaux
        where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose'
        except
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz from jsonb_array_elements(p_creneaux) x)
       union all
       (select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz from jsonb_array_elements(p_creneaux) x
        except
        select debut, fin from public.intervention_creneaux
        where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose')) then
    return v_nb;
  end if;

  -- Seules les propositions de l'artisan sont refusées par cette contre-proposition ;
  -- une liste précédente du locataire, remplacée par la nouvelle, devient caduque
  -- (elle n'a pas été refusée, donc elle ne compte pas dans les six refus).
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose' and propose_par is distinct from 'locataire';
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = p_intervention and statut = 'propose' and propose_par = 'locataire';
$nouveau$);
  execute v_def;
end $correctif$;
