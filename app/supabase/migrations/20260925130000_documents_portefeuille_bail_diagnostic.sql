-- Les pièces d'un bail (contrat signé, règlement de copropriété) et d'un
-- diagnostic sont rattachées par une COLONNE (baux.document_signe,
-- baux.reglement_copropriete, diagnostics.document_id), pas par un lien
-- document_liens : la pièce ne porte qu'un lien « organisation ». Résultat
-- (relecture des écrans du 25/09, D4) : l'agent titulaire du seul lot de
-- l'agence lisait « 1 document » là où l'administrateur en lisait 4 — le bail
-- signé, le DPE et l'ERP de SON lot lui étaient cachés par la RLS
-- (document_dans_portefeuille) et, à l'inverse, comptaient comme « pièces
-- d'organisation » visibles de tous dans documents_courants.
--
-- Une pièce référencée par un bail ou un diagnostic appartient au lot de ce
-- bail ou de ce diagnostic (ou aux lots du bien, pour un diagnostic de
-- l'immeuble) : dans le portefeuille si ce lot y est, hors portefeuille sinon.
-- Aucune donnée n'est modifiée ; seules les deux fonctions de lecture changent.

-- 1. Le prédicat de la RLS des agents restreints.
create or replace function public.document_dans_portefeuille(p_org uuid, p_doc uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_doc and (
      (dl.entite = 'lot' and not public.lot_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'bail' and not public.bail_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'personne' and not public.person_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'mandat' and not public.mandat_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'incident' and not public.incident_hors_portefeuille(p_org, dl.entite_id))
    )
  )
  -- Le contrat signé et le règlement de copropriété d'un bail du portefeuille.
  or exists (
    select 1 from public.baux b
    where b.organization_id = p_org
      and (b.document_signe = p_doc or b.reglement_copropriete = p_doc)
      and not public.bail_hors_portefeuille(p_org, b.id)
  )
  -- Le rapport d'un diagnostic posé sur un lot du portefeuille, ou sur un
  -- bien dont un lot au moins est du portefeuille.
  or exists (
    select 1 from public.diagnostics dg
    where dg.organization_id = p_org
      and dg.document_id = p_doc
      and (
        (dg.lot_id is not null and not public.lot_hors_portefeuille(p_org, dg.lot_id))
        or (dg.lot_id is null and dg.bien_id is not null and exists (
              select 1 from public.lots l
              where l.bien_id = dg.bien_id
                and not public.lot_hors_portefeuille(p_org, l.id)))
      )
  );
$$;

-- 2. Le périmètre « mes lots » de la GED (liste, agrégats, à renouveler).
create or replace function public.documents_courants(p_org uuid, p_lots uuid[] default null)
returns setof public.documents
language sql stable set search_path = '' as $$
  select d.*
  from public.documents d
  where d.organization_id = p_org
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
    and (
      p_lots is null
      or exists (
        select 1 from public.document_liens dl
        where dl.document_id = d.id
          and ((dl.entite = 'lot' and dl.entite_id = any(p_lots))
            or (dl.entite = 'bail' and dl.entite_id in (
                  select b.id from public.baux b where b.lot_id = any(p_lots)))
            or (dl.entite = 'incident' and dl.entite_id in (
                  select i.id from public.incidents i where i.lot_id = any(p_lots)))
            or (dl.entite = 'personne' and dl.entite_id in (
                  select b.locataire_principal from public.baux b
                  where b.lot_id = any(p_lots) and b.locataire_principal is not null
                  union
                  select bp.person_id from public.bail_personnes bp
                  join public.baux b on b.id = bp.bail_id
                  where b.lot_id = any(p_lots)))))
      -- Rattachée par colonne à un bail d'un de mes lots…
      or exists (
        select 1 from public.baux b
        where b.lot_id = any(p_lots)
          and (b.document_signe = d.id or b.reglement_copropriete = d.id))
      -- … ou à un diagnostic d'un de mes lots (ou du bien qui les porte).
      or exists (
        select 1 from public.diagnostics dg
        where dg.document_id = d.id
          and (dg.lot_id = any(p_lots)
               or (dg.lot_id is null and dg.bien_id in (
                     select l.bien_id from public.lots l where l.id = any(p_lots)))))
      -- Une pièce d'organisation : rattachée à rien de tout cela.
      or (
        not exists (
          select 1 from public.document_liens dl2
          where dl2.document_id = d.id
            and dl2.entite in ('lot', 'bail', 'personne', 'incident'))
        and not exists (
          select 1 from public.baux b2
          where b2.document_signe = d.id or b2.reglement_copropriete = d.id)
        and not exists (
          select 1 from public.diagnostics dg2 where dg2.document_id = d.id)
      )
    );
$$;
revoke execute on function public.documents_courants(uuid, uuid[]) from public, anon;
