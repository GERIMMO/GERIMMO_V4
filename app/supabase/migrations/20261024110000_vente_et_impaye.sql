-- Conformité V1 (plan juriste/DPO du 23/10/2026, lots 1B et 1C) : vente au consommateur et impayé.
-- Décisions du dirigeant du 23/10 qui priment sur le plan : le médiateur n'est pas bloquant (rien n'attend sa saisie) ;
-- remboursements protecteurs : oui à tout. Sources juridiques non ouvertes le 23/10/2026 : à relire par le juriste.
--
-- 1. `abonnements`, cinq colonnes (aucune valeur existante réécrite) :
--    · `souscrit_le` : la conclusion du contrat (`start_date` de la souscription Stripe), posée par le webhook au travers
--      de `abonnement_souscription_datee`. Point de départ du délai de rétractation (R01) et de la confirmation (R03) ;
--    · `confirmation_envoyee_le` : la confirmation sur support durable est partie (R03 ; une fois par souscription) ;
--    · `passage_annuel_demande_le` : la demande de passage du mensuel à l'annuel, qui ouvre un nouveau délai de
--      rétractation (R37), posée par `demander_periodicite_suivante` ;
--    · `resiliation_accusee_pour` : la fin de période dont la résiliation a été accusée (R04 ; un seul accusé, que la
--      résiliation vienne de l'action ou du webhook) ;
--    · `resiliation_impaye_notifiee_le` : le courrier de résiliation pour impayé est parti (R07).
--    Une nouvelle souscription (autre `start_date`) remet ces marques à zéro.
-- 2. `public.retractations_abonnement` (R01, R37) : une ligne par déclaration de rétractation, clé stable (`cle`), en
--    ajout seul hormis l'exécution (remboursements) et l'accusé. Écrite par la clé de service seulement, après la
--    vérification des droits et du délai par l'action serveur. Lue par le responsable au travers de `ma_retractation`.
--    Hors de la garde de lecture seule (`poser_gardes_abonnement`) : la rétractation reste ouverte à un compte gelé.
-- 3. `abonnement_appliquer` (R07) : « unpaid » garde le statut d'un client qui a déjà payé (la lecture seule vient de la
--    date, à J+15, comme pour « past_due »). Insertion à compte exact.
-- 4. `abonnements_a_relancer` (R23) : le premier prélèvement échoué (compte gelé dès l'échec) reçoit UN courrier, au
--    palier 0, si le défaut est récent (deux jours au plus) et qu'aucune résiliation n'est demandée ; rend
--    `premier_prelevement`, `en_defaut_depuis` et `resiliable_le` (défaut + 30 jours, la mise en demeure). Le type de
--    retour change : DROP puis CREATE, droits rétablis. Quatre `public.aujourdhui_paris()` comme avant (la migration
--    20261018231827 et son retour, qui les comptent, restent valables).
-- 5. `org_ecriture_ouverte` (R27) : un compte « active » ne passe en lecture seule à J+15 que si au moins un courrier
--    de relance est parti (`relances_paiement >= 1`). Remplacement à compte exact.
-- 6. `abonnement_relance_consigner` (R06) : marque la relance (`abonnement_relance_envoyee`, inchangée) et inscrit la
--    preuve de la mise en demeure dans `audit_log` (action relance_paiement_envoyee : palier, date, identifiant du
--    message ; jamais l'adresse).
-- 7. `abonnements_avis_reconduction_dus` (R54, R17) : fenêtre en mois, en dates de Paris (entre un et trois mois avant
--    l'échéance) ; rend la périodicité suivante et le portefeuille pour annoncer le montant de la période suivante.
-- 8. `demander_periodicite_suivante` (R37) : date la demande de passage à l'annuel. Remplacement à compte exact.
-- 9. Fonctions de service des courriers contractuels (confirmation, accusé de résiliation, résiliation pour impayé),
--    de la rétractation, et `abonnement_geste_consigner` (liste fermée d'actions d'audit) ; `ma_retractation` pour
--    l'écran du responsable.
-- 10. Réclamations (R05) : nature « reclamation » admise par `retours_utilisateurs` et `soumettre_retour`.
-- Relectures adverses du 24/10 : l'exécution d'une rétractation se consigne une fois (montant, références, et pour un
-- passage à l'annuel s'il était déjà effectué), sans jamais s'écraser ; `ma_retractation` retrouve une déclaration de
-- passage à la milliseconde ; `retractations_a_terminer` liste celles restées en chemin (reprise de nuit) ; la levée
-- d'une résiliation efface la marque de son accusé (`abonnement_resiliation_levee`) ; la fenêtre de l'avis de
-- reconduction se borne sur la date limite de non-reconduction (veille de l'échéance).
--
-- Rejouable : IF NOT EXISTS, CREATE OR REPLACE, remplacements qui acceptent la forme déjà convertie et s'arrêtent en
-- nommant la fonction sinon. `search_path = ''` ; `fermer_fonctions_a_anon()` en fin. Aucune donnée existante réécrite.
-- Retour : supabase/retours-arriere/20261024110000_vente_et_impaye.retour.sql

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. Les colonnes de l'abonnement ─────────────────────────────────────────────────────────────────────────────────
alter table public.abonnements
  add column if not exists souscrit_le timestamptz,
  add column if not exists confirmation_envoyee_le timestamptz,
  add column if not exists passage_annuel_demande_le timestamptz,
  add column if not exists resiliation_accusee_pour timestamptz,
  add column if not exists resiliation_impaye_notifiee_le timestamptz;

comment on column public.abonnements.souscrit_le is
  'Conclusion de la souscription suivie (start_date Stripe), posée par le webhook. Départ du délai de rétractation (plan du 23/10, R01).';
comment on column public.abonnements.confirmation_envoyee_le is
  'Confirmation de la souscription sur support durable envoyée (R03). Remise à zéro par une nouvelle souscription.';
comment on column public.abonnements.passage_annuel_demande_le is
  'Demande de passage du mensuel à l''annuel : ouvre un nouveau délai de rétractation de quatorze jours (R37).';
comment on column public.abonnements.resiliation_accusee_pour is
  'Fin de période dont la résiliation a été accusée par courriel (R04) : un seul accusé par l''action et le webhook.';
comment on column public.abonnements.resiliation_impaye_notifiee_le is
  'Courrier de résiliation pour impayé envoyé (R07).';

-- ── 2. Les rétractations ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.retractations_abonnement (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id text not null,
  nature text not null,
  cle text not null,
  -- Pour un passage à l'annuel : la demande de passage visée.
  passage_demande_le timestamptz,
  texte_declaration text not null,
  declaree_le timestamptz not null default date_trunc('second', clock_timestamp()),
  declaree_par uuid,
  canal text not null default 'en_ligne',
  adresse_accuse text not null,
  executee_le timestamptz,
  montant_rembourse_cents bigint not null default 0,
  refunds jsonb not null default '[]'::jsonb,
  -- Passage à l'annuel : était-il déjà effectué (échéance annuelle prélevée) ? Fixé à l'exécution, une fois.
  passage_effectue boolean,
  accuse_envoye_le timestamptz,
  constraint retractations_abonnement_nature_check check (nature in ('abonnement', 'passage_annuel')),
  constraint retractations_abonnement_canal_check check (canal in ('en_ligne', 'courriel')),
  constraint retractations_abonnement_cle_unique unique (cle),
  constraint retractations_abonnement_cle_format check (cle ~ '^retractation-[A-Za-z0-9_:.-]{1,200}$'),
  constraint retractations_abonnement_souscription_format check (subscription_id ~ '^sub_[A-Za-z0-9_]{1,200}$'),
  constraint retractations_abonnement_passage check ((nature = 'passage_annuel') = (passage_demande_le is not null)),
  constraint retractations_abonnement_texte check (length(btrim(texte_declaration)) between 20 and 2000),
  constraint retractations_abonnement_adresse check (adresse_accuse ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(adresse_accuse) <= 320),
  constraint retractations_abonnement_montant check (montant_rembourse_cents >= 0),
  constraint retractations_abonnement_refunds check (jsonb_typeof(refunds) = 'array' and length(refunds::text) <= 8000)
);

-- Rejeu sur une table déjà créée (ou conservée par le retour) : la colonne ajoutée par la relecture du 24/10.
alter table public.retractations_abonnement add column if not exists passage_effectue boolean;
comment on column public.retractations_abonnement.passage_effectue is
  'Passage à l''annuel : déjà effectué (échéance annuelle prélevée, retour au mensuel et remboursement) ou encore programmé. Décidé une fois, à la première exécution (relecture adverse du 24/10).';

alter table public.retractations_abonnement enable row level security;
create index if not exists retractations_abonnement_org on public.retractations_abonnement (organization_id, declaree_le desc);

drop trigger if exists diagnostic_artisan_lecture on public.retractations_abonnement;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.retractations_abonnement
  for each row execute function public.refuser_mutation_diagnostic_artisan();
-- Hors de la garde de lecture seule (voir la section 13) : un rejeu après retour retire une garde posée entre-temps.
drop trigger if exists abonnement_retractations_abonnement on public.retractations_abonnement;

-- La déclaration, sa date, son canal et sa référence ne se réécrivent pas ; seuls l'exécution (remboursements) et
-- l'accusé se complètent, une fois. Aucune suppression hors de la suppression de l'organisation.
create or replace function public.retractations_abonnement_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Seule la suppression de l'organisation l'emporte (cascade : l'organisation n'existe déjà plus).
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then return old; end if;
    raise exception 'Une déclaration de rétractation ne se supprime pas';
  end if;
  if (to_jsonb(new) - array['executee_le', 'montant_rembourse_cents', 'refunds', 'passage_effectue', 'accuse_envoye_le'])
     is distinct from (to_jsonb(old) - array['executee_le', 'montant_rembourse_cents', 'refunds', 'passage_effectue', 'accuse_envoye_le']) then
    raise exception 'Une déclaration de rétractation ne se réécrit pas';
  end if;
  -- Relecture adverse du 24/10 (point 5) : l'exécution consignée (montant remboursé, références) ne s'écrase pas.
  if old.executee_le is not null
     and (new.executee_le, new.montant_rembourse_cents, new.refunds, new.passage_effectue)
         is distinct from (old.executee_le, old.montant_rembourse_cents, old.refunds, old.passage_effectue) then
    raise exception 'L''exécution de la rétractation est déjà consignée';
  end if;
  if old.accuse_envoye_le is not null and new.accuse_envoye_le is distinct from old.accuse_envoye_le then
    raise exception 'L''accusé de réception est déjà enregistré';
  end if;
  return new;
end;
$$;
drop trigger if exists retractations_abonnement_ajout_seul on public.retractations_abonnement;
create trigger retractations_abonnement_ajout_seul before update or delete on public.retractations_abonnement
  for each row execute function public.retractations_abonnement_ajout_seul();

revoke all on table public.retractations_abonnement from public, anon, authenticated;
grant select, insert, update on table public.retractations_abonnement to service_role;

comment on table public.retractations_abonnement is
  'Plan du 23/10/2026 (R01, R37) : déclarations de rétractation d''un abonnement ou d''un passage à l''annuel, leur exécution (remboursements Stripe) et leur accusé. Écrite par la clé de service (fonctions retractation_*). Aucune donnée bancaire.';

-- ── 3. abonnement_appliquer : « unpaid » garde le statut d'un client qui a déjà payé (R07) ──────────────────────────
do $appliquer$
declare
  d text;
  ancre text := $a$           else 'suspendue'::public.organization_status end
    when p_statut = 'past_due' then v_statut_actuel$a$;
  nouveau text := $n$           else 'suspendue'::public.organization_status end
    -- Plan du 23/10 (R07) : un client qui a déjà payé garde son statut en « unpaid » comme en « past_due » ; la lecture
    -- seule vient de la date (J+15, org_ecriture_ouverte), la résiliation d'un geste humain, au plus tôt à J+30.
    when p_statut = 'unpaid' then v_statut_actuel
    when p_statut = 'past_due' then v_statut_actuel$n$;
begin
  select pg_get_functiondef('public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)'::regprocedure) into d;
  if strpos(d, $q$when p_statut = 'unpaid' then v_statut_actuel$q$) > 0 then
    return; -- déjà convertie
  end if;
  if (length(d) - length(replace(d, ancre, ''))) / length(ancre) <> 1 then
    raise exception 'abonnement_appliquer : définition inattendue (ancre « unpaid » absente ou multiple), aucune réécriture';
  end if;
  execute replace(d, ancre, nouveau);
end $appliquer$;

-- ── 4. abonnements_a_relancer : le premier prélèvement échoué reçoit son courrier (R23) ─────────────────────────────
do $relancer$
declare
  d text;
begin
  select pg_get_functiondef('public.abonnements_a_relancer(integer)'::regprocedure) into d;
  -- Forme attendue : celle de 20261019120500 (periodicite, montant_periode_cents), ou la nôtre (rejeu).
  if strpos(d, 'premier_prelevement') = 0
     and (strpos(d, 'montant_periode_cents bigint') = 0 or strpos(d, $q$o.status not in ('archivee', 'suspendue')$q$) = 0) then
    raise exception 'abonnements_a_relancer : définition inattendue, aucune réécriture';
  end if;
end $relancer$;

drop function if exists public.abonnements_a_relancer(integer);
create function public.abonnements_a_relancer(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  palier smallint,              -- 0 alerte · 1 rappel · 2 avis · 3 constat
  jours_ecoules integer,
  jours_restants integer,
  lecture_seule_le date,
  montant_mensuel numeric,      -- équivalent mensuel, conservé pour l'affichage
  periodicite text,             -- 'mensuel' | 'annuel' : ce que le prélèvement couvre
  montant_periode_cents bigint, -- le montant du prélèvement, en centimes
  premier_prelevement boolean,  -- aucune échéance encore réglée : le compte est gelé dès l'échec (R23)
  en_defaut_depuis date,        -- le jour de l'échec
  resiliable_le date            -- le jour à partir duquel l'abonnement peut être résilié (mise en demeure, R06)
)
language sql
stable
security definer
set search_path = ''
as $$
  with delai as (select public.delai_defaut_paiement_jours() as j)
  select
    a.organization_id,
    o.name,
    coalesce(
      nullif(btrim(coalesce(o.email_contact, '')), ''),
      (select c.email from public.memberships m
         join public.accounts c on c.id = m.account_id
        where m.organization_id = o.id and m.status = 'active'
          and m.role in ('admin_agence', 'proprietaire_direct')
        order by m.created_at limit 1)
    ),
    v.palier,
    (public.aujourdhui_paris() - a.paiement_en_defaut_depuis)::integer,
    greatest(0, d.j - (public.aujourdhui_paris() - a.paiement_en_defaut_depuis))::integer,
    (a.paiement_en_defaut_depuis + d.j)::date,
    round(a.montant_mensuel_cents / 100.0, 2),
    -- La périodicité telle qu'enregistrée. Le repli sur le montant mensuel ne vaut que pour un abonnement mensuel (grille
    -- historique : aucun montant de période enregistré, c'est le montant mensuel qui est prélevé) ; un annuel sans montant
    -- de période rend NULL, que le code rapporte en échec au lieu d'annoncer un douzième « par mois ».
    a.periodicite,
    case when a.periodicite = 'mensuel' then coalesce(a.montant_periode_cents, a.montant_mensuel_cents) else a.montant_periode_cents end,
    not a.premiere_facture_payee,
    a.paiement_en_defaut_depuis,
    -- Plan du 23/10 (R06) : la résiliation par l'Éditeur, au plus tôt trente jours après la mise en demeure (le courrier
    -- du jour de l'échec). À relire par le juriste (source non ouverte le 23/10/2026).
    (a.paiement_en_defaut_depuis + 30)::date
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  cross join delai d
  cross join lateral (
    select a.relances_paiement::smallint as palier
  ) v
  where a.paiement_en_defaut_depuis is not null
    and (
      -- Un client qui a déjà payé : les quatre paliers, compte ouvert jusqu'à J+15.
      (a.premiere_facture_payee and o.status not in ('archivee', 'suspendue'))
      -- Plan du 23/10 (R23) : le PREMIER prélèvement échoué gèle le compte dès l'échec (abonnement_appliquer) ; il reçoit
      -- un seul courrier, le sien, au palier 0 : défaut récent, aucune résiliation demandée, prélèvement encore en échec.
      or (not a.premiere_facture_payee and o.status <> 'archivee' and a.relances_paiement = 0
          and a.stripe_statut in ('past_due', 'unpaid') and not coalesce(a.annulation_demandee, false))
    )
    -- Le palier suivant n'est dû qu'à partir de son jour. Le premier (l'alerte) l'est immédiatement : c'est précisément
    -- son intérêt. Le courrier du premier prélèvement ne part que dans les deux jours de l'échec : passé ce délai, un
    -- ancien défaut ne reçoit pas un courrier qui dirait « depuis le » comme si c'était d'hier.
    and (public.aujourdhui_paris() - a.paiement_en_defaut_depuis) between case a.relances_paiement
          when 0 then 0
          when 1 then 7
          when 2 then d.j - 1
          when 3 then d.j
          else 99999 end
        and case when a.premiere_facture_payee then 99999 else 2 end
    -- Jamais deux courriers le même jour, quoi qu'il arrive : une tâche rejouée
    -- ne doit pas doubler l'envoi.
    and (a.derniere_relance_le is null or a.derniere_relance_le < public.aujourdhui_paris())
  order by a.paiement_en_defaut_depuis
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
comment on function public.abonnements_a_relancer(integer) is
  'Les organisations dont un courrier de relance de paiement est dû aujourd''hui, avec son palier (0 alerte, 1 rappel, 2 avis, 3 constat de lecture seule), la périodicité et le montant de la période prélevée ; le premier prélèvement échoué (R23, plan du 23/10) reçoit un seul courrier, au palier 0.';
revoke execute on function public.abonnements_a_relancer(integer) from public, anon, authenticated;
grant execute on function public.abonnements_a_relancer(integer) to service_role;

-- ── 5. org_ecriture_ouverte : pas de lecture seule sans courrier (R27) ──────────────────────────────────────────────
do $ecriture$
declare
  d text;
  ancre text := $a$           when 'active' then
             a.paiement_en_defaut_depuis is null
             or (public.aujourdhui_paris() - a.paiement_en_defaut_depuis) < public.delai_defaut_paiement_jours()$a$;
  nouveau text := $n$           when 'active' then
             a.paiement_en_defaut_depuis is null
             or (public.aujourdhui_paris() - a.paiement_en_defaut_depuis) < public.delai_defaut_paiement_jours()
             -- Plan du 23/10 (R27) : jamais de lecture seule sans qu'un courrier de relance soit parti.
             or coalesce(a.relances_paiement, 0) < 1$n$;
begin
  select pg_get_functiondef('public.org_ecriture_ouverte(uuid)'::regprocedure) into d;
  if strpos(d, 'coalesce(a.relances_paiement, 0) < 1') > 0 then
    return; -- déjà convertie
  end if;
  if (length(d) - length(replace(d, ancre, ''))) / length(ancre) <> 1 then
    raise exception 'org_ecriture_ouverte : définition inattendue (ancre « active » absente ou multiple), aucune réécriture';
  end if;
  execute replace(d, ancre, nouveau);
end $ecriture$;
comment on function public.org_ecriture_ouverte(uuid) is
  'L''écriture est-elle ouverte ? Essai non expiré, ou compte actif dont le prélèvement n''est pas en défaut depuis quinze jours, ou dont aucun courrier de relance n''est encore parti (plan du 23/10, R27). Grille historique seulement : essai expiré sans rien à payer reste ouvert (24/09). Fermée, les données restent lisibles et exportables.';

-- ── 6. La preuve de la mise en demeure (R06) ────────────────────────────────────────────────────────────────────────
create or replace function public.abonnement_relance_consigner(
  p_org uuid, p_palier integer, p_message text, p_premier_prelevement boolean default false)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant smallint;
  v_apres smallint;
  v_defaut date;
begin
  if p_org is null or p_palier is null or p_palier not between 0 and 3 then
    raise exception 'Relance de paiement invalide';
  end if;
  if p_message is not null and (length(p_message) > 200 or p_message ~ '[[:space:]@]') then
    raise exception 'Identifiant de message invalide';
  end if;
  select a.relances_paiement, a.paiement_en_defaut_depuis into v_avant, v_defaut
    from public.abonnements a where a.organization_id = p_org for update;
  if not found then return false; end if;
  perform public.abonnement_relance_envoyee(p_org);
  select a.relances_paiement into v_apres from public.abonnements a where a.organization_id = p_org;
  if v_apres is not distinct from v_avant then
    return false; -- déjà marquée aujourd'hui, ou défaut levé entre-temps : aucune seconde preuve
  end if;
  insert into public.audit_log (organization_id, action, details)
  values (p_org, 'relance_paiement_envoyee',
          jsonb_build_object('palier', p_palier, 'premier_prelevement', coalesce(p_premier_prelevement, false),
                             'envoyee_le', clock_timestamp(), 'en_defaut_depuis', v_defaut,
                             'message', p_message));
  return true;
end;
$$;

-- ── 7. L'avis de reconduction : fenêtre en mois, montant de la période suivante (R54, R17) ───────────────────────────
drop function if exists public.abonnements_avis_reconduction_dus(integer);
create function public.abonnements_avis_reconduction_dus(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  periode_fin timestamptz,
  montant_periode_cents bigint,
  formule text,
  periodicite_suivante text,   -- la périodicité demandée pour l'échéance, s'il y en a une
  unites_souscrites integer,
  unites_a_couvrir integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, public.destinataire_facturation(o.id),
         a.periode_fin, a.montant_periode_cents, a.formule,
         a.periodicite_suivante, a.unites_souscrites, public.abonnement_quantite_cible(o.id)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where o.type = 'proprietaire_direct'
    and o.status <> 'archivee'
    and a.stripe_subscription_id is not null
    and a.stripe_statut in ('active', 'trialing', 'past_due')
    and not coalesce(a.annulation_demandee, false)
    and a.periodicite = 'annuel'
    and a.periode_fin is not null
    -- Plan du 23/10 (R54) : entre un mois et trois mois, en dates de Paris (un mois après le 31 août est le 30
    -- septembre), avant le terme de la période qui autorise le rejet de la reconduction (L. 215-1), c'est-à-dire la
    -- DATE LIMITE de non-reconduction annoncée par l'avis, veille de l'échéance (relecture adverse du 24/10 : solution
    -- la plus protectrice, sans coût). À relire par le juriste (source non ouverte le 23/10/2026).
    and (a.periode_fin at time zone 'Europe/Paris')::date - 1 >= (public.aujourdhui_paris() + interval '1 month')::date
    and (a.periode_fin at time zone 'Europe/Paris')::date - 1 <= (public.aujourdhui_paris() + interval '3 months')::date
    and a.avis_reconduction_periode_fin is distinct from (a.periode_fin at time zone 'Europe/Paris')::date
  order by a.periode_fin
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
comment on function public.abonnements_avis_reconduction_dus(integer) is
  'Les avis de reconduction tacite dus aujourd''hui (art. L. 215-1 du code de la consommation) : entre un et trois mois avant la date limite de non-reconduction (veille de l''échéance), en dates de Paris (plan du 23/10, R54 ; relecture du 24/10), avec ce qu''il faut pour annoncer le montant de la période suivante (R17).';
revoke execute on function public.abonnements_avis_reconduction_dus(integer) from public, anon, authenticated;
grant execute on function public.abonnements_avis_reconduction_dus(integer) to service_role;

-- ── 8. La demande de passage à l'annuel est datée (R37) ─────────────────────────────────────────────────────────────
do $periodicite$
declare
  d text;
  ancre text := $a$     set periodicite_suivante = case when p_periodicite = periodicite then null else p_periodicite end,$a$;
  nouveau text := $n$     set periodicite_suivante = case when p_periodicite = periodicite then null else p_periodicite end,
         -- Plan du 23/10 (R37) : la demande de passage du mensuel à l'annuel ouvre un nouveau délai de rétractation ;
         -- la redemander ne le rouvre pas, y renoncer avant l'échéance l'efface.
         passage_annuel_demande_le = case
           when periodicite = 'mensuel' and p_periodicite = 'annuel'
             then coalesce(case when periodicite_suivante = 'annuel' then passage_annuel_demande_le end, now())
           when periodicite = 'mensuel' then null
           else passage_annuel_demande_le end,$n$;
begin
  select pg_get_functiondef('public.demander_periodicite_suivante(uuid,text)'::regprocedure) into d;
  if strpos(d, 'passage_annuel_demande_le') > 0 then
    return; -- déjà convertie
  end if;
  if (length(d) - length(replace(d, ancre, ''))) / length(ancre) <> 1 then
    raise exception 'demander_periodicite_suivante : définition inattendue (ancre absente ou multiple), aucune réécriture';
  end if;
  execute replace(d, ancre, nouveau);
end $periodicite$;

-- ── 9. Les fonctions de service des courriers contractuels ──────────────────────────────────────────────────────────

-- 9.1 La souscription datée (webhook) : une autre conclusion = une autre souscription, ses marques repartent de zéro.
create or replace function public.abonnement_souscription_datee(p_customer text, p_subscription text, p_souscrit_le timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  if p_customer is null or p_subscription is null or p_souscrit_le is null then
    raise exception 'Souscription à dater invalide';
  end if;
  update public.abonnements a
     set souscrit_le = p_souscrit_le,
         confirmation_envoyee_le = case when a.souscrit_le is not null and a.souscrit_le <> p_souscrit_le then null else a.confirmation_envoyee_le end,
         passage_annuel_demande_le = case when a.souscrit_le is not null and a.souscrit_le <> p_souscrit_le then null else a.passage_annuel_demande_le end,
         resiliation_accusee_pour = case when a.souscrit_le is not null and a.souscrit_le <> p_souscrit_le then null else a.resiliation_accusee_pour end,
         resiliation_impaye_notifiee_le = case when a.souscrit_le is not null and a.souscrit_le <> p_souscrit_le then null else a.resiliation_impaye_notifiee_le end,
         updated_at = now()
   where a.stripe_customer_id = btrim(p_customer)
     and a.stripe_subscription_id = btrim(p_subscription)
     and a.souscrit_le is distinct from p_souscrit_le
  returning a.organization_id into v_org;
  return v_org;
end;
$$;

-- 9.2 Ce que la base savait AVANT l'événement (le webhook en déduit les bascules). `resiliation_par_la_page` : la page
-- « Résilier votre contrat » vient de notifier cette résiliation (moins de quinze minutes) ; c'est elle qui envoie
-- l'accusé, à l'adresse choisie par le client, et le webhook s'abstient.
drop function if exists public.abonnement_contexte_evenement(text);
create function public.abonnement_contexte_evenement(p_customer text)
returns table (organization_id uuid, stripe_subscription_id text, stripe_statut text, annulation_demandee boolean,
               paiement_en_defaut_depuis date, periode_fin timestamptz, souscrit_le timestamptz,
               confirmation_envoyee_le timestamptz, resiliation_accusee_pour timestamptz,
               resiliation_impaye_notifiee_le timestamptz, resiliation_par_la_page boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, a.stripe_subscription_id, a.stripe_statut, coalesce(a.annulation_demandee, false),
         a.paiement_en_defaut_depuis, a.periode_fin, a.souscrit_le, a.confirmation_envoyee_le,
         a.resiliation_accusee_pour, a.resiliation_impaye_notifiee_le,
         exists (select 1 from public.audit_log l
                  where l.organization_id = a.organization_id and l.action = 'abonnement_resiliation_notifiee'
                    and l.created_at > now() - interval '15 minutes'
                    and l.details->>'souscription' = a.stripe_subscription_id)
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
$$;

-- 9.3 Ce que disent les courriers contractuels : l'organisation, son titulaire, l'offre, l'acceptation des conditions.
-- `resiliations_accusees` (relecture adverse du 24/10, I3) : les accusés de résiliation déjà envoyés pour cette
-- souscription. Une résiliation notifiée de nouveau après une levée reçoit son propre accusé : la clé du prestataire
-- d'e-mail porte ce rang, le même pour l'action et le webhook.
drop function if exists public.abonnement_courrier_contexte(uuid);
create function public.abonnement_courrier_contexte(p_org uuid)
returns table (organization_id uuid, organisation text, public_tarif public.organization_type, grille text,
               destinataire text, nom_titulaire text, stripe_subscription_id text, stripe_statut text,
               souscrit_le timestamptz, periode_fin timestamptz, essai_fin date, formule text, unites_souscrites integer,
               periodicite text, montant_periode_cents bigint, confirmation_envoyee_le timestamptz,
               resiliation_accusee_pour timestamptz, cgu_version text, cgu_acceptee_le timestamptz,
               resiliations_accusees integer)
language sql
stable
security definer
set search_path = ''
as $$
  with titulaire as (
    select m.account_id
    from public.memberships m
    where m.organization_id = p_org and m.status = 'active' and m.role in ('admin_agence', 'proprietaire_direct')
    order by m.created_at limit 1
  ), acceptation as (
    -- La dernière acceptation des conditions clients par un responsable de l'organisation.
    select c.version, c.acceptee_le
    from public.acceptations_cgu c
    join public.memberships m on m.account_id = c.account_id
    where m.organization_id = p_org and m.status = 'active' and m.role in ('admin_agence', 'proprietaire_direct')
      and c.document = 'conditions_clients'
    order by c.acceptee_le desc limit 1
  )
  select o.id, o.name, o.type, o.grille_tarifaire,
         public.destinataire_facturation(o.id),
         (select nullif(btrim(concat_ws(' ', nullif(btrim(u.raw_user_meta_data->>'prenom'), ''),
                                             nullif(btrim(u.raw_user_meta_data->>'nom'), ''))), '')
            from auth.users u where u.id = (select t.account_id from titulaire t)),
         a.stripe_subscription_id, a.stripe_statut, a.souscrit_le, a.periode_fin, o.essai_fin, a.formule,
         a.unites_souscrites, coalesce(a.periodicite, 'mensuel'), a.montant_periode_cents, a.confirmation_envoyee_le,
         a.resiliation_accusee_pour,
         (select x.version from acceptation x), (select x.acceptee_le from acceptation x),
         (select count(*)::integer from public.audit_log l
           where l.organization_id = o.id and l.action = 'abonnement_resiliation_accusee'
             and l.details->>'souscription' = a.stripe_subscription_id)
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;

-- 9.4 Les confirmations à rattraper (tâche de nuit) : souscription datée du dernier mois, jamais confirmée.
create or replace function public.abonnements_confirmation_dues(p_limite integer default 50)
returns table (organization_id uuid, stripe_subscription_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, a.stripe_subscription_id
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where a.stripe_subscription_id is not null
    and a.souscrit_le is not null
    and a.souscrit_le >= now() - interval '30 days'
    and a.confirmation_envoyee_le is null
    and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid')
    and o.status <> 'archivee'
  order by a.souscrit_le
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

-- 9.5 La confirmation est partie : une fois par souscription, avec sa preuve.
create or replace function public.abonnement_confirmation_envoyee(
  p_org uuid, p_subscription text, p_message text, p_piece_jointe boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if p_message is not null and (length(p_message) > 200 or p_message ~ '[[:space:]@]') then
    raise exception 'Identifiant de message invalide';
  end if;
  update public.abonnements a set confirmation_envoyee_le = clock_timestamp(), updated_at = now()
   where a.organization_id = p_org and a.stripe_subscription_id = p_subscription and a.confirmation_envoyee_le is null;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_log (organization_id, action, details)
    values (p_org, 'abonnement_confirmation_envoyee',
            jsonb_build_object('souscription', p_subscription, 'message', p_message,
                               'conditions_jointes_en_pdf', coalesce(p_piece_jointe, false)));
  end if;
  return v_n = 1;
end;
$$;

-- 9.6 La résiliation accusée (R04) : une fois par fin de période, quel que soit le chemin (action ou webhook).
create or replace function public.abonnement_resiliation_accusee(
  p_org uuid, p_subscription text, p_periode_fin timestamptz, p_message text, p_chemin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if p_periode_fin is null or p_chemin is null or p_chemin not in ('action', 'webhook') then
    raise exception 'Accusé de résiliation invalide';
  end if;
  if p_message is not null and (length(p_message) > 200 or p_message ~ '[[:space:]@]') then
    raise exception 'Identifiant de message invalide';
  end if;
  update public.abonnements a set resiliation_accusee_pour = p_periode_fin, updated_at = now()
   where a.organization_id = p_org and a.stripe_subscription_id = p_subscription
     and a.resiliation_accusee_pour is distinct from p_periode_fin;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_log (organization_id, action, details)
    values (p_org, 'abonnement_resiliation_accusee',
            jsonb_build_object('souscription', p_subscription, 'periode_fin', p_periode_fin,
                               'message', p_message, 'chemin', p_chemin));
  end if;
  return v_n = 1;
end;
$$;

-- 9.6 bis La résiliation levée (relecture adverse du 24/10, I3) : la marque de l'accusé s'efface, pour qu'une nouvelle
-- notification de la même échéance reçoive son propre accusé (D. 215-3). Appelée par l'action et par le webhook.
create or replace function public.abonnement_resiliation_levee(p_org uuid, p_subscription text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.abonnements a set resiliation_accusee_pour = null, updated_at = now()
   where a.organization_id = p_org and a.stripe_subscription_id = p_subscription and a.resiliation_accusee_pour is not null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- 9.7 La résiliation pour impayé notifiée (R07), avec les factures annulées.
create or replace function public.abonnement_resiliation_impaye_notifiee(
  p_org uuid, p_subscription text, p_message text, p_factures_annulees jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if p_message is not null and (length(p_message) > 200 or p_message ~ '[[:space:]@]') then
    raise exception 'Identifiant de message invalide';
  end if;
  if p_factures_annulees is null or jsonb_typeof(p_factures_annulees) <> 'array' or length(p_factures_annulees::text) > 4000 then
    raise exception 'Factures annulées invalides';
  end if;
  update public.abonnements a set resiliation_impaye_notifiee_le = clock_timestamp(), updated_at = now()
   where a.organization_id = p_org and a.stripe_subscription_id = p_subscription and a.resiliation_impaye_notifiee_le is null;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_log (organization_id, action, details)
    values (p_org, 'abonnement_resiliation_impaye_notifiee',
            jsonb_build_object('souscription', p_subscription, 'message', p_message, 'factures_annulees', p_factures_annulees));
  end if;
  return v_n = 1;
end;
$$;

-- 9.8 Les gestes de l'abonnement, inscrits au journal d'audit (liste fermée ; aucune coordonnée).
create or replace function public.abonnement_geste_consigner(p_org uuid, p_account uuid, p_action text, p_details jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_org is null or p_action is null
     or p_action not in ('abonnement_commande_confirmee', 'abonnement_resiliation_notifiee', 'abonnement_resiliation_levee') then
    raise exception 'Geste d''abonnement invalide';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 4000
     or p_details::text ~ '@' then
    raise exception 'Détails du geste invalides';
  end if;
  insert into public.audit_log (organization_id, account_id, action, details)
  values (p_org, p_account, p_action, p_details);
end;
$$;

-- ── 10. La rétractation ─────────────────────────────────────────────────────────────────────────────────────────────

-- 10.1 Ce que l'écran du responsable lit (droits : responsable de l'organisation, comme mon_abonnement).
-- Relecture adverse du 24/10 (point 3) : la demande de passage est datée par now() (microsecondes), la déclaration la
-- reçoit du navigateur (millisecondes) : les deux se comparent à la milliseconde.
drop function if exists public.ma_retractation(uuid);
create function public.ma_retractation(p_org uuid)
returns table (souscrit_le timestamptz, abonnement_suivi boolean, stripe_statut text, essai_fin date, periodicite text,
               periodicite_suivante text, passage_annuel_demande_le timestamptz, formule text, organisation text,
               destinataire text, retractation_abonnement_le timestamptz, retractation_passage_le timestamptz,
               retractation_passage_effectue boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.souscrit_le, a.stripe_subscription_id is not null, a.stripe_statut, o.essai_fin,
         coalesce(a.periodicite, 'mensuel'), a.periodicite_suivante, a.passage_annuel_demande_le, a.formule, o.name,
         public.destinataire_facturation(o.id),
         (select r.declaree_le from public.retractations_abonnement r
           where r.organization_id = o.id and r.subscription_id = a.stripe_subscription_id and r.nature = 'abonnement'
           limit 1),
         (select r.declaree_le from public.retractations_abonnement r
           where r.organization_id = o.id and r.subscription_id = a.stripe_subscription_id and r.nature = 'passage_annuel'
             and date_trunc('milliseconds', r.passage_demande_le) = date_trunc('milliseconds', a.passage_annuel_demande_le)
           limit 1),
         (select r.passage_effectue from public.retractations_abonnement r
           where r.organization_id = o.id and r.subscription_id = a.stripe_subscription_id and r.nature = 'passage_annuel'
             and date_trunc('milliseconds', r.passage_demande_le) = date_trunc('milliseconds', a.passage_annuel_demande_le)
           limit 1)
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;

-- 10.2 Enregistrer la déclaration : une seule par clé ; la première fixe la date, le texte et l'adresse de l'accusé
-- (rejouer rend la même ligne, telle qu'enregistrée, avec son exécution).
drop function if exists public.retractation_enregistrer(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz);
create function public.retractation_enregistrer(
  p_org uuid, p_subscription text, p_nature text, p_cle text, p_texte text, p_adresse text, p_account uuid,
  p_canal text, p_declaree_le timestamptz default null, p_passage_demande_le timestamptz default null)
returns table (id uuid, organization_id uuid, subscription_id text, nature text, cle text, passage_demande_le timestamptz,
               texte_declaration text, declaree_le timestamptz, adresse_accuse text, executee_le timestamptz,
               montant_rembourse_cents bigint, refunds jsonb, passage_effectue boolean, accuse_envoye_le timestamptz,
               nouvelle boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.retractations_abonnement;
  v_nouvelle boolean := false;
begin
  if p_org is null or p_subscription is null or p_cle is null or p_texte is null or p_adresse is null then
    raise exception 'Déclaration de rétractation incomplète';
  end if;
  if p_declaree_le is not null and (p_canal <> 'courriel' or p_declaree_le > clock_timestamp()) then
    raise exception 'Date de déclaration invalide';
  end if;
  if not exists (select 1 from public.abonnements a where a.organization_id = p_org and a.stripe_subscription_id = p_subscription) then
    raise exception 'Cette souscription n''est pas celle de l''organisation';
  end if;
  insert into public.retractations_abonnement as r
    (organization_id, subscription_id, nature, cle, passage_demande_le, texte_declaration, declaree_le, declaree_par,
     canal, adresse_accuse)
  values (p_org, p_subscription, p_nature, p_cle, p_passage_demande_le, btrim(p_texte),
          coalesce(p_declaree_le, date_trunc('second', clock_timestamp())), p_account, coalesce(p_canal, 'en_ligne'),
          btrim(p_adresse))
  on conflict (cle) do nothing
  returning * into v;
  if v.id is not null then
    v_nouvelle := true;
    insert into public.audit_log (organization_id, account_id, action, details)
    values (p_org, p_account, 'abonnement_retractation',
            jsonb_build_object('retractation', v.id, 'nature', v.nature, 'souscription', v.subscription_id,
                               'declaree_le', v.declaree_le, 'canal', v.canal));
  else
    select * into v from public.retractations_abonnement r where r.cle = p_cle;
    if v.organization_id <> p_org then raise exception 'Déclaration de rétractation incohérente'; end if;
  end if;
  return query select v.id, v.organization_id, v.subscription_id, v.nature, v.cle, v.passage_demande_le,
                      v.texte_declaration, v.declaree_le, v.adresse_accuse, v.executee_le, v.montant_rembourse_cents,
                      v.refunds, v.passage_effectue, v.accuse_envoye_le, v_nouvelle;
end;
$$;

-- 10.3 L'exécution : remboursements faits (montant total et références Stripe) et, pour un passage à l'annuel, s'il
-- était déjà effectué. Consignée UNE fois (relecture adverse du 24/10, point 5) : un second passage (rejeu, double
-- clic) ne l'écrase pas, il reçoit la ligne déjà consignée (`nouvelle` faux), que l'accusé reprend.
drop function if exists public.retractation_executee(uuid, bigint, jsonb);
create or replace function public.retractation_executee(
  p_id uuid, p_montant_cents bigint, p_refunds jsonb, p_passage_effectue boolean default null)
returns table (executee_le timestamptz, montant_rembourse_cents bigint, refunds jsonb, passage_effectue boolean,
               nouvelle boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.retractations_abonnement;
  v_nouvelle boolean := false;
begin
  if p_montant_cents is null or p_montant_cents < 0 or p_refunds is null or jsonb_typeof(p_refunds) <> 'array' then
    raise exception 'Exécution de rétractation invalide';
  end if;
  update public.retractations_abonnement r
     set executee_le = clock_timestamp(), montant_rembourse_cents = p_montant_cents, refunds = p_refunds,
         passage_effectue = case when r.nature = 'passage_annuel' then p_passage_effectue end
   where r.id = p_id and r.executee_le is null
  returning * into v;
  if v.id is not null then
    v_nouvelle := true;
  else
    select * into v from public.retractations_abonnement r where r.id = p_id;
    if v.id is null then raise exception 'Déclaration de rétractation introuvable'; end if;
  end if;
  return query select v.executee_le, v.montant_rembourse_cents, v.refunds, v.passage_effectue, v_nouvelle;
end;
$$;

-- 10.4 L'accusé de réception est parti.
create or replace function public.retractation_accuse_envoye(p_id uuid, p_message text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer; v_org uuid;
begin
  if p_message is not null and (length(p_message) > 200 or p_message ~ '[[:space:]@]') then
    raise exception 'Identifiant de message invalide';
  end if;
  update public.retractations_abonnement r set accuse_envoye_le = clock_timestamp()
   where r.id = p_id and r.accuse_envoye_le is null
  returning r.organization_id into v_org;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_retractation_accusee', jsonb_build_object('retractation', p_id, 'message', p_message));
  end if;
  return v_n = 1;
end;
$$;

-- 10.5 La rétractation d'un passage à l'annuel encore programmé : l'abonnement reste mensuel.
create or replace function public.retractation_passage_annuel_annuler(p_org uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.abonnements a
     set periodicite_suivante = null, changement_applique_pour = null, updated_at = now()
   where a.organization_id = p_org and a.periodicite = 'mensuel' and a.periodicite_suivante = 'annuel';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- 10.6 Les rétractations restées en chemin (relecture adverse du 24/10, I4) : enregistrées, mais dont l'exécution
-- chez Stripe ou l'accusé n'a pas abouti. La tâche de nuit les reprend et alerte le relais de celles qu'elle ne termine
-- pas. Les dix dernières minutes sont laissées à l'action en cours.
create or replace function public.retractations_a_terminer(p_limite integer default 20)
returns table (id uuid, organization_id uuid, subscription_id text, nature text, cle text, passage_demande_le timestamptz,
               texte_declaration text, declaree_le timestamptz, adresse_accuse text, executee_le timestamptz,
               montant_rembourse_cents bigint, refunds jsonb, passage_effectue boolean, accuse_envoye_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.organization_id, r.subscription_id, r.nature, r.cle, r.passage_demande_le, r.texte_declaration,
         r.declaree_le, r.adresse_accuse, r.executee_le, r.montant_rembourse_cents, r.refunds, r.passage_effectue,
         r.accuse_envoye_le
  from public.retractations_abonnement r
  where (r.executee_le is null or r.accuse_envoye_le is null)
    and r.declaree_le < now() - interval '10 minutes'
  order by r.declaree_le
  limit greatest(1, least(coalesce(p_limite, 20), 200));
$$;

revoke all on function public.abonnement_relance_consigner(uuid, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.abonnement_souscription_datee(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.abonnement_contexte_evenement(text) from public, anon, authenticated;
revoke all on function public.abonnement_courrier_contexte(uuid) from public, anon, authenticated;
revoke all on function public.abonnements_confirmation_dues(integer) from public, anon, authenticated;
revoke all on function public.abonnement_confirmation_envoyee(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.abonnement_resiliation_accusee(uuid, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.abonnement_resiliation_levee(uuid, text) from public, anon, authenticated;
revoke all on function public.abonnement_resiliation_impaye_notifiee(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.abonnement_geste_consigner(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.retractation_enregistrer(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.retractation_executee(uuid, bigint, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.retractations_a_terminer(integer) from public, anon, authenticated;
revoke all on function public.retractation_accuse_envoye(uuid, text) from public, anon, authenticated;
revoke all on function public.retractation_passage_annuel_annuler(uuid) from public, anon, authenticated;
revoke all on function public.retractations_abonnement_ajout_seul() from public, anon, authenticated;
revoke all on function public.ma_retractation(uuid) from public, anon;
grant execute on function public.abonnement_relance_consigner(uuid, integer, text, boolean) to service_role;
grant execute on function public.abonnement_souscription_datee(text, text, timestamptz) to service_role;
grant execute on function public.abonnement_contexte_evenement(text) to service_role;
grant execute on function public.abonnement_courrier_contexte(uuid) to service_role;
grant execute on function public.abonnements_confirmation_dues(integer) to service_role;
grant execute on function public.abonnement_confirmation_envoyee(uuid, text, text, boolean) to service_role;
grant execute on function public.abonnement_resiliation_accusee(uuid, text, timestamptz, text, text) to service_role;
grant execute on function public.abonnement_resiliation_levee(uuid, text) to service_role;
grant execute on function public.abonnement_resiliation_impaye_notifiee(uuid, text, text, jsonb) to service_role;
grant execute on function public.abonnement_geste_consigner(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.retractation_enregistrer(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.retractation_executee(uuid, bigint, jsonb, boolean) to service_role;
grant execute on function public.retractations_a_terminer(integer) to service_role;
grant execute on function public.retractation_accuse_envoye(uuid, text) to service_role;
grant execute on function public.retractation_passage_annuel_annuler(uuid) to service_role;
grant execute on function public.ma_retractation(uuid) to authenticated, service_role;

-- ── 11. Réclamations (R05) ──────────────────────────────────────────────────────────────────────────────────────────
do $reclamation$
declare
  d text;
  ancre text := $a$p_nature not in ('bug','idee','question','contestation')$a$;
  nouveau text := $n$p_nature not in ('bug','idee','question','contestation','reclamation')$n$;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.retours_utilisateurs'::regclass
                  and conname = 'retours_utilisateurs_nature_check' and pg_get_constraintdef(oid) like '%reclamation%') then
    alter table public.retours_utilisateurs drop constraint if exists retours_utilisateurs_nature_check;
    alter table public.retours_utilisateurs add constraint retours_utilisateurs_nature_check
      check (nature in ('bug', 'idee', 'question', 'contestation', 'reclamation'));
  end if;
  select pg_get_functiondef('public.soumettre_retour(uuid,text,text,text,text,text,uuid,text)'::regprocedure) into d;
  if strpos(d, nouveau) > 0 then
    return; -- déjà convertie
  end if;
  if (length(d) - length(replace(d, ancre, ''))) / length(ancre) <> 1 then
    raise exception 'soumettre_retour : définition inattendue (liste des natures absente ou multiple), aucune réécriture';
  end if;
  execute replace(d, ancre, nouveau);
end $reclamation$;

-- ── 12. Hors de la garde de lecture seule : la rétractation d'un compte gelé ────────────────────────────────────────
-- Insertion à compte exact en tête de la liste « jamais gardées » de poser_gardes_abonnement().
do $exclusion$
declare
  d text;
  ancre text := $a$v_jamais text[] := array['acces_pieces_log', 'audit_log',$a$;
  nouveau text := $n$v_jamais text[] := array['acces_pieces_log', 'audit_log',
                           -- Plan du 23/10/2026 (R01) : la rétractation reste ouverte à un compte gelé.
                           'retractations_abonnement',$n$;
begin
  select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
  if strpos(d, $q$'retractations_abonnement'$q$) > 0 then
    return;
  end if;
  if (length(d) - length(replace(d, ancre, ''))) / length(ancre) <> 1 then
    raise exception 'poser_gardes_abonnement : liste « jamais gardées » inattendue (ancre R01 absente ou multiple)';
  end if;
  execute replace(d, ancre, nouveau);
end $exclusion$;

-- ── 13. Contrôle : on s'arrête plutôt que de taire un droit de trop ou une conversion manquée ───────────────────────
do $controle$
declare f text;
begin
  if has_table_privilege('anon', 'public.retractations_abonnement', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('anon', 'public.retractations_abonnement', 'SELECT, INSERT, UPDATE, REFERENCES')
     or has_table_privilege('authenticated', 'public.retractations_abonnement', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('authenticated', 'public.retractations_abonnement', 'SELECT, INSERT, UPDATE, REFERENCES') then
    raise exception 'retractations_abonnement : anon ou authenticated garde un droit';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.retractations_abonnement'::regclass) then
    raise exception 'retractations_abonnement : la sécurité par ligne doit être activée';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.retractations_abonnement'::regclass
              and tgname = 'abonnement_retractations_abonnement') then
    raise exception 'retractations_abonnement : la garde de lecture seule ne doit pas s''y poser';
  end if;
  foreach f in array array['public.abonnement_relance_consigner(uuid,integer,text,boolean)',
                           'public.abonnement_souscription_datee(text,text,timestamp with time zone)',
                           'public.abonnement_contexte_evenement(text)',
                           'public.abonnement_courrier_contexte(uuid)',
                           'public.abonnements_confirmation_dues(integer)',
                           'public.abonnement_confirmation_envoyee(uuid,text,text,boolean)',
                           'public.abonnement_resiliation_accusee(uuid,text,timestamp with time zone,text,text)',
                           'public.abonnement_resiliation_levee(uuid,text)',
                           'public.abonnement_resiliation_impaye_notifiee(uuid,text,text,jsonb)',
                           'public.abonnement_geste_consigner(uuid,uuid,text,jsonb)',
                           'public.retractation_enregistrer(uuid,text,text,text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
                           'public.retractation_executee(uuid,bigint,jsonb,boolean)',
                           'public.retractations_a_terminer(integer)',
                           'public.retractation_accuse_envoye(uuid,text)',
                           'public.retractation_passage_annuel_annuler(uuid)',
                           'public.abonnements_a_relancer(integer)',
                           'public.abonnements_avis_reconduction_dus(integer)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% : exécution réservée à la clé de service', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.ma_retractation(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.ma_retractation(uuid)', 'EXECUTE') then
    raise exception 'ma_retractation : réservée aux comptes connectés (droits vérifiés dans la fonction)';
  end if;
  if strpos(pg_get_functiondef('public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)'::regprocedure),
            $q$when p_statut = 'unpaid' then v_statut_actuel$q$) = 0 then
    raise exception 'abonnement_appliquer : la branche « unpaid » manque';
  end if;
  if strpos(pg_get_functiondef('public.org_ecriture_ouverte(uuid)'::regprocedure), 'coalesce(a.relances_paiement, 0) < 1') = 0 then
    raise exception 'org_ecriture_ouverte : la condition des relances manque';
  end if;
  if strpos(pg_get_functiondef('public.demander_periodicite_suivante(uuid,text)'::regprocedure), 'passage_annuel_demande_le') = 0 then
    raise exception 'demander_periodicite_suivante : la date de la demande manque';
  end if;
  if strpos(pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure), $q$'retractations_abonnement'$q$) = 0 then
    raise exception 'poser_gardes_abonnement : retractations_abonnement absente de la liste « jamais gardées »';
  end if;
end $controle$;

select public.fermer_fonctions_a_anon();
