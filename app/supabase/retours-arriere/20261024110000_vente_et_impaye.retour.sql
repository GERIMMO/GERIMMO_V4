-- RETOUR ARRIÈRE de 20261024110000_vente_et_impaye.sql (plan de conformité du 23/10/2026, lots 1B et 1C).
-- Remettre D'ABORD le code précédent : le code de cette livraison appelle les fonctions retirées ici (confirmation,
-- accusés, rétractation, relances consignées) et lit les colonnes de `abonnements_a_relancer` ajoutées.
-- Instruction atomique (`do $retour_atomique$`) : participe à une transaction externe sans la valider ; verrou borné à
-- 10 s. Chaque réécriture par ancre exige un compte exact (sinon arrêt, rien n'est modifié) et accepte la forme d'avant
-- (rejeu sans effet).
--   · rend à `abonnement_appliquer`, `org_ecriture_ouverte` (et son commentaire), `demander_periodicite_suivante`,
--     `soumettre_retour` et `poser_gardes_abonnement` leur texte d'avant ;
--   · recrée `abonnements_a_relancer` (texte de 20261019120500) et `abonnements_avis_reconduction_dus` (texte de
--     20260929100000), droits : service_role seul ;
--   · retire les fonctions ajoutées ;
--   · supprime la table `retractations_abonnement` SEULEMENT si elle est vide (une déclaration de rétractation est une
--     preuve : décision du dirigeant requise) ; sinon la garde telle quelle et le dit ;
--   · repose la contrainte des natures de retours d'avant SEULEMENT si aucune réclamation n'est enregistrée ;
--   · CONSERVE les cinq colonnes ajoutées à `abonnements` (dates de souscription, de confirmation, d'accusés) ;
--   · supprime la version.
-- Cite le jour de Paris (abonnements_a_relancer) : dans la chaîne « Ordre complet », après les retours de 20261024140000,
-- 130000 et 120000, avant ceux de 20261024100000 et 090000, puis 20261023184512 ; donc avant le retour de
-- 20261019120500 et celui de 20261018231827.
do $retour_atomique$
declare
  d text;
  n bigint;
  ancre_appliquer text := $a$           else 'suspendue'::public.organization_status end
    -- Plan du 23/10 (R07) : un client qui a déjà payé garde son statut en « unpaid » comme en « past_due » ; la lecture
    -- seule vient de la date (J+15, org_ecriture_ouverte), la résiliation d'un geste humain, au plus tôt à J+30.
    when p_statut = 'unpaid' then v_statut_actuel
    when p_statut = 'past_due' then v_statut_actuel$a$;
  avant_appliquer text := $n$           else 'suspendue'::public.organization_status end
    when p_statut = 'past_due' then v_statut_actuel$n$;
  ancre_ecriture text := $a$
             -- Plan du 23/10 (R27) : jamais de lecture seule sans qu'un courrier de relance soit parti.
             or coalesce(a.relances_paiement, 0) < 1$a$;
  ancre_periodicite text := $a$
         -- Plan du 23/10 (R37) : la demande de passage du mensuel à l'annuel ouvre un nouveau délai de rétractation ;
         -- la redemander ne le rouvre pas, y renoncer avant l'échéance l'efface.
         passage_annuel_demande_le = case
           when periodicite = 'mensuel' and p_periodicite = 'annuel'
             then coalesce(case when periodicite_suivante = 'annuel' then passage_annuel_demande_le end, now())
           when periodicite = 'mensuel' then null
           else passage_annuel_demande_le end,$a$;
  ancre_retour text := $a$p_nature not in ('bug','idee','question','contestation','reclamation')$a$;
  avant_retour text := $n$p_nature not in ('bug','idee','question','contestation')$n$;
  ancre_gardes text := $a$
                           -- Plan du 23/10/2026 (R01) : la rétractation reste ouverte à un compte gelé.
                           'retractations_abonnement',$a$;
begin
  perform set_config('lock_timeout', '10s', true);

  -- abonnement_appliquer
  select pg_get_functiondef('public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)'::regprocedure) into d;
  if strpos(d, $q$when p_statut = 'unpaid' then v_statut_actuel$q$) > 0 then
    if (length(d) - length(replace(d, ancre_appliquer, ''))) / length(ancre_appliquer) <> 1 then
      raise exception 'abonnement_appliquer : forme inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancre_appliquer, avant_appliquer);
  end if;

  -- org_ecriture_ouverte
  select pg_get_functiondef('public.org_ecriture_ouverte(uuid)'::regprocedure) into d;
  if strpos(d, 'coalesce(a.relances_paiement, 0) < 1') > 0 then
    if (length(d) - length(replace(d, ancre_ecriture, ''))) / length(ancre_ecriture) <> 1 then
      raise exception 'org_ecriture_ouverte : forme inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancre_ecriture, '');
  end if;
  comment on function public.org_ecriture_ouverte(uuid) is
    'L''écriture est-elle ouverte ? Essai non expiré, ou compte actif dont le prélèvement n''est pas en défaut depuis quinze jours. Grille historique seulement : essai expiré sans rien à payer reste ouvert (24/09). Fermée, les données restent lisibles et exportables.';

  -- demander_periodicite_suivante
  select pg_get_functiondef('public.demander_periodicite_suivante(uuid,text)'::regprocedure) into d;
  if strpos(d, 'passage_annuel_demande_le') > 0 then
    if (length(d) - length(replace(d, ancre_periodicite, ''))) / length(ancre_periodicite) <> 1 then
      raise exception 'demander_periodicite_suivante : forme inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancre_periodicite, '');
  end if;

  -- soumettre_retour et la contrainte des natures
  select pg_get_functiondef('public.soumettre_retour(uuid,text,text,text,text,text,uuid,text)'::regprocedure) into d;
  if strpos(d, ancre_retour) > 0 then
    if (length(d) - length(replace(d, ancre_retour, ''))) / length(ancre_retour) <> 1 then
      raise exception 'soumettre_retour : forme inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancre_retour, avant_retour);
  end if;
  select count(*) into n from public.retours_utilisateurs where nature = 'reclamation';
  if n = 0 then
    alter table public.retours_utilisateurs drop constraint if exists retours_utilisateurs_nature_check;
    alter table public.retours_utilisateurs add constraint retours_utilisateurs_nature_check
      check (nature in ('bug', 'idee', 'question', 'contestation'));
  else
    raise notice 'retours_utilisateurs : % réclamation(s) enregistrée(s) ; la contrainte qui les admet est conservée.', n;
  end if;

  -- poser_gardes_abonnement : la liste « jamais gardées » d'avant
  select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
  if strpos(d, $q$'retractations_abonnement'$q$) > 0 then
    if (length(d) - length(replace(d, ancre_gardes, ''))) / length(ancre_gardes) <> 1 then
      raise exception 'poser_gardes_abonnement : forme inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancre_gardes, '');
  end if;

  -- abonnements_a_relancer : le texte de 20261019120500
  drop function if exists public.abonnements_a_relancer(integer);
  execute $relancer$
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
  montant_periode_cents bigint  -- le montant du prélèvement, en centimes
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
    case when a.periodicite = 'mensuel' then coalesce(a.montant_periode_cents, a.montant_mensuel_cents) else a.montant_periode_cents end
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  cross join delai d
  cross join lateral (
    select a.relances_paiement::smallint as palier
  ) v
  where a.paiement_en_defaut_depuis is not null
    and o.status not in ('archivee', 'suspendue')
    -- Le palier suivant n'est dû qu'à partir de son jour. Le premier (l'alerte)
    -- l'est immédiatement : c'est précisément son intérêt.
    and (public.aujourdhui_paris() - a.paiement_en_defaut_depuis) >= case a.relances_paiement
          when 0 then 0
          when 1 then 7
          when 2 then d.j - 1
          when 3 then d.j
          else 99999 end
    -- Jamais deux courriers le même jour, quoi qu'il arrive : une tâche rejouée
    -- ne doit pas doubler l'envoi.
    and (a.derniere_relance_le is null or a.derniere_relance_le < public.aujourdhui_paris())
  order by a.paiement_en_defaut_depuis
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$
$relancer$;
  comment on function public.abonnements_a_relancer(integer) is
    'Les organisations dont un courrier de relance de paiement est dû aujourd''hui, avec son palier (0 alerte, 1 rappel, 2 avis, 3 constat de lecture seule), la périodicité et le montant de la période prélevée.';
  revoke execute on function public.abonnements_a_relancer(integer) from public, anon, authenticated;
  grant execute on function public.abonnements_a_relancer(integer) to service_role;

  -- abonnements_avis_reconduction_dus : le texte de 20260929100000
  drop function if exists public.abonnements_avis_reconduction_dus(integer);
  execute $avis$
create function public.abonnements_avis_reconduction_dus(p_limite integer default 200)
returns table (organization_id uuid, organisation text, destinataire text,
               periode_fin timestamptz, montant_periode_cents bigint, formule text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, public.destinataire_facturation(o.id),
         a.periode_fin, a.montant_periode_cents, a.formule
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where o.type = 'proprietaire_direct'
    and o.status <> 'archivee'
    and a.stripe_subscription_id is not null
    and a.stripe_statut in ('active', 'trialing', 'past_due')
    and not coalesce(a.annulation_demandee, false)
    and a.periodicite = 'annuel'
    and a.periode_fin is not null
    and a.periode_fin >= now() + interval '30 days'
    and a.periode_fin <= now() + interval '90 days'
    and a.avis_reconduction_periode_fin is distinct from (a.periode_fin at time zone 'Europe/Paris')::date
  order by a.periode_fin
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$
$avis$;
  revoke execute on function public.abonnements_avis_reconduction_dus(integer) from public, anon, authenticated;
  grant execute on function public.abonnements_avis_reconduction_dus(integer) to service_role;

  -- Les fonctions ajoutées
  drop function if exists public.abonnement_relance_consigner(uuid, integer, text, boolean);
  drop function if exists public.abonnement_souscription_datee(text, text, timestamptz);
  drop function if exists public.abonnement_contexte_evenement(text);
  drop function if exists public.abonnement_courrier_contexte(uuid);
  drop function if exists public.abonnements_confirmation_dues(integer);
  drop function if exists public.abonnement_confirmation_envoyee(uuid, text, text, boolean);
  drop function if exists public.abonnement_resiliation_accusee(uuid, text, timestamptz, text, text);
  drop function if exists public.abonnement_resiliation_impaye_notifiee(uuid, text, text, jsonb);
  drop function if exists public.abonnement_geste_consigner(uuid, uuid, text, jsonb);
  drop function if exists public.ma_retractation(uuid);
  drop function if exists public.retractation_enregistrer(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz);
  drop function if exists public.retractation_executee(uuid, bigint, jsonb);
  drop function if exists public.retractation_executee(uuid, bigint, jsonb, boolean);
  drop function if exists public.retractations_a_terminer(integer);
  drop function if exists public.abonnement_resiliation_levee(uuid, text);
  drop function if exists public.retractation_accuse_envoye(uuid, text);
  drop function if exists public.retractation_passage_annuel_annuler(uuid);

  -- La table des rétractations : supprimée si elle est vide, conservée sinon (preuves).
  if to_regclass('public.retractations_abonnement') is not null then
    select count(*) into n from public.retractations_abonnement;
    if n = 0 then
      drop table public.retractations_abonnement;
      drop function if exists public.retractations_abonnement_ajout_seul();
    else
      raise notice 'retractations_abonnement : % déclaration(s) enregistrée(s) ; table conservée (décision du dirigeant requise).', n;
    end if;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261024110000';
  end if;
end;
$retour_atomique$;
