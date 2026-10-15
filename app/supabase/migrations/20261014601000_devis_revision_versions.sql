-- Demande de révision d'un devis et versions suivantes (décision D18 du 14/10/2026, option A : seconde et
-- dernière livraison, après le refus motivé de 20261014600000 ; fiches ART-13 et PRO2-12).
--
-- Constat : après un devis reçu, le gérant ou le propriétaire ne pouvait ni demander une correction ni recevoir une
-- version 2 : la demande close devenait lecture seule pour l'artisan (ART-13). Pour obtenir une autre offre, il
-- fallait solliciter un autre artisan.
--
-- Ce que cette livraison ajoute (section A, états A.4, données A.5, droits A.6, erreurs A.7 ; réponses ratifiées :
-- trois versions au plus (A.15-2), sept jours de réponse au jour de Paris (A.15-3)) :
--   · deux valeurs d'énumération : devis `revise` (une révision a été demandée sur cette version), sollicitation
--     `revision_demandee` (l'artisan doit répondre par une version suivante ou renoncer) ; employées seulement dans
--     des corps de fonction (règle du lot : une valeur nouvelle n'est utilisable qu'une fois le lot validé) ;
--   · `incident_devis.version` (1 par défaut, aucune ligne réécrite), `devis_precedent_id` (clé étrangère composite
--     avec l'organisation), `note_revision` (« ce qui change », obligatoire dès la version 2, ≤ 4 000) ; la contrainte
--     « une seule réponse par demande » devient « une seule par demande ET version », plus un index partiel « un seul
--     devis vivant (déposé ou retenu) par demande » ;
--   · `incident_sollicitations.revision_avant` : le dernier jour (de Paris) où l'artisan peut répondre ;
--   · `demander_revision_devis(p_org, p_devis, p_motif, p_cle)` : devis `revise`, sollicitation `revision_demandee`
--     (échéance à sept jours), brouillon de l'artisan rouvert avec sa saisie (version précédente préremplie), événement
--     `devis_revision_demandee`, alerte « devis à décider » fermée (« Révision demandée »). Refusée au-delà de la
--     troisième version : seuls « retenir » et « refuser » restent. Rend vrai si la décision est nouvelle, faux au rejeu ;
--   · `deposer_devis` accepte une demande `revision_demandee` tant que l'échéance n'est pas passée : numéro de version,
--     lien à la version précédente, « ce qui change » lu dans le brouillon de l'artisan, artisan toujours affectable ;
--     événement `devis_revise` et alerte « nouvelle version, à décider » ;
--   · `decliner_sollicitation` accepte le renoncement depuis `revision_demandee` ; `solliciter_artisan` compte
--     `revision_demandee` dans le plafond de deux ; `retenir_devis` écarte aussi les demandes en révision et dit en clair
--     qu'une version révisée n'est plus sélectionnable ; les deux fonctions d'écartement (liste noire locale, décision
--     de plateforme) annulent aussi une demande en révision ;
--   · lecture : `mes_sollicitations` (version, motif de la révision, échéance ; une seule ligne par demande), nouvelle
--     `mes_versions_devis` (l'historique des versions de l'artisan, les siennes seules), `mon_suivi_intervention`
--     compte l'artisan en révision parmi les consultés, `mes_photos_incident_artisan` garde les photos visibles pendant
--     la révision, `lire_devis_structure` lit la dernière version ;
--   · échéance : `expirer_revisions_devis(p_jour)`, appelée par la tâche quotidienne `maintenance-artisans` (04 h 30 UTC,
--     jour de Paris) : la demande passe `expiree`, le devis reste `revise`, événement `devis_revision_expiree`, alerte
--     `devis_revision_expiree` au gérant ;
--   · la liste fermée des types d'événement gagne `devis_revision_demandee`, `devis_revise`, `devis_revision_expiree` ;
--     `libelle_generique_alerte` nomme la nouvelle alerte.
--
-- Aucune ligne existante n'est modifiée (les devis d'avant ont `version = 1`). Les fonctions existantes sont modifiées
-- EN RELISANT leur définition en vigueur (pg_get_functiondef), par des ancres d'UNE SEULE ligne au nombre d'occurrences
-- contrôlé. Les types de retour étendus passent par drop puis create, puis fermeture à anon. Elle se rejoue sans effet :
-- chaque bloc cherche la marque « Décision D18 du 14/10 (livraison 2) ». Préalable : 20261014600000.
--
-- Retour arrière : app/supabase/retours-arriere/20261014601000_devis_revision_versions.retour.sql

-- 0. Préalable.
do $correctif$
begin
  if to_regprocedure('public.refuser_devis(uuid,uuid,text,uuid)') is null then
    raise exception 'Décision D18 (livraison 2) : la livraison 1 (20261014600000, refuser_devis) doit être appliquée d''abord';
  end if;
end $correctif$;

-- 1. Les deux valeurs d'énumération.
alter type public.devis_statut add value if not exists 'revise';
alter type public.sollicitation_statut add value if not exists 'revision_demandee';

-- 2. Versions et échéance.
alter table public.incident_devis
  add column if not exists version integer not null default 1,
  add column if not exists devis_precedent_id uuid,
  add column if not exists note_revision text;
alter table public.incident_sollicitations
  add column if not exists revision_avant date;

do $correctif$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_version_check') then
    alter table public.incident_devis add constraint incident_devis_version_check check (version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_precedent_meme_org_fk') then
    alter table public.incident_devis add constraint incident_devis_precedent_meme_org_fk
      foreign key (devis_precedent_id, organization_id) references public.incident_devis(id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_version_coherente') then
    alter table public.incident_devis add constraint incident_devis_version_coherente check (
      (version = 1 and devis_precedent_id is null and note_revision is null)
      or (version > 1 and devis_precedent_id is not null and length(btrim(note_revision)) between 1 and 4000));
  end if;
  -- Une réponse par demande ET par version ; un seul devis vivant par demande (les valeurs du prédicat existent
  -- depuis l'origine : l'index se pose dans la transaction du lot).
  if exists (select 1 from pg_constraint where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_sollicitation_unique') then
    alter table public.incident_devis drop constraint incident_devis_sollicitation_unique;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_sollicitation_version_unique') then
    alter table public.incident_devis add constraint incident_devis_sollicitation_version_unique unique (sollicitation_id, version);
  end if;
end $correctif$;
create unique index if not exists incident_devis_un_vivant_par_sollicitation
  on public.incident_devis (sollicitation_id)
  where statut in ('depose', 'retenu');
create index if not exists incident_devis_precedent_idx on public.incident_devis (devis_precedent_id, organization_id);

comment on column public.incident_devis.version is
  'Numéro de version du devis sur sa demande (D18, livraison 2) : 1, puis 2 et 3 après une demande de révision. Trois au plus.';
comment on column public.incident_devis.devis_precedent_id is
  'La version que celle-ci remplace (D18, livraison 2). Nulle pour la version 1.';
comment on column public.incident_devis.note_revision is
  'Ce qui change par rapport à la version précédente, écrit par l''artisan (D18, livraison 2). Obligatoire dès la version 2.';
comment on column public.incident_sollicitations.revision_avant is
  'Dernier jour (de Paris) où l''artisan peut répondre à une demande de révision (D18, livraison 2 : sept jours). Au-delà, la demande expire.';

-- 3. Le fil de l'incident sait dire la révision.
do $correctif$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.incident_evenements'::regclass
               and conname = 'incident_evenements_type_check'
               and pg_get_constraintdef(oid) like '%devis_revision_expiree%') then
    return;
  end if;
  alter table public.incident_evenements drop constraint if exists incident_evenements_type_check;
  alter table public.incident_evenements add constraint incident_evenements_type_check
    check (type = any (array[
      'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
      'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
      'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
      'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
      'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
      'creneaux_refuses', 'facture_deposee', 'facture_validee', 'mission_annulee',
      'devis_refuse', 'devis_revision_demandee', 'devis_revise', 'devis_revision_expiree'
    ]::text[]));
end $correctif$;

-- 4. La demande de révision.
create or replace function public.demander_revision_devis(p_org uuid, p_devis uuid, p_motif text, p_cle uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
-- Décision D18 du 14/10 (livraison 2), fiches ART-13 et PRO2-12 : le gérant ou le propriétaire demande une
-- révision du devis reçu ; l'artisan répond par une version suivante (trois au plus) ou renonce, sous sept jours
-- (jour de Paris). Rend vrai si la décision est nouvelle, faux si le même envoi (même clé) est rejoué.
declare d record; s record; i record; v_motif text; v_avant date;
begin
  if public.devis_hors_portefeuille(p_org, p_devis) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if (select auth.uid()) is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la décision sur un devis appartient à l''agence ou au propriétaire' using errcode = '42501';
  end if;
  if p_cle is null then
    raise exception 'La référence de cet envoi manque : rechargez la page avant de demander la révision.';
  end if;
  v_motif := nullif(btrim(coalesce(p_motif, '')), '');
  if v_motif is null or length(v_motif) < 10 then
    raise exception 'Dites à l''artisan ce que vous demandez, en dix caractères au moins : ce texte lui est transmis.';
  end if;
  if length(v_motif) > 4000 then
    raise exception 'La demande de révision est trop longue : 4 000 caractères au plus.';
  end if;

  -- Ordre de verrou fixe, le même que le refus : devis, puis sollicitation, puis incident.
  select * into d from public.incident_devis where id = p_devis and organization_id = p_org for update;
  if not found then raise exception 'Devis introuvable'; end if;

  if d.statut = 'revise' and d.decision_cle = p_cle then
    return false;
  end if;
  if d.statut = 'revise' then
    raise exception 'Une révision de ce devis a déjà été demandée : attendez la réponse de l''artisan.';
  end if;
  if d.statut = 'refuse' then
    raise exception 'Ce devis a déjà été refusé : il ne peut plus être révisé.';
  end if;
  if d.statut = 'retenu' then
    raise exception 'Ce devis a déjà été retenu : la mission est confiée à l''artisan.';
  end if;
  if d.statut = 'non_retenu' then
    raise exception 'Un autre devis a été retenu sur ce dossier : celui-ci est déjà écarté.';
  end if;
  if d.statut = 'annule' then
    raise exception 'Ce devis a été annulé (artisan écarté) : il n''y a rien à réviser.';
  end if;
  if d.statut = 'expire' or d.valide_jusqu_au < public.aujourdhui_paris() then
    raise exception 'Ce devis a expiré le % : il est caduc, demandez une proposition à jour.', to_char(d.valide_jusqu_au, 'DD/MM/YYYY');
  end if;
  if d.statut <> 'depose' then
    raise exception 'Ce devis n''attend plus de décision.';
  end if;
  if d.version >= 3 then
    raise exception 'Dernière version possible : ce devis ne peut plus être révisé (trois versions au plus). Retenez-le ou refusez-le.';
  end if;

  select * into s from public.incident_sollicitations
  where id = d.sollicitation_id and organization_id = p_org for update;
  select * into i from public.incidents
  where id = d.incident_id and organization_id = p_org for update;
  if i.etat <> 'qualifie' then
    raise exception 'Ce dossier n''est plus en attente d''un artisan (déjà affecté, ou clos) : le devis ne peut plus être décidé ici.';
  end if;

  -- Sept jours de réponse, le dernier jour compris, au jour de Paris (réponse A.15-3).
  v_avant := public.aujourdhui_paris() + 7;

  update public.incident_devis
  set statut = 'revise', decision = 'revision', decide_par = (select auth.uid()), decide_le = now(),
      decision_motif = v_motif, decision_cle = p_cle
  where id = p_devis;
  update public.incident_sollicitations
  set statut = 'revision_demandee', revision_avant = v_avant
  where id = s.id;

  -- Le brouillon de l'artisan est rouvert : sa saisie reste (la version suivante part de la précédente), le PDF
  -- validé et le lien au devis envoyé sont vidés (le PDF de la version envoyée reste porté par incident_devis.document_id).
  update public.artisan_devis_preparations
  set statut = 'brouillon', revision = revision + 1, devis_id = null,
      pdf_path = null, pdf_sha = null, pdf_taille = null, valide_le = null, entreprise = null,
      pdf_bucket = 'devis-preparations', email_statut = 'non_envoye', updated_at = now()
  where sollicitation_id = s.id and artisan_id = d.artisan_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, d.incident_id, 'devis_revision_demandee', (select auth.uid()),
          jsonb_build_object('devis_id', p_devis, 'version', d.version, 'artisan_id', d.artisan_id,
                             'sollicitation_id', s.id, 'montant_ttc_cents', d.montant_ttc_cents,
                             'motif', v_motif, 'revision_avant', v_avant));
  return true;
end;
$$;
revoke all on function public.demander_revision_devis(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.demander_revision_devis(uuid, uuid, text, uuid) to authenticated, service_role;

-- 5. L'alerte « devis à décider » se ferme avec la bonne raison.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.fermer_alerte_devis_a_decider()'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$when 'refuse' then 'Devis refusé'$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (fermer_alerte_devis_a_decider) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$when 'refuse' then 'Devis refusé'
        -- Décision D18 du 14/10 (livraison 2) : la demande de révision ferme l'alerte ; la version suivante en ouvrira une autre.
        when 'revise' then 'Révision demandée'$nouveau$);
  execute v_def;
end $correctif$;

-- 6. deposer_devis : la version suivante, depuis une demande en révision.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;

  -- 6a. Variables.
  v_ancre := $ancre$declare v record; c record; v_devis uuid; v_doc uuid; v_echeance date;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$declare v record; c record; v_devis uuid; v_doc uuid; v_echeance date;
  -- Décision D18 du 14/10 (livraison 2) : numéro de version, version précédente et « ce qui change ».
  v_version integer := 1; v_precedent uuid; v_note text;$nouveau$);

  -- 6b. L'état accepté : « envoyée », ou « révision demandée » dans le délai.
  v_ancre := $ancre$if v.statut <> 'envoyee' then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$if v.statut = 'revision_demandee' then
    -- Décision D18 du 14/10 (livraison 2) : la version suivante répond à une demande de révision, dans le délai
    -- (jour de Paris, dernier jour compris), trois versions au plus, avec « ce qui change » lu dans le brouillon de
    -- l'artisan (c'est sa contre-proposition), par un artisan toujours affectable.
    if v.revision_avant is not null and v.revision_avant < public.aujourdhui_paris() then
      raise exception 'Le délai de réponse à la demande de révision est dépassé : cette demande est close.';
    end if;
    select d0.version + 1, d0.id into v_version, v_precedent from public.incident_devis d0
    where d0.sollicitation_id = p_sollicitation and d0.statut = 'revise'
    order by d0.version desc limit 1;
    if v_precedent is null then
      raise exception 'Aucune version précédente à réviser sur cette demande.';
    end if;
    if v_version > 3 then
      raise exception 'Trois versions au plus : ce devis ne peut plus être révisé.';
    end if;
    select nullif(btrim(p0.saisie->>'noteRevision'), '') into v_note from public.artisan_devis_preparations p0
    where p0.sollicitation_id = p_sollicitation and p0.artisan_id = v.artisan_id;
    if v_note is null then
      raise exception 'Dites ce qui change dans cette nouvelle version du devis.';
    end if;
    if length(v_note) > 4000 then
      raise exception 'Le texte « ce qui change » est trop long : 4 000 caractères au plus.';
    end if;
    if not public.artisan_affectable(v.artisan_id, v.organization_id,
         (select c0.metier from public.incident_consultations c0 where c0.id = v.consultation_id),
         (select c0.nature_travaux from public.incident_consultations c0 where c0.id = v.consultation_id)) then
      raise exception 'Votre profil ne permet plus de répondre à cette demande (attestation, validation ou zone) : la nouvelle version n''a pas été déposée.';
    end if;
  elsif v.statut <> 'envoyee' then$nouveau$);

  -- 6c. L'insertion porte la version.
  v_ancre := $ancre$montant_ttc_cents, description, valide_jusqu_au, document_id)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 3 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$montant_ttc_cents, description, valide_jusqu_au, document_id,
     version, devis_precedent_id, note_revision)$nouveau$);
  v_ancre := $ancre$p_montant_ttc_cents, trim(p_description), v_echeance, v_doc)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 4 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$p_montant_ttc_cents, trim(p_description), v_echeance, v_doc,
          v_version, v_precedent, v_note)$nouveau$);

  -- 6d. L'événement dit « nouvelle version » et porte le numéro.
  v_ancre := $ancre$values (v.organization_id, v.incident_id, 'devis', (select auth.uid()),$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 5 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$values (v.organization_id, v.incident_id, case when v_version > 1 then 'devis_revise' else 'devis' end, (select auth.uid()),$nouveau$);
  v_ancre := $ancre$jsonb_build_object('devis_id', v_devis, 'artisan_id', v.artisan_id,$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 6 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$jsonb_build_object('devis_id', v_devis, 'version', v_version, 'devis_precedent_id', v_precedent,
                             'note_revision', v_note, 'artisan_id', v.artisan_id,$nouveau$);

  -- 6e. L'alerte dit « nouvelle version » à partir de la deuxième.
  v_ancre := $ancre$'Devis reçu, à décider — ' || (select i.numero from public.incidents i where i.id = v.incident_id),$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 7 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$case when v_version > 1 then 'Nouvelle version du devis (v' || v_version || '), à décider — ' else 'Devis reçu, à décider — ' end
            || (select i.numero from public.incidents i where i.id = v.incident_id),$nouveau$);
  v_ancre := $ancre$'libelle', 'Un devis est arrivé : consultez-le et décidez de le retenir.'),$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (deposer_devis) : définition inattendue (ancre 8 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$'version', v_version,
                             'libelle', case when v_version > 1
                               then 'L''artisan a envoyé une nouvelle version de son devis : consultez-la et décidez.'
                               else 'Un devis est arrivé : consultez-le et décidez de le retenir.' end),$nouveau$);
  execute v_def;
end $correctif$;

-- 7. L'artisan peut renoncer depuis une demande en révision.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.decliner_sollicitation(uuid,text)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$if v.statut <> 'envoyee' then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (decliner_sollicitation) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : renoncer vaut aussi depuis une demande de révision.
  if v.statut not in ('envoyee', 'revision_demandee') then$nouveau$);
  execute v_def;
end $correctif$;

-- 8. Le plafond de deux artisans compte une demande en révision.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.solliciter_artisan_interne(uuid,uuid,uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$and s.statut in ('envoyee', 'devis_depose', 'retenue');$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (solliciter_artisan_interne) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : une demande en révision tient sa place ; une demande refusée l'a rendue.
    and s.statut in ('envoyee', 'devis_depose', 'retenue', 'revision_demandee');$nouveau$);
  execute v_def;
end $correctif$;

-- 9. retenir_devis : une version révisée ne se retient plus ; les demandes en révision sont écartées avec les autres.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.retenir_devis(uuid,uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$if d.statut = 'refuse' then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (retenir_devis) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$if d.statut = 'revise' then
      -- Décision D18 du 14/10 (livraison 2) : la version révisée est remplacée par la suivante.
      raise exception 'Ce devis n''est plus sélectionnable : une révision a été demandée, attendez la version suivante de l''artisan (ou son renoncement).';
    end if;
    if d.statut = 'refuse' then$nouveau$);
  v_ancre := $ancre$and id <> d.sollicitation_id and statut in ('envoyee', 'devis_depose');$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (retenir_devis) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$and id <> d.sollicitation_id and statut in ('envoyee', 'devis_depose', 'revision_demandee');$nouveau$);
  execute v_def;
end $correctif$;

-- 10. Écarter un artisan (liste noire locale, décision de plateforme) annule aussi sa demande en révision (RM-8.5.7).
do $correctif$
declare v_def text; v_ancre text; v_sig text;
begin
  v_ancre := $ancre$and statut in ('envoyee', 'devis_depose');$ancre$;
  foreach v_sig in array array['public.artisan_blacklist_locale(uuid,uuid,text)', 'public.artisan_decider_plateforme(uuid,public.artisan_decision_plateforme,text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'Décision D18 livraison 2 : fonction % introuvable', v_sig;
    end if;
    select pg_get_functiondef(v_sig::regprocedure) into v_def;
    if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then continue; end if;
    if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
      raise exception 'Décision D18 livraison 2 (%) : définition inattendue (ancre absente ou répétée)', v_sig;
    end if;
    v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : une demande en révision tombe aussi avec l'écartement.
    and statut in ('envoyee', 'devis_depose', 'revision_demandee');$nouveau$);
    execute v_def;
  end loop;
end $correctif$;

-- 11. Le suivi du locataire compte l'artisan en révision parmi ceux dont un devis est attendu (A.6).
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.mon_suivi_intervention(uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$where s.statut in ('envoyee', 'devis_depose', 'retenue', 'non_retenue')$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (mon_suivi_intervention) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- Fonction en langage SQL : son corps est vérifié à la création, dans la transaction du lot, où la valeur
  -- nouvelle n'est pas encore utilisable ; la comparaison passe donc par le texte.
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : un artisan en révision va encore envoyer un devis.
        where s.statut::text in ('envoyee', 'devis_depose', 'retenue', 'non_retenue', 'revision_demandee')$nouveau$);
  execute v_def;
end $correctif$;

-- 12. Les photos du locataire restent visibles de l'artisan pendant la révision (D16).
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.mes_photos_incident_artisan(uuid,uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$and s.statut in ('envoyee', 'devis_depose', 'retenue')$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (mes_photos_incident_artisan) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- Fonction en langage SQL (corps vérifié à la création) : comparaison par le texte, voir le point 11.
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : la demande en révision est encore vivante pour l'artisan.
       and s.statut::text in ('envoyee', 'devis_depose', 'retenue', 'revision_demandee')$nouveau$);
  execute v_def;
end $correctif$;

-- 13. Le document structuré lit la dernière version de la demande.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.lire_devis_structure(uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$select * into d from public.incident_devis where sollicitation_id=p_sollicitation;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (lire_devis_structure) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 2) : plusieurs versions par demande, la dernière fait foi.
  select * into d from public.incident_devis where sollicitation_id=p_sollicitation order by version desc limit 1;$nouveau$);
  execute v_def;
end $correctif$;

-- 14. L'artisan lit sa demande : version, motif de la révision, échéance (une ligne par demande : la dernière version).
drop function if exists public.mes_sollicitations();
create function public.mes_sollicitations()
returns table (
  sollicitation_id uuid, organization_id uuid, agence_nom text,
  incident_numero text, categorie text, description text,
  urgence public.incident_urgence, metier public.artisan_metier,
  nature_travaux public.nature_travaux, decennale_requise boolean,
  code_postal text, ville text, envoyee_le timestamptz,
  statut public.sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint,
  decision_motif text,
  version integer, revision_motif text, revision_avant date)
language sql stable security definer set search_path = '' as $$
  -- Décision D18 du 14/10 (livraison 1) : decision_motif, le motif de la décision prise sur son devis.
  -- Décision D18 du 14/10 (livraison 2) : la DERNIÈRE version de son devis ; revision_motif et revision_avant quand
  -- une révision lui est demandée. Jamais le devis d'un concurrent : filtré par mon_artisan_id().
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents,
         d.decision_motif,
         d.version,
         case when d.decision = 'revision' then d.decision_motif end,
         s.revision_avant
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join lateral (
    select d0.* from public.incident_devis d0 where d0.sollicitation_id = s.id
    order by d0.version desc limit 1
  ) d on true
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  -- Comparaison par le texte : corps vérifié à la création, valeur nouvelle non encore utilisable dans le lot.
  order by (s.statut::text in ('envoyee', 'revision_demandee')) desc, s.envoyee_le desc;
$$;
revoke all on function public.mes_sollicitations() from public, anon;
grant execute on function public.mes_sollicitations() to authenticated, service_role;

-- 15. L'historique des versions de l'artisan : les siennes seules, jamais celles d'un concurrent.
create or replace function public.mes_versions_devis(p_sollicitation uuid)
returns table (
  devis_id uuid, version integer, statut public.devis_statut, montant_ttc_cents bigint,
  valide_jusqu_au date, depose_le timestamptz, note_revision text,
  decision text, decision_motif text, decide_le timestamptz, description text, lignes jsonb)
language sql stable security definer set search_path = '' as $$
  -- Décision D18 du 14/10 (livraison 2).
  select d.id, d.version, d.statut, d.montant_ttc_cents, d.valide_jusqu_au, d.depose_le, d.note_revision,
         d.decision, d.decision_motif, d.decide_le, d.description, d.lignes
  from public.incident_devis d
  join public.incident_sollicitations s on s.id = d.sollicitation_id
  where s.id = p_sollicitation
    and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by d.version;
$$;
revoke all on function public.mes_versions_devis(uuid) from public, anon;
grant execute on function public.mes_versions_devis(uuid) to authenticated, service_role;

-- 16. L'échéance de réponse : la demande expire, le devis reste tel quel, le gérant est alerté.
create or replace function public.expirer_revisions_devis(p_jour date default public.aujourdhui_paris())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
-- Décision D18 du 14/10 (livraison 2) : appelée par la tâche quotidienne maintenance-artisans (jour de Paris).
-- Fermée à tous les rôles d'API : seul le propriétaire de la fonction (l'identité de pg_cron) l'exécute.
declare s record; v_n integer := 0; v_devis record;
begin
  for s in
    select so.* from public.incident_sollicitations so
    where so.statut = 'revision_demandee' and so.revision_avant is not null and so.revision_avant < p_jour
    order by so.revision_avant, so.id
    for update of so
  loop
    update public.incident_sollicitations set statut = 'expiree' where id = s.id;
    select d.* into v_devis from public.incident_devis d
    where d.sollicitation_id = s.id and d.statut = 'revise' order by d.version desc limit 1;
    insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
    values (s.organization_id, s.incident_id, 'devis_revision_expiree', null,
            jsonb_build_object('sollicitation_id', s.id, 'artisan_id', s.artisan_id,
                               'devis_id', v_devis.id, 'version', v_devis.version,
                               'revision_avant', s.revision_avant));
    insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
    values (s.organization_id, 'devis_revision_expiree', 'normale',
            'Révision de devis sans réponse — ' || (select i.numero from public.incidents i where i.id = s.incident_id),
            jsonb_build_object('incident_id', s.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2 where i2.id = s.incident_id),
                               'consultation_id', s.consultation_id,
                               'sollicitation_id', s.id,
                               'devis_id', v_devis.id,
                               'revision_avant', s.revision_avant,
                               'libelle', 'L''artisan n''a pas répondu à la demande de révision dans le délai : retenez un autre devis ou sollicitez un autre artisan.'),
            'sollicitation', s.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.expirer_revisions_devis(date) from public, anon, authenticated, service_role;

do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 2)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$get diagnostics v_devis = row_count;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (maintenance_artisans_interne) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$get diagnostics v_devis = row_count;

  -- Décision D18 du 14/10 (livraison 2) : les demandes de révision sans réponse à l'échéance expirent (jour de Paris) ;
  -- le devis reste « révision demandée », le gérant reçoit une alerte.
  perform public.expirer_revisions_devis(v_jour);$nouveau$);
  execute v_def;
end $correctif$;

-- 17. Les faits de direction nomment la nouvelle alerte (libellé générique, sans donnée personnelle).
do $correctif$
declare v_def text; v_ancre text;
begin
  if to_regprocedure('public.libelle_generique_alerte(text)') is null then return; end if;
  select pg_get_functiondef('public.libelle_generique_alerte(text)'::regprocedure) into v_def;
  if position('devis_revision_expiree' in v_def) > 0 then return; end if;
  v_ancre := $ancre$when 'creneaux_arbitrage' then 'Rendez-vous à arbitrer'$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 livraison 2 (libelle_generique_alerte) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$when 'creneaux_arbitrage' then 'Rendez-vous à arbitrer'
    when 'devis_revision_expiree' then 'Révision de devis sans réponse'$nouveau$);
  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
