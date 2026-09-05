-- Fermer le portail locataire du référentiel (05/09) — trois briques :
--  A. PIÈCES RÉCLAMÉES (RM-0b.2.5) : le gérant demande une pièce (RIB, avis
--     d'imposition, justificatif de domicile…), le locataire la dépose depuis
--     son espace — dépôt générique sur le modèle de l'attestation, demande
--     soldée, agence alertée.
--  B. DÉCOMPTE DE RESTITUTION côté locataire (module 2.7) : suivi du délai
--     dès la remise des clés, décompte détaillé (retenues, décote, solde)
--     UNIQUEMENT une fois finalisé (RM-2.6.2), justificatifs consultables.
--  C. RELANCES VISIBLES (module 3.12) : les relances reçues, sans les notes
--     internes de l'agence (RM-3.12.2).

-- A. Pièces réclamées --------------------------------------------------
create table public.pieces_demandees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null,
  -- Seuls les types que le locataire peut consulter ensuite (mon_document_locataire)
  type public.document_type not null
    check (type in ('piece_identite', 'justificatif', 'attestation_assurance')),
  libelle text not null check (char_length(libelle) between 1 and 120),
  note text,
  demandee_le timestamptz not null default now(),
  demandee_par uuid references public.accounts (id),
  relancee_le timestamptz,
  document_id uuid references public.documents (id),
  satisfaite_le timestamptz,
  constraint pieces_demandees_person_meme_org_fk
    foreign key (person_id, organization_id) references public.persons (id, organization_id)
    on delete cascade
);
create index pieces_demandees_person_idx on public.pieces_demandees (organization_id, person_id);
alter table public.pieces_demandees enable row level security;
create policy pieces_demandees_gerants_select on public.pieces_demandees for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy pieces_demandees_gerants_insert on public.pieces_demandees for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy pieces_demandees_gerants_update on public.pieces_demandees for update
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy pieces_demandees_gerants_delete on public.pieces_demandees for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- Les demandes en attente du locataire connecté
create function public.mes_pieces_demandees(p_org uuid)
returns table (id uuid, type public.document_type, libelle text, note text,
               demandee_le timestamptz, relancee_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.type, d.libelle, d.note, d.demandee_le, d.relancee_le
  from public.pieces_demandees d
  where d.organization_id = p_org
    and d.person_id = public.ma_personne_locataire(p_org)
    and d.satisfaite_le is null
  order by d.demandee_le;
$$;
revoke execute on function public.mes_pieces_demandees(uuid) from public, anon;

-- Dépôt d'une pièce réclamée (miroir de deposer_mon_attestation, générique)
create function public.deposer_ma_piece(
  p_org uuid, p_demande uuid, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
  v_person_nom text;
  v_demande record;
  v_doc uuid;
begin
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;
  select trim(coalesce(prenom || ' ', '') || nom) into v_person_nom
  from public.persons where id = v_person;

  select * into v_demande from public.pieces_demandees d
  where d.id = p_demande and d.organization_id = p_org
    and d.person_id = v_person and d.satisfaite_le is null;
  if v_demande.id is null then
    raise exception 'Cette demande n''existe plus — elle a peut-être déjà été satisfaite';
  end if;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by)
  values
    (p_org, v_demande.type, v_demande.libelle, p_storage_path, p_mime,
     p_taille, p_empreinte, (select auth.uid()))
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  update public.pieces_demandees
  set document_id = v_doc, satisfaite_le = now()
  where id = p_demande;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'piece_deposee', 'normale',
          format('%s déposé — %s', v_demande.libelle, v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', 'Pièce réclamée reçue — à vérifier'));
  return v_doc;
end;
$$;
revoke execute on function public.deposer_ma_piece(uuid, uuid, text, text, bigint, text) from public, anon;

-- B. Restitution côté locataire ----------------------------------------
-- Le dernier bail de l'appelant, quel que soit son état (une restitution
-- arrive après la sortie, adhésion encore active)
create function public.mon_dernier_bail_locataire(p_org uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id from public.baux b
  where b.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc limit 1;
$$;
revoke execute on function public.mon_dernier_bail_locataire(uuid) from public, anon;

-- Le suivi : dès la remise des clés. Le détail chiffré (solde, impayés
-- imputés) n'apparaît qu'au décompte finalisé (RM-2.6.2).
create function public.ma_restitution_locataire(p_org uuid)
returns table (statut text, date_remise_cles date, delai_mois integer,
               depot numeric, impayes numeric, solde numeric,
               date_emission date, sans_edl_entree boolean)
language sql stable security definer set search_path = '' as $$
  select r.statut, r.date_remise_cles, r.delai_mois, r.depot,
         case when r.statut = 'finalise' then r.impayes end,
         case when r.statut = 'finalise' then r.solde end,
         r.date_emission, r.sans_edl_entree
  from public.restitutions r
  where r.organization_id = p_org
    and r.bail_id = public.mon_dernier_bail_locataire(p_org);
$$;
revoke execute on function public.ma_restitution_locataire(uuid) from public, anon;

-- Les retenues : chaque ligne avec coût, âge, décote et justificatif —
-- uniquement une fois le décompte finalisé (RM-2.6.2)
create function public.mes_retenues_restitution(p_org uuid)
returns table (libelle text, cout numeric, duree_vie_ans numeric,
               age_ans numeric, montant_retenu numeric, justificatif_document uuid)
language sql stable security definer set search_path = '' as $$
  select t.libelle, t.cout, t.duree_vie_ans, t.age_ans, t.montant_retenu,
         t.justificatif_document
  from public.retenues t
  join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
  where r.organization_id = p_org
    and r.bail_id = public.mon_dernier_bail_locataire(p_org)
  order by t.created_at;
$$;
revoke execute on function public.mes_retenues_restitution(uuid) from public, anon;

-- Les justificatifs de retenues deviennent consultables par le locataire
-- (module 2.7) : une branche de plus dans le contrôle d'accès aux fichiers.
create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and (
      (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org)
      -- Justificatif d'une retenue du décompte FINALISÉ de mon bail
      or exists (
        select 1 from public.retenues t
        join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
        where t.justificatif_document = d.id
          and r.organization_id = p_org
          and r.bail_id = public.mon_dernier_bail_locataire(p_org)));
$$;
revoke execute on function public.mon_document_locataire(uuid, uuid) from public, anon;

-- C. Relances reçues ---------------------------------------------------
-- Sans note interne ni commentaire d'agence (RM-3.12.2)
create function public.mes_relances_locataire(p_org uuid)
returns table (niveau text, date_envoi date, date_premiere_presentation date,
               numero_recommande text)
language sql stable security definer set search_path = '' as $$
  select r.niveau::text, r.date_envoi, r.date_premiere_presentation, r.numero_recommande
  from public.relances r
  join public.baux b on b.id = r.bail_id
  where b.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by r.date_envoi desc;
$$;
revoke execute on function public.mes_relances_locataire(uuid) from public, anon;
