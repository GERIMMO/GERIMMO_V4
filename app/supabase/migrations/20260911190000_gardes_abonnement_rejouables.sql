-- La garde d'abonnement ne doit plus se rater à la table suivante.
--
-- CE QUI S'EST PASSÉ, LE JOUR MÊME. La migration du 11/09 pose le refus
-- d'écriture sur toute table portant `organization_id`, par un bloc anonyme qui
-- ÉNUMÈRE LES TABLES AU MOMENT OÙ IL S'EXÉCUTE. Le module artisan, arrivé
-- quelques heures plus tard, en a créé neuf de plus : `artisan_agences`,
-- `incident_consultations`, `incident_devis`, `incident_sollicitations`,
-- `incident_interventions`, `intervention_creneaux`, `intervention_photos`,
-- `intervention_comptes_rendus`, `artisan_evaluations`. Aucune n'était gardée.
-- Une agence suspendue pouvait donc continuer à consulter des artisans, faire
-- chiffrer, faire intervenir — tout le module le plus coûteux du produit,
-- gratuitement.
--
-- Un bloc anonyme ne se rejoue pas : il faut y penser. Ce qu'on ne peut pas
-- appeler, on l'oublie. La pose devient donc une FONCTION, que toute migration
-- créant une table d'organisation termine par appeler — et qu'un test vérifie
-- (`tests/abonnement-lecture-seule.test.ts` : aucune table à `organization_id`
-- sans sa garde). Le test est la vraie protection : la fonction, on peut encore
-- oublier de l'appeler ; le test, lui, échoue.
--
-- ET LE MESSAGE CESSE DE PARLER D'ARGENT À DES TIERS. Le refus disait
-- « Abonnement suspendu […] Réactivez l'abonnement depuis Mon abonnement » à
-- QUICONQUE écrit — y compris un locataire qui envoie un message, et désormais
-- un artisan qui dépose un devis. Ni l'un ni l'autre n'a d'abonnement à
-- réactiver, et l'état de paiement de l'agence ne les regarde pas. Le message
-- est donc celui du gérant seulement ; les autres reçoivent un refus neutre.

-- ── 1. Le refus, selon qui écrit ───────────────────────────────────────────
create or replace function public.refuser_ecriture_si_fermee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Les tâches planifiées (rétention légale, purge) ne sont pas des gestes du
  -- client : elles doivent aboutir même sur une organisation suspendue. Elles
  -- se signalent par un réglage LOCAL à leur transaction, que seules elles
  -- posent — PostgREST n'expose aucun moyen d'en poser un.
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  -- Sans organisation, rien à vérifier : la clé étrangère s'en chargera.
  if v_org is null then
    return coalesce(new, old);
  end if;

  if not public.org_ecriture_ouverte(v_org) then
    if v_org in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) then
      raise exception
        'Abonnement suspendu : vos données restent consultables et exportables, mais aucune nouvelle saisie n''est possible. Réactivez l''abonnement depuis « Mon abonnement ».'
        using errcode = 'check_violation';
    else
      -- Locataire, artisan, propriétaire mandant : la situation commerciale de
      -- l'agence ne les concerne pas, et ils n'ont rien à y faire.
      raise exception
        'Cette agence n''enregistre plus de nouvelles saisies pour le moment. Vos documents restent consultables ; pour toute démarche, contactez-la directement.'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
-- Le droit EXECUTE sur une fonction déclencheur n'autorise pas l'appel direct,
-- mais il autorise à la POSER sur une table à soi — et anon comme authenticated
-- ont TEMPORARY sur la base (brèche fermée par l'audit du 10/09).
revoke execute on function public.refuser_ecriture_si_fermee() from public, anon, authenticated;

-- ── 2. La pose, rejouable ──────────────────────────────────────────────────
create or replace function public.poser_gardes_abonnement()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  -- Les journaux : jamais gardés. Lire une pièce écrit dans `acces_pieces_log`,
  -- toute action écrit dans `audit_log` : les bloquer bloquerait la LECTURE
  -- elle-même, et ferait perdre la trace au moment précis où elle compte.
  v_jamais text[] := array['acces_pieces_log', 'audit_log'];
  -- Gardées en création et suppression seulement : leur UPDATE est un effet de
  -- LECTURE (marquage « lu »), pas un geste de gestion. Sans cette exception,
  -- un locataire ne pourrait plus ouvrir son courrier parce que son agence ne
  -- paie plus.
  v_sans_update text[] := array['messages'];
  v_ops text;
  v_n integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'organization_id'
                    and a.attnum > 0 and not a.attisdropped)
    order by c.relname
  loop
    if t.relname = any(v_jamais) then continue; end if;
    v_ops := case when t.relname = any(v_sans_update)
                  then 'insert or delete' else 'insert or update or delete' end;
    execute format('drop trigger if exists %I on public.%I',
                   'abonnement_' || t.relname, t.relname);
    execute format(
      'create trigger %I before %s on public.%I for each row execute function public.refuser_ecriture_si_fermee()',
      'abonnement_' || t.relname, v_ops, t.relname);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function public.poser_gardes_abonnement() is
  'Repose le refus d''écriture sur toutes les tables d''organisation. À APPELER EN FIN DE TOUTE MIGRATION qui crée une table portant organization_id : le bloc du 11/09 ne couvrait que les tables existant ce jour-là.';
revoke execute on function public.poser_gardes_abonnement() from public, anon, authenticated;

-- Rattrapage immédiat : les neuf tables du module artisan.
select public.poser_gardes_abonnement();
