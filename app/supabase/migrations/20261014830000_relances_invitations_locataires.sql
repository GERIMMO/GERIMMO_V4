-- Relances automatiques des invitations de locataire à J+3 et J+10 (décision du dirigeant du 15/10/2026, point X16,
-- fiche REP-05 ; spécification V3, module 16 : parcours 16.4 étape 5 « Programme les relances J+3, J+10 », RM-16.6.1
-- « Deux relances automatiques partent à J+3 et J+10 », RM-16.7.2 « Un refus explicite arrête les relances »,
-- RM-16.4.3 « Le propriétaire mandant n'est jamais invité »).
--
-- CONSTAT. Un seul e-mail partait, à l'envoi de l'invitation ; aucune tâche ne relisait les invitations en attente.
--
-- CE QUE POSE CETTE MIGRATION (l'envoi lui-même est fait par l'application, mission planifiée « rappels », qui seule
-- sait fabriquer le lien et envoyer le courrier) :
--   1. `invitations_locataires.premier_envoi_le` : l'instant du PREMIER envoi confirmé de l'invitation (J+0). Un
--      déclencheur le pose une fois, à la première valeur de `envoye_le`, et ne le déplace plus : `envoye_le` reste
--      l'instant du DERNIER envoi par le gestionnaire (renvoi manuel compris). Aucune fonction existante n'est réécrite.
--   2. `invitations_locataires.relances_prevues` : vrai pour toute invitation créée APRÈS cette migration. Les
--      invitations déjà en base le reçoivent à FAUX (ajout de colonne, aucune valeur existante modifiée) : elles ne
--      sont jamais relancées (leur e-mail n'annonçait aucun rappel ; pas de vague de courriels au déploiement).
--   3. `relances_invitations_locataires` : une ligne par relance (rang 1 = J+3, rang 2 = J+10), clé primaire
--      (invitation, rang) : la même relance ne peut exister deux fois. La ligne est RÉSERVÉE avant l'envoi (au plus un
--      envoi, jamais deux), puis notée « envoyée », « incertaine » (le service d'e-mail n'a pas répondu : jamais
--      renvoyée) ou retirée (échec certain, limite atteinte, arrêt d'urgence : une passe suivante pourra la reprendre).
--   4. Quatre fonctions, réservées au traitement (`service_role`) sauf la règle interne, fermée à tous :
--      `relance_invitation_locataire_due(invitation)` (LA règle, lue par les trois autres),
--      `invitations_locataires_relances_dues(limite)`, `reserver_relance_invitation_locataire(invitation, rang)`,
--      `noter_relance_invitation_locataire(invitation, rang, résultat)` (journal d'audit).
--
-- LA RÈGLE (jours comptés au jour de Paris, `public.aujourdhui_paris()`, jamais `current_date`) :
--   - seule une invitation EN ATTENTE est relancée : ni acceptée, ni refusée, ni annulée, ni expirée — l'expiration
--     est relue à l'instant (`expire_le > now()`), puisque l'état enregistré ne passe à « expirée » qu'à la réponse ;
--   - J+0 = jour de Paris du premier envoi confirmé ; rang 1 dû de J+3 à J+9, rang 2 dû à partir de J+10 et jusqu'à
--     l'expiration ; au plus deux relances ; un rang 1 manqué (arrêt, panne) n'est plus envoyé une fois J+10 atteint ;
--   - jamais deux e-mails d'invitation à moins de trois jours d'écart : ni dans les trois jours qui suivent un renvoi
--     manuel (la spécification ne dit pas qu'un renvoi relance le cycle : il ne le relance pas, il le retarde), ni
--     dans les trois jours qui suivent une relance (cas d'un rang 1 rattrapé tard) ;
--   - jamais une personne propriétaire ou mandante (un mandat, quel que soit son état, ou une détention en cours :
--     RM-16.4.3), jamais une fiche archivée, déjà liée à un compte, dont l'adresse a changé depuis l'invitation, ni un
--     compte qui a déjà un accès à l'organisation ; jamais une organisation fermée à l'écriture (abonnement suspendu,
--     essai échu) ;
--   - l'arrêt d'urgence (global, ou clé « rappels », celle de la mission qui envoie) refuse toute réservation.
--
-- Migration ADDITIVE et rejouable : colonnes et table ajoutées sous garde, fonctions en `create or replace`, politique
-- et déclencheurs reposés. Aucune donnée financière touchée ; aucune ligne existante réécrite. Retour arrière :
-- supabase/retours-arriere/20261014830000_relances_invitations_locataires.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

-- ── 1. Les deux colonnes de l'invitation ───────────────────────────────────
alter table public.invitations_locataires add column if not exists premier_envoi_le timestamptz;
comment on column public.invitations_locataires.premier_envoi_le is
  'Instant du premier envoi confirmé de l''invitation (J+0 des relances J+3 et J+10). Posé une fois par le déclencheur premier_envoi_invitation_locataire ; envoye_le reste le dernier envoi du gestionnaire. Décision X16 (REP-05).';

do $colonne$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invitations_locataires' and column_name = 'relances_prevues') then
    -- Les invitations déjà en base : FAUX (jamais relancées). Toute invitation créée ensuite : VRAI.
    alter table public.invitations_locataires add column relances_prevues boolean not null default false;
    alter table public.invitations_locataires alter column relances_prevues set default true;
  end if;
end $colonne$;
comment on column public.invitations_locataires.relances_prevues is
  'Vrai : l''invitation reçoit les relances automatiques J+3 et J+10. Faux pour les invitations créées avant la décision X16 (15/10/2026).';

-- ── 2. Le premier envoi, posé une fois ─────────────────────────────────────
create or replace function public.poser_premier_envoi_invitation_locataire()
returns trigger
language plpgsql
set search_path = ''
as $$
-- Décision X16 (REP-05) du 15/10 : J+0 des relances = premier envoi confirmé, jamais déplacé par un renvoi.
begin
  if tg_op = 'UPDATE' and old.premier_envoi_le is not null then
    new.premier_envoi_le := old.premier_envoi_le;
  elsif new.premier_envoi_le is null and new.envoye_le is not null then
    new.premier_envoi_le := new.envoye_le;
  end if;
  return new;
end;
$$;
revoke all on function public.poser_premier_envoi_invitation_locataire() from public, anon, authenticated, service_role;

drop trigger if exists premier_envoi_invitation_locataire on public.invitations_locataires;
create trigger premier_envoi_invitation_locataire
  before insert or update on public.invitations_locataires
  for each row execute function public.poser_premier_envoi_invitation_locataire();

-- ── 3. Les relances ────────────────────────────────────────────────────────
create table if not exists public.relances_invitations_locataires (
  invitation_id uuid not null references public.invitations_locataires(id) on delete cascade,
  rang smallint not null check (rang in (1, 2)),
  jour date not null,
  etat text not null default 'reservee' check (etat in ('reservee', 'envoyee', 'incertaine')),
  reservee_le timestamptz not null default now(),
  envoyee_le timestamptz,
  primary key (invitation_id, rang),
  check ((etat = 'envoyee') = (envoyee_le is not null))
);
comment on table public.relances_invitations_locataires is
  'Relances automatiques des invitations de locataire (rang 1 : J+3, rang 2 : J+10). Réservée avant l''envoi, notée après : jamais deux fois la même. Décision X16 (REP-05).';
comment on column public.relances_invitations_locataires.jour is 'Jour de Paris de la relance.';
comment on column public.relances_invitations_locataires.etat is
  'reservee : envoi en cours ou interrompu sans réponse ; envoyee : le service d''e-mail l''a acceptée ; incertaine : le service n''a pas répondu, elle a peut-être eu lieu (jamais renvoyée).';

alter table public.relances_invitations_locataires enable row level security;
revoke all on public.relances_invitations_locataires from public, anon, authenticated, service_role;
grant select on public.relances_invitations_locataires to authenticated, service_role;
-- Lisible exactement par qui lit l'invitation (sa politique s'applique dans la sous-requête) : le gérant de la fiche,
-- dans son portefeuille, et la personne invitée. Aucune écriture hors des fonctions ci-dessous.
drop policy if exists relances_invitations_locataires_lecture on public.relances_invitations_locataires;
create policy relances_invitations_locataires_lecture on public.relances_invitations_locataires
  for select to authenticated
  using (exists (select 1 from public.invitations_locataires i where i.id = invitation_id));

drop trigger if exists diagnostic_artisan_lecture on public.relances_invitations_locataires;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.relances_invitations_locataires
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- ── 4. La règle ────────────────────────────────────────────────────────────
create or replace function public.relance_invitation_locataire_due(p_invitation uuid)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
-- Décision X16 (REP-05) du 15/10 : le rang de relance dû aujourd'hui (jour de Paris), ou NULL.
declare
  i public.invitations_locataires%rowtype;
  p public.persons%rowtype;
  v_jour date := public.aujourdhui_paris();
  v_j0 date;
  v_dernier date;
  v_rangs smallint[];
begin
  select * into i from public.invitations_locataires where id = p_invitation;
  if not found or i.etat <> 'en_attente' or i.expire_le <= now() or not i.relances_prevues or i.premier_envoi_le is null then
    return null;
  end if;
  select * into p from public.persons where id = i.person_id and organization_id = i.organization_id;
  if not found or p.archived_at is not null or p.account_id is not null or lower(btrim(p.email)) is distinct from i.email then
    return null;
  end if;
  -- RM-16.4.3 : le propriétaire mandant n'est jamais invité, donc jamais relancé.
  if exists (select 1 from public.mandats m where m.person_id = i.person_id)
     or exists (select 1 from public.detentions d where d.person_id = i.person_id and (d.date_fin is null or d.date_fin >= v_jour)) then
    return null;
  end if;
  if exists (select 1 from public.memberships m where m.account_id = i.account_id and m.organization_id = i.organization_id) then
    return null;
  end if;
  if not coalesce(public.org_ecriture_ouverte(i.organization_id), false) then
    return null;
  end if;

  v_j0 := (i.premier_envoi_le at time zone 'Europe/Paris')::date;
  select coalesce(array_agg(r.rang), '{}'::smallint[]), max(r.jour) into v_rangs, v_dernier
    from public.relances_invitations_locataires r where r.invitation_id = i.id;
  -- Trois jours au moins après le dernier e-mail d'invitation : renvoi manuel (envoye_le) ou relance.
  v_dernier := greatest(v_dernier, (coalesce(i.envoye_le, i.premier_envoi_le) at time zone 'Europe/Paris')::date);
  if v_jour < v_dernier + 3 then
    return null;
  end if;
  if v_jour >= v_j0 + 10 then
    return case when 2 = any(v_rangs) then null else 2 end;
  end if;
  if v_jour >= v_j0 + 3 and cardinality(v_rangs) = 0 then
    return 1;
  end if;
  return null;
end;
$$;
comment on function public.relance_invitation_locataire_due(uuid) is
  'Règle des relances d''invitation de locataire (X16) : 1 de J+3 à J+9, 2 à partir de J+10, au jour de Paris, ou NULL. Interne, fermée à tous les rôles.';
revoke all on function public.relance_invitation_locataire_due(uuid) from public, anon, authenticated, service_role;

create or replace function public.invitations_locataires_relances_dues(p_limite integer default 50)
returns table(invitation_id uuid, organization_id uuid, email text, rang smallint, expire_le timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- Décision X16 (REP-05) du 15/10 : les relances dues aujourd'hui, les plus anciennes invitations d'abord.
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  return query
    select i.id, i.organization_id, i.email, d.rang, i.expire_le
      from public.invitations_locataires i
      cross join lateral (select public.relance_invitation_locataire_due(i.id) as rang) d
     where i.etat = 'en_attente' and i.expire_le > now() and i.relances_prevues and i.premier_envoi_le is not null
       and d.rang is not null
     order by i.premier_envoi_le, i.id
     limit greatest(1, least(coalesce(p_limite, 50), 200));
end;
$$;
revoke all on function public.invitations_locataires_relances_dues(integer) from public, anon, authenticated;
grant execute on function public.invitations_locataires_relances_dues(integer) to service_role;

create or replace function public.reserver_relance_invitation_locataire(p_invitation uuid, p_rang smallint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
-- Décision X16 (REP-05) du 15/10 : réserve la relance AVANT l'envoi. Vrai : elle est à envoyer, une seule fois.
declare
  v_person uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  if p_invitation is null or p_rang is null or p_rang not in (1, 2) then
    return false;
  end if;
  -- Arrêt d'urgence (global, ou « rappels », la mission qui envoie) : aucune nouvelle relance.
  if not public.verifier_arret_supervision('rappels') then
    return false;
  end if;
  -- Même ordre de verrous que la préparation et la réponse : la fiche, puis l'invitation. Une acceptation, un refus
  -- ou une annulation concurrents passent avant ou après, jamais entre la relecture de la règle et la réservation.
  select person_id into v_person from public.invitations_locataires where id = p_invitation;
  if v_person is null then
    return false;
  end if;
  perform 1 from public.persons where id = v_person for update;
  perform 1 from public.invitations_locataires where id = p_invitation for update;
  if public.relance_invitation_locataire_due(p_invitation) is distinct from p_rang then
    return false;
  end if;
  insert into public.relances_invitations_locataires (invitation_id, rang, jour)
  values (p_invitation, p_rang, public.aujourdhui_paris())
  on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.reserver_relance_invitation_locataire(uuid, smallint) from public, anon, authenticated;
grant execute on function public.reserver_relance_invitation_locataire(uuid, smallint) to service_role;

create or replace function public.noter_relance_invitation_locataire(p_invitation uuid, p_rang smallint, p_resultat text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
-- Décision X16 (REP-05) du 15/10 : le sort d'une relance réservée. Rejouable sans effet.
--   envoyee    : acceptée par le service d'e-mail (journal d'audit « invitation_locataire_relancee »)
--   incertaine : le service n'a pas répondu ; elle a peut-être eu lieu, elle ne sera jamais renvoyée
--   echec      : refusée, rien n'est parti ; la réservation est retirée (une passe suivante pourra la reprendre)
--   reportee   : rien n'est parti (limite par organisation, arrêt d'urgence) ; la réservation est retirée
declare
  r public.relances_invitations_locataires%rowtype;
  i public.invitations_locataires%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  if p_resultat is null or p_resultat not in ('envoyee', 'incertaine', 'echec', 'reportee') then
    raise exception 'Résultat de relance inconnu';
  end if;
  select * into r from public.relances_invitations_locataires
   where invitation_id = p_invitation and rang = p_rang for update;
  if not found or r.etat <> 'reservee' then
    return;
  end if;
  select * into i from public.invitations_locataires where id = p_invitation;
  if p_resultat = 'envoyee' then
    update public.relances_invitations_locataires set etat = 'envoyee', envoyee_le = now()
     where invitation_id = p_invitation and rang = p_rang;
    insert into public.audit_log (account_id, organization_id, action, details)
    values (null, i.organization_id, 'invitation_locataire_relancee',
            jsonb_build_object('invitation', p_invitation, 'rang', p_rang, 'person_id', i.person_id));
  elsif p_resultat = 'incertaine' then
    update public.relances_invitations_locataires set etat = 'incertaine'
     where invitation_id = p_invitation and rang = p_rang;
    insert into public.audit_log (account_id, organization_id, action, details)
    values (null, i.organization_id, 'invitation_locataire_relance_incertaine',
            jsonb_build_object('invitation', p_invitation, 'rang', p_rang, 'person_id', i.person_id));
  else
    delete from public.relances_invitations_locataires where invitation_id = p_invitation and rang = p_rang;
    if p_resultat = 'echec' then
      insert into public.audit_log (account_id, organization_id, action, details)
      values (null, i.organization_id, 'invitation_locataire_relance_echec',
              jsonb_build_object('invitation', p_invitation, 'rang', p_rang, 'person_id', i.person_id));
    end if;
  end if;
end;
$$;
revoke all on function public.noter_relance_invitation_locataire(uuid, smallint, text) from public, anon, authenticated;
grant execute on function public.noter_relance_invitation_locataire(uuid, smallint, text) to service_role;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
