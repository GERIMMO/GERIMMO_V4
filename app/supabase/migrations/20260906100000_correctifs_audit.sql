-- Correctifs de l'audit du 06/09 (voir wiki/syntheses/Audit espaces locataire
-- et proprietaire.md) — vague SQL.
--
-- 1. Le congé en ligne devient une INTENTION de congé (RM-A3 : la mise à
--    disposition en ligne n'a aucune valeur probante ; le congé se donne par
--    LRAR, la date de première présentation est saisie par le gérant).
--    L'ancien mon_conge_locataire fabriquait cette date, basculait le bail
--    (sans le lot) et permettait à un colocataire de résilier tout le bail.
-- 2. quittance_detail s'ouvre aux colocataires (ils voyaient le bouton, ils
--    recevaient une page introuvable).
-- 3. chemins_pieces_locataire reçoit les branches que mon_document_locataire
--    avait déjà : justificatifs de retenue (décompte finalisé) et de
--    régularisation de charges — le lien affiché téléchargeait un 502.
-- 4. Répondre à un message ferme l'alerte « message_locataire » (sinon elle
--    restait ouverte à vie et, dédoublonnée, étouffait les messages suivants).
-- 5. alerte_origine apprend conge_intention (bail) et piece_deposee (document).
-- 6. Sécurité : deposer_mon_attestation re-vérifie l'adhésion locataire ;
--    révocation des grants anon restants sur les fonctions security definer.
-- 7. Ménage : demandes_pieces (table héritée, vide, jamais référencée).

-- 1a. Intention de congé -------------------------------------------------
create table public.intentions_conge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bail_id uuid not null references public.baux(id),
  person_id uuid not null references public.persons(id),
  motif text,
  created_at timestamptz not null default now(),
  traitee_le timestamptz,
  conge_id uuid references public.conges(id)
);
create index intentions_conge_bail_idx on public.intentions_conge (bail_id);
create index intentions_conge_org_idx on public.intentions_conge (organization_id);
alter table public.intentions_conge enable row level security;
create policy intentions_conge_select_gerants on public.intentions_conge
  for select using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

drop function if exists public.mon_conge_locataire(uuid, text);

create function public.mon_conge_locataire(p_org uuid, p_motif text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_bail record;
  v_person uuid;
  v_intention uuid;
begin
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;
  select b.* into v_bail
  from public.baux b
  where b.organization_id = p_org and b.etat = 'actif'
    and (b.locataire_principal = v_person
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = v_person
                      and bp.role = 'colocataire'))
  order by b.created_at desc limit 1;
  if v_bail.id is null then
    raise exception 'Aucun bail actif à votre nom — contactez votre gestionnaire';
  end if;
  if exists (select 1 from public.intentions_conge i
             where i.bail_id = v_bail.id and i.person_id = v_person
               and i.traitee_le is null) then
    raise exception 'Votre demande est déjà transmise — votre gestionnaire la confirmera à réception de votre lettre recommandée';
  end if;

  insert into public.intentions_conge (organization_id, bail_id, person_id, motif)
  values (p_org, v_bail.id, v_person,
          nullif(trim(coalesce(p_motif, '')), ''))
  returning id into v_intention;

  -- Une alerte par bail tant qu'une intention reste ouverte
  if not exists (select 1 from public.alerts a
                 where a.organization_id = p_org and a.statut = 'ouverte'
                   and a.type = 'conge_intention'
                   and (a.details ->> 'bail_id')::uuid = v_bail.id) then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (p_org, 'conge_intention', 'normale',
            'Intention de congé du locataire — lettre recommandée à venir',
            jsonb_build_object('bail_id', v_bail.id, 'lot_id', v_bail.lot_id,
                               'intention_id', v_intention, 'person_id', v_person,
                               'motif', nullif(trim(coalesce(p_motif, '')), '')));
  end if;
  return v_intention;
end;
$$;
revoke execute on function public.mon_conge_locataire(uuid, text) from public, anon;

-- L'intention en cours (ou récemment traitée) de l'appelant, pour sa carte
create function public.mon_intention_conge(p_org uuid)
returns table (id uuid, created_at timestamptz, motif text, traitee_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.created_at, i.motif, i.traitee_le
  from public.intentions_conge i
  where i.organization_id = p_org
    and i.person_id = public.ma_personne_locataire(p_org)
  order by i.created_at desc
  limit 1;
$$;
revoke execute on function public.mon_intention_conge(uuid) from public, anon;

-- 1b. alerte_origine : conge_intention → bail, piece_deposee → document ---
create or replace function public.alerte_origine(p_type text, p_details jsonb,
  out origine_type text, out origine_id uuid)
returns record
language plpgsql immutable set search_path = '' as $$
declare v_cle text;
begin
  origine_type := case p_type
    when 'edl_entree' then 'bail' when 'edl_sortie' then 'bail'
    when 'conge_intention' then 'bail'
    when 'diagnostic_expiration' then 'diagnostic'
    when 'assurance_expiration' then 'document' when 'attestation_a_verifier' then 'document'
    when 'piece_deposee' then 'document'
    when 'incident_a_qualifier' then 'incident' when 'incident_conteste' then 'incident'
    when 'versement_proprietaire' then 'rapport' when 'ecart_versement' then 'rapport'
    when 'decompte' then 'restitution' when 'decompte_lrar' then 'restitution'
    when 'restitution_echeance' then 'restitution'
    when 'retenue_sans_justificatif' then case when p_details ? 'retenue_id' then 'retenue' else 'restitution' end
    else null end;
  v_cle := case origine_type
    when 'bail' then 'bail_id' when 'diagnostic' then 'diagnostic_id'
    when 'document' then 'document_id' when 'incident' then 'incident_id'
    when 'rapport' then 'rapport_id' when 'restitution' then 'restitution_id'
    when 'retenue' then 'retenue_id' else null end;
  if v_cle is null or not (p_details ? v_cle) then origine_type := null; origine_id := null; return; end if;
  begin origine_id := (p_details ->> v_cle)::uuid;
  exception when others then origine_type := null; origine_id := null; end;
end $$;

-- 1c. enregistrer_conge solde l'intention et ferme son alerte -------------
create or replace function public.enregistrer_conge(
  p_bail uuid, p_par public.conge_par, p_date_presentation date,
  p_preavis_mois smallint, p_motif text default null, p_justificatif uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.type, b.etat, coalesce(bi.zone_tendue, false)
    into v_org, v_lot, v_type, v_etat, v_zone
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_type = 'meuble' then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_type = 'meuble' then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  -- Le bail fait foi : le lot suit, sinon le parc annonce « loué » pour un
  -- logement dont le locataire part.
  update public.lots set etat = 'preavis' where id = v_lot and etat = 'loue';

  -- L'intention transmise depuis l'espace locataire est soldée par ce congé
  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end $function$;
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid) from public, anon;

-- Rattrapage : les congés « portail » déjà enregistrés (par = locataire,
-- présentation = jour du clic) restent valides — mais leurs lots suivent enfin.
update public.lots l set etat = 'preavis'
 where l.etat = 'loue'
   and exists (select 1 from public.baux b where b.lot_id = l.id and b.etat = 'preavis');
update public.alerts a
   set echeance = (a.details ->> 'date_effet')::date
 where a.type = 'edl_sortie' and a.echeance is null and a.details ? 'date_effet';

-- 2. quittance_detail : le colocataire aussi ------------------------------
create or replace function public.quittance_detail(p_quittance uuid)
returns table (emetteur text, proprietaire text, locataire text, adresse text,
               lot_nom text, periode date, loyer_hc numeric, charges numeric,
               montant numeric, est_quittance boolean, date_emission date)
language sql stable security definer set search_path to '' as $$
  select
    o.name,
    (select string_agg(p.nom || coalesce(' ' || p.prenom, ''), ', ')
       from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = l.id and d.date_fin is null),
    (loc.nom || coalesce(' ' || loc.prenom, '')),
    (b2.address_line1 || coalesce(', ' || b2.address_line2, '') || ', ' || b2.postal_code || ' ' || b2.city),
    l.nom, a.periode, a.loyer_hc, a.charges, q.montant, q.est_quittance, q.date_emission
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.lots l on l.id = b.lot_id
  join public.biens b2 on b2.id = l.bien_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.id = p_quittance
    and (
      q.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      or exists (
        select 1 from public.persons p
        where p.organization_id = q.organization_id
          and p.account_id = (select auth.uid())
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire')))
    );
$$;
revoke execute on function public.quittance_detail(uuid) from public, anon;

-- 3. chemins_pieces_locataire : retenues et régularisations ---------------
-- Les mêmes portes que mon_document_locataire : justificatif d'une retenue
-- d'un décompte FINALISÉ (RM-2.7.2) et justificatif de régularisation de
-- charges (RM-3.9.5) — sur un bail dont l'appelant est locataire.
create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.pieces_bail_locataire() pb
  join public.documents d on d.id = pb.document_id
  where d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = p.organization_id
    and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status = 'active')
  union
  select d.storage_path
  from public.retenues r
  join public.restitutions re on re.id = r.restitution_id and re.statut = 'finalise'
  join public.baux b on b.id = re.bail_id
  join public.documents d on d.id = r.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active')
  union
  select d.storage_path
  from public.regularisations_charges rc
  join public.baux b on b.id = rc.bail_id
  join public.documents d on d.id = rc.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active');
$$;

-- 4. Répondre ferme l'alerte message_locataire ----------------------------
create or replace function public.repondre_message_personne(p_org uuid, p_person uuid, p_texte text)
returns uuid
language plpgsql security definer set search_path to '' as $$
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
  -- La réponse solde l'alerte — sinon, dédoublonnée sur « alerte ouverte »,
  -- elle étouffait la notification de tous les messages suivants.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Réponse envoyée au locataire'
   where organization_id = p_org and statut = 'ouverte'
     and type = 'message_locataire'
     and (details ->> 'person_id')::uuid = p_person;
  return v_message;
end;
$$;
revoke execute on function public.repondre_message_personne(uuid, uuid, text) from public, anon;

-- 6a. deposer_mon_attestation : l'adhésion locataire redevient exigée -----
create or replace function public.deposer_mon_attestation(
  p_org uuid, p_storage_path text, p_mime text, p_taille bigint,
  p_empreinte text, p_titre text, p_expire date)
returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  v_person uuid;
  v_person_nom text;
  v_courante uuid;
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
  select trim(coalesce(prenom, '') || ' ' || nom) into v_person_nom
  from public.persons where id = v_person;

  select d.id into v_courante
  from public.documents d
  join public.document_liens dl
    on dl.document_id = d.id and dl.entite = 'personne' and dl.entite_id = v_person
  where d.type = 'attestation_assurance' and d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.created_at desc
  limit 1;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le, remplace_id)
  values
    (p_org, 'attestation_assurance',
     coalesce(nullif(p_titre, ''), 'Attestation d''assurance'),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()),
     p_expire, v_courante)
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'attestation_a_verifier', 'normale',
          format('Attestation d''assurance déposée — %s', v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', format('Expire le %s — à vérifier puis valider',
                                               to_char(p_expire, 'DD/MM/YYYY'))));
  return v_doc;
end;
$$;
revoke execute on function public.deposer_mon_attestation(uuid, text, text, bigint, text, text, date) from public, anon;

-- 6b. Grants anon restants sur des fonctions security definer -------------
revoke execute on function public.bien_type_coherent_avec_lots() from public, anon;
revoke execute on function public.charges_recuperables_exercice(uuid, integer) from public, anon;
revoke execute on function public.contre_passer_encaissement() from public, anon;
revoke execute on function public.ecrire_encaissement() from public, anon;
revoke execute on function public.ecriture_mois_ouvert() from public, anon;
revoke execute on function public.edl_annexe_verifier_non_signe() from public, anon;
revoke execute on function public.edl_lignes_fige() from public, anon;
revoke execute on function public.generer_alertes_assurance() from public, anon;
revoke execute on function public.mandat_verifier_contenu_transition() from public, anon;
revoke execute on function public.mon_bail_document_locataire(uuid) from public, anon;
revoke execute on function public.postes_appel_non_fige() from public, anon;
revoke execute on function public.provisions_charges_annee(uuid, integer) from public, anon;
revoke execute on function public.verifier_lien_meme_agence() from public, anon;

-- 7. Table héritée, vide, jamais référencée par le code -------------------
drop table if exists public.demandes_pieces;
