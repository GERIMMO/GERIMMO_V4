-- L'appel de loyer part au locataire.
--
-- LE DERNIER MAILLON MUET. Depuis le cycle mensuel automatique, l'appel se
-- crée seul le 1er du mois, et depuis le 11/09 la quittance s'envoie seule une
-- fois le terme encaissé. Entre les deux, rien : l'appel existait dans l'espace
-- du locataire, et personne ne le lui disait. Le locataire qui ne se connecte
-- pas découvrait sa dette à la relance. Le référentiel (module 3) veut l'appel
-- « émis par tâche planifiée au jour paramétré […] envoyé au locataire » : cette
-- migration lui donne les deux fonctions qui manquaient pour cela.
--
-- POURQUOI CE N'EST PAS AUTOMATIQUE PAR DÉFAUT. Même raison que pour la
-- quittance, plus une : les adresses e-mail d'un parc repris valent ce que vaut
-- l'import. Cocher la case est un geste de l'agence, qui dit « mes adresses
-- sont bonnes, écrivez en mon nom ». Tant qu'elle ne l'a pas fait, rien ne part
-- et rien ne change pour elle. Les deux réglages sont distincts : une agence
-- peut vouloir annoncer les échéances sans déléguer la validation des
-- quittances, qui sont, elles, des actes libératoires.
--
-- CE QUI N'EST PAS RATTRAPÉ, ET CE QUI N'EST PAS RÉCLAMÉ. Seuls les appels
-- créés dans les 45 derniers jours partent : cocher la case n'envoie pas
-- l'arriéré de deux ans. Et un appel DÉJÀ SOLDÉ ne part jamais — réclamer un
-- loyer payé est la faute qu'aucune explication ne rattrape. C'est
-- `etat_loyers_bail_brut` qui tranche, la même vue que l'échéancier de l'écran
-- et que l'alerte d'impayé : trois voix, un seul calcul.

alter table public.appels_loyer
  add column if not exists email_envoye_at timestamptz;
comment on column public.appels_loyer.email_envoye_at is
  'Date d''envoi de l''avis d''échéance au locataire. Nul tant qu''il n''est pas parti ; posé une seule fois.';

-- Les candidats sont rares au milieu de l'historique : l'index ne porte que sur
-- eux.
create index if not exists appels_loyer_a_envoyer_idx
  on public.appels_loyer (created_at)
  where email_envoye_at is null;

alter table public.organizations
  add column if not exists appels_envoi_auto boolean not null default false;
comment on column public.organizations.appels_envoi_auto is
  'L''agence a donné son accord permanent pour que l''avis d''échéance parte au locataire à la création de l''appel. Faux par défaut.';

-- ── Ce que la tâche d'envoi a le droit de voir ─────────────────────────────
create or replace function public.appels_a_envoyer(p_limite integer default 200)
returns table (
  appel_id uuid,
  organization_id uuid,
  bail_id uuid,
  destinataire text,
  prenom text,
  emetteur text,
  periode date,
  loyer_hc numeric,
  charges numeric,
  montant_du numeric,
  reste_du numeric,
  date_echeance date,
  prorata boolean,
  arriere numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin. Un compte d'agence n'a rien à faire ici : la fonction traverse
  -- TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appels_a_envoyer: reserve a la tache d''envoi';
  end if;

  return query
  select a.id, a.organization_id, a.bail_id,
         loc.email, loc.prenom, o.name,
         a.periode, a.loyer_hc, a.charges, a.montant_du,
         etat.reste_appel, a.date_echeance, a.prorata, etat.arriere
  from public.appels_loyer a
  join public.baux b on b.id = a.bail_id
  join public.organizations o on o.id = a.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  -- Un seul parcours de l'échéancier du bail par appel candidat : ce qui reste
  -- dû sur CET appel, et ce qui traînait sur les termes antérieurs. Le second
  -- n'est pas de la décoration : un avis qui tait une dette en cours laisse
  -- croire au locataire qu'il est à jour dès qu'il aura payé le mois.
  join lateral (
    select
      coalesce(max(e.montant_du - e.montant_couvert)
               filter (where e.appel_id = a.id), 0) as reste_appel,
      coalesce(sum(e.montant_du - e.montant_couvert)
               filter (where e.periode < a.periode
                         and e.montant_du > e.montant_couvert), 0) as arriere
    from public.etat_loyers_bail_brut(a.bail_id) e
  ) etat on true
  where a.email_envoye_at is null
    and o.appels_envoi_auto
    -- Une organisation suspendue n'écrit plus en son nom.
    and public.org_ecriture_ouverte(a.organization_id)
    and loc.email is not null and length(btrim(loc.email)) > 0
    -- Pas d'arriéré d'envoi : cocher la case n'expédie pas l'historique.
    and a.created_at >= now() - interval '45 days'
    -- Et surtout : jamais un appel déjà soldé.
    and etat.reste_appel > 0
  order by a.date_echeance, a.id
  limit greatest(1, least(p_limite, 500));
end;
$$;
comment on function public.appels_a_envoyer(integer) is
  'Les avis d''échéance à envoyer : appels non encore envoyés, non soldés, des organisations qui ont donné leur accord. Réservée à la tâche planifiée.';
revoke execute on function public.appels_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.appels_a_envoyer(integer) to service_role;

-- ── Et ce qu'elle a le droit d'écrire : une date, sur un appel ─────────────
create or replace function public.marquer_appel_envoye(p_appel uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'marquer_appel_envoye: reserve a la tache d''envoi';
  end if;
  -- Le marquage ne se pose que sur un appel ENCORE non envoyé : si deux
  -- passages se chevauchent, le second ne réécrit pas la date du premier.
  update public.appels_loyer
     set email_envoye_at = now()
   where id = p_appel and email_envoye_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
comment on function public.marquer_appel_envoye(uuid) is
  'Pose la date d''envoi d''un avis d''échéance. Réservée à la tâche planifiée.';
revoke execute on function public.marquer_appel_envoye(uuid) from public, anon, authenticated;
grant execute on function public.marquer_appel_envoye(uuid) to service_role;

-- Le verrou d'abonnement se repose : il énumère les tables d'organisation, et
-- une colonne ajoutée ne doit pas laisser passer une écriture en lecture seule.
select public.poser_gardes_abonnement();
