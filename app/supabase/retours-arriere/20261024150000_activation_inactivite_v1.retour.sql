-- RETOUR ARRIÈRE de 20261024150000_activation_inactivite_v1.sql (activation de la règle d'inactivité avec la V1 des
-- conditions, 24/10/2026 ; plan de conformité du 23/10, lot 1E, R14 et R51).
--
-- Ce qui est défait :
--  · la règle `compte:inactif` redevient inactive (seulement si elle est encore active : rien d'autre n'est touché) ;
--  · `comptes_inactifs_a_prevenir` et `fermetures_comptes_programmer_inactifs` retrouvent le texte exact de
--    20261024130000 (sans la lecture de la règle, marque ACTIVATION_INACTIVITE_20261024) ; droits inchangés
--    (CREATE OR REPLACE les garde) ;
--  · la version d'historique 20261024150000 (les deux formes : production à 14 chiffres, CI avec le nom du fichier).
-- Ce qui est conservé : les avertissements déjà envoyés (`avertissements_inactivite`, preuve de ce qui est parti) et les
-- fermetures déjà exécutées (rien ne revient, sauvegarde).
--
-- Refuse sans rien défaire tant qu'une fermeture pour inactivité est programmée : l'annuler d'abord depuis
-- /admin/donnees (supervision permanente, second facteur), puis rejouer. Remettre d'abord le code d'avant la V1, ou du
-- moins `VERSION_MIN_INACTIVITE = null` (src/lib/comptes-fermeture.ts) : sinon la règle reste annoncée par la V1 publiée
-- sans que la base l'applique, ce qui ne supprime rien mais doit être une décision du dirigeant, consignée.
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Premier dans la chaîne « Ordre complet » du LISEZ-MOI
-- (retours du plan de conformité du 24/10, ordre inverse du manifeste : 150000, 140000, 130000, 120000, 110000, 100000,
-- 090000) : à jouer AVANT le retour de 20261024140000, qui retire la règle `compte:inactif`. La marche avant se rejoue
-- ensuite.
do $retour_atomique$
declare
  v_n bigint;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 0. Refus : une fermeture pour inactivité programmée s'exécuterait quand même la nuit venue.
  if to_regclass('public.fermetures_comptes') is not null then
    select count(*) into v_n from public.fermetures_comptes where origine = 'inactivite' and statut = 'programmee';
    if v_n > 0 then
      raise exception 'Retour 20261024150000 refusé : % fermeture(s) pour inactivité programmée(s) ; les annuler depuis /admin/donnees, puis rejouer', v_n
        using errcode = '55000';
    end if;
  end if;

  -- 1. La règle du catalogue, inactive comme en 20261024140000.
  if to_regclass('public.retention_rules') is not null then
    update public.retention_rules set actif = false where data_type = 'compte:inactif' and actif;
  end if;

  -- 2. Les deux traitements : texte exact de 20261024130000.
  if to_regprocedure('public.comptes_inactifs_a_prevenir(text,integer)') is not null then
create or replace function public.comptes_inactifs_a_prevenir(p_version_min text, p_limite integer default 200)
returns table (account_id uuid, email text, etape text, nature text, organisation text, titulaire boolean,
               derniere_activite_le timestamptz, suppression_le date)
language plpgsql
stable
security definer
set search_path = ''
as $fonction$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version_min is null then return; end if;
  if p_version_min !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
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
end $fonction$;
  end if;
  if to_regprocedure('public.fermetures_comptes_programmer_inactifs()') is not null then
create or replace function public.fermetures_comptes_programmer_inactifs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fonction$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_programmees integer := 0;
  v_echecs integer := 0;
  v_act record;
  r record;
begin
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
end $fonction$;
  end if;

  -- 3. Version d'historique, filet commun.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where left(version, 14) = '20261024150000';  -- les deux formes : production (14 chiffres) et CI (nom du fichier)
  end if;
  perform public.fermer_fonctions_a_anon();
end $retour_atomique$;
