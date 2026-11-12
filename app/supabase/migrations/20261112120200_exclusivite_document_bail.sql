-- Le relais de migrations exécute le fichier dans une transaction unique.
lock table public.baux, public.document_liens, public.bail_signature_circuits, public.demandes_signature in share row exclusive mode;

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
  bail_id uuid
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
returns uuid language plpgsql security invoker set search_path='' as $$
declare origine uuid;
begin
  if exists(select from public.documents d where d.id=p_doc
    and split_part(d.storage_path,'/',2)='baux-papier'
    and split_part(d.storage_path,'/',3)<>p_bail::text) then
    raise exception 'Ce document a été déposé pour un autre bail.';
  end if;
  -- ON CONFLICT attend également une réservation non encore validée. Un SELECT
  -- préalable ne suffirait pas à sérialiser les trois chemins d'écriture.
  insert into public.provenances_contrats_bail as p(document_id,bail_id) values(p_doc,p_bail)
  on conflict(document_id) do update set bail_id=coalesce(p.bail_id,excluded.bail_id)
    where p.bail_id is null or excluded.bail_id is null or p.bail_id=excluded.bail_id
    returning bail_id into origine;
  if not found then raise exception 'Ce document appartient déjà à un autre bail.' using errcode='23505'; end if;
  return origine;
end $$;
revoke all on function public.reserver_provenance_contrat(uuid,uuid) from public, anon, authenticated, service_role;

create function public.verifier_provenance_contrat() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.documents; origine uuid; doc uuid; personne uuid;
begin
  if tg_table_name='document_liens' then
    if new.entite in ('bail','lot','personne') and exists(select from public.documents where id=new.document_id and type='bail') then
      origine:=public.reserver_provenance_contrat(new.document_id,case when new.entite='bail' then new.entite_id end);
      if new.entite='lot' and exists(select from public.baux where id=origine and lot_id<>new.entite_id) then
        raise exception 'Ce contrat concerne un autre logement.';
      end if;
      if new.entite='personne' then personne:=new.entite_id; end if;
    end if;
  elsif tg_table_name='demandes_signature' then
    foreach doc in array array[new.document_id,new.document_retour_id] loop
      if doc is not null and exists(select from public.documents where id=doc and type='bail') then
        origine:=public.reserver_provenance_contrat(doc,null);
        if exists(select from public.baux b where b.id=origine
          and b.locataire_principal is distinct from new.person_id and not exists
          (select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=new.person_id)) then
          raise exception 'Ce destinataire ne figure pas sur le bail.';
        end if;
      end if;
    end loop;
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
    if exists(select from public.document_liens l where l.document_id=d.id and l.entite='lot' and l.entite_id<>new.lot_id)
       or exists (
         select from (
           select ds.person_id from public.demandes_signature ds where d.id in (ds.document_id,ds.document_retour_id)
           union select l.entite_id from public.document_liens l
             join public.persons p on p.id=l.entite_id
             join public.memberships m on m.account_id=p.account_id and m.organization_id=d.organization_id and m.role='locataire'
             where l.document_id=d.id and l.entite='personne'
         ) destinataires where person_id is distinct from new.locataire_principal
           and not exists(select from public.bail_personnes bp where bp.bail_id=new.id and bp.person_id=destinataires.person_id)
       ) then raise exception 'Le logement ou le destinataire du document ne correspond pas au bail.'; end if;
  end if;
  if personne is not null and exists(select from public.baux b
    join public.persons p on p.id=personne
    join public.memberships m on m.account_id=p.account_id and m.organization_id=b.organization_id and m.role='locataire'
    where b.id=origine and b.locataire_principal is distinct from personne and not exists
    (select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=personne)) then
    raise exception 'Ce locataire ne figure pas sur le bail.';
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
create trigger provenance_contrat_demande before insert or update of document_id,document_retour_id,person_id on public.demandes_signature
  for each row execute function public.verifier_provenance_contrat();
