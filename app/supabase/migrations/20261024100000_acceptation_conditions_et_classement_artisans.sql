-- Conformité V1 (plan juriste/DPO du 23/10/2026, lot 1A ; constats R10 et R19), après 20261024090000 (archive des
-- versions, document des acceptations) :
--
-- 1. CLASSEMENT DES ARTISANS (R10). `artisans_disponibles_bien` triait par note moyenne dès la première évaluation :
--    un artisan noté 5 sur deux avis passait devant un artisan noté 4 sur vingt. La note n'est désormais prise en compte
--    qu'à partir de trois évaluations : le tri lit `note_publiee` seulement quand `publiable` est vrai. `publiable`
--    vaut déjà « trois évaluations au moins » (`artisan_note`, 20260911180000 : `count(*) >= 3`) : rien d'autre ne
--    change, ni le seuil, ni les colonnes rendues, ni les droits. Viennent ensuite, sans note, les artisans qui ont moins
--    de trois évaluations ; à égalité, la raison sociale, puis l'identifiant. Remplacement à compte exact de l'ancre de
--    20261023180000 (une seule occurrence) ; la forme déjà convertie est acceptée ; toute autre forme arrête la
--    migration en nommant la fonction.
--    Relecture adverse du 24/10 : (a) la raison sociale se trie dans l'ordre alphabétique FRANÇAIS (collation ICU
--    `fr-x-icu`), quelle que soit la collation de la base — en `C.UTF-8`, les capitales passaient avant les minuscules et
--    « Électricité » après « Zinc » ; sans ICU sur le serveur, la collation de la base reste (avis NOTICE, rien d'arrêté) ;
--    (b) `artisans_affectables_interne` (derrière `artisans_affectables`, contacts personnels de l'espace) suit le même
--    classement : son ancre de 20260911180000 est remplacée de la même façon. La forme convertie sans collation (premier
--    état de cette migration, bases locales) est acceptée et complétée.
--
-- 2. SANS ACCORD À LA DATE D'EFFET, PAS DE RECONDUCTION (R19). Deux fonctions réservées à la clé de service, appelées
--    par la tâche quotidienne des abonnements (lib/non-reconduction-conditions.ts), qui pose `cancel_at_period_end`
--    chez Stripe :
--    · `abonnements_sans_accord_conditions(p_version)` : les abonnements vivants, non déjà programmés pour finir, dont
--      AUCUN responsable actif (propriétaire, admin d'agence) n'a accepté cette version des conditions clients, alors
--      qu'au moins un en avait accepté une autre (il a pu voir l'écran « Nos conditions générales évoluent ») ;
--    · `abonnement_non_reconduction_conditions(…)` : une fois la non-reconduction posée chez Stripe, le miroir
--      (`annulation_demandee`, que le webhook confirmera) et le journal d'audit ; quand un échéancier Stripe a été
--      libéré, l'échéance redevient « à préparer » (si le Client poursuit son abonnement, la tâche la reprogramme).
--    La version, sa nature et sa date d'effet sont décidées par le code (conditions-versions.json) : la base ne
--    connaît que la version demandée. Aucune table nouvelle.
--
-- Rejouable : remplacement par ancre qui accepte la forme convertie, CREATE OR REPLACE ; `search_path = ''` ; aucune
-- donnée existante réécrite ; `fermer_fonctions_a_anon()` en fin.
-- Retour : supabase/retours-arriere/20261024100000_acceptation_conditions_et_classement_artisans.retour.sql (dans
-- la chaîne « Ordre complet », avec les retours du plan de conformité, bien que rien ici ne cite `aujourdhui_paris()`).

-- Finitions du 24/10 (relecture transverse, point 6) : aucun verrou attendu plus de dix secondes. Le chantier envoie le
-- lot dans une seule transaction : la limite posée ici couvre toutes les migrations qui suivent ; seule, elle couvre ce
-- fichier. Un verrou refusé fait échouer la migration (rien n'est appliqué) au lieu de faire attendre les inscriptions.
do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. Classement des artisans : la note à partir de trois évaluations, puis l'ordre alphabétique français ──────
do $classement$
declare
  icu constant boolean := exists (select 1 from pg_catalog.pg_collation where collname = 'fr-x-icu');
  alpha_icu constant text := 'a.raison_sociale collate "fr-x-icu"';
  alpha_base constant text := 'a.raison_sociale';
  r record;
  f regprocedure;
  d text;
  cible text;
  autre text;
  n_ancien integer;
  n_cible integer;
  n_autre integer;
begin
  if not icu then
    raise notice 'collation fr-x-icu absente : la raison sociale des artisans se trie dans la collation de la base';
  end if;
  for r in
    select * from (values
      ('public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux)', 'artisans_disponibles_bien', '20261023180000',
       'order by n.note_publiee desc nulls last,a.raison_sociale,a.id;',
       'order by case when n.publiable then n.note_publiee end desc nulls last,%s,a.id;'),
      ('public.artisans_affectables_interne(uuid,public.artisan_metier,public.nature_travaux,text)', 'artisans_affectables_interne', '20260928081000',
       'order by n.note_publiee desc nulls last, a.raison_sociale;',
       'order by case when n.publiable then n.note_publiee end desc nulls last, %s, a.id;')
    ) v(signature, nom, origine, ancien, gabarit)
  loop
    f := to_regprocedure(r.signature);
    if f is null then
      raise exception '% introuvable : migration % attendue avant celle-ci', r.nom, r.origine;
    end if;
    d := pg_get_functiondef(f);
    cible := format(r.gabarit, case when icu then alpha_icu else alpha_base end);
    autre := format(r.gabarit, case when icu then alpha_base else alpha_icu end);
    n_ancien := (length(d) - length(replace(d, r.ancien, ''))) / length(r.ancien);
    n_cible := (length(d) - length(replace(d, cible, ''))) / length(cible);
    n_autre := (length(d) - length(replace(d, autre, ''))) / length(autre);
    if n_cible = 1 and n_ancien = 0 and n_autre = 0 then
      continue; -- déjà convertie (rejeu)
    elsif n_ancien = 1 and n_cible = 0 and n_autre = 0 then
      execute replace(d, r.ancien, cible);
    elsif n_autre = 1 and n_ancien = 0 and n_cible = 0 then
      execute replace(d, autre, cible); -- forme convertie avec l'autre collation : complétée
    else
      raise exception 'définition inattendue de % (tri par note : % occurrence(s) de l''ancre de %, % de la forme convertie)',
        r.nom, n_ancien, r.origine, n_cible + n_autre;
    end if;
  end loop;
end $classement$;

-- ── 2. Non-reconduction sans accord exprès (R19) ────────────────────────────────────────────────────────────────
create or replace function public.abonnements_sans_accord_conditions(p_version text)
returns table (organization_id uuid, organisation text, stripe_subscription_id text, periode_fin timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  return query
    select a.organization_id, o.name::text, a.stripe_subscription_id, a.periode_fin
      from public.abonnements a
      join public.organizations o on o.id = a.organization_id
     where a.stripe_subscription_id is not null
       and not coalesce(a.annulation_demandee, false)
       and coalesce(a.stripe_statut, '') in ('active', 'trialing', 'past_due', 'unpaid')
       and o.status <> 'archivee'
       -- Au moins un responsable a accepté une version des conditions clients : l'écran a pu lui être montré.
       and exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients')
       -- Aucun responsable n'a accepté cette version.
       and not exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients'
            and c.version = btrim(p_version))
     order by a.periode_fin nulls last, a.organization_id;
end $$;
revoke all on function public.abonnements_sans_accord_conditions(text) from public, anon, authenticated;
grant execute on function public.abonnements_sans_accord_conditions(text) to service_role;
comment on function public.abonnements_sans_accord_conditions(text) is
  'Abonnements vivants dont aucun responsable n''a accepté cette version des conditions clients (mais une autre, oui) : la tâche quotidienne les programme pour ne pas être reconduits (24/10/2026, plan de conformité R19). Clé de service seulement.';

create or replace function public.abonnement_non_reconduction_conditions(
  p_org uuid,
  p_subscription text,
  p_version text,
  p_echeancier_libere boolean default false,
  p_posee boolean default true
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_periode_fin timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_org is null or p_subscription is null or p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Paramètres de non-reconduction invalides' using errcode = '22023';
  end if;
  update public.abonnements a
     set annulation_demandee = case when coalesce(p_posee, true) then true else a.annulation_demandee end,
         changement_applique_pour = case when coalesce(p_echeancier_libere, false) then null else a.changement_applique_pour end,
         updated_at = now()
   where a.organization_id = p_org
     and a.stripe_subscription_id = p_subscription
  returning a.periode_fin into v_periode_fin;
  if not found then
    raise exception 'Abonnement introuvable pour cette organisation' using errcode = '22023';
  end if;
  if coalesce(p_posee, true) then
    insert into public.audit_log (organization_id, action, details)
    values (p_org, 'abonnement_non_reconduit_conditions', jsonb_build_object(
      'version', btrim(p_version),
      'periode_fin', v_periode_fin,
      'echeancier_libere', coalesce(p_echeancier_libere, false)));
  end if;
end $$;
revoke all on function public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean) to service_role;
comment on function public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean) is
  'Consigne une non-reconduction posée chez Stripe faute d''accord à une version substantielle des conditions (miroir et journal d''audit) ; remet l''échéance « à préparer » quand un échéancier a été libéré (24/10/2026, plan de conformité R19). Clé de service seulement.';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
