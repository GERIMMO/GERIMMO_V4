-- Module 8 — trois écrans du locataire qui disaient faux (11/09).
--
-- Trouvés par la vérification adversariale, chacun reproduit en SQL :
--  1. « 2 artisans consultés — votre gestionnaire attend leur devis » alors que
--     les deux avaient DÉCLINÉ. Le locataire lisait une attente qui n'existait
--     pas pendant que son dossier était à l'arrêt.
--  2. « L'artisan retenu s'est désisté » quand c'est l'AGENCE qui a annulé la
--     mission (motif obligatoire : erreur d'affectation, liste noire locale…).
--     On imputait à un tiers un retard décidé par l'agence.
--  3. « Propose 3 créneaux » au-dessus d'une liste vide : le compteur ignorait
--     l'état du bail, que la liste affichable exige. Cas réel — un locataire
--     relogé dans la même agence garde son adhésion.

CREATE OR REPLACE FUNCTION public.mon_suivi_intervention(p_org uuid)
 RETURNS TABLE(incident_id uuid, etape text, intervention_id uuid, artisan text, nb_artisans_consultes integer, nb_devis_recus integer, rdv_debut timestamp with time zone, rdv_fin timestamp with time zone, terminee_le timestamp with time zone, creneaux_a_choisir integer, mes_creneaux_en_attente integer, creneaux_refuses integer, arbitrage boolean, travaux_realises text, nouvelle_intervention_necessaire boolean, photos_apres uuid[], deja_notee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- On ne compte que les artisans DONT UN DEVIS EST ENCORE POSSIBLE.
      -- « declinee » et « expiree » y figuraient : l'écran annonçait alors
      -- « 2 artisans consultés — votre gestionnaire attend leur devis » alors
      -- que les deux avaient refusé de chiffrer et que personne n'enverrait
      -- rien (constat du 11/09).
      select count(*) filter (
        where s.statut in ('envoyee', 'devis_depose', 'retenue', 'non_retenue')
      ) as nb
      from public.incident_sollicitations s where s.consultation_id = co.id
    ) so on true
    left join lateral (
      select count(*) as nb from public.incident_devis d
      join public.incident_sollicitations s on s.id = d.sollicitation_id
      where s.consultation_id = co.id and d.statut in ('depose', 'retenu')
    ) dv on true
    left join lateral (
      select
        -- Seulement si le bail est encore vivant : `mes_creneaux_locataire`,
        -- seule source de la LISTE affichable, l'exige. Sans ce miroir, un
        -- locataire relogé dans la même agence (adhésion conservée, incident
        -- rattaché par declarant_person_id) lisait « propose 3 créneaux » au
        -- dessus d'une liste vide.
        count(*) filter (
          where k.statut = 'propose' and k.propose_par = 'artisan'
            and exists (select 1 from public.incidents i2
                        where i2.id = m.incident_id and i2.bail_id in (select id from mes_baux))
        ) as a_choisir,
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
      when a.mission_statut = 'refusee' then 'reaffectation'
      when a.mission_statut = 'annulee' then 'reaffectation_agence'
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
$function$
