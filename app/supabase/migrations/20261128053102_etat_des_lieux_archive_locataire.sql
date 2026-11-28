-- Le PDF de l’état des lieux signé reste une pièce du bail après la clôture.
-- La liste, la lecture du fichier et le journal d’accès utilisent déjà cette
-- fonction. Seuls les locataires parties au bail ont accès à son PDF signé.
create or replace function public.pieces_bail_locataire()
returns table (document_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.document_id, b.organization_id
  from public.baux b
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  cross join lateral (values (b.document_signe), (b.reglement_copropriete)) as x(document_id)
  where x.document_id is not null
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active')
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
  union
  select d.id, b.organization_id
  from public.baux b
  join public.etats_des_lieux e on e.bail_id = b.id and e.organization_id = b.organization_id
  join public.documents d on d.id = e.preuve_signature_document and d.organization_id = b.organization_id
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where b.etat in ('actif', 'preavis', 'termine')
    and e.etat = 'signe' and e.signature_mode = 'pdf_signe'
    and d.type = 'etat_des_lieux' and d.mime_type = 'application/pdf'
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'));
$$;

select public.fermer_fonctions_a_anon();
