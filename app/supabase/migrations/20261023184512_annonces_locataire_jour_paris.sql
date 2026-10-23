-- Relecture adverse du 23/10/2026 (mineur « Annonces d'un bien : correctif à moitié ») : le locataire lit ses annonces au
-- jour de Paris, comme la fiche agence du bien.
--
-- Le lot du 23/10 (TST-5) a fait filtrer la fiche agence d'un bien sur `aujourdhuiParis()`. Le locataire, destinataire
-- de l'annonce, la lit par `mes_annonces_locataire` (page /locataire/[orgId]), qui comparait toujours `visible_jusquau`
-- au jour de la session, `current_date`, soit le jour UTC en production (`show timezone` : Etc/UTC). Une annonce
-- « visible jusqu'au 30/11 » quittait la fiche agence le 01/12 à 0 h à Paris, mais le locataire la voyait encore jusqu'à
-- 1 h ou 2 h : le défaut n'était corrigé que du côté qui ne la lit pas, et l'agence et le locataire ne voyaient plus la
-- même chose.
--
-- Correction : `current_date` devient `public.aujourdhui_paris()` (20261014500000), seule différence avec le texte de
-- 20260905120000 ; le périmètre (bail actif ou en préavis, locataire principal ou colocataire, annonces du bien ou de
-- toute l'agence) ne change pas.
--
-- Rejouable : `create or replace`, même signature, même retour, `search_path = ''`, SECURITY DEFINER ; droits inchangés
-- (authenticated et service_role, jamais public ni anon). Aucune donnée touchée.
-- Retour : supabase/retours-arriere/20261023184512_annonces_locataire_jour_paris.retour.sql (à jouer AVANT celui de
-- 20261014500000 : chaîne « Ordre complet » du LISEZ-MOI des retours).

create or replace function public.mes_annonces_locataire(p_org uuid)
returns table (id uuid, texte text, visible_jusquau date)
language sql stable security definer set search_path = '' as $$
  select a.id, a.texte, a.visible_jusquau
  from public.annonces a
  where a.organization_id = p_org
    and a.visible_jusquau >= public.aujourdhui_paris()
    and (a.bien_id is null or a.bien_id in (
      select l.bien_id from public.baux b
      join public.lots l on l.id = b.lot_id
      where b.organization_id = p_org and b.etat in ('actif', 'preavis')
        and exists (
          select 1 from public.persons p
          where p.organization_id = p_org and p.account_id = (select auth.uid())
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire')))))
    and public.ma_personne_locataire(p_org) is not null
  order by a.visible_jusquau;
$$;
revoke execute on function public.mes_annonces_locataire(uuid) from public, anon;

select public.fermer_fonctions_a_anon();
