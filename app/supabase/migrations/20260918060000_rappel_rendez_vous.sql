-- Le rappel de rendez-vous (RM-10.5) : « veille systématique, J-7 si posé
-- assez tôt ».
--
-- CE QUI MANQUAIT. Rien ne le portait : ni table, ni tâche. L'écran du
-- locataire l'annonçait ; la phrase a été retirée le 11/09 plutôt que laissée à
-- mentir. Un rendez-vous manqué coûte un déplacement d'artisan, un créneau
-- repris à zéro, et il pèse sur le score de fiabilité de celui qui n'est pas
-- venu — quand le seul tort était d'avoir oublié.
--
-- DEUX DESTINATAIRES, PAS UN. Le locataire doit être là ; l'artisan doit
-- venir. Les deux absences ont les mêmes conséquences et méritent le même
-- rappel. C'est pourquoi le suivi se fait PAR DESTINATAIRE et non par
-- rendez-vous : si l'adresse de l'un est fausse, l'autre reçoit quand même le
-- sien, et la prochaine passe retentera le premier.
--
-- « SI POSÉ ASSEZ TÔT » NE S'ÉCRIT PAS. La condition se tient d'elle-même : on
-- ne regarde que les rendez-vous qui tombent dans exactement sept jours. Un
-- rendez-vous fixé l'avant-veille n'a jamais de J-7 à envoyer, puisque ce jour
-- est déjà passé quand il est fixé. Aucune règle supplémentaire n'est
-- nécessaire.
--
-- PAS DE RATTRAPAGE, ET C'EST VOULU. Les deux échéances sont des dates exactes,
-- pas des fenêtres. Si la tâche saute un jour, le rappel est perdu — parce
-- qu'un message disant « demain » envoyé le matin même serait faux, et qu'un
-- rappel faux est pire que pas de rappel.

create type public.rappel_echeance as enum ('j7', 'veille');
create type public.rappel_destinataire as enum ('locataire', 'artisan');

create table public.intervention_rappels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  intervention_id uuid not null,
  echeance public.rappel_echeance not null,
  destinataire public.rappel_destinataire not null,
  -- L'adresse au moment de l'envoi : elle peut changer ensuite, et on veut
  -- pouvoir dire OÙ le rappel est parti, pas où il partirait aujourd'hui.
  adresse text not null,
  envoye_le timestamptz not null default now(),
  constraint intervention_rappels_id_org_unique unique (id, organization_id),
  constraint intervention_rappels_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions (id, organization_id)
    on delete cascade,
  -- Un rappel, une fois, à chacun : c'est cette contrainte qui rend la tâche
  -- rejouable sans risque.
  constraint intervention_rappels_une_fois
    unique (intervention_id, echeance, destinataire)
);
comment on table public.intervention_rappels is
  'Trace des rappels de rendez-vous envoyés (RM-10.5) : une ligne par destinataire et par échéance.';

alter table public.intervention_rappels enable row level security;
-- Lecture seule, et pour les seuls gestionnaires : le gérant qui traite un
-- rendez-vous manqué doit pouvoir dire si le rappel est bien parti. Personne
-- n'écrit ici depuis l'application — seule la tâche planifiée pose une ligne,
-- par la fonction ci-dessous.
create policy intervention_rappels_select on public.intervention_rappels for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- L'agenda des rappels balaie par date, toutes organisations confondues.
create index intervention_rappels_intervention_idx
  on public.intervention_rappels (intervention_id, echeance);

-- ── Ce que la tâche de rappel a le droit de voir ───────────────────────────
create or replace function public.rendez_vous_a_rappeler(p_limite integer default 200)
returns table (
  intervention_id uuid,
  organization_id uuid,
  echeance text,
  destinataire text,
  adresse text,
  prenom text,
  emetteur text,
  artisan text,
  lot text,
  adresse_bien text,
  debut_prevu timestamptz,
  fin_prevue timestamptz,
  incident_numero text,
  categorie text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin : elle traverse TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'rendez_vous_a_rappeler: reserve a la tache de rappel';
  end if;

  return query
  with rdv as (
    select i.id, i.organization_id, i.debut_prevu, i.fin_prevue,
           o.name as emetteur, a.raison_sociale, a.email as email_artisan,
           inc.numero, inc.categorie,
           l.nom as lot_nom,
           coalesce(b.address_line1, '') as adresse_bien,
           loc.email as email_locataire, loc.prenom as prenom_locataire,
           -- La veille, ou sept jours avant : des dates exactes, lues à Paris.
           case
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 1 then 'veille'
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 7 then 'j7'
           end as quand
    from public.incident_interventions i
    join public.organizations o on o.id = i.organization_id
    join public.artisans a on a.id = i.artisan_id
    join public.incidents inc on inc.id = i.incident_id
    join public.lots l on l.id = inc.lot_id
    join public.biens b on b.id = l.bien_id
    left join public.baux ba on ba.id = inc.bail_id
    left join public.persons loc
           on loc.id = coalesce(ba.locataire_principal, inc.declarant_person_id)
    where i.debut_prevu is not null
      and i.statut in ('acceptee', 'planifiee')
      -- Une organisation suspendue n'écrit plus en son nom.
      and public.org_ecriture_ouverte(i.organization_id)
  ),
  -- Une ligne par destinataire : l'adresse fausse de l'un ne prive pas
  -- l'autre de son rappel.
  cible as (
    select r.*, 'locataire' as qui, r.email_locataire as ou, r.prenom_locataire as p
      from rdv r
    union all
    select r.*, 'artisan' as qui, r.email_artisan as ou, null::text as p
      from rdv r
  )
  select c.id, c.organization_id, c.quand, c.qui, c.ou, c.p, c.emetteur,
         c.raison_sociale, c.lot_nom, c.adresse_bien, c.debut_prevu, c.fin_prevue,
         c.numero, c.categorie
  from cible c
  where c.quand is not null
    and c.ou is not null and length(btrim(c.ou)) > 0
    and not exists (
      select 1 from public.intervention_rappels r
      where r.intervention_id = c.id
        and r.echeance = c.quand::public.rappel_echeance
        and r.destinataire = c.qui::public.rappel_destinataire
    )
  order by c.debut_prevu, c.id
  limit greatest(1, least(p_limite, 500));
end;
$$;
comment on function public.rendez_vous_a_rappeler(integer) is
  'Les rappels de rendez-vous à envoyer (RM-10.5) : une ligne par destinataire, veille et J-7. Réservée à la tâche planifiée.';
revoke execute on function public.rendez_vous_a_rappeler(integer) from public, anon, authenticated;
grant execute on function public.rendez_vous_a_rappeler(integer) to service_role;

-- ── Et ce qu'elle a le droit d'écrire : la trace d'un rappel parti ─────────
create or replace function public.marquer_rappel_envoye(
  p_intervention uuid,
  p_echeance text,
  p_destinataire text,
  p_adresse text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'marquer_rappel_envoye: reserve a la tache de rappel';
  end if;
  select organization_id into v_org
  from public.incident_interventions where id = p_intervention;
  if v_org is null then return false; end if;

  -- `on conflict do nothing` : si deux passes se chevauchent, la seconde ne
  -- double pas la trace et ne lève pas d'erreur.
  insert into public.intervention_rappels
    (organization_id, intervention_id, echeance, destinataire, adresse)
  values (v_org, p_intervention, p_echeance::public.rappel_echeance,
          p_destinataire::public.rappel_destinataire, p_adresse)
  on conflict (intervention_id, echeance, destinataire) do nothing;
  return found;
end;
$$;
comment on function public.marquer_rappel_envoye(uuid, text, text, text) is
  'Trace un rappel de rendez-vous parti. Réservée à la tâche planifiée.';
revoke execute on function public.marquer_rappel_envoye(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.marquer_rappel_envoye(uuid, text, text, text) to service_role;

-- Nouvelle table d'organisation : elle doit être sous le verrou d'abonnement,
-- sans quoi une agence suspendue continuerait d'y écrire.
select public.poser_gardes_abonnement();
