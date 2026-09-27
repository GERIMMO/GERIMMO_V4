-- La quittance délivrée au locataire suit le modèle conforme — audit du 27/09
--
-- LE DÉFAUT. La page /quittance/[id] — celle que le locataire ouvre depuis
-- l'e-mail, « Mes paiements » et « Mes documents » — était une mise en page
-- à part, nourrie par `quittance_detail`, qui ne renvoie que des NOMS. Il y
-- manquait tout ce que la page wiki « Quittance conforme » exige :
-- l'identité et l'adresse de l'émetteur (« un courrier officiel sans
-- l'identité et l'adresse de son auteur n'a aucune valeur »), la période
-- « du … au … », le « Fait à », la signature, la date et le mode du
-- règlement. Chez un propriétaire direct, elle écrivait en plus « Moreau
-- Claire représenté par Parc de Claire Moreau » : un mandataire qui n'existe
-- pas.
--
-- Le modèle conforme existe déjà (src/lib/documents/modeles/quittance.ts :
-- art. 21, période, Fait à, signature). Il lit les tables directement — ce
-- que la RLS interdit, à raison, au locataire. Cette fonction lui donne
-- EXACTEMENT les données du modèle, sous les mêmes contrôles d'accès que
-- `quittance_detail` (gérant de l'organisation dans son portefeuille, OU
-- locataire principal / colocataire du bail), plus la tâche planifiée
-- d'envoi (service_role), qui doit vérifier la complétude avant d'envoyer.
--
-- Rien n'est calculé ici : les montants sont ceux du terme (figés à
-- l'échéance). Les termes et les versements du bail sont rendus tels quels :
-- le modèle rejoue l'imputation (du plus ancien terme au plus récent) pour
-- citer les seuls versements qui ont couvert CE terme, comme le PDF.
-- Idempotent : create or replace.

create or replace function public.quittance_document(p_quittance uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quittance_id', q.id,
    'appel_id', q.appel_id,
    'organization_id', q.organization_id,
    'est_quittance', q.est_quittance,
    'montant', q.montant,
    'date_emission', q.date_emission,
    'periode', a.periode,
    'loyer_hc', a.loyer_hc,
    'charges', a.charges,
    'montant_du', a.montant_du,
    'prorata', coalesce(a.prorata, false),
    'bail_id', b.id,
    'bail_date_debut', b.date_debut,
    'bail_date_fin', b.date_fin,
    'charges_mode', b.charges_mode,
    -- L'émetteur : l'organisation qui émet (agence, ou parc du propriétaire)
    'organisation', jsonb_build_object(
      'type', o.type,
      'nom', o.name,
      'siret', o.siret,
      'carte_pro', o.carte_pro,
      'adresse', o.address_line1,
      'code_postal', o.postal_code,
      'ville', o.city,
      'telephone', o.telephone,
      'email', o.email_contact
    ),
    -- Le bailleur : les détenteurs du lot à ce jour, comme le modèle
    'bailleurs', coalesce((
      select jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom) order by p.nom, p.prenom)
      from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = l.id and d.date_fin is null), '[]'::jsonb),
    'locataires', (
      select jsonb_agg(jsonb_build_object('nom', x.nom, 'prenom', x.prenom) order by x.rang, x.nom)
      from (
        select loc.nom, loc.prenom, 0 as rang
        union all
        select p.nom, p.prenom, 1
        from public.bail_personnes bp join public.persons p on p.id = bp.person_id
        where bp.bail_id = b.id and bp.role = 'colocataire' and p.id <> b.locataire_principal
      ) x),
    'logement', jsonb_build_object(
      'lot_nom', l.nom,
      'etage', l.etage,
      'adresse', b2.address_line1,
      'code_postal', b2.postal_code,
      'ville', b2.city
    ),
    -- Les termes et les versements du bail : de quoi retrouver le règlement
    -- de CE terme (imputation du plus ancien au plus récent).
    'appels', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'periode', x.periode, 'montant_du', x.montant_du)
                       order by x.periode)
      from public.appels_loyer x where x.bail_id = b.id), '[]'::jsonb),
    'encaissements', coalesce((
      select jsonb_agg(jsonb_build_object('date_paiement', e.date_paiement, 'mode', e.mode,
                                          'montant', e.montant, 'created_at', e.created_at)
                       order by e.date_paiement, e.created_at)
      from public.encaissements e where e.bail_id = b.id), '[]'::jsonb),
    -- Qui regarde : le gérant voit ce qu'il doit compléter, le locataire non
    'vue_gestionnaire', (
      q.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  )
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.lots l on l.id = b.lot_id
  join public.biens b2 on b2.id = l.bien_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.id = p_quittance
    and (
      coalesce((select auth.jwt())->>'role' = 'service_role', false)
      or (q.organization_id in (select public.org_ids_avec_roles(
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

comment on function public.quittance_document(uuid) is
  'Données du modèle conforme de quittance (art. 21, identité et adresse de l''émetteur, période, règlement) pour la page /quittance et l''envoi par e-mail. Mêmes contrôles d''accès que quittance_detail, plus la tâche d''envoi (service_role).';

revoke execute on function public.quittance_document(uuid) from public, anon;
grant execute on function public.quittance_document(uuid) to authenticated, service_role;
