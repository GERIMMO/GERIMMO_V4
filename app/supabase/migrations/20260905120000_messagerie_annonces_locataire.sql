-- Espace locataire v10 — vague backend (05/09) :
--  1. MESSAGERIE locataire ↔ gestionnaire : un fil par personne locataire.
--     Table sans policies (RLS activée, accès uniquement par RPC definer) ;
--     lire marque lu ; un message locataire lève une alerte côté agence
--     (dédoublonnée tant qu'une alerte du fil reste ouverte).
--  2. ANNONCES D'IMMEUBLE : mot de l'agence aux locataires d'un bien (ou de
--     toute l'agence), avec date de fin d'affichage. Gérants en direct (RLS),
--     locataires via RPC.

-- 1. Messagerie -------------------------------------------------------
create type public.message_auteur as enum ('locataire', 'gerant');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null,
  auteur public.message_auteur not null,
  auteur_account_id uuid references public.accounts (id),
  texte text not null check (char_length(texte) between 1 and 4000),
  lu_le timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_person_meme_org_fk
    foreign key (person_id, organization_id) references public.persons (id, organization_id)
    on delete cascade
);
create index messages_fil_idx on public.messages (organization_id, person_id, created_at);
alter table public.messages enable row level security;

-- La personne locataire de l'appelant dans cette organisation (ou null)
create function public.ma_personne_locataire(p_org uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.persons p
  where p.organization_id = p_org and p.account_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
  limit 1;
$$;
revoke execute on function public.ma_personne_locataire(uuid) from public, anon;

create function public.envoyer_message_locataire(p_org uuid, p_texte text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
  v_message uuid;
  v_nom text;
begin
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then raise exception 'Accès refusé'; end if;
  if length(trim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Écrivez votre message avant d''envoyer';
  end if;

  insert into public.messages (organization_id, person_id, auteur, auteur_account_id, texte)
  values (p_org, v_person, 'locataire', (select auth.uid()), trim(p_texte))
  returning id into v_message;

  -- Une alerte signale le fil côté agence — pas une par message : tant
  -- qu'une alerte du fil est ouverte, on ne double pas.
  if not exists (
    select 1 from public.alerts a
    where a.organization_id = p_org and a.type = 'message_locataire'
      and a.statut = 'ouverte' and (a.details ->> 'person_id')::uuid = v_person
  ) then
    select trim(coalesce(p.prenom || ' ', '') || p.nom) into v_nom
    from public.persons p where p.id = v_person;
    insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
    values (p_org, 'message_locataire', 'normale',
            'Nouveau message de ' || coalesce(v_nom, 'votre locataire'),
            jsonb_build_object('person_id', v_person), 'message', v_message);
  end if;

  return v_message;
end;
$$;
revoke execute on function public.envoyer_message_locataire(uuid, text) from public, anon;

-- Lire mon fil (locataire) : renvoie tout et marque lus les messages du gérant
create function public.mes_messages_locataire(p_org uuid)
returns table (id uuid, auteur public.message_auteur, texte text, cree_le timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then raise exception 'Accès refusé'; end if;
  update public.messages m set lu_le = now()
  where m.organization_id = p_org and m.person_id = v_person
    and m.auteur = 'gerant' and m.lu_le is null;
  return query
    select m.id, m.auteur, m.texte, m.created_at
    from public.messages m
    where m.organization_id = p_org and m.person_id = v_person
    order by m.created_at;
end;
$$;
revoke execute on function public.mes_messages_locataire(uuid) from public, anon;

-- Badge du menu locataire : combien de réponses du gérant non lues
create function public.messages_non_lus_locataire(p_org uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.messages m
  where m.organization_id = p_org
    and m.person_id = public.ma_personne_locataire(p_org)
    and m.auteur = 'gerant' and m.lu_le is null;
$$;
revoke execute on function public.messages_non_lus_locataire(uuid) from public, anon;

-- Côté agence : lire le fil d'une personne (marque lus les messages du
-- locataire), et répondre.
create function public.messages_personne(p_org uuid, p_person uuid)
returns table (id uuid, auteur public.message_auteur, texte text, cree_le timestamptz, lu_le timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.messages m set lu_le = now()
  where m.organization_id = p_org and m.person_id = p_person
    and m.auteur = 'locataire' and m.lu_le is null;
  return query
    select m.id, m.auteur, m.texte, m.created_at, m.lu_le
    from public.messages m
    where m.organization_id = p_org and m.person_id = p_person
    order by m.created_at;
end;
$$;
revoke execute on function public.messages_personne(uuid, uuid) from public, anon;

create function public.repondre_message_personne(p_org uuid, p_person uuid, p_texte text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_message uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if length(trim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Écrivez votre réponse avant d''envoyer';
  end if;
  if not exists (select 1 from public.persons p
                 where p.id = p_person and p.organization_id = p_org) then
    raise exception 'Personne introuvable';
  end if;
  insert into public.messages (organization_id, person_id, auteur, auteur_account_id, texte)
  values (p_org, p_person, 'gerant', (select auth.uid()), trim(p_texte))
  returning id into v_message;
  return v_message;
end;
$$;
revoke execute on function public.repondre_message_personne(uuid, uuid, text) from public, anon;

-- 2. Annonces d'immeuble ----------------------------------------------
create table public.annonces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bien_id uuid,
  texte text not null check (char_length(texte) between 1 and 500),
  visible_jusquau date not null,
  created_by uuid references public.accounts (id),
  created_at timestamptz not null default now(),
  constraint annonces_bien_meme_org_fk
    foreign key (bien_id, organization_id) references public.biens (id, organization_id)
    on delete cascade
);
create index annonces_org_idx on public.annonces (organization_id, visible_jusquau);
alter table public.annonces enable row level security;

create policy annonces_gerants_select on public.annonces for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy annonces_gerants_insert on public.annonces for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy annonces_gerants_delete on public.annonces for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- Les annonces qui concernent MON logement (bien de mon bail, ou toute l'agence)
create function public.mes_annonces_locataire(p_org uuid)
returns table (id uuid, texte text, visible_jusquau date)
language sql stable security definer set search_path = '' as $$
  select a.id, a.texte, a.visible_jusquau
  from public.annonces a
  where a.organization_id = p_org
    and a.visible_jusquau >= current_date
    and (a.bien_id is null or a.bien_id in (
      select l.bien_id from public.baux b
      join public.lots l on l.id = b.lot_id
      where b.organization_id = p_org and b.etat in ('actif', 'preavis')
        and exists (
          select 1 from public.persons p
          where p.organization_id = p_org and p.account_id = (select auth.uid())
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire')))))
    and public.ma_personne_locataire(p_org) is not null
  order by a.visible_jusquau;
$$;
revoke execute on function public.mes_annonces_locataire(uuid) from public, anon;
