-- Le relais de migrations exécute le fichier dans une transaction unique.
lock table public.baux, public.document_liens, public.bail_signature_circuits in share row exclusive mode;

do $$
begin
  if exists (select document_signe from public.baux where document_signe is not null
             group by document_signe having count(*) > 1) then
    raise exception 'Migration interrompue : un document signé figure sur plusieurs baux.';
  end if;
end $$;

create unique index baux_document_signe_exclusif on public.baux(document_signe)
  where document_signe is not null;

-- La provenance survit au retour en brouillon et à la suppression d'un lien GED.
-- Elle disparaît seulement avec la fiche document. Aucun accès depuis les API.
create table public.provenances_contrats_bail (
  document_id uuid primary key references public.documents(id) on delete cascade,
  bail_id uuid not null
);
alter table public.provenances_contrats_bail enable row level security;
revoke all on public.provenances_contrats_bail from public, anon, authenticated, service_role;

-- UNION élimine les preuves concordantes. Deux destinations différentes pour une
-- même pièce font échouer l'installation entière, sans toucher aux contrats.
insert into public.provenances_contrats_bail(document_id,bail_id)
  select document_signe,id from public.baux where document_signe is not null
  union select l.document_id,l.entite_id from public.document_liens l
    join public.documents d on d.id=l.document_id where l.entite='bail' and d.type='bail'
  union select document_id,bail_id from public.bail_signature_circuits where modele='bail' and bail_id is not null
  union select document_signe,bail_id from public.bail_signature_circuits
    where modele='bail' and bail_id is not null and document_signe is not null;

create function public.reserver_provenance_contrat(p_doc uuid,p_bail uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if exists(select from public.documents d where d.id=p_doc
    and split_part(d.storage_path,'/',2)='baux-papier'
    and split_part(d.storage_path,'/',3)<>p_bail::text) then
    raise exception 'Ce document a été déposé pour un autre bail.';
  end if;
  -- ON CONFLICT attend également une réservation non encore validée. Un SELECT
  -- préalable ne suffirait pas à sérialiser les trois chemins d'écriture.
  insert into public.provenances_contrats_bail as p(document_id,bail_id) values(p_doc,p_bail)
  on conflict(document_id) do update set bail_id=excluded.bail_id where p.bail_id=excluded.bail_id;
  if not found then raise exception 'Ce document appartient déjà à un autre bail.' using errcode='23505'; end if;
end $$;
revoke all on function public.reserver_provenance_contrat(uuid,uuid) from public, anon, authenticated, service_role;

create function public.verifier_provenance_contrat() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.documents;
begin
  if tg_table_name='document_liens' then
    if new.entite='bail' and exists(select from public.documents where id=new.document_id and type='bail') then
      perform public.reserver_provenance_contrat(new.document_id,new.entite_id);
    end if;
  elsif tg_table_name='bail_signature_circuits' then
    if new.modele='bail' and new.bail_id is not null then
      perform public.reserver_provenance_contrat(new.document_id,new.bail_id);
      if new.document_signe is not null then
        perform public.reserver_provenance_contrat(new.document_signe,new.bail_id);
      end if;
    end if;
  elsif new.document_signe is not null then
    select * into d from public.documents where id=new.document_signe and organization_id=new.organization_id;
    if not found or d.type is distinct from 'bail' or d.mime_type is distinct from 'application/pdf' or d.purged_at is not null then
      raise exception 'PDF du bail inaccessible';
    end if;
    if exists(select from public.bail_signature_circuits c where c.document_id=d.id
              or (c.document_signe=d.id and (c.modele<>'bail' or c.bail_id is distinct from new.id
                  or c.essai or c.environnement<>'production' or c.etat<>'termine'))) then
      raise exception 'Ce document ne constitue pas le contrat signé de ce bail.';
    end if;
    perform public.reserver_provenance_contrat(d.id,new.id);
  end if;
  return new;
end $$;
revoke all on function public.verifier_provenance_contrat() from public, anon, authenticated, service_role;

create trigger provenance_contrat_bail before insert or update of document_signe on public.baux
  for each row execute function public.verifier_provenance_contrat();
create trigger provenance_contrat_lien before insert or update of document_id,entite,entite_id on public.document_liens
  for each row execute function public.verifier_provenance_contrat();
create trigger provenance_contrat_signature before insert or update of modele,bail_id,document_id,document_signe on public.bail_signature_circuits
  for each row execute function public.verifier_provenance_contrat();
