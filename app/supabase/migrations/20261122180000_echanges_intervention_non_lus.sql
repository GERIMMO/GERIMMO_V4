-- Audit palier 1, P1-05 — Discussion d'une intervention : un nouveau message se voit sans ouvrir la fiche.
--
-- CE QUI MANQUAIT. La discussion partagée entre le gestionnaire, le locataire et l'artisan (20261101190943) n'écrivait
-- que le message : ni alerte, ni compteur de messages non lus. Un artisan qui écrivait « je ne peux pas entrer dans
-- l'immeuble » n'était lu que si quelqu'un rouvrait la fiche par hasard.
--
-- CE QUE POSE CETTE MIGRATION. Aucun e-mail (la liste des e-mails du pilote reste fermée) : tout se lit dans l'espace.
--   1. Un marqueur de lecture PAR COMPTE et par intervention : « j'ai lu la discussion jusqu'à telle heure ».
--   2. `echanges_intervention_non_lus(p_org)` : pour l'appelant, les interventions dont la discussion porte des
--      messages d'un autre compte, postérieurs à son marqueur. Avec un espace : ses interventions dans cet espace
--      (gestionnaire, locataire). Sans espace : les missions de l'artisan. Le droit de lire reste celui de la
--      discussion (`role_echange_intervention`) : qui ne peut pas la lire n'y compte rien.
--      Seule compte la dernière mission de chaque incident : c'est la seule discussion que les écrans affichent.
--   3. `marquer_echange_intervention_lu(p_intervention, p_message)` : avance le marqueur de l'appelant jusqu'au
--      dernier message qu'il a eu sous les yeux, désigné par son identifiant — jamais en arrière.
--   4. Pour le gestionnaire, une alerte « Nouveau message sur l'intervention » : UNE alerte ouverte par intervention
--      (un second message la met à jour), née du message d'un locataire ou d'un artisan, fermée d'elle-même quand un
--      gestionnaire a lu la discussion. Elle ne porte que des identifiants : jamais le texte du message.
--
-- CE QUI NE CHANGE PAS. Qui peut lire et écrire dans la discussion ; le texte des messages ; leur conservation.
-- L'alerte ne peut jamais empêcher un message de partir : une erreur à sa pose est avalée (le message reste).
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261122180000_echanges_intervention_non_lus.retour.sql

-- ── 1. Le marqueur de lecture, par compte ────────────────────────────────────────────────────────────────────────
create table if not exists public.intervention_echanges_lectures (
  intervention_id uuid not null references public.incident_interventions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  lue_le timestamptz not null,
  primary key (intervention_id, account_id)
);
create index if not exists intervention_echanges_lectures_compte_idx on public.intervention_echanges_lectures(account_id);
comment on table public.intervention_echanges_lectures is
  'Jusqu''où chaque compte a lu la discussion d''une intervention (P1-05). Écrit par marquer_echange_intervention_lu seulement.';

alter table public.intervention_echanges_lectures enable row level security;
revoke all on public.intervention_echanges_lectures from public, anon, authenticated;
grant select on public.intervention_echanges_lectures to authenticated;
drop policy if exists echanges_lectures_les_miennes on public.intervention_echanges_lectures;
create policy echanges_lectures_les_miennes on public.intervention_echanges_lectures
  for select to authenticated using (account_id = (select auth.uid()));

-- ── 2. Ce qui attend d'être lu ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.echanges_intervention_non_lus(p_org uuid default null)
returns table(intervention_id uuid, incident_id uuid, organization_id uuid, non_lus integer, dernier_le timestamptz)
language sql stable security definer set search_path = '' as $$
  with miennes as (
    select iv.id, iv.incident_id, iv.organization_id
      from public.incident_interventions iv
     where (select auth.uid()) is not null
       and ((p_org is not null and iv.organization_id = p_org)
            or (p_org is null and iv.artisan_id = public.mon_artisan_id()))
       and exists (select 1 from public.intervention_messages m
                    where m.intervention_id = iv.id and m.auteur_id <> (select auth.uid()))
       -- Seulement la discussion que les écrans affichent : celle de la DERNIÈRE mission de l'incident (la fiche du
       -- gestionnaire et « Mes demandes » du locataire n'en montrent pas d'autre). Un message resté non lu sur une
       -- mission remplacée ne peut plus être lu nulle part : le compter allumerait un signal impossible à éteindre.
       and iv.id = (select x.id from public.incident_interventions x
                     where x.incident_id = iv.incident_id and x.organization_id = iv.organization_id
                     order by x.confiee_le desc, x.id desc limit 1)
       -- Le droit de lire est celui de la discussion : il se vérifie ici, intervention par intervention.
       and public.role_echange_intervention(iv.id) is not null
  )
  select x.id, x.incident_id, x.organization_id, count(*)::integer, max(m.cree_le)
    from miennes x
    join public.intervention_messages m on m.intervention_id = x.id and m.auteur_id <> (select auth.uid())
    left join public.intervention_echanges_lectures l
      on l.intervention_id = x.id and l.account_id = (select auth.uid())
   where l.lue_le is null or m.cree_le > l.lue_le
   group by x.id, x.incident_id, x.organization_id;
$$;
revoke all on function public.echanges_intervention_non_lus(uuid) from public, anon;
grant execute on function public.echanges_intervention_non_lus(uuid) to authenticated;
comment on function public.echanges_intervention_non_lus(uuid) is
  'Discussions d''intervention portant des messages non lus par l''appelant (P1-05). Avec un espace : ses interventions dans cet espace ; sans : les missions de l''artisan.';

-- ── 3. Marquer lu ────────────────────────────────────────────────────────────────────────────────────────────────
-- L'appelant désigne le DERNIER MESSAGE qu'il a eu sous les yeux, par son identifiant. Jamais par une heure : une
-- heure repassée par un navigateur ou un service intermédiaire peut être arrondie à la milliseconde, et tomberait
-- alors juste AVANT le message — qui resterait « non lu » pour toujours. L'heure retenue est celle du message, lue ici.
create or replace function public.marquer_echange_intervention_lu(p_intervention uuid, p_message uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_org uuid;
  v_jusqua timestamptz;
  v_avant timestamptz;
begin
  if auth.uid() is null or p_intervention is null or p_message is null then return false; end if;
  v_role := public.role_echange_intervention(p_intervention);
  if v_role is null then return false; end if;
  -- Le message doit être de CETTE discussion.
  select m.cree_le into v_jusqua from public.intervention_messages m
   where m.id = p_message and m.intervention_id = p_intervention;
  if not found then return false; end if;

  select l.lue_le into v_avant from public.intervention_echanges_lectures l
   where l.intervention_id = p_intervention and l.account_id = auth.uid();
  -- Jamais en arrière : relire un écran ancien ne « dé-lit » rien.
  if v_avant is not null and v_avant >= v_jusqua then return false; end if;
  insert into public.intervention_echanges_lectures (intervention_id, account_id, lue_le)
  values (p_intervention, auth.uid(), v_jusqua)
  on conflict (intervention_id, account_id) do update set lue_le = excluded.lue_le
    where public.intervention_echanges_lectures.lue_le < excluded.lue_le;

  -- Un gestionnaire a lu : l'alerte « nouveau message » de cette intervention n'a plus lieu d'être — sauf si un
  -- message est arrivé depuis ce qu'il a eu sous les yeux. Une écriture refusée ici (abonnement suspendu) ne défait
  -- pas la lecture : le marqueur reste.
  if v_role = 'gerant' then
    select iv.organization_id into v_org from public.incident_interventions iv where iv.id = p_intervention;
    begin
      update public.alerts
         set statut = 'fermee', closed_at = now(), closed_by = auth.uid(), closed_action = 'Discussion lue'
       where organization_id = v_org and type = 'message_intervention' and statut = 'ouverte'
         and origine_type = 'intervention' and origine_id = p_intervention
         and coalesce((details->>'dernier_le')::timestamptz, '-infinity') <= v_jusqua;
    exception when others then
      raise warning 'P1-05 : alerte de discussion non fermée (%)', sqlerrm;
    end;
  end if;
  return true;
end;
$$;
revoke all on function public.marquer_echange_intervention_lu(uuid, uuid) from public, anon;
grant execute on function public.marquer_echange_intervention_lu(uuid, uuid) to authenticated;
comment on function public.marquer_echange_intervention_lu(uuid, uuid) is
  'Avance le marqueur de lecture de l''appelant jusqu''au message désigné de la discussion d''une intervention (P1-05) ; ferme l''alerte du gestionnaire quand il a tout lu.';

-- ── 4. L'alerte du gestionnaire ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.signaler_message_intervention()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  -- Le gestionnaire qui écrit n'a pas à être prévenu de son propre message.
  if new.auteur_role = 'gerant' then return null; end if;
  begin
    select iv.organization_id, iv.incident_id, i.numero, i.lot_id into m
      from public.incident_interventions iv
      join public.incidents i on i.id = iv.incident_id and i.organization_id = iv.organization_id
     where iv.id = new.intervention_id;
    if not found then return null; end if;
    -- Une seule alerte ouverte par intervention : un message de plus la met à jour.
    update public.alerts
       set details = details || jsonb_build_object(
             'messages', coalesce((details->>'messages')::integer, 1) + 1,
             'dernier_role', new.auteur_role, 'dernier_le', new.cree_le)
     where organization_id = m.organization_id and type = 'message_intervention' and statut = 'ouverte'
       and origine_type = 'intervention' and origine_id = new.intervention_id;
    if not found then
      insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
      values (m.organization_id, 'message_intervention', 'normale',
              'Nouveau message sur l''intervention — ' || m.numero,
              jsonb_build_object('incident_id', m.incident_id, 'lot_id', m.lot_id,
                                 'intervention_id', new.intervention_id, 'messages', 1,
                                 'dernier_role', new.auteur_role, 'dernier_le', new.cree_le,
                                 'libelle', case new.auteur_role
                                   when 'artisan' then 'L''artisan a écrit dans la discussion de l''intervention.'
                                   else 'Le locataire a écrit dans la discussion de l''intervention.' end),
              'intervention', new.intervention_id);
    end if;
  exception when others then
    -- Le message prime : une alerte qui ne se pose pas ne l'empêche jamais de partir.
    raise warning 'P1-05 : alerte de discussion non posée (%)', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.signaler_message_intervention() from public, anon, authenticated;

drop trigger if exists signaler_message_intervention on public.intervention_messages;
create trigger signaler_message_intervention
  after insert on public.intervention_messages
  for each row execute function public.signaler_message_intervention();

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
