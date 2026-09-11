-- ══════════════════════════════════════════════════════════════════════════
-- SPRINT 7 — CE QUE LE LOCATAIRE VOIT DE L'INTERVENTION
--
-- CONSTAT DU 11/09, avant d'écrire une ligne d'écran. Le socle du module 8
-- (20260911180000) donne au locataire de quoi AGIR — mes_creneaux_locataire,
-- choisir_creneau, contre_proposer_creneaux, noter_artisan_locataire — mais
-- rien pour SAVOIR. Ses quatorze tables ne sont lisibles par PostgREST que
-- pour les gestionnaires (politiques « …_select » sur org_ids_avec_roles) :
-- vérifié, une session de locataire qui interroge incident_interventions
-- reçoit zéro ligne. Sans ce qui suit, « Mes demandes » ne sait afficher que
-- l'état de l'incident — « Un artisan s'en occupe » — pendant les deux
-- semaines où il se passe justement quelque chose : on consulte, un devis
-- arrive, l'artisan accepte, le rendez-vous est fixé, c'est fait.
--
-- LA PROJECTION EST LE CONTRAT — même principe que mon_agenda_artisan. Ce qui
-- sort d'ici est arrêté colonne par colonne, et voici pourquoi chaque absence
-- est une absence VOULUE :
--
--   · AUCUN MONTANT, ni de devis ni de compte rendu. « Ni le locataire ni
--     Gerimmo n'approuvent l'intervention » (module 8, [[Artisan]]) : la
--     seconde approbation est la sélection du devis par le gestionnaire.
--     Afficher un prix à quelqu'un qui ne le décide pas, c'est lui faire
--     croire qu'on attend son avis — l'écran mentirait.
--
--   · AUCUNE CAUSE SUGGÉRÉE PAR L'ARTISAN. Le compte rendu porte cause_reelle
--     et imputation_suggeree, mais c'est une DEMANDE d'arbitrage adressée à
--     l'agent (RM-7.5.3, « l'artisan signale, l'agent révise »), pas une
--     décision. L'afficher annoncerait au locataire un changement de « qui
--     paie » que personne n'a tranché, quand RM-7.2.4 veut qu'il soit informé
--     de l'imputation DÉCIDÉE et justifiée — celle que porte déjà
--     mes_incidents_locataire.
--
--   · LE NOM DE L'ARTISAN SEULEMENT À PARTIR DE SON ACCEPTATION. Avant, la
--     mission peut encore être refusée (refuser_mission → réaffectation) :
--     nommer quelqu'un qui ne viendra pas n'informe pas, il embrouille. Après,
--     le locataire ouvre sa porte à cette entreprise — il doit la connaître.
--     Jamais son téléphone : c'est l'agence qui coordonne, et le socle fait le
--     même choix dans l'autre sens (l'artisan n'a le contact de l'occupant que
--     pendant la mission vivante).
--
--   · RIEN DU CONCURRENT. Le nombre de devis reçus, oui — il dit l'avancement.
--     Ni qui, ni combien.
--
-- Le périmètre des incidents est celui, mot pour mot, de
-- mes_incidents_locataire : déclarant OU bail (titulaire ou colocataire),
-- adhésion « locataire » active ou désactivée. Si les deux divergeaient, une
-- carte de « Mes demandes » s'afficherait sans son suivi, ou l'inverse.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Le suivi ───────────────────────────────────────────────────────────

create or replace function public.mon_suivi_intervention(p_org uuid)
returns table (
  incident_id uuid,
  -- Étape RÉELLE, en vocabulaire fermé (l'écran la traduit en français) : le
  -- locataire ne lit pas « affecté », il lit « on cherche un artisan » ou
  -- « rendez-vous jeudi 14 h ».
  etape text,
  intervention_id uuid,
  artisan text,
  nb_artisans_consultes integer,
  nb_devis_recus integer,
  rdv_debut timestamptz,
  rdv_fin timestamptz,
  terminee_le timestamptz,
  creneaux_a_choisir integer,
  mes_creneaux_en_attente integer,
  creneaux_refuses integer,
  arbitrage boolean,
  travaux_realises text,
  nouvelle_intervention_necessaire boolean,
  photos_apres uuid[],
  deja_notee boolean
)
language sql stable security definer set search_path = '' as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  mes_baux as (
    select b.id from public.baux b
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal in (select id from mes_fiches)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id in (select id from mes_fiches)))
  ),
  mes_incidents as (
    select i.id
    from public.incidents i
    where i.organization_id = p_org
      and exists (select 1 from public.memberships m
                  where m.account_id = (select auth.uid())
                    and m.organization_id = p_org
                    and m.role = 'locataire' and m.status in ('active', 'inactive'))
      and (i.declarant_person_id in (select id from mes_fiches)
           or i.bail_id in (select id from mes_baux))
  ),
  -- Une seule mission par incident : la dernière confiée. Il peut y en avoir
  -- plusieurs (une refusée puis sa remplaçante), mais une seule VIVANTE —
  -- l'index unique partiel du socle le garantit — et c'est toujours la
  -- dernière qui a cours.
  derniere_mission as (
    select distinct on (iv.incident_id)
           iv.id, iv.incident_id, iv.artisan_id, iv.statut,
           iv.debut_prevu, iv.fin_prevue, iv.terminee_le
    from public.incident_interventions iv
    where iv.organization_id = p_org and iv.incident_id in (select id from mes_incidents)
    order by iv.incident_id, iv.confiee_le desc
  ),
  consultation_ouverte as (
    select c.id, c.incident_id
    from public.incident_consultations c
    where c.organization_id = p_org and c.statut = 'ouverte'
      and c.incident_id in (select id from mes_incidents)
  ),
  assemble as (
    select
      inc.id as incident_id,
      co.id as consultation_id,
      m.id as mission_id,
      m.statut as mission_statut,
      -- La mission RACONTE l'étape tant qu'aucune consultation n'est rouverte
      -- au-dessus d'elle et qu'elle n'est ni refusée ni annulée. Les deux cas
      -- existent : un refus rouvre une recherche (registre A5, retour à
      -- « qualifié »), et une réouverture d'incident peut relancer une
      -- consultation par-dessus une mission déjà terminée. Dans ces cas, tout
      -- ce que la mission portait (rendez-vous, compte rendu, photos) est
      -- périmé : on ne le laisse pas s'afficher comme s'il avait cours.
      (co.id is null and m.id is not null
       and m.statut not in ('refusee', 'annulee')) as courante,
      m.artisan_id, m.debut_prevu, m.fin_prevue, m.terminee_le,
      coalesce(so.nb, 0)::integer as nb_artisans_consultes,
      coalesce(dv.nb, 0)::integer as nb_devis_recus,
      coalesce(cr.a_choisir, 0)::integer as a_choisir,
      coalesce(cr.les_miens, 0)::integer as les_miens,
      coalesce(cr.refuses, 0)::integer as refuses,
      cro.travaux_realises,
      coalesce(cro.nouvelle_intervention_necessaire, false) as nouvelle_intervention,
      coalesce(ph.apres, array[]::uuid[]) as photos_apres,
      (ev.id is not null) as deja_notee
    from mes_incidents inc
    left join derniere_mission m on m.incident_id = inc.id
    left join consultation_ouverte co on co.incident_id = inc.id
    left join lateral (
      select count(*) filter (where s.statut <> 'annulee') as nb
      from public.incident_sollicitations s where s.consultation_id = co.id
    ) so on true
    left join lateral (
      select count(*) as nb from public.incident_devis d
      join public.incident_sollicitations s on s.id = d.sollicitation_id
      where s.consultation_id = co.id and d.statut in ('depose', 'retenu')
    ) dv on true
    left join lateral (
      select
        count(*) filter (where k.statut = 'propose' and k.propose_par = 'artisan') as a_choisir,
        count(*) filter (where k.statut = 'propose' and k.propose_par = 'locataire') as les_miens,
        count(*) filter (where k.statut = 'refuse') as refuses
      from public.intervention_creneaux k where k.intervention_id = m.id
    ) cr on true
    left join public.intervention_comptes_rendus cro on cro.intervention_id = m.id
    left join lateral (
      select array_agg(p.document_id order by p.created_at) as apres
      from public.intervention_photos p
      join public.documents d on d.id = p.document_id and d.purged_at is null
      where p.intervention_id = m.id and p.moment = 'apres'
    ) ph on true
    -- Une évaluation RETIRÉE par le super admin (RM-11.4.4) compte quand même
    -- comme « déjà notée » : la contrainte d'unicité du socle porte sur
    -- (intervention, source) sans regarder le retrait, donc rouvrir le
    -- formulaire ne ferait qu'offrir un geste que la base refusera.
    left join public.artisan_evaluations ev
           on ev.intervention_id = m.id and ev.source = 'locataire'
    where m.id is not null or co.id is not null
  )
  select
    a.incident_id,
    case
      when a.consultation_id is not null then
        case when a.nb_devis_recus > 0 then 'devis_recus' else 'recherche' end
      when a.mission_id is null then null
      when a.mission_statut in ('refusee', 'annulee') then 'reaffectation'
      when a.mission_statut = 'proposee'  then 'artisan_retenu'
      when a.mission_statut = 'planifiee' then 'planifiee'
      when a.mission_statut = 'en_cours'  then 'en_cours'
      when a.mission_statut = 'terminee'  then 'terminee'
      -- « acceptee » : la négociation du rendez-vous (module 10)
      when a.a_choisir > 0 then 'creneau_a_choisir'
      when a.les_miens > 0 then 'ma_proposition'
      else 'creneaux_attendus'
    end,
    case when a.courante then a.mission_id end,
    -- Le nom n'apparaît qu'une fois la mission acceptée (voir l'en-tête).
    case when a.courante and a.mission_statut in
              ('acceptee', 'planifiee', 'en_cours', 'terminee')
         then ar.raison_sociale end,
    a.nb_artisans_consultes,
    a.nb_devis_recus,
    case when a.courante then a.debut_prevu end,
    case when a.courante then a.fin_prevue end,
    case when a.courante then a.terminee_le end,
    case when a.courante then a.a_choisir else 0 end,
    case when a.courante then a.les_miens else 0 end,
    case when a.courante then a.refuses else 0 end,
    -- RM-10.4.1 : au-delà de six refus « le problème n'est plus logistique
    -- mais relationnel » — le gérant règle par téléphone. L'écran cesse alors
    -- de réclamer une septième contre-proposition, qui n'ajouterait qu'un
    -- tour ; les créneaux refusés restent en base, opposables (RM-10.4.4).
    a.courante and a.refuses >= 6,
    -- Le travail décrit par l'artisan, et rien d'autre du compte rendu : ce
    -- qui en est écarté, et pourquoi, est dit en tête de migration.
    case when a.courante then a.travaux_realises end,
    case when a.courante then a.nouvelle_intervention else false end,
    case when a.courante then a.photos_apres else array[]::uuid[] end,
    a.courante and a.deja_notee
  from assemble a
  left join public.artisans ar on ar.id = a.artisan_id;
$$;
revoke execute on function public.mon_suivi_intervention(uuid) from public, anon;

comment on function public.mon_suivi_intervention(uuid) is
  'Suivi d''intervention du locataire (sprint 7). Projection fixe : jamais de '
  'montant, jamais la cause suggérée par l''artisan (RM-7.5.3 : c''est une '
  'demande d''arbitrage, pas une décision), nom de l''artisan seulement à '
  'partir de son acceptation. Périmètre identique à mes_incidents_locataire.';

-- ── 2. Les photos du chantier, visibles par le locataire ──────────────────
--
-- RM-7.5.2 fait de la photo du travail réalisé la condition pour terminer une
-- intervention ; le socle la range dans la GED de l'agence ET la lie à
-- l'incident « pour que le locataire les consulte avant de noter » (RM-11.1).
-- Or rien, au 11/09, ne la lui montrait : vérifié, mon_document_locataire ne
-- connaît que les pièces du dossier, du bail, des signatures, des retenues et
-- des régularisations — et les photos d'incident n'y figurent pas, y compris
-- CELLES QU'IL A LUI-MÊME PRISES en déclarant.
--
-- On ouvre donc une branche, et une seule : un document de type
-- « photo_incident » lié (document_liens) à un incident de SON périmètre. Ce
-- couple type + lien est ce qui borne l'ouverture — aucun autre type de pièce
-- ne passe par là, et un incident qui n'est pas le sien ne passe pas non plus.
-- Deux fonctions doivent l'apprendre ensemble, sinon rien ne s'affiche :
-- mon_document_locataire (la fiche, et par ricochet log_document_access qui
-- s'appuie sur elle pour tracer l'accès, RM-0b.7.5) et
-- chemins_pieces_locataire (la politique storage ged_select_locataire).
-- La contrepartie assumée : le locataire voit aussi les photos que l'AGENCE a
-- jointes à son incident. C'est le désordre de son logement, photographié
-- chez lui — le lui cacher serait plus difficile à justifier que le lui
-- montrer.

create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text, storage_path text, purged_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (
      ((d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
        or (d.type in ('quittance', 'courrier') and d.partage_le is not null))
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org)
      -- Un document qu'on me demande de signer (et mon retour signé)
      or exists (
        select 1 from public.demandes_signature ds
        join public.persons p on p.id = ds.person_id
        where (ds.document_id = d.id or ds.document_retour_id = d.id)
          and ds.organization_id = p_org
          and p.account_id = (select auth.uid()))
      or exists (
        select 1 from public.retenues t
        join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
        where t.justificatif_document = d.id
          and r.organization_id = p_org
          and r.bail_id = public.mon_dernier_bail_locataire(p_org))
      or exists (
        select 1 from public.regularisations_charges rc
        join public.baux b on b.id = rc.bail_id
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where rc.justificatif_document = d.id
          and b.organization_id = p_org
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire')))
      -- Les photos de MES incidents : celles que j'ai prises en déclarant,
      -- celles de l'agence, et celles du chantier déposées par l'artisan
      -- (RM-7.5.2 / RM-11.1). Ajout du 11/09 — voir le commentaire ci-dessus.
      or (d.type = 'photo_incident' and exists (
        select 1 from public.document_liens dl
        join public.mes_incidents_locataire(p_org) mi on mi.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'incident'
          and dl.organization_id = p_org)));
$$;

create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.pieces_bail_locataire() pb
  join public.documents d on d.id = pb.document_id
  where d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = p.organization_id
    and (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
         or (d.type in ('quittance', 'courrier') and d.partage_le is not null))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.demandes_signature ds
  join public.persons p on p.id = ds.person_id
                       and p.account_id = (select auth.uid())
  join public.documents d on d.id = ds.document_id
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = ds.organization_id
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = ds.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.demandes_signature ds
  join public.persons p on p.id = ds.person_id
                       and p.account_id = (select auth.uid())
  join public.documents d on d.id = ds.document_retour_id
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = ds.organization_id
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = ds.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.retenues r
  join public.restitutions re on re.id = r.restitution_id and re.statut = 'finalise'
  join public.baux b on b.id = re.bail_id
  join public.documents d on d.id = r.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.regularisations_charges rc
  join public.baux b on b.id = rc.bail_id
  join public.documents d on d.id = rc.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  -- Photos de MES incidents (ajout du 11/09, jumelle de la branche ajoutée à
  -- mon_document_locataire : sans elle la fiche serait lisible et le fichier
  -- refusé par la politique storage).
  select d.storage_path
  from public.memberships m
  join public.mes_incidents_locataire(m.organization_id) mi on true
  join public.document_liens dl on dl.entite = 'incident' and dl.entite_id = mi.id
                               and dl.organization_id = m.organization_id
  join public.documents d on d.id = dl.document_id and d.type = 'photo_incident'
  where m.account_id = (select auth.uid())
    and m.role = 'locataire' and m.status in ('active', 'inactive')
    and d.purged_at is null and d.storage_path is not null;
$$;

-- ── 3. Contrôles : cette migration échoue plutôt que de laisser passer ─────
do $$
declare v_def text;
begin
  -- 3.1 Les branches PRÉEXISTANTES de mon_document_locataire et de
  --     chemins_pieces_locataire sont recopiées à l'identique dans les
  --     « create or replace » ci-dessus : une erreur de copie retirerait au
  --     locataire l'accès à son bail ou à ses quittances SANS RIEN CASSER DE
  --     VISIBLE. On le refuse ici.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mon_document_locataire';
  if v_def is null
     or position('pieces_bail_locataire' in v_def) = 0
     or position('demandes_signature' in v_def) = 0
     or position('mon_dernier_bail_locataire' in v_def) = 0
     or position('regularisations_charges' in v_def) = 0
     or position('photo_incident' in v_def) = 0 then
    raise exception 'mon_document_locataire a perdu une branche : %', coalesce(v_def, '(absente)');
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'chemins_pieces_locataire';
  if v_def is null
     or position('pieces_bail_locataire' in v_def) = 0
     or position('demandes_signature' in v_def) = 0
     or position('retenues' in v_def) = 0
     or position('regularisations_charges' in v_def) = 0
     or position('photo_incident' in v_def) = 0 then
    raise exception 'chemins_pieces_locataire a perdu une branche : %', coalesce(v_def, '(absente)');
  end if;

  -- 3.2 Le suivi ne doit rien laisser filtrer d'un montant : ni le devis, ni
  --     le montant final du compte rendu. Le contrôle lit la définition, donc
  --     il tiendra même si quelqu'un ajoute une colonne plus tard.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mon_suivi_intervention';
  if v_def is null then
    raise exception 'mon_suivi_intervention absente';
  end if;
  if position('montant' in v_def) > 0
     or position('cause_reelle' in v_def) > 0
     or position('imputation_suggeree' in v_def) > 0 then
    raise exception
      'mon_suivi_intervention expose un montant ou la cause suggérée par l''artisan : '
      'le locataire n''approuve rien (module 8) et RM-7.5.3 réserve l''arbitrage à l''agent';
  end if;

  -- 3.3 Personne d'autre qu'un compte connecté ne l'appelle.
  if has_function_privilege('anon', 'public.mon_suivi_intervention(uuid)', 'execute') then
    raise exception 'mon_suivi_intervention reste exécutable par anon';
  end if;
end $$;
