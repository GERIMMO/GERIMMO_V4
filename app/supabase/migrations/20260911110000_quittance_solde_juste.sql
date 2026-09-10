-- Le solde d'un reçu partiel se calcule sur le montant DÛ — 2026-09-11
--
-- LE DÉFAUT. La quittance existe sous deux formes, et elles ne calculaient pas
-- le même solde restant dû :
--   • le PDF (src/lib/documents/modeles/quittance.ts) : montantDu − encaissé ;
--   • la page web (src/app/quittance/[id]) : loyer_hc + charges − encaissé.
-- Les deux coïncident sur un mois plein, et DIVERGENT dès que le terme n'est
-- pas la simple somme du loyer et des charges — c'est-à-dire :
--   • un mois AU PRORATA (entrée ou sortie en cours de mois) : le terme est
--     réduit, mais la page web continuait de soustraire un loyer PLEIN ;
--   • un terme portant une régularisation de charges.
-- Dans ces cas la page annonçait au locataire un solde PLUS ÉLEVÉ que ce qu'il
-- doit réellement, sur un document qui écrit noir sur blanc « un solde de X
-- reste dû ». Un reçu qui surestime la dette est un reçu faux (RM-3.4.2 : le
-- reçu constate le versement partiel et laisse le solde exact).
--
-- LA CAUSE. quittance_detail ne renvoyait tout simplement pas montant_du : la
-- page ne POUVAIT pas calculer juste, elle reconstituait le terme de son côté.
-- On lui donne la donnée plutôt que de lui demander de la deviner. On ajoute
-- aussi `prorata`, pour que le document puisse DIRE pourquoi le terme n'est
-- pas un loyer plein — sans quoi le locataire lit un montant qu'il ne
-- s'explique pas.
--
-- Le corps et les contrôles d'accès sont repris à l'identique (gérant de
-- l'organisation dans son portefeuille, OU locataire principal / colocataire
-- du bail). Seules deux colonnes s'ajoutent.

drop function if exists public.quittance_detail(uuid);

create function public.quittance_detail(p_quittance uuid)
returns table (
  emetteur text, proprietaire text, locataire text, adresse text, lot_nom text,
  periode date, loyer_hc numeric, charges numeric, montant_du numeric,
  prorata boolean, montant numeric, est_quittance boolean, date_emission date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    (select string_agg(p.nom || coalesce(' ' || p.prenom, ''), ', ')
       from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = l.id and d.date_fin is null),
    (loc.nom || coalesce(' ' || loc.prenom, '')),
    (b2.address_line1 || coalesce(', ' || b2.address_line2, '') || ', ' || b2.postal_code || ' ' || b2.city),
    l.nom, a.periode, a.loyer_hc, a.charges,
    a.montant_du, coalesce(a.prorata, false),
    q.montant, q.est_quittance, q.date_emission
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.lots l on l.id = b.lot_id
  join public.biens b2 on b2.id = l.bien_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.id = p_quittance
    and (
      (q.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
       and not public.bail_hors_portefeuille(q.organization_id, q.bail_id))
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

comment on function public.quittance_detail(uuid) is
  'Détail d''une quittance ou d''un reçu, pour la page web et l''email. Renvoie le montant DÛ du terme (et s''il est au prorata) : le solde restant dû se calcule sur lui, jamais sur loyer + charges — les deux diffèrent dès qu''un mois est proratisé ou porte une régularisation.';

revoke execute on function public.quittance_detail(uuid) from public, anon;
grant execute on function public.quittance_detail(uuid) to authenticated;
