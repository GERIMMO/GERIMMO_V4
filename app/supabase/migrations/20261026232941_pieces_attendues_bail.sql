-- Une assurance est identifiée par un choix explicite, jamais par son titre.
-- La pièce du propriétaire suit le lot ; celle du locataire suit son bail.
alter table public.baux add constraint baux_id_lot_org_pieces_unique unique (id, lot_id, organization_id);

create table public.pieces_attendues_bail (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lot_id uuid not null,
  bail_id uuid,
  nature text not null check (nature in ('assurance_proprietaire', 'assurance_locataire')),
  document_id uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  constraint pieces_attendues_bail_portee_check check (
    (nature = 'assurance_proprietaire' and bail_id is null)
    or (nature = 'assurance_locataire' and bail_id is not null)
  ),
  constraint pieces_attendues_bail_lot_meme_org_fk
    foreign key (lot_id, organization_id) references public.lots(id, organization_id) on delete cascade,
  constraint pieces_attendues_bail_contrat_meme_lot_fk
    foreign key (bail_id, lot_id, organization_id) references public.baux(id, lot_id, organization_id) on delete cascade,
  constraint pieces_attendues_bail_document_meme_org_fk
    foreign key (document_id, organization_id) references public.documents(id, organization_id),
  constraint pieces_attendues_bail_cible_unique unique nulls not distinct (organization_id, lot_id, nature, bail_id)
);
create index pieces_attendues_bail_lot_idx on public.pieces_attendues_bail(lot_id);
create index pieces_attendues_bail_bail_idx on public.pieces_attendues_bail(bail_id, lot_id, organization_id);
create index pieces_attendues_bail_document_idx on public.pieces_attendues_bail(document_id, organization_id);
create index pieces_attendues_bail_auteur_idx on public.pieces_attendues_bail(updated_by);

-- Garde aussi les appels directs à l'API. Une purge ultérieure reste possible :
-- la lecture affichera la pièce comme indisponible, jamais comme une couverture valide.
create function public.controler_piece_attendue_bail()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id
      and d.organization_id = new.organization_id and d.purged_at is null) then
    raise exception 'Le document est inaccessible ou son fichier a été purgé.' using errcode = '23514';
  end if;
  if exists (select 1 from public.documents d where d.remplace_id = new.document_id
      and d.organization_id = new.organization_id) then
    raise exception 'Cette attestation a été remplacée. Choisissez sa nouvelle version.' using errcode = '23514';
  end if;
  if new.bail_id is not null then
    perform 1 from public.baux b where b.id = new.bail_id and b.organization_id = new.organization_id
      and b.lot_id = new.lot_id and b.etat = 'brouillon' for share;
    if not found then
      raise exception 'Le bail doit être un brouillon du logement concerné.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.controler_piece_attendue_bail() from public, anon;
grant execute on function public.controler_piece_attendue_bail() to authenticated;
create trigger pieces_attendues_bail_controle before insert or update
  on public.pieces_attendues_bail for each row execute function public.controler_piece_attendue_bail();

alter table public.pieces_attendues_bail enable row level security;
revoke all on public.pieces_attendues_bail from public, anon, authenticated;
grant select, insert, update on public.pieces_attendues_bail to authenticated;

create policy pieces_attendues_bail_lecture on public.pieces_attendues_bail
  for select to authenticated using (
    (exists (select 1 from public.memberships m
      where m.organization_id = pieces_attendues_bail.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
      or (select public.is_super_admin()))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );

-- L'enregistrement garde le brouillon verrouillé pendant le rattachement et
-- le classement. Une ancienne fenêtre ne peut écraser une réponse plus récente.
create function public.affecter_piece_attendue_bail(
  p_org uuid, p_bail uuid, p_nature text, p_document uuid, p_document_precedent uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_lot uuid;
  v_bail uuid;
  v_document uuid;
begin
  if auth.uid() is null then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  if p_nature not in ('assurance_proprietaire', 'assurance_locataire') or p_nature is null then
    raise exception 'Nature de pièce inconnue.' using errcode = '23514';
  end if;
  select b.lot_id into v_lot from public.baux b where b.id = p_bail and b.organization_id = p_org
    and b.etat = 'brouillon' for share;
  if not found or public.lot_hors_portefeuille(p_org, v_lot) then
    raise exception 'Le bail doit être un brouillon accessible.' using errcode = '42501';
  end if;
  v_bail := case when p_nature = 'assurance_locataire' then p_bail else null end;
  if p_document_precedent is not null then
    perform 1 from public.pieces_attendues_bail p where p.organization_id = p_org and p.lot_id = v_lot
      and p.nature = p_nature and p.bail_id is not distinct from v_bail
      and p.document_id = p_document_precedent for update;
    if not found then
      raise exception 'Cette assurance a changé depuis l’ouverture du formulaire. Rechargez le dossier.' using errcode = '40001';
    end if;
  end if;
  -- INSERT simple : ON CONFLICT impose aussi la policy SELECT avant le
  -- premier lien, alors que le fichier de l'agent devient visible par ce lien.
  begin
    insert into public.document_liens(organization_id,document_id,entite,entite_id)
      values(p_org,p_document,case when p_nature = 'assurance_proprietaire' then 'lot'::public.entite_liee else 'bail'::public.entite_liee end,
        case when p_nature = 'assurance_proprietaire' then v_lot else p_bail end);
  exception when unique_violation then
    if not exists (select 1 from public.document_liens dl where dl.organization_id = p_org
      and dl.document_id = p_document
      and dl.entite = case when p_nature = 'assurance_proprietaire' then 'lot'::public.entite_liee else 'bail'::public.entite_liee end
      and dl.entite_id = case when p_nature = 'assurance_proprietaire' then v_lot else p_bail end) then
      raise;
    end if;
  end;
  insert into public.pieces_attendues_bail(organization_id,lot_id,bail_id,nature,document_id)
    values(p_org,v_lot,v_bail,p_nature,p_document)
    on conflict(organization_id,lot_id,nature,bail_id) do update set document_id = excluded.document_id
      where pieces_attendues_bail.document_id = p_document_precedent
    returning document_id into v_document;
  if v_document is null then
    raise exception 'Cette assurance a changé depuis l’ouverture du formulaire. Rechargez le dossier.' using errcode = '40001';
  end if;
  return v_document;
end;
$$;
revoke all on function public.affecter_piece_attendue_bail(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.affecter_piece_attendue_bail(uuid,uuid,text,uuid,uuid) to authenticated;
create policy pieces_attendues_bail_ajout on public.pieces_attendues_bail
  for insert to authenticated with check (
    exists (select 1 from public.memberships m
      where m.organization_id = pieces_attendues_bail.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );
create policy pieces_attendues_bail_modification on public.pieces_attendues_bail
  for update to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = pieces_attendues_bail.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  ) with check (
    exists (select 1 from public.memberships m
      where m.organization_id = pieces_attendues_bail.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );
