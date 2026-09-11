-- Le statut d'abonnement cesse d'être une étiquette.
--
-- Constat du 11/09 : `organizations.status` vaut essai / active / suspendue /
-- archivee, et RIEN dans le produit n'en tient compte. `statutOrganisation()`
-- ne fait que choisir une couleur de pastille. Une agence qui ne paie plus
-- continue de tout faire ; un essai expiré n'expire pas. On ne peut pas vendre
-- un abonnement dont le non-paiement n'a aucune conséquence.
--
-- CE QUE « SUSPENDU » VEUT DIRE ICI : lecture seule. Le client garde l'accès
-- complet à ses données et à leurs exports — c'est l'engagement de
-- réversibilité, et il ne se négocie pas — mais il ne crée plus rien.
--
-- OÙ LA RÈGLE EST TENUE, ET POURQUOI PAS AILLEURS.
-- Pas dans l'application : un jeton suffirait à passer outre. Pas dans la RLS
-- non plus : le produit écrit presque tout par des fonctions SECURITY DEFINER
-- (151 à ce jour), qui s'exécutent avec les droits du propriétaire et
-- CONTOURNENT la RLS. Le seul point de passage que rien ne contourne est le
-- DÉCLENCHEUR : il s'exécute quelle que soit l'origine de l'écriture.
--
-- DEUX PIÈGES ÉVITÉS, tous deux constatés avant d'écrire cette migration.
--  1. Certaines LECTURES écrivent. `mes_messages_locataire` marque les messages
--     comme lus : un déclencheur posé sans distinction sur `messages` aurait
--     empêché un locataire de LIRE son courrier parce que son agence ne paie
--     plus. La table n'est donc gardée qu'en INSERT et DELETE.
--  2. Les journaux doivent toujours écrire. Lire une pièce inscrit une ligne
--     dans `acces_pieces_log` ; toute action inscrit dans `audit_log`. Les
--     bloquer, c'est bloquer la lecture elle-même — et perdre la trace au
--     moment précis où elle compte. Ils ne portent aucun déclencheur.

-- ── 1. L'écriture est-elle ouverte pour cette organisation ? ────────────────
create or replace function public.org_ecriture_ouverte(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case o.status
           -- L'essai court jusqu'à sa date incluse ; sans date, il ne ferme pas
           -- (organisation créée avant que l'essai n'existe).
           when 'essai' then o.essai_fin is null or o.essai_fin >= current_date
           when 'active' then true
           else false                     -- suspendue, archivee
         end
  from public.organizations o
  where o.id = p_org;
$$;
comment on function public.org_ecriture_ouverte(uuid) is
  'Vrai si l''organisation peut encore créer. Faux = lecture seule : l''accès aux données et à leurs exports reste entier.';
-- Personne ne l'appelle directement : le déclencheur et etat_abonnement s'en
-- servent, tous deux SECURITY DEFINER, donc sous le propriétaire. Exposée à
-- `authenticated`, elle laisserait sonder le statut d'abonnement de n'importe
-- quelle organisation à partir de son seul identifiant — une RPC qui prend un
-- uuid sans contrôler l'appartenance (invariant posé par l'audit du 10/09).
revoke execute on function public.org_ecriture_ouverte(uuid) from public, anon, authenticated;

-- ── 2. Le déclencheur ──────────────────────────────────────────────────────
create or replace function public.refuser_ecriture_si_fermee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Les tâches planifiées (rétention légale, génération d'alertes) ne sont pas
  -- des gestes du client : elles doivent aboutir même sur une organisation
  -- suspendue. Elles se signalent par un réglage LOCAL à leur transaction, que
  -- seules elles posent — PostgREST n'expose aucun moyen d'en poser un.
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  -- Sans organisation, rien à vérifier : la clé étrangère s'en chargera.
  if v_org is null then
    return coalesce(new, old);
  end if;

  if not public.org_ecriture_ouverte(v_org) then
    raise exception
      'Abonnement suspendu : vos données restent consultables et exportables, mais aucune nouvelle saisie n''est possible. Réactivez l''abonnement depuis « Mon abonnement ».'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;
-- Le droit EXECUTE sur une fonction déclencheur n'autorise pas l'appel direct,
-- mais il autorise à la POSER sur une table à soi — et anon comme authenticated
-- ont TEMPORARY sur la base. C'est la brèche que l'audit du 10/09 a fermée sur
-- trois fonctions ; celle-ci ne la rouvre pas. Le déclencheur, lui, s'exécute
-- sous le propriétaire de la fonction : la révocation ne l'atteint pas.
revoke execute on function public.refuser_ecriture_si_fermee() from public, anon, authenticated;

-- ── 3. Pose du déclencheur sur toutes les tables d'organisation ─────────────
do $$
declare
  t record;
  -- Les journaux : jamais gardés. Les bloquer bloquerait la lecture elle-même
  -- (voir l'en-tête), et ferait perdre la trace au pire moment.
  v_jamais text[] := array['acces_pieces_log', 'audit_log'];
  -- Gardées en création et suppression seulement : leur UPDATE est un effet de
  -- LECTURE (marquage « lu »), pas un geste de gestion.
  v_sans_update text[] := array['messages'];
  v_ops text;
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
  end loop;
end;
$$;

-- ── 4. Les tâches planifiées se signalent ──────────────────────────────────
-- Elles écrivent pour le compte de la plateforme, pas du client. Sans ce
-- réglage, la rétention légale s'arrêterait sur une organisation suspendue —
-- c'est-à-dire exactement là où elle doit continuer.
create or replace function public.tache_systeme()
returns void
language sql
volatile
as $$ select set_config('gerimmo.systeme', 'on', true); $$;
comment on function public.tache_systeme() is
  'À appeler en tête d''une tâche planifiée : lève le refus d''écriture sur les organisations suspendues, pour la seule transaction en cours.';
revoke execute on function public.tache_systeme() from public, anon, authenticated;

-- ── 5. Ce que l'écran doit savoir ──────────────────────────────────────────
-- Le décompte facturable : premier bien offert, 5,99 € par bien et par mois
-- ensuite (grille du 05/09, affichée sur la page d'accueil publique).
create or replace function public.etat_abonnement(p_org uuid)
returns table (
  statut text,
  ecriture_ouverte boolean,
  essai_fin date,
  jours_essai_restants integer,
  biens integer,
  biens_factures integer,
  mensuel numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.status::text,
    public.org_ecriture_ouverte(o.id),
    o.essai_fin,
    case when o.status = 'essai' and o.essai_fin is not null
         then greatest(0, (o.essai_fin - current_date))::integer end,
    b.nb::integer,
    greatest(0, b.nb - 1)::integer,
    round(greatest(0, b.nb - 1) * 5.99, 2)
  from public.organizations o
  cross join lateral (
    select count(*) as nb from public.biens x where x.organization_id = o.id
  ) b
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.etat_abonnement(uuid) from public, anon;
