-- Décision du dirigeant du 24/11/2026 (Q49), seconde reprise du lot D3 (points 1, 3 et 4 de la relecture) — la pièce
-- qui justifie une retenue ne vient pas du dossier de quelqu'un d'autre ; une pièce purgée se remplace.
--
-- LE DÉFAUT. Depuis 20261124200000, une pièce déjà rangée dans Documents peut justifier une retenue. Le contrôle ne
-- regardait que le lien « bail » et le contrat signé. Étaient donc acceptés pour une retenue du bail A : la pièce
-- d'identité du locataire B (lien « personne »), un état des lieux rangé au seul logement B, le règlement de
-- copropriété du bail B. Or, une fois le décompte finalisé, le locataire A lit la pièce de chacune de ses retenues.
--
-- CE QUE CONTRÔLE MAINTENANT `garde_justificatif_retenue`, dans cet ordre (1 et 2 sont inchangés) :
--   1. la pièce est un document vivant (non purgé) du MÊME espace que la retenue ;
--   2. elle est lisible par la personne qui fait le geste (agent limité à son portefeuille compris) ;
--   3. elle n'est pas rangée dans le dossier d'une personne qui n'est pas partie au bail de la retenue (ni locataire
--      principal, ni inscrite au bail : colocataire, garant). Toujours refusé ;
--   4. elle n'est pas rangée dans un autre dossier que celui de ce bail, c'est-à-dire :
--        · liée à un autre bail ;
--        · liée à un autre logement que celui du bail ;
--        · liée à un incident d'un autre logement (ou sans logement) ;
--        · contrat signé ou règlement de copropriété d'un autre bail ;
--      sauf si elle est AUSSI dans le dossier de ce bail (liée à ce bail, ou contrat signé / règlement de copropriété
--      de ce bail) : c'est la sortie pour une pièce réellement commune, et le message du refus le dit.
-- Une pièce rangée seulement dans l'espace (cas d'un devis ou d'une facture déposé depuis l'écran de la restitution,
-- même pour une retenue d'un autre bail) reste admise : elle n'est dans le dossier de personne.
--
-- CE QUI N'EST PAS CONTRÔLÉ (à savoir) : la nature de la pièce (devis, facture, photo…) ; les pièces liées à un
-- mandat ; le rapport d'un diagnostic (rattaché par la table des diagnostics, pas par un lien de dossier) ; les
-- retenues déjà enregistrées, qui ne sont pas relues.
--
-- PIÈCE PURGÉE (point 3). Quand la pièce d'une retenue a été purgée (règle de conservation), `justifier_retenue`
-- refusait de la remplacer (« Cette retenue a déjà un justificatif »). Elle accepte maintenant, dans ce seul cas. Son
-- texte est celui de 20260829120000, avec une condition de plus, marquée « seconde reprise D3 ». Aucune règle de
-- conservation n'est touchée.
--
-- CE QUI NE CHANGE PAS. Aucun droit n'est ouvert, aucune règle de lecture (RLS) n'est touchée, aucune fonction de
-- lecture n'est réécrite, aucune donnée n'est écrite ni supprimée.
--
-- À SAVOIR : rejouer SEULE la migration 20261124200000 remet l'ancien contrôle ; rejouer ensuite celle-ci.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124220000_justificatif_retenue_dossier_du_bail.retour.sql

create or replace function public.garde_justificatif_retenue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_doc record;
  v_bail uuid;
  v_lot uuid;
  v_locataire uuid;
  v_dans_ce_bail boolean;
begin
  -- Rien à contrôler si la retenue n'a pas de pièce, ou si sa pièce ne change pas.
  if new.justificatif_document is null
     or (tg_op = 'UPDATE' and new.justificatif_document is not distinct from old.justificatif_document) then
    return new;
  end if;

  -- 1. Un document vivant du même espace.
  select d.id, d.storage_path, d.deposited_by into v_doc
    from public.documents d
   where d.id = new.justificatif_document
     and d.organization_id = new.organization_id
     and d.purged_at is null;
  if v_doc.id is null then
    raise exception 'Justificatif introuvable';
  end if;

  -- 2. Lisible par la personne qui fait le geste. Cette fonction écrit sans les règles de lecture (elle est appelée
  --    depuis des fonctions qui s'exécutent avec les droits de leur propriétaire) : elle refait donc ici les deux
  --    conditions restrictives de la lecture de `documents` (chemin du fichier dans l'espace ; portefeuille de l'agent).
  if not ged_securite_interne.chemin_organisation(new.organization_id, v_doc.storage_path)
     or (public.est_agent_restreint(new.organization_id)
         and v_doc.deposited_by is distinct from (select auth.uid())
         and not public.document_dans_portefeuille(new.organization_id, v_doc.id)) then
    raise exception 'Justificatif introuvable';
  end if;

  -- Le bail de la retenue, son logement, son locataire principal.
  select b.id, b.lot_id, b.locataire_principal into v_bail, v_lot, v_locataire
    from public.restitutions r join public.baux b on b.id = r.bail_id
   where r.id = new.restitution_id;

  -- 3. Pas la pièce d'une personne étrangère à ce bail (pièce d'identité, attestation… d'un autre locataire).
  --    Toujours refusé : le locataire de ce bail lirait la pièce personnelle de quelqu'un d'autre.
  if exists (select 1 from public.document_liens l
              where l.document_id = v_doc.id and l.entite = 'personne'
                and l.entite_id is distinct from v_locataire
                and not exists (select 1 from public.bail_personnes bp
                                 where bp.bail_id = v_bail and bp.person_id = l.entite_id)) then
    raise exception 'Cette pièce est rangée dans le dossier d''une personne qui n''est pas partie à ce bail : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail';
  end if;

  -- 4. Pas le dossier d'un autre bail ou d'un autre logement. Une pièce rangée AUSSI dans ce bail reste admise.
  v_dans_ce_bail :=
       exists (select 1 from public.document_liens l
                where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id = v_bail)
    or exists (select 1 from public.baux b
                where b.id = v_bail and (b.document_signe = v_doc.id or b.reglement_copropriete = v_doc.id));
  if not v_dans_ce_bail and (
       exists (select 1 from public.document_liens l
                where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id <> v_bail)
    or exists (select 1 from public.document_liens l
                where l.document_id = v_doc.id and l.entite = 'lot' and l.entite_id is distinct from v_lot)
    or exists (select 1 from public.document_liens l
                 join public.incidents i on i.id = l.entite_id
                where l.document_id = v_doc.id and l.entite = 'incident' and i.lot_id is distinct from v_lot)
    or exists (select 1 from public.baux b
                where b.id <> v_bail and (b.document_signe = v_doc.id or b.reglement_copropriete = v_doc.id))) then
    raise exception 'Cette pièce est rangée dans le dossier d''un autre bail ou d''un autre logement : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail, ou rangez-la aussi dans le dossier de ce bail';
  end if;

  return new;
end;
$$;
comment on function public.garde_justificatif_retenue() is
  'Avant d''accepter une pièce sur une retenue : document vivant du même espace, lisible par l''appelant, pas rangé chez une personne étrangère au bail, ni dans le dossier d''un autre bail ou d''un autre logement sauf s''il est aussi dans ce bail (Q49, seconde reprise du lot D3).';
revoke all on function public.garde_justificatif_retenue() from public, anon, authenticated, service_role;

-- Justificatif rattaché a posteriori (possible même après finalisation : il s'agit de défendre la retenue, pas de la
-- modifier). Texte de 20260829120000 ; seule la ligne marquée change.
create or replace function public.justifier_retenue(p_retenue uuid, p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select r.*, d.type as doc_type into v
  from public.retenues r left join public.documents d on d.id = p_document and d.organization_id = r.organization_id
  where r.id = p_retenue;
  if v.id is null then raise exception 'Retenue introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.doc_type is null then raise exception 'Justificatif introuvable'; end if;
  -- Seconde reprise D3 : une pièce purgée (règle de conservation) ne justifie plus rien ; elle se remplace.
  if v.justificatif_document is not null
     and not exists (select 1 from public.documents d where d.id = v.justificatif_document and d.purged_at is not null) then
    raise exception 'Cette retenue a déjà un justificatif';
  end if;
  update public.retenues set justificatif_document = p_document, sans_justificatif = false where id = p_retenue;
  perform public.fermer_alertes_origine(v.organization_id, 'retenue', p_retenue,
    'Justificatif fourni pour la retenue « ' || v.libelle || ' »', array['retenue_sans_justificatif']);
end $$;
revoke execute on function public.justifier_retenue(uuid, uuid) from public, anon;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
