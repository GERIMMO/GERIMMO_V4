-- Sprint 3 (incrément 2) — Dossier locataire versionné + garant
-- Source : wiki/concepts/Dossier locataire (module 0b). Le dossier = les pièces
-- (documents) rattachées à une PERSONNE, versionnées : toutes conservées, seule
-- la courante affichée (RM-0b.4.1) ; pas de suppression d'une version (RM-0b.4.5,
-- déjà garanti par revoke delete). Le garant est une personne à part entière
-- (RM-0b.3.1) — couvert par le même mécanisme, pas de table dédiée.

alter table public.documents
  add column remplace_id uuid references public.documents (id);

alter table public.documents
  add constraint documents_remplace_pas_soi
  check (remplace_id is null or remplace_id <> id);

create index documents_remplace_idx on public.documents (remplace_id);

-- Pièces courantes d'un dossier : documents rattachés à la personne, vivants,
-- non remplacés par une version plus récente. SECURITY INVOKER = respecte la RLS
-- documents (donc « le mandant ne voit aucune pièce », RM-0b.7.4).
create function public.dossier_personne(p_person uuid)
returns table (document_id uuid, type public.document_type, titre text, depose_le timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select d.id, d.type, d.titre, d.created_at
  from public.documents d
  join public.document_liens dl
    on dl.document_id = d.id and dl.entite = 'personne' and dl.entite_id = p_person
  where d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.type, d.created_at;
$$;
