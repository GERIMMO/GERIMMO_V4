-- Décisions du dirigeant du 24/11/2026, lot D4 — Q37 (un cinquième envoi automatique, avec son interrupteur) et Q24
-- (la relance de loyer envoyée à la main est ouverte elle aussi).
--
-- CE QUI EXISTAIT (migration 20261122200000). Quatre envois automatiques ont chacun un interrupteur, fermé par défaut,
-- que seul le superviseur permanent ouvre. Deux e-mails étaient restés en dehors :
--   · Q37 — quand un locataire demande le report d'un rendez-vous, l'artisan reçoit l'avis de la demande, mais la
--     relance envoyée avant la fin de son délai de réponse était retenue par la liste fermée des e-mails ;
--   · Q24 — la relance amiable d'un loyer que le propriétaire envoie lui-même, d'un clic, depuis son tableau de bord
--     était retenue de la même façon.
--
-- CE QUE POSE CETTE MIGRATION. RIEN NE S'OUVRE : tout reste fermé à la livraison.
--   1. Un cinquième interrupteur, `relance_report_rdv`, FAUX par défaut, sur le modèle exact des quatre autres : même
--      table, mêmes quatre fonctions (lecture des tâches, lecture de la console, lecture des écrans, geste journalisé
--      du superviseur permanent), qui connaissent maintenant cinq envois.
--   2. Deux contextes métier de plus en tête de la chaîne `empreinte_metier_courriel` :
--      · `relance_report_rdv` : la preuve exige l'interrupteur `relance_report_rdv` OUVERT, aucun arrêt d'urgence, et
--        que la base redise que cette demande de report attend toujours, que sa relance est réservée et pas encore
--        partie, et que l'adresse est celle de l'artisan de la mission ;
--      · `relance_loyer_manuelle` : la relance envoyée à la main. Elle suit l'interrupteur `relance_loyer` (le même
--        geste du superviseur ouvre la relance automatique et la relance à la main). Elle N'EXIGE PAS l'accord
--        permanent de l'espace (`relances_envoi_auto`), qui reste requis pour les seuls envois automatiques : ici,
--        c'est le clic du propriétaire qui décide. La preuve exige que la personne qui clique soit le propriétaire de
--        l'espace, que ce loyer soit toujours le plus ancien impayé du bail, échu, pour ces montants, sans plan
--        d'apurement en cours, sans relance du même niveau déjà consignée, et que l'adresse soit celle du locataire
--        ou d'un colocataire encore engagé.
--   3. La clôture après l'envoi : la ligne de l'e-mail est close ; la trace métier reste celle que chaque geste écrit
--      déjà (relance notée sur la demande de report, relance consignée au bail).
--
-- CE QUI NE CHANGE PAS. Les quatre premiers interrupteurs et leur état, les accords déjà donnés par les espaces, les
-- textes des e-mails, les heures, les limites, les arrêts d'urgence. Interrupteur fermé : les deux envois restent
-- suspendus exactement comme avant.
--
-- Même construction que les maillons précédents (20261122130000, 20261122200000, 20261122210000) : la tête de chaîne
-- est renommée et la nouvelle tête lui délègue tout autre type, à l'identique. Rejouable.
-- Retour arrière : supabase/retours-arriere/20261125110000_relance_report_rdv_et_relance_a_la_main.retour.sql

-- ── 1. Le cinquième interrupteur, fermé ──────────────────────────────────────────────────────────────────────────
alter table public.envois_automatiques_reglage add column if not exists relance_report_rdv boolean not null default false;
comment on table public.envois_automatiques_reglage is
  'Interrupteurs des envois automatiques suspendus (P1-08, puis décision Q37 du 24/11) : avis d''échéance, relance amiable, rappel de rendez-vous, relance d''invitation, relance d''une demande de report de rendez-vous. Tous fermés par défaut. Écrit par regler_envoi_automatique seulement.';

-- Les quatre fonctions du réglage, reprises mot pour mot avec un envoi de plus. Droits inchangés (redits plus bas).
create or replace function public.envoi_automatique_ouvert(p_flux text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_flux
             when 'avis_echeance' then r.avis_echeance
             when 'relance_loyer' then r.relance_loyer
             when 'rappel_rendez_vous' then r.rappel_rendez_vous
             when 'relance_invitation' then r.relance_invitation
             when 'relance_report_rdv' then r.relance_report_rdv
             else false
           end
      from public.envois_automatiques_reglage r where r.singleton), false);
$$;
comment on function public.envoi_automatique_ouvert(text) is
  'Vrai si le superviseur a ouvert cet envoi automatique (P1-08, Q37). Flux inconnu ou réglage absent : faux.';
revoke all on function public.envoi_automatique_ouvert(text) from public, anon, authenticated;
grant execute on function public.envoi_automatique_ouvert(text) to service_role;

create or replace function public.lire_envois_automatiques()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.envois_automatiques_reglage;
begin
  if public.is_super_admin() is not true then
    raise exception 'Accès réservé à la supervision' using errcode = '42501';
  end if;
  select * into r from public.envois_automatiques_reglage where singleton;
  return jsonb_build_object(
    'avis_echeance', coalesce(r.avis_echeance, false),
    'relance_loyer', coalesce(r.relance_loyer, false),
    'rappel_rendez_vous', coalesce(r.rappel_rendez_vous, false),
    'relance_invitation', coalesce(r.relance_invitation, false),
    'relance_report_rdv', coalesce(r.relance_report_rdv, false),
    'modifie_le', r.modifie_le,
    -- Avant d'ouvrir : combien d'espaces ont déjà donné leur accord permanent. Leurs e-mails partiraient aussitôt.
    'espaces_avis_echeance', (select count(*) from public.organizations o where o.appels_envoi_auto),
    'espaces_relance_loyer', (select count(*) from public.organizations o where o.relances_envoi_auto));
end;
$$;
comment on function public.lire_envois_automatiques() is
  'État des cinq interrupteurs d''envoi automatique, pour la console du superviseur (P1-08, Q37).';
revoke all on function public.lire_envois_automatiques() from public, anon, service_role;
grant execute on function public.lire_envois_automatiques() to authenticated;

create or replace function public.envois_automatiques_proposes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'avis_echeance', public.envoi_automatique_ouvert('avis_echeance'),
    'relance_loyer', public.envoi_automatique_ouvert('relance_loyer'),
    'rappel_rendez_vous', public.envoi_automatique_ouvert('rappel_rendez_vous'),
    'relance_invitation', public.envoi_automatique_ouvert('relance_invitation'),
    'relance_report_rdv', public.envoi_automatique_ouvert('relance_report_rdv'));
$$;
comment on function public.envois_automatiques_proposes() is
  'Les envois automatiques que le superviseur a ouverts (P1-08, Q37), pour que les écrans des espaces sachent quoi proposer. Cinq booléens, aucun autre contenu.';
revoke all on function public.envois_automatiques_proposes() from public, anon;
grant execute on function public.envois_automatiques_proposes() to authenticated, service_role;

create or replace function public.regler_envoi_automatique(p_flux text, p_ouvert boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.envois_automatiques_reglage;
  v_precedent boolean;
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_flux is null or p_flux not in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation', 'relance_report_rdv') then
    raise exception 'Envoi automatique inconnu';
  end if;
  if p_ouvert is null then
    raise exception 'Indiquez si cet envoi est ouvert ou fermé';
  end if;
  insert into public.envois_automatiques_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.envois_automatiques_reglage where singleton for update;
  v_precedent := case p_flux
    when 'avis_echeance' then r.avis_echeance when 'relance_loyer' then r.relance_loyer
    when 'rappel_rendez_vous' then r.rappel_rendez_vous when 'relance_invitation' then r.relance_invitation
    else r.relance_report_rdv end;
  update public.envois_automatiques_reglage
     set avis_echeance = case when p_flux = 'avis_echeance' then p_ouvert else avis_echeance end,
         relance_loyer = case when p_flux = 'relance_loyer' then p_ouvert else relance_loyer end,
         rappel_rendez_vous = case when p_flux = 'rappel_rendez_vous' then p_ouvert else rappel_rendez_vous end,
         relance_invitation = case when p_flux = 'relance_invitation' then p_ouvert else relance_invitation end,
         relance_report_rdv = case when p_flux = 'relance_report_rdv' then p_ouvert else relance_report_rdv end,
         modifie_le = now(), modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'envoi_automatique', auth.uid(),
          jsonb_build_object('flux', p_flux, 'ouvert', p_ouvert, 'precedent', v_precedent));
end;
$$;
comment on function public.regler_envoi_automatique(text, boolean) is
  'Le superviseur permanent ouvre ou ferme un envoi automatique (P1-08, Q37) ; geste journalisé (supervision_operations, action « envoi_automatique »).';
revoke all on function public.regler_envoi_automatique(text, boolean) from public, anon, service_role;
grant execute on function public.regler_envoi_automatique(text, boolean) to authenticated;

-- ── 2. La preuve avant l'envoi ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.empreinte_maillon_relances_d4(p_org uuid, p_contexte jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_contexte->>'type';
  v_dest text := p_contexte->>'destinataire';
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_montant constant text := '^[0-9]{1,9}(\.[0-9]{1,2})?$';
  v_du boolean := false;
begin
  -- Tout autre type suit la chaîne existante, sans aucun changement (un type absent aussi).
  if v_type is null or v_type not in ('relance_report_rdv', 'relance_loyer_manuelle') then
    return public.empreinte_avant_relances_d4(p_org, p_contexte);
  end if;
  -- Les formats d'abord : aucune conversion sur une valeur mal formée. Toujours un espace : ces deux e-mails en ont un.
  if p_org is null or coalesce(p_contexte->>'id', '') !~ v_uuid or coalesce(v_dest, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- L'interrupteur du superviseur : fermé (le défaut), rien ne part. La relance à la main suit celui de la relance
  -- de loyer : un seul geste ouvre l'automatique et le manuel, un seul geste referme les deux.
  if not public.envoi_automatique_ouvert(case v_type when 'relance_report_rdv' then 'relance_report_rdv' else 'relance_loyer' end) then
    return null;
  end if;
  -- Arrêt d'urgence, général ou de la mission concernée : rien ne part tant qu'il n'est pas levé.
  if exists (select 1 from public.supervision_arrets a
              where a.arrete and a.cle in ('global', case v_type when 'relance_report_rdv' then 'rappels' else 'relances' end)) then
    return null;
  end if;

  if v_type = 'relance_report_rdv' then
    -- La base redit que cette demande de report attend toujours la réponse de l'artisan, que sa relance est réservée
    -- (une seule tentative par demande) et n'a encore aucun sort, et que l'adresse est celle de l'artisan de la mission.
    select true into v_du
      from public.intervention_demandes_rdv d
      join public.incident_interventions i on i.id = d.intervention_id and i.organization_id = d.organization_id
      join public.artisans a on a.id = i.artisan_id
     where d.id = (p_contexte->>'id')::uuid and d.organization_id = p_org
       and d.type = 'report' and d.statut = 'en_attente' and d.expire_le > now()
       and d.relance_reservee_le is not null and d.relance_envoyee_le is null and d.relance_echec is null
       and i.statut = 'planifiee'
       and coalesce(public.org_ecriture_ouverte(d.organization_id), false)
       and encode(sha256(convert_to(lower(btrim(a.email)), 'UTF8')), 'hex') = v_dest
     limit 1;

  else
    -- relance_loyer_manuelle : le propriétaire clique, la base revérifie tout ce que l'e-mail affirme.
    if coalesce(p_contexte->>'niveau', '') not in ('relance_1', 'relance_2')
       or coalesce(p_contexte->>'acteur', '') !~ v_uuid
       or coalesce(p_contexte->>'reste', '') !~ v_montant
       or coalesce(p_contexte->>'total', '') !~ v_montant then
      return null;
    end if;
    select true into v_du
      from public.appels_loyer al
      join public.baux b on b.id = al.bail_id and b.organization_id = al.organization_id
      join public.organizations o on o.id = b.organization_id and o.type = 'proprietaire_direct'
      join public.persons loc on loc.id = b.locataire_principal and loc.organization_id = b.organization_id
      cross join lateral (
        -- Le terme impayé le plus ancien du bail : c'est lui, et lui seul, qu'on relance.
        select e.appel_id, e.date_echeance, round(e.montant_du - e.montant_couvert, 2) as reste
          from public.etat_loyers_bail_brut(b.id) e
         where e.montant_couvert < e.montant_du
         order by e.periode, e.appel_id
         limit 1
      ) x
     where al.id = (p_contexte->>'id')::uuid and al.organization_id = p_org
       and b.etat in ('actif', 'preavis', 'termine')
       and not exists (select from public.restitutions r where r.bail_id = b.id and r.statut = 'finalise')
       and x.appel_id = al.id
       and x.date_echeance < public.aujourdhui_paris()
       and x.reste = (p_contexte->>'reste')::numeric
       -- La dette échue totale du bail, que l'e-mail annonce aussi.
       and (select round(coalesce(sum(t.montant_du - t.montant_couvert), 0), 2)
              from public.etat_loyers_bail_brut(b.id) t
             where t.montant_couvert < t.montant_du and t.date_echeance < public.aujourdhui_paris())
           = (p_contexte->>'total')::numeric
       and coalesce(public.org_ecriture_ouverte(o.id), false)
       and not public.plan_apurement_suspend_relances(b.id)
       -- Pas deux fois le même niveau pour la même échéance : une relance consignée ne repart pas.
       and not exists (select 1 from public.relances r
                        where r.bail_id = b.id and r.niveau = p_contexte->>'niveau' and r.date_envoi >= x.date_echeance)
       -- La personne qui a cliqué est toujours le propriétaire de cet espace.
       and exists (select 1 from public.memberships m
                    where m.organization_id = p_org and m.account_id = (p_contexte->>'acteur')::uuid
                      and m.status = 'active' and m.role = 'proprietaire_direct')
       -- L'adresse est celle du locataire ou d'un colocataire encore engagé.
       and (encode(sha256(convert_to(lower(btrim(coalesce(loc.email, ''))), 'UTF8')), 'hex') = v_dest
            or exists (select 1
                         from public.bail_personnes bp join public.persons p on p.id = bp.person_id and p.organization_id = p_org
                        where bp.bail_id = b.id and bp.organization_id = p_org and bp.role = 'colocataire'
                          and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= public.aujourdhui_paris())
                          and p.email is not null and length(btrim(p.email)) > 0
                          and encode(sha256(convert_to(lower(btrim(p.email)), 'UTF8')), 'hex') = v_dest))
     limit 1;
  end if;

  if v_du is not true then return null; end if;
  -- Le contexte porte tout ce qui a été prouvé (objet, niveau, montants, adresse) : sa propre empreinte suffit.
  return encode(sha256(convert_to(p_contexte::text, 'UTF8')), 'hex');
end $$;
comment on function public.empreinte_maillon_relances_d4(uuid, jsonb) is
  'Preuve métier d''un e-mail conservé, recalculée avant l''envoi. Tête de chaîne du 24/11/2026 (décisions Q37 et Q24) : traite relance_report_rdv (interrupteur du même nom) et relance_loyer_manuelle (interrupteur relance_loyer, clic du propriétaire, sans accord permanent de l''espace), délègue tout autre type à empreinte_avant_relances_d4.';
revoke all on function public.empreinte_maillon_relances_d4(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.empreinte_maillon_relances_d4(uuid, jsonb) to service_role;
do $chaine$
begin
  if to_regprocedure('public.empreinte_avant_relances_d4(uuid,jsonb)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_relances_d4;
    alter function public.empreinte_maillon_relances_d4(uuid,jsonb) rename to empreinte_metier_courriel;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.empreinte_maillon_relances_d4(uuid,jsonb);
  end if;
end $chaine$;
revoke all on function public.empreinte_avant_relances_d4(uuid,jsonb) from public, anon, authenticated, service_role;

-- ── 3. La clôture après l'envoi ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.finaliser_maillon_relances_d4(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m public.courriels_durables;
begin
  select * into m from public.courriels_durables where id = p_id for update;
  if m.contexte_metier is null
     or m.contexte_metier->>'type' is null
     or m.contexte_metier->>'type' not in ('relance_report_rdv', 'relance_loyer_manuelle') then
    return public.finaliser_avant_relances_d4(p_id);
  end if;
  if m.finalisation_etat = 'terminee' then return true; end if;
  if m.fournisseur_id is null or m.etat not in ('accepte', 'livre') then return false; end if;
  -- Rien d'autre à consigner ici : la tâche note la relance sur la demande de report, et le geste du propriétaire
  -- consigne la relance au bail.
  update public.courriels_durables set finalisation_etat = 'terminee', motif = null where id = p_id;
  insert into public.courriels_evenements (courrier_id, etat) values (p_id, 'finalisation_terminee');
  return true;
end $$;
comment on function public.finaliser_maillon_relances_d4(text) is
  'Clôture d''un e-mail conservé après son envoi. Tête de chaîne du 24/11/2026 (décisions Q37 et Q24) : traite relance_report_rdv et relance_loyer_manuelle, délègue tout autre type à finaliser_avant_relances_d4.';
revoke all on function public.finaliser_maillon_relances_d4(text) from public, anon, authenticated;
grant execute on function public.finaliser_maillon_relances_d4(text) to service_role;
do $chaine$
begin
  if to_regprocedure('public.finaliser_avant_relances_d4(text)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_relances_d4;
    alter function public.finaliser_maillon_relances_d4(text) rename to finaliser_courriel_metier;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.finaliser_maillon_relances_d4(text);
  end if;
end $chaine$;
revoke all on function public.finaliser_avant_relances_d4(text) from public, anon, authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
