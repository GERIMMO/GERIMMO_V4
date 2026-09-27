-- L'attestation de bon paiement nomme un émetteur identifiable — audit du 27/09
--
-- LE DÉFAUT. L'attestation « fait pour servir et valoir » était émise au seul
-- nom de l'organisation (« Parc de Claire Moreau, gestionnaire du logement »
-- chez un propriétaire direct), sans adresse ni signature. [[Quittance
-- conforme]] : « un courrier officiel sans l'identité et l'adresse de son
-- auteur n'a aucune valeur ».
--
-- LA CORRECTION. Le locataire lit, pour SON bail, l'identité de l'émetteur :
-- type d'organisation, nom, adresse, e-mail, SIRET, et les bailleurs (les
-- détenteurs du lot). Chez un propriétaire direct, c'est le bailleur qui
-- atteste ; chez une agence, l'agence, pour le compte du bailleur.
-- Mêmes contrôles que l'échéancier du locataire (mon_echeancier_locataire).
-- Idempotent : create or replace.

create or replace function public.attestation_emetteur_locataire(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', o.type,
    'nom', o.name,
    'adresse', o.address_line1,
    'code_postal', o.postal_code,
    'ville', o.city,
    'email', o.email_contact,
    'siret', o.siret,
    'bailleurs', coalesce((
      select jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom) order by p.nom, p.prenom)
      from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = b.lot_id and d.date_fin is null), '[]'::jsonb)
  )
  from public.baux b
  join public.organizations o on o.id = b.organization_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis', 'termine')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by case b.etat when 'actif' then 0 when 'preavis' then 1 else 2 end, b.date_debut desc
  limit 1;
$$;

comment on function public.attestation_emetteur_locataire(uuid) is
  'Identité de l''émetteur de l''attestation de bon paiement du locataire connecté : organisation (type, nom, adresse, e-mail, SIRET) et bailleurs de son lot.';

revoke execute on function public.attestation_emetteur_locataire(uuid) from public, anon;
grant execute on function public.attestation_emetteur_locataire(uuid) to authenticated;
