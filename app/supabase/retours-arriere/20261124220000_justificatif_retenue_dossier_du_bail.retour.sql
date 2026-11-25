-- RETOUR ARRIÈRE de 20261124220000_justificatif_retenue_dossier_du_bail.sql (décision du 24/11/2026, Q49, seconde
-- reprise du lot D3 : la pièce d'une retenue ne vient pas du dossier de quelqu'un d'autre ; une pièce purgée se
-- remplace).
--
-- Rend à `garde_justificatif_retenue` son texte de 20261124200000 et à `justifier_retenue` son texte de
-- 20260829120000, recopiés tels quels. RÉINTRODUIT les défauts corrigés : la pièce d'identité d'un autre locataire,
-- une pièce rangée à un autre logement ou le règlement de copropriété d'un autre bail justifient de nouveau une
-- retenue (et le locataire les lit une fois le décompte finalisé) ; une pièce purgée ne se remplace plus.
-- Aucune donnée n'est modifiée ni supprimée ; droits inchangés.
--
-- À JOUER AVANT le retour de 20261124200000 (qui retire le déclencheur et sa fonction). Joué après lui, ce retour ne
-- recrée pas la fonction du déclencheur. Peut être joué avant ou après le retour du code. Rejouable.
do $retour$
begin
  if to_regprocedure('public.garde_justificatif_retenue()') is not null then
    create or replace function public.garde_justificatif_retenue()
    returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_doc record;
  v_bail uuid;
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

  -- 3. Pas le dossier d'un autre bail. Une pièce rangée à la fois dans ce bail et dans un autre reste admise.
  select r.bail_id into v_bail from public.restitutions r where r.id = new.restitution_id;
  if (exists (select 1 from public.document_liens l
               where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id <> v_bail)
      or exists (select 1 from public.baux b
                  where b.document_signe = v_doc.id and b.id <> v_bail))
     and not exists (select 1 from public.document_liens l
                      where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id = v_bail) then
    raise exception 'Cette pièce est rangée dans le dossier d''un autre bail : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail';
  end if;

  return new;
end;
$$;
    comment on function public.garde_justificatif_retenue() is
      'Avant d''accepter une pièce sur une retenue : document vivant du même espace, lisible par l''appelant, pas rangé dans le dossier d''un autre bail (Q49, reprise du lot D3).';
  end if;

  if to_regprocedure('public.justifier_retenue(uuid, uuid)') is not null then
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
  if v.justificatif_document is not null then raise exception 'Cette retenue a déjà un justificatif'; end if;
  update public.retenues set justificatif_document = p_document, sans_justificatif = false where id = p_retenue;
  perform public.fermer_alertes_origine(v.organization_id, 'retenue', p_retenue,
    'Justificatif fourni pour la retenue « ' || v.libelle || ' »', array['retenue_sans_justificatif']);
end $$;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261124220000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
