-- Sprint 3 (incrément 5) — Espace locataire : accès du locataire à SON dossier
-- Source : module 0b. Le locataire (role 'locataire') accède uniquement à sa
-- propre fiche et à ses pièces, et dépose lui-même son attestation d'assurance
-- (RM-0b.5.1). Accès contrôlé par fonctions SECURITY DEFINER (pas de RLS large).

-- Le locataire lit sa propre fiche (pour l'accueil)
create policy persons_select_locataire on public.persons
  for select to authenticated
  using (account_id = (select auth.uid()));

-- Son dossier courant (pièces non remplacées) — définit ce qu'il voit
create function public.mon_dossier_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text, expire_le date, depose_le timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select d.id, d.type, d.titre, d.expire_le, d.created_at
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
  where p.organization_id = p_org and p.account_id = (select auth.uid())
    and d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.type, d.created_at;
$$;
revoke execute on function public.mon_dossier_locataire(uuid) from public, anon;

-- Dépôt de l'attestation par le locataire : insert contrôlé du document + liens,
-- après vérification que le compte a bien une fiche dans l'agence. Le fichier
-- lui-même est déposé au stockage par le client (policy ci-dessous).
create function public.deposer_mon_attestation(
  p_org uuid, p_storage_path text, p_mime text, p_taille bigint,
  p_empreinte text, p_titre text, p_expire date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_doc uuid;
begin
  select id into v_person from public.persons
  where organization_id = p_org and account_id = (select auth.uid())
  limit 1;
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le)
  values
    (p_org, 'attestation_assurance',
     coalesce(nullif(p_titre, ''), 'Attestation d''assurance'),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()), p_expire)
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  return v_doc;
end;
$$;
revoke execute on function public.deposer_mon_attestation(uuid, text, text, bigint, text, text, date)
  from public, anon;

-- Stockage : le locataire dépose dans le dossier de son agence
create policy ged_insert_locataire on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select m.organization_id::text from public.memberships m
      where m.account_id = (select auth.uid())
        and m.role = 'locataire' and m.status = 'active'
    )
  );
