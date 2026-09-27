-- Le parcours de démarrage mène au premier loyer encaissé — audit du 27/09
--
-- LES DÉFAUTS.
--   1. Le parcours s'arrêtait au bail (cinq étapes) et disparaissait dès qu'un
--      bail était actif, en concluant « vous n'aurez plus rien à lancer ». Or
--      l'encaissement se DÉCLARE à la main (la comptabilité est
--      déclarative) : le premier appel, l'encaissement et la quittance
--      n'étaient guidés nulle part. Sixième étape : « Premier loyer encaissé »,
--      faite quand une quittance (paiement intégral) existe.
--   2. L'étape « Votre identité » se validait sans e-mail de contact, alors
--      que « Mon profil » le marque obligatoire et que les documents
--      l'impriment en en-tête. Elle suit désormais les champs obligatoires du
--      profil : nom, adresse, code postal, ville, e-mail ; pour une agence,
--      SIRET, carte professionnelle et garantie financière en plus.
--   3. « Un locataire » comptait les adhésions locataire de TOUT statut : une
--      adhésion désactivée validait l'étape. Seules les adhésions actives
--      comptent.
--   4. Un lot archivé (ou le lot d'un bien retiré) pouvait passer pour « prêt
--      à louer » ; un bien retiré comptait comme « premier bien ».
-- Idempotent : create or replace, signature inchangée.

create or replace function public.parcours_demarrage(p_org uuid)
returns table(etape text, faite boolean, detail text, lot_id uuid, bien_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_type public.organization_type;
  v_profil boolean;
  v_biens integer;
  v_lot_pret uuid;
  v_bien_pret uuid;
  v_blocages text[];
  v_locataires integer;
  v_bail integer;
  v_quittances integer;
  v_recus integer;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  -- L'identité qui signera les documents : les champs obligatoires de « Mon
  -- profil », ni plus ni moins (27/09).
  select o.type,
         (length(btrim(coalesce(o.name, ''))) > 1
          and length(btrim(coalesce(o.address_line1, ''))) > 0
          and length(btrim(coalesce(o.postal_code, ''))) > 0
          and length(btrim(coalesce(o.city, ''))) > 0
          and length(btrim(coalesce(o.email_contact, ''))) > 0
          and (o.type = 'proprietaire_direct'
               or (length(btrim(coalesce(o.siret, ''))) > 0
                   and length(btrim(coalesce(o.carte_pro, ''))) > 0
                   and length(btrim(coalesce(o.garantie_financiere, ''))) > 0)))
    into v_type, v_profil
  from public.organizations o where o.id = p_org;

  select count(*)::integer into v_biens from public.biens b
   where b.organization_id = p_org and b.archived_at is null;

  -- Le premier lot qui n'a plus aucun blocage, s'il y en a un ; sinon les
  -- blocages du premier lot, pour dire CE QUI manque et pas seulement que
  -- quelque chose manque. Un lot archivé n'est pas à louer.
  select l.id, l.bien_id into v_lot_pret, v_bien_pret
  from public.lots l
  join public.biens b on b.id = l.bien_id and b.archived_at is null
  where l.organization_id = p_org
    and l.etat <> 'archive'
    and coalesce(array_length(public.lot_blocages_location(l.id), 1), 0) = 0
  order by l.created_at limit 1;
  if v_lot_pret is null then
    select public.lot_blocages_location(l.id) into v_blocages
    from public.lots l
    join public.biens b on b.id = l.bien_id and b.archived_at is null
    where l.organization_id = p_org and l.etat <> 'archive'
    order by l.created_at limit 1;
  end if;

  select count(*)::integer into v_locataires
  from public.persons p
  where p.organization_id = p_org and p.account_id is not null
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active');

  select count(*)::integer into v_bail
  from public.baux b where b.organization_id = p_org and b.etat in ('actif', 'preavis');

  select count(*) filter (where q.est_quittance)::integer,
         count(*) filter (where not q.est_quittance)::integer
    into v_quittances, v_recus
  from public.quittances q where q.organization_id = p_org;

  return query
  select 'identite', v_profil,
         case when v_profil then null
              when v_type = 'proprietaire_direct'
                then 'Nom, adresse et e-mail figurent en tête de vos quittances et de vos baux.'
              else 'Nom, adresse, e-mail, SIRET, carte professionnelle et garantie financière figurent en tête de vos quittances et de vos baux.' end,
         null::uuid, null::uuid
  union all
  select 'bien', v_biens > 0,
         case when v_biens > 0 then format('%s bien%s', v_biens, case when v_biens > 1 then 's' else '' end)
              else 'Un bien, et son premier lot dans la foulée.' end,
         null::uuid, null::uuid
  union all
  select 'lot_pret', v_lot_pret is not null,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
              when v_biens = 0 then null
              when v_blocages is null then 'Aucun lot pour l''instant.'
              else array_to_string(v_blocages, ' · ') end,
         v_lot_pret, v_bien_pret
  union all
  select 'locataire', v_locataires > 0,
         case when v_locataires > 0
              then format('%s locataire%s avec un accès', v_locataires, case when v_locataires > 1 then 's' else '' end)
              else 'Créez sa fiche, puis invitez-le : il suivra son bail et ses quittances depuis son espace.' end,
         null::uuid, null::uuid
  union all
  select 'bail', v_bail > 0,
         case when v_bail > 0 then format('%s bail%s en cours', v_bail, case when v_bail > 1 then 'x' else '' end)
              else 'Le bail signé déposé, le loyer du mois est calculé seul le 1er de chaque mois.' end,
         v_lot_pret, v_bien_pret
  union all
  -- La sixième étape (27/09) : le loyer arrive, vous le déclarez, la
  -- quittance s'établit d'elle-même.
  select 'loyer', v_quittances > 0,
         case when v_quittances > 0 then 'Loyer encaissé, quittance émise.'
              when v_recus > 0 then 'Un paiement partiel est enregistré : la quittance suivra le solde.'
              when v_bail = 0 then null
              else 'Le loyer arrive sur votre compte : déclarez l''encaissement, la quittance s''établit d''elle-même.' end,
         null::uuid, null::uuid;
end;
$function$;
