-- Audit palier 1, P1-08 — Les envois automatiques prévus mais suspendus : prêts, fermés par défaut, ouverts un par un
-- par le superviseur.
--
-- CE QUI EXISTAIT. Quatre envois sont écrits, testés et planifiés, mais ne partent pas : l'avis d'échéance du loyer,
-- la relance amiable d'un loyer impayé, le rappel d'un rendez-vous d'intervention, la relance d'une invitation de
-- locataire. Depuis la liste fermée des e-mails (lot 1 du 09/11), tout e-mail sans « contexte métier » reconnu est
-- suspendu ; ces quatre-là n'en portent pas. Rien ne permettait de les ouvrir sans réécrire du code.
--
-- CE QUE POSE CETTE MIGRATION. RIEN NE S'OUVRE : tout est fermé à la livraison.
--   1. `envois_automatiques_reglage` : quatre interrupteurs, tous FAUX par défaut. Aucune lecture ni écriture directe.
--   2. `regler_envoi_automatique(flux, ouvert)` : le geste du superviseur permanent en double vérification, journalisé
--      (supervision_operations, action « envoi_automatique »). `lire_envois_automatiques()` : l'état, pour la console.
--      `envoi_automatique_ouvert(flux)` : la lecture des tâches planifiées (service).
--      `envois_automatiques_proposes()` : ce que les écrans des espaces peuvent proposer (tout compte connecté) —
--      l'accord d'un espace pour l'avis d'échéance ou la relance ne se demande que si l'envoi est ouvert.
--   3. La preuve avant l'envoi. Un contexte métier par envoi (`avis_echeance`, `relance_loyer`, `rappel_rendez_vous`,
--      `relance_invitation`), reconnu en tête de la chaîne `empreinte_metier_courriel`. La preuve, recalculée juste
--      avant chaque envoi et à chaque reprise, exige : l'interrupteur du flux OUVERT, aucun arrêt d'urgence (général ou
--      de la mission), et que la base redise elle-même, par la fonction qui décide déjà de l'envoi, que CET e-mail est
--      dû à CETTE adresse à cet instant (`appels_a_envoyer`, `relances_loyer_dues`, `rendez_vous_a_rappeler`, la
--      réservation du jour d'une relance d'invitation). Sinon : pas de preuve, pas d'envoi.
--   4. La clôture après l'envoi : la ligne de l'e-mail est close ; la trace métier reste celle que chaque tâche écrit
--      déjà (appel marqué envoyé, relance consignée, rappel marqué, relance d'invitation notée).
--
-- CE QUI NE CHANGE PAS. Les accords déjà demandés à chaque espace (envoi automatique des avis et des relances, délais,
-- seuils), les textes des e-mails, les heures, les limites, les arrêts d'urgence. Interrupteur fermé : la tâche se
-- comporte exactement comme avant (envoi suspendu, consigné comme tel).
--
-- Même construction que les maillons précédents (20261116201423, 20261122130000) : la tête de chaîne est renommée et
-- la nouvelle tête lui délègue tout autre type, à l'identique. Rejouable : chaque maillon se crée d'abord sous son
-- propre nom (« …_maillon_envois_automatiques ») et ne prend la tête que s'il n'est pas déjà posé ; un second passage ne
-- touche donc pas à la chaîne, même si une migration plus récente l'a prolongée au-dessus de ce maillon.
-- Retour arrière : supabase/retours-arriere/20261122200000_envois_automatiques_reglage.retour.sql

-- ── 1. Le réglage : quatre interrupteurs, fermés ─────────────────────────────────────────────────────────────────
create table if not exists public.envois_automatiques_reglage (
  singleton boolean primary key default true,
  avis_echeance boolean not null default false,
  relance_loyer boolean not null default false,
  rappel_rendez_vous boolean not null default false,
  relance_invitation boolean not null default false,
  modifie_le timestamptz,
  modifie_par uuid references public.accounts(id),
  constraint envois_automatiques_reglage_unique check (singleton)
);
create index if not exists envois_automatiques_reglage_modifie_par on public.envois_automatiques_reglage(modifie_par);
comment on table public.envois_automatiques_reglage is
  'Interrupteurs des envois automatiques suspendus (P1-08) : avis d''échéance, relance amiable, rappel de rendez-vous, relance d''invitation. Tous fermés par défaut. Écrit par regler_envoi_automatique seulement.';
insert into public.envois_automatiques_reglage (singleton) values (true) on conflict (singleton) do nothing;

alter table public.envois_automatiques_reglage enable row level security;
revoke all on public.envois_automatiques_reglage from public, anon, authenticated, service_role;

-- ── 2. Lire et régler ────────────────────────────────────────────────────────────────────────────────────────────
-- Réglage absent ou flux inconnu = fermé : sans réglage lisible, rien ne part.
create or replace function public.envoi_automatique_ouvert(p_flux text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_flux
             when 'avis_echeance' then r.avis_echeance
             when 'relance_loyer' then r.relance_loyer
             when 'rappel_rendez_vous' then r.rappel_rendez_vous
             when 'relance_invitation' then r.relance_invitation
             else false
           end
      from public.envois_automatiques_reglage r where r.singleton), false);
$$;
comment on function public.envoi_automatique_ouvert(text) is
  'Vrai si le superviseur a ouvert cet envoi automatique (P1-08). Flux inconnu ou réglage absent : faux.';
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
    'modifie_le', r.modifie_le,
    -- Avant d'ouvrir : combien d'espaces ont déjà donné leur accord permanent. Leurs e-mails partiraient aussitôt.
    'espaces_avis_echeance', (select count(*) from public.organizations o where o.appels_envoi_auto),
    'espaces_relance_loyer', (select count(*) from public.organizations o where o.relances_envoi_auto));
end;
$$;
comment on function public.lire_envois_automatiques() is
  'État des quatre interrupteurs d''envoi automatique, pour la console du superviseur (P1-08).';
revoke all on function public.lire_envois_automatiques() from public, anon, service_role;
grant execute on function public.lire_envois_automatiques() to authenticated;

-- Ce que les écrans des espaces peuvent proposer : rien de confidentiel, quatre oui/non. Fermé : le profil d'un espace
-- continue d'afficher « envoi suspendu » et ne demande aucun accord.
create or replace function public.envois_automatiques_proposes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'avis_echeance', public.envoi_automatique_ouvert('avis_echeance'),
    'relance_loyer', public.envoi_automatique_ouvert('relance_loyer'),
    'rappel_rendez_vous', public.envoi_automatique_ouvert('rappel_rendez_vous'),
    'relance_invitation', public.envoi_automatique_ouvert('relance_invitation'));
$$;
comment on function public.envois_automatiques_proposes() is
  'Les envois automatiques que le superviseur a ouverts (P1-08), pour que les écrans des espaces sachent quoi proposer. Quatre booléens, aucun autre contenu.';
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
  if p_flux is null or p_flux not in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation') then
    raise exception 'Envoi automatique inconnu';
  end if;
  if p_ouvert is null then
    raise exception 'Indiquez si cet envoi est ouvert ou fermé';
  end if;
  insert into public.envois_automatiques_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.envois_automatiques_reglage where singleton for update;
  v_precedent := case p_flux
    when 'avis_echeance' then r.avis_echeance when 'relance_loyer' then r.relance_loyer
    when 'rappel_rendez_vous' then r.rappel_rendez_vous else r.relance_invitation end;
  update public.envois_automatiques_reglage
     set avis_echeance = case when p_flux = 'avis_echeance' then p_ouvert else avis_echeance end,
         relance_loyer = case when p_flux = 'relance_loyer' then p_ouvert else relance_loyer end,
         rappel_rendez_vous = case when p_flux = 'rappel_rendez_vous' then p_ouvert else rappel_rendez_vous end,
         relance_invitation = case when p_flux = 'relance_invitation' then p_ouvert else relance_invitation end,
         modifie_le = now(), modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'envoi_automatique', auth.uid(),
          jsonb_build_object('flux', p_flux, 'ouvert', p_ouvert, 'precedent', v_precedent));
end;
$$;
comment on function public.regler_envoi_automatique(text, boolean) is
  'Le superviseur permanent ouvre ou ferme un envoi automatique (P1-08) ; geste journalisé (supervision_operations, action « envoi_automatique »).';
revoke all on function public.regler_envoi_automatique(text, boolean) from public, anon, service_role;
grant execute on function public.regler_envoi_automatique(text, boolean) to authenticated;

-- ── 3. La preuve avant l'envoi ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.empreinte_maillon_envois_automatiques(p_org uuid, p_contexte jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_contexte->>'type';
  v_dest text := p_contexte->>'destinataire';
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_montant constant text := '^[0-9]{1,9}(\.[0-9]{1,2})?$';
  v_du boolean := false;
begin
  -- Tout autre type suit la chaîne existante, sans aucun changement (« is distinct from » : un type absent aussi).
  if v_type is null or v_type not in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation') then
    return public.empreinte_avant_envois_automatiques(p_org, p_contexte);
  end if;
  -- Les formats d'abord : aucune conversion sur une valeur mal formée.
  if coalesce(p_contexte->>'id', '') !~ v_uuid or coalesce(v_dest, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- L'interrupteur du superviseur : fermé (le défaut), rien ne part.
  if not public.envoi_automatique_ouvert(v_type) then
    return null;
  end if;
  -- Arrêt d'urgence, général ou de la mission qui envoie : rien ne part tant qu'il n'est pas levé.
  if exists (select 1 from public.supervision_arrets a
              where a.arrete and a.cle in ('global', case v_type when 'avis_echeance' then 'appels'
                                                                 when 'relance_loyer' then 'relances' else 'rappels' end)) then
    return null;
  end if;

  if v_type = 'avis_echeance' then
    -- La base redit que cet appel est à envoyer (non envoyé, non soldé, espace qui a demandé l'envoi automatique), et
    -- que l'adresse est celle du locataire ou d'un colocataire titulaire.
    if p_org is null then return null; end if;
    select true into v_du
      from public.appels_a_envoyer(500) a
     where a.appel_id = (p_contexte->>'id')::uuid and a.organization_id = p_org
       and (encode(sha256(convert_to(lower(btrim(a.destinataire)), 'UTF8')), 'hex') = v_dest
            or exists (select 1 from unnest(a.autres_destinataires) x
                        where encode(sha256(convert_to(lower(btrim(x)), 'UTF8')), 'hex') = v_dest))
     limit 1;

  elsif v_type = 'relance_loyer' then
    -- La base redit que cette relance est due aujourd'hui, à ce niveau, pour ce terme et ces montants ; l'adresse est
    -- celle du locataire, d'un colocataire titulaire, ou — pour l'information de la caution — d'un garant du bail.
    if p_org is null
       or coalesce(p_contexte->>'niveau', '') not in ('relance_1', 'relance_2')
       or coalesce(p_contexte->>'cible', '') not in ('locataire', 'caution')
       or coalesce(p_contexte->>'echeance', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(p_contexte->>'reste', '') !~ v_montant
       or (p_contexte->>'total' is not null and p_contexte->>'total' !~ v_montant) then
      return null;
    end if;
    select true into v_du
      from public.relances_loyer_dues(500) r
     where r.bail_id = (p_contexte->>'id')::uuid and r.organization_id = p_org
       and r.niveau = p_contexte->>'niveau'
       and r.date_echeance = (p_contexte->>'echeance')::date
       and r.reste = (p_contexte->>'reste')::numeric
       and r.total_du is not distinct from (p_contexte->>'total')::numeric
       and case p_contexte->>'cible'
             when 'caution' then exists (select 1 from unnest(r.garants) x
                                          where encode(sha256(convert_to(lower(btrim(x)), 'UTF8')), 'hex') = v_dest)
             else (encode(sha256(convert_to(lower(btrim(r.destinataire)), 'UTF8')), 'hex') = v_dest
                   or exists (select 1 from unnest(r.autres_destinataires) x
                               where encode(sha256(convert_to(lower(btrim(x)), 'UTF8')), 'hex') = v_dest))
           end
     limit 1;

  elsif v_type = 'rappel_rendez_vous' then
    -- La base redit que ce rappel (la veille, ou sept jours avant) est dû à ce destinataire et pas encore envoyé.
    if p_org is null
       or coalesce(p_contexte->>'echeance', '') not in ('veille', 'j7')
       or coalesce(p_contexte->>'role', '') not in ('locataire', 'artisan') then
      return null;
    end if;
    select true into v_du
      from public.rendez_vous_a_rappeler(500) r
     where r.intervention_id = (p_contexte->>'id')::uuid and r.organization_id = p_org
       and r.echeance = p_contexte->>'echeance' and r.destinataire = p_contexte->>'role'
       and encode(sha256(convert_to(lower(btrim(r.adresse)), 'UTF8')), 'hex') = v_dest
     limit 1;

  else
    -- relance_invitation : la relance a été RÉSERVÉE aujourd'hui pour ce rang (la réservation relit la règle sous
    -- verrou), elle n'a pas encore de sort, l'invitation attend toujours, et l'adresse est celle de l'invitation.
    if coalesce(p_contexte->>'rang', '') not in ('1', '2') then return null; end if;
    select true into v_du
      from public.relances_invitations_locataires ri
      join public.invitations_locataires i on i.id = ri.invitation_id
     where ri.invitation_id = (p_contexte->>'id')::uuid and ri.rang = (p_contexte->>'rang')::smallint
       and ri.etat = 'reservee' and ri.jour = public.aujourdhui_paris()
       and i.etat = 'en_attente' and i.expire_le > now()
       and (p_org is null or i.organization_id = p_org)
       and coalesce(public.org_ecriture_ouverte(i.organization_id), false)
       and encode(sha256(convert_to(lower(btrim(i.email)), 'UTF8')), 'hex') = v_dest
     limit 1;
  end if;

  if v_du is not true then return null; end if;
  -- Le contexte porte tout ce qui a été prouvé (objet, niveau, montants, adresse) : sa propre empreinte suffit.
  return encode(sha256(convert_to(p_contexte::text, 'UTF8')), 'hex');
end $$;
comment on function public.empreinte_maillon_envois_automatiques(uuid, jsonb) is
  'Preuve métier d''un e-mail conservé, recalculée avant l''envoi. Tête de chaîne du 22/11/2026 (P1-08) : traite avis_echeance, relance_loyer, rappel_rendez_vous et relance_invitation (interrupteur du superviseur ouvert + envoi redit dû par la base), délègue tout autre type à empreinte_avant_envois_automatiques.';
revoke all on function public.empreinte_maillon_envois_automatiques(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.empreinte_maillon_envois_automatiques(uuid, jsonb) to service_role;
do $chaine$
begin
  if to_regprocedure('public.empreinte_avant_envois_automatiques(uuid,jsonb)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_envois_automatiques;
    alter function public.empreinte_maillon_envois_automatiques(uuid,jsonb) rename to empreinte_metier_courriel;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.empreinte_maillon_envois_automatiques(uuid,jsonb);
  end if;
end $chaine$;
revoke all on function public.empreinte_avant_envois_automatiques(uuid,jsonb) from public, anon, authenticated, service_role;

-- ── 4. La clôture après l'envoi ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.finaliser_maillon_envois_automatiques(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m public.courriels_durables;
begin
  select * into m from public.courriels_durables where id = p_id for update;
  if m.contexte_metier is null
     or m.contexte_metier->>'type' is null
     or m.contexte_metier->>'type' not in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation') then
    return public.finaliser_avant_envois_automatiques(p_id);
  end if;
  if m.finalisation_etat = 'terminee' then return true; end if;
  if m.fournisseur_id is null or m.etat not in ('accepte', 'livre') then return false; end if;
  -- Rien d'autre à consigner ici : chaque tâche écrit déjà sa trace métier (appel marqué envoyé, relance consignée,
  -- rappel marqué, relance d'invitation notée).
  update public.courriels_durables set finalisation_etat = 'terminee', motif = null where id = p_id;
  insert into public.courriels_evenements (courrier_id, etat) values (p_id, 'finalisation_terminee');
  return true;
end $$;
comment on function public.finaliser_maillon_envois_automatiques(text) is
  'Clôture d''un e-mail conservé après son envoi. Tête de chaîne du 22/11/2026 (P1-08) : traite les quatre envois automatiques, délègue tout autre type à finaliser_avant_envois_automatiques.';
revoke all on function public.finaliser_maillon_envois_automatiques(text) from public, anon, authenticated;
grant execute on function public.finaliser_maillon_envois_automatiques(text) to service_role;
do $chaine$
begin
  if to_regprocedure('public.finaliser_avant_envois_automatiques(text)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_envois_automatiques;
    alter function public.finaliser_maillon_envois_automatiques(text) rename to finaliser_courriel_metier;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.finaliser_maillon_envois_automatiques(text);
  end if;
end $chaine$;
revoke all on function public.finaliser_avant_envois_automatiques(text) from public, anon, authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
