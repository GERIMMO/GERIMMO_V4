-- ACTIVATION DE LA RÈGLE D'INACTIVITÉ AVEC LA V1 DES CONDITIONS (24/10/2026 ; plan de conformité du 23/10, lot 1E :
-- R14, R51 ; V1 des conditions générales, article 9 ; page confidentialité, « Comptes »).
--
-- La V1 annonce qu'un compte et ses données sont supprimés vingt-quatre mois après la plus tardive de deux dates (la
-- dernière connexion d'un utilisateur du compte, la fin du dernier abonnement payé), après deux avertissements par
-- courriel (deux mois, puis quinze jours avant). Le code de la fermeture (20261024130000) et la règle de catalogue
-- `compte:inactif` (20261024140000, inactive) sont en production depuis le 24/10 ; l'une et l'autre s'activent avec la
-- V1, dans le même déploiement que `VERSION_MIN_INACTIVITE = "2026-10-24"` (src/lib/comptes-fermeture.ts).
--
-- Ce que fait cette migration :
--  1. elle passe la règle `compte:inactif` à active, après avoir vérifié qu'elle a la forme de 20261024140000
--     (24 mois, suppression, déclencheur exact) ;
--  2. les deux traitements de l'inactivité lisent désormais cette règle (`retention_rules`, lue directement : elle reste
--     lisible même si la conservation de 20261024140000 était défaite hors de son ordre) : sans elle,
--     `comptes_inactifs_a_prevenir` ne rend aucun compte et `fermetures_comptes_programmer_inactifs` ne programme rien,
--     quelle que soit la version passée par l'application. Activer exige donc les deux gestes (la règle en base, la
--     version dans le code) ; le retour arrière de cette migration suffit à tout arrêter, même avec le code de la V1.
--     Le reste de leur texte est celui de 20261024130000, inchangé : seuls les comptes qui ont accepté la version
--     désignée ou une plus récente (`acceptations_cgu.version >= p_version_min`, tous documents confondus) sont visés ;
--     aucun abonnement en cours ni essai ; avertissement J-60 à une date annoncée d'au moins vingt-quatre mois après
--     l'activité et soixante jours après l'avertissement ; rappel J-15 qui n'avance jamais cette date ; programmation
--     seulement une fois les deux avertissements consignés et la date annoncée atteinte, sans connexion entre-temps.
--
-- Production au 24/10 (relevés en lecture seule du journal) : un compte, aucune acceptation des conditions : la règle ne
-- vise personne. La preuve sur une base tirée de la production est dans tests/activation-inactivite-v1-base.test.ts.
-- Durée de 24 mois et avertissements : à relire par le juriste (référence CNIL des comptes inactifs ; source non ouverte
-- le 23/10/2026).
--
-- Rejouable : préconditions sans effet, UPDATE idempotent, CREATE OR REPLACE ; droits redits comme en 20261024130000.
-- `search_path = ''`, `fermer_fonctions_a_anon()` en fin. Aucune donnée existante réécrite hors du catalogue.
-- Retour : supabase/retours-arriere/20261024150000_activation_inactivite_v1.retour.sql
set local lock_timeout = '10s';

-- ── 0. Préconditions ──────────────────────────────────────────────────────────────────────────────────────────────

do $preconditions$
begin
  if to_regprocedure('public.comptes_inactifs_a_prevenir(text,integer)') is null
     or to_regprocedure('public.fermetures_comptes_programmer_inactifs()') is null then
    raise exception 'Migration 20261024150000 refusée : 20261024130000 (fermeture des comptes) et 20261024140000 (conservation) doivent la précéder';
  end if;
  if not exists (select 1 from public.retention_rules r
                  where r.data_type = 'compte:inactif' and r.duree_mois = 24 and r.sort = 'suppression'
                    and r.declencheur = 'Dernière connexion d''un membre ou fin du dernier abonnement payé') then
    raise exception 'Migration 20261024150000 refusée : la règle compte:inactif n''a pas la forme de 20261024140000 (24 mois, suppression, déclencheur exact) ; rien n''est activé';
  end if;
end $preconditions$;

-- ── 1. La règle du catalogue ──────────────────────────────────────────────────────────────────────────────────────

update public.retention_rules set actif = true where data_type = 'compte:inactif' and actif is distinct from true;

-- ── 2. Les avertissements (J-60, puis J-15) : seulement si la règle est active ────────────────────────────────────

-- Texte de 20261024130000 ; ajout : la règle `compte:inactif` active (ACTIVATION_INACTIVITE_20261024).
create or replace function public.comptes_inactifs_a_prevenir(p_version_min text, p_limite integer default 200)
returns table (account_id uuid, email text, etape text, nature text, organisation text, titulaire boolean,
               derniere_activite_le timestamptz, suppression_le date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version_min is null then return; end if;
  if p_version_min !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  -- ACTIVATION_INACTIVITE_20261024 : la règle du catalogue décide aussi (V1 du 24/10/2026, migration 20261024150000).
  if not exists (select 1 from public.retention_rules regle where regle.data_type = 'compte:inactif' and regle.actif) then return; end if;
  return query
  with candidats as (
    select a.id, a.email, act.derniere_activite_le as activite, act.nature, act.organisation, act.titulaire,
           ((act.derniere_activite_le at time zone 'Europe/Paris')::date + interval '24 months')::date as base
      from public.accounts a
      cross join lateral public.activite_compte(a.id) act
     where a.efface_le is null
       and not exists (select 1 from public.memberships m where m.account_id = a.id and m.role = 'super_admin')
       and not exists (select 1 from public.fermetures_comptes f where f.account_id = a.id and f.statut = 'programmee')
       and exists (select 1 from public.acceptations_cgu c
                    where c.account_id = a.id and c.version ~ '^\d{4}-\d{2}-\d{2}$' and c.version >= p_version_min)
       and not act.abonnement_en_cours
       and act.derniere_activite_le is not null
  ), etat as (
    select c.*, j60.suppression_prevue_le as annonce,
           exists (select 1 from public.avertissements_inactivite j
                    where j.account_id = c.id and j.etape = 'j15' and j.derniere_activite_le = c.activite) as j15_envoye
      from candidats c
      left join public.avertissements_inactivite j60
        on j60.account_id = c.id and j60.etape = 'j60' and j60.derniere_activite_le = c.activite
  )
  select * from (
    select e.id, e.email, 'j60'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.base, v_jour + 60)
      from etat e where e.annonce is null and v_jour >= e.base - 60
    union all
    select e.id, e.email, 'j15'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.annonce, v_jour + 15)
      from etat e where e.annonce is not null and not e.j15_envoye and v_jour >= e.annonce - 15
  ) x
  order by 8, 1
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;
revoke all on function public.comptes_inactifs_a_prevenir(text, integer) from public, anon, authenticated;
grant execute on function public.comptes_inactifs_a_prevenir(text, integer) to service_role;

-- ── 3. La programmation des fermetures pour inactivité : seulement si la règle est active ─────────────────────────

-- Texte de 20261024130000 ; ajout : la règle `compte:inactif` active (ACTIVATION_INACTIVITE_20261024). Inactive, la
-- passe ne programme rien et le dit (« regle_inactive ») ; les consommateurs ne lisent que « programmees » et « echecs ».
create or replace function public.fermetures_comptes_programmer_inactifs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_programmees integer := 0;
  v_echecs integer := 0;
  v_act record;
  r record;
begin
  -- ACTIVATION_INACTIVITE_20261024 : la règle du catalogue décide aussi (V1 du 24/10/2026, migration 20261024150000).
  if not exists (select 1 from public.retention_rules regle where regle.data_type = 'compte:inactif' and regle.actif) then
    return jsonb_build_object('programmees', 0, 'echecs', 0, 'regle_inactive', true);
  end if;
  for r in
    select j60.account_id, j15.suppression_prevue_le, j60.derniere_activite_le
      from public.avertissements_inactivite j60
      join public.avertissements_inactivite j15
        on j15.account_id = j60.account_id and j15.etape = 'j15' and j15.derniere_activite_le = j60.derniere_activite_le
      join public.accounts a on a.id = j60.account_id and a.efface_le is null
     where j60.etape = 'j60' and j60.suppression_prevue_le <= v_jour and j15.suppression_prevue_le <= v_jour
       and not exists (select 1 from public.fermetures_comptes f
                        where f.account_id = j60.account_id
                          and (f.statut = 'programmee'
                               or (f.origine = 'inactivite' and f.derniere_activite_le = j60.derniere_activite_le)))
  loop
    select * into v_act from public.activite_compte(r.account_id);
    continue when v_act.derniere_activite_le is distinct from r.derniere_activite_le or v_act.abonnement_en_cours;
    begin
      perform public.programmer_fermeture_compte(r.account_id, 'inactivite', null, null, null, null, v_jour,
                                                 r.derniere_activite_le);
      v_programmees := v_programmees + 1;
    exception when others then
      v_echecs := v_echecs + 1;
    end;
  end loop;
  return jsonb_build_object('programmees', v_programmees, 'echecs', v_echecs);
end $$;
revoke all on function public.fermetures_comptes_programmer_inactifs() from public, anon, authenticated, service_role;

-- ── 4. Contrôle ───────────────────────────────────────────────────────────────────────────────────────────────────

do $controle$
begin
  if not exists (select 1 from public.retention_rules r where r.data_type = 'compte:inactif' and r.actif and r.duree_mois = 24) then
    raise exception 'Migration 20261024150000 : la règle compte:inactif n''est pas active à 24 mois';
  end if;
  if strpos(pg_get_functiondef('public.comptes_inactifs_a_prevenir(text,integer)'::regprocedure), 'ACTIVATION_INACTIVITE_20261024') = 0
     or strpos(pg_get_functiondef('public.fermetures_comptes_programmer_inactifs()'::regprocedure), 'ACTIVATION_INACTIVITE_20261024') = 0 then
    raise exception 'Migration 20261024150000 : un traitement de l''inactivité ne lit pas la règle du catalogue';
  end if;
end $controle$;

select public.fermer_fonctions_a_anon();
