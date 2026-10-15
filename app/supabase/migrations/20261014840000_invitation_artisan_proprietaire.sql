-- Invitation d'un artisan par un propriétaire direct (décision du dirigeant du 15/10/2026, qui remplace la question
-- D17-B) : « L'artisan doit pouvoir être invité par un propriétaire, ce sera à l'artisan de s'inscrire. »
--
-- Parcours retenu :
--   1. le PROPRIÉTAIRE DIRECT (membre `proprietaire_direct` actif d'une organisation de type `proprietaire_direct`)
--      invite un artisan par son ADRESSE E-MAIL ;
--   2. l'ARTISAN crée lui-même son compte, inscrit son entreprise (SIRET, métiers, zones) et dépose ses attestations
--      (parcours d'inscription existant, inchangé) ;
--   3. GERIMMO (super administrateur, écran /admin/artisans) le valide avant toute intervention : la barrière
--      `artisan_affectable` n'est pas touchée ;
--   4. une fois l'invitation ACCEPTÉE par l'artisan (jamais sans son geste), il est rattaché au carnet du propriétaire
--      (`artisan_agences`) et peut être sollicité par lui même si la commune du bien est fermée au réseau : c'est la
--      règle du carnet personnel déjà en place (`reseau_contact_personnel`, `reseau_contact_dans_zone`, non modifiées),
--      qui exige toujours que la zone de l'artisan couvre le code postal du bien.
--
-- Ce que cette migration ajoute (et rien d'autre) :
--   · la table `invitations_artisans`, fermée par défaut (RLS active, aucune politique, aucun droit pour `anon` ni
--     `authenticated`) : on n'y accède que par les fonctions ci-dessous ;
--   · huit fonctions SECURITY DEFINER à search_path vide, chacune avec ses droits explicites, et quatre fonctions
--     internes qu'aucun rôle client ne peut appeler (`invitation_artisan_par_proprietaire`, et pour les limites
--     anti-abus `adresse_canonique_invitation_artisan`, `autoriser_invitation_artisan_cle`,
--     `limiter_envoi_invitation_artisan`).
-- Aucune fonction existante n'est modifiée ; aucune ligne existante n'est réécrite. L'ajout d'un artisan par SIRET
-- reste réservé aux agences (`artisan_creer_ou_rattacher` refuse toujours les propriétaires directs) : l'invitation
-- est une porte distincte. La table `public.invitations` (20260903205742, avec jeton) n'est pas réutilisée : elle
-- ouvre une ADHÉSION à une organisation, ce qu'une invitation d'artisan ne doit jamais faire, et aucun code ne s'en sert.
--
-- Modèle suivi : l'invitation du locataire (20261013101000, 104000, 106000, 107000) — mêmes états, expiration à
-- 30 jours, envoi noté, acceptation par la seule session dont l'ADRESSE CONFIRMÉE est celle de l'invitation.
-- Limites anti-abus en base, comptées AVANT chaque envoi (invitation et renvoi), dans la table des demandes de lien
-- (`demandes_lien_mot_de_passe`, clés conservées sous forme d'empreinte, purgées après une journée) :
--   · 30 invitations par organisation et par heure, sur la MÊME clé que les invitations de locataires
--     (`organisation:<uuid>`, src/lib/lien-mot-de-passe.ts) : le budget d'une organisation est commun ;
--   · 50 invitations d'artisans par organisation et par 24 heures ;
--   · 50 invitations d'artisans par compte qui invite et par 24 heures, quel que soit son espace (un compte peut quitter
--     son espace propriétaire et en ouvrir un autre) ;
--   · 3 envois par adresse et par heure, 5 par 24 heures, toutes organisations confondues : une adresse ne devient pas la
--     cible d'une rafale. L'adresse est ramenée à sa BOÎTE (relecture du 15/10) : sans « +étiquette », sans point final,
--     et sans les points de la partie locale pour gmail.com et googlemail.com (une même boîte) ; sinon, cible+1@…,
--     c.ible@gmail.com ou « cible@gmail.com. » passaient chacune pour une adresse neuve.
--
-- Rejouable sans effet : `if not exists` pour la table et les index, `create or replace` pour les fonctions (toutes
-- nouvelles : il n'y a pas de définition antérieure à relire), déclencheurs reposés à l'identique.
-- Retour arrière : app/supabase/retours-arriere/20261014840000_invitation_artisan_proprietaire.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

create table if not exists public.invitations_artisans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  -- Normalisée en minuscules, sans espace autour : c'est elle que l'adresse confirmée du compte doit égaler.
  email text not null
    constraint invitations_artisans_email_normalisee check (
      email = lower(btrim(email)) and length(email) between 6 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  -- Pour mémoire seulement (ce que le propriétaire a noté) : jamais montré à l'artisan, jamais copié sur sa fiche.
  nom_memo text constraint invitations_artisans_nom_memo_borne check (nom_memo is null or length(nom_memo) between 1 and 120),
  metier_memo public.artisan_metier,
  etat text not null default 'en_attente'
    constraint invitations_artisans_etat_check check (etat in ('en_attente', 'acceptee', 'refusee', 'annulee', 'expiree')),
  cree_par uuid not null references public.accounts(id),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default (now() + interval '30 days'),
  envoye_le timestamptz,
  erreur_envoi boolean not null default false,
  repondu_le timestamptz,
  -- L'artisan rattaché à l'acceptation (NULL avant). Une fiche purgée ne doit pas être retenue par une invitation.
  artisan_id uuid references public.artisans(id) on delete set null
);

comment on table public.invitations_artisans is
  'Invitations d''artisans envoyées par un propriétaire direct (décision du 15/10/2026). Fermée : accès par les fonctions preparer_, renvoyer_, annuler_, noter_envoi_, repondre_invitation_artisan, mon_invitation_artisan, carnet_artisans_proprietaire, invitations_des_artisans_a_valider.';

-- Une seule invitation en attente par organisation et par adresse.
create unique index if not exists invitations_artisans_une_en_attente
  on public.invitations_artisans (organization_id, email) where etat = 'en_attente';
-- Index couvrant de chaque clé étrangère (tests/schema-performance-securite.test.ts).
create index if not exists invitations_artisans_organisation
  on public.invitations_artisans (organization_id, email, cree_le desc);
create index if not exists invitations_artisans_auteur on public.invitations_artisans (cree_par);
create index if not exists invitations_artisans_artisan on public.invitations_artisans (artisan_id);

alter table public.invitations_artisans enable row level security;
revoke all on public.invitations_artisans from public, anon, authenticated;

-- Les mêmes gardes que toute table d'organisation : abonnement suspendu (aucune nouvelle saisie du gérant) et
-- session de diagnostic d'un artisan par la supervision (lecture seule).
drop trigger if exists abonnement_invitations_artisans on public.invitations_artisans;
create trigger abonnement_invitations_artisans before insert or update or delete on public.invitations_artisans
  for each row execute function public.refuser_ecriture_si_fermee();
drop trigger if exists diagnostic_artisan_lecture on public.invitations_artisans;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.invitations_artisans
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- Qui peut inviter : le propriétaire de l'organisation, et lui seul. Ni une agence (elle a son ajout par SIRET), ni
-- un agent, ni un locataire, ni un artisan, ni un compte sans organisation, ni la supervision (qui n'est pas membre :
-- elle ne parle pas au nom du propriétaire à un tiers). Fonction interne : aucun rôle client ne l'appelle.
create or replace function public.invitation_artisan_par_proprietaire(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and p_org is not null and exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.account_id = (select auth.uid())
      and m.organization_id = p_org
      and m.status = 'active'
      and m.role = 'proprietaire_direct'
      and o.type = 'proprietaire_direct');
$$;
revoke all on function public.invitation_artisan_par_proprietaire(uuid) from public, anon, authenticated;

-- Limites anti-abus (voir l'en-tête). Trois fonctions internes : aucun rôle client ne les appelle.
-- La boîte d'une adresse, pour la limite seulement (l'invitation part à l'adresse saisie, telle quelle).
create or replace function public.adresse_canonique_invitation_artisan(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when d.domaine in ('gmail.com', 'googlemail.com')
              then replace(d.locale, '.', '') || '@gmail.com'
              else d.locale || '@' || d.domaine end
  from (select regexp_replace(split_part(a.adresse, '@', 1), '[+].*$', '') as locale,
               regexp_replace(split_part(a.adresse, '@', 2), '[.]+$', '') as domaine
          from (select lower(btrim(coalesce(p_email, ''))) as adresse) a) d;
$$;
revoke all on function public.adresse_canonique_invitation_artisan(text) from public, anon, authenticated;

-- Une clé, plafonnée par heure ET par 24 heures. Rend NULL si l'envoi passe (il est alors compté), sinon 'heure' ou
-- 'jour'. Le décompte de l'heure et l'écriture sont ceux de `autoriser_lien_mot_de_passe_cle` ; celui du jour se fait
-- sous le même verrou, sur la même empreinte.
create or replace function public.autoriser_invitation_artisan_cle(p_cle text, p_max_heure integer, p_max_jour integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_empreinte text := encode(sha256(convert_to('cle:' || btrim(coalesce(p_cle, '')), 'UTF8')), 'hex');
begin
  perform pg_advisory_xact_lock(hashtext('lien_mot_de_passe:' || v_empreinte));
  if (select count(*) from public.demandes_lien_mot_de_passe
       where empreinte_email = v_empreinte and cree_le > now() - interval '1 day') >= p_max_jour then
    return 'jour';
  end if;
  if not public.autoriser_lien_mot_de_passe_cle(p_cle, p_max_heure) then
    return 'heure';
  end if;
  return null;
end $$;
revoke all on function public.autoriser_invitation_artisan_cle(text, integer, integer) from public, anon, authenticated;

-- Toutes les limites d'un envoi (invitation ou renvoi), dans l'ordre : organisation, compte, adresse. Un refus lève
-- l'erreur affichée au propriétaire ; la transaction annulée ne compte rien.
create or replace function public.limiter_envoi_invitation_artisan(p_org uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_refus text;
begin
  if not public.autoriser_lien_mot_de_passe_cle('organisation:' || p_org::text, 30) then
    raise exception 'Trop d’invitations envoyées par cette organisation en une heure. Réessayez plus tard';
  end if;
  if public.autoriser_invitation_artisan_cle('invitation-artisan-organisation:' || p_org::text, 50, 50) is not null then
    raise exception 'Trop d’invitations envoyées par cette organisation en 24 heures. Réessayez plus tard';
  end if;
  if public.autoriser_invitation_artisan_cle('invitation-artisan-compte:' || (select auth.uid())::text, 50, 50) is not null then
    raise exception 'Trop d’invitations envoyées depuis votre compte en 24 heures. Réessayez plus tard';
  end if;
  v_refus := public.autoriser_invitation_artisan_cle(
    'invitation-artisan:' || public.adresse_canonique_invitation_artisan(p_email), 3, 5);
  if v_refus = 'jour' then
    raise exception 'Trop d’invitations envoyées à cette adresse en 24 heures. Réessayez plus tard';
  elsif v_refus = 'heure' then
    raise exception 'Trop d’invitations envoyées à cette adresse en une heure. Réessayez plus tard';
  end if;
end $$;
revoke all on function public.limiter_envoi_invitation_artisan(uuid, text) from public, anon, authenticated;

-- 1. Inviter. Rend de quoi écrire l'e-mail : l'identifiant, l'adresse, le nom de l'organisation, l'échéance.
create or replace function public.preparer_invitation_artisan(
  p_org uuid, p_email text, p_nom text default null, p_metier public.artisan_metier default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  v_org text;
  i public.invitations_artisans%rowtype;
begin
  if not public.invitation_artisan_par_proprietaire(p_org) then
    raise exception 'Accès refusé';
  end if;
  if not public.org_ecriture_ouverte(p_org) then
    raise exception 'Cette organisation ne peut pas envoyer de nouvelles invitations';
  end if;
  if length(v_email) not between 6 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Indiquez une adresse e-mail valide';
  end if;
  if v_nom is not null and length(v_nom) > 120 then
    raise exception 'Le nom pour mémoire compte 120 caractères au plus';
  end if;

  -- Deux envois simultanés vers la même adresse ne créent pas deux invitations.
  perform pg_advisory_xact_lock(hashtextextended('invitation-artisan:' || p_org::text || ':' || v_email, 0));

  -- Une invitation en attente arrivée à échéance devient « expirée » : elle ne bloque pas la nouvelle.
  update public.invitations_artisans set etat = 'expiree', repondu_le = now()
   where organization_id = p_org and email = v_email and etat = 'en_attente' and expire_le <= now();

  if exists (select 1 from public.invitations_artisans
              where organization_id = p_org and email = v_email and etat = 'en_attente') then
    raise exception 'Une invitation est déjà en attente pour cette adresse. Utilisez « Renvoyer » dans votre carnet';
  end if;
  if exists (select 1 from public.invitations_artisans ia
               join public.artisan_agences aa on aa.organization_id = ia.organization_id and aa.artisan_id = ia.artisan_id
              where ia.organization_id = p_org and ia.email = v_email and ia.etat = 'acceptee'
                and aa.statut = 'actif' and aa.blacklist_le is null) then
    raise exception 'Cet artisan a déjà accepté votre invitation : il est dans votre carnet';
  end if;

  -- Limites anti-abus (voir l'en-tête) : comptées avant l'envoi, annulées avec la transaction si l'invitation échoue.
  perform public.limiter_envoi_invitation_artisan(p_org, v_email);

  insert into public.invitations_artisans (organization_id, email, nom_memo, metier_memo, cree_par)
  values (p_org, v_email, v_nom, p_metier, (select auth.uid()))
  returning * into i;
  -- La trace ne porte pas l'adresse : l'identifiant de l'invitation suffit à la retrouver.
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'invitation_artisan',
          jsonb_build_object('invitation', i.id, 'expire_le', i.expire_le));

  select o.name into v_org from public.organizations o where o.id = p_org;
  return jsonb_build_object('id', i.id, 'email', i.email, 'organisation', v_org, 'expire_le', i.expire_le);
end $$;

-- 2. Renvoyer le même lien (l'échéance ne bouge pas). Une invitation arrivée à échéance est notée « expirée » et le
-- dit : on en envoie alors une nouvelle.
create or replace function public.renvoyer_invitation_artisan(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.invitations_artisans%rowtype; v_org text;
begin
  select * into i from public.invitations_artisans where id = p_id for update;
  if not found or not public.invitation_artisan_par_proprietaire(i.organization_id) then
    raise exception 'Accès refusé';
  end if;
  if not public.org_ecriture_ouverte(i.organization_id) then
    raise exception 'Cette organisation ne peut pas envoyer de nouvelles invitations';
  end if;
  if i.etat = 'en_attente' and i.expire_le <= now() then
    update public.invitations_artisans set etat = 'expiree', repondu_le = now() where id = p_id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), i.organization_id, 'invitation_artisan_expiree', jsonb_build_object('invitation', p_id));
    return jsonb_build_object('etat', 'expiree',
      'erreur', 'Cette invitation a expiré. Invitez de nouveau cet artisan.');
  end if;
  if i.etat <> 'en_attente' then
    raise exception 'Cette invitation n’est plus en attente : elle ne peut pas être renvoyée';
  end if;
  perform public.limiter_envoi_invitation_artisan(i.organization_id, i.email);
  select o.name into v_org from public.organizations o where o.id = i.organization_id;
  return jsonb_build_object('id', i.id, 'email', i.email, 'organisation', v_org, 'expire_le', i.expire_le, 'etat', 'en_attente');
end $$;

-- 3. Annuler. Jamais une invitation déjà acceptée, refusée ou expirée : on ne dit pas « annulée » après une réponse.
create or replace function public.annuler_invitation_artisan(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invitations_artisans%rowtype;
begin
  select * into i from public.invitations_artisans where id = p_id for update;
  if not found or not public.invitation_artisan_par_proprietaire(i.organization_id) then
    raise exception 'Accès refusé';
  end if;
  if i.etat = 'annulee' then return; end if;
  if i.etat = 'acceptee' then raise exception 'Cette invitation a déjà été acceptée : l’artisan est dans votre carnet'; end if;
  if i.etat = 'refusee' then raise exception 'Cette invitation a déjà été refusée par l’artisan'; end if;
  if i.etat = 'expiree' or i.expire_le <= now() then raise exception 'Cette invitation a expiré : elle ne peut plus être acceptée'; end if;
  update public.invitations_artisans set etat = 'annulee', repondu_le = now() where id = p_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), i.organization_id, 'invitation_artisan_annulee', jsonb_build_object('invitation', p_id));
end $$;

-- 4. Noter l'issue de l'envoi de l'e-mail (parti, ou non).
create or replace function public.noter_envoi_invitation_artisan(p_id uuid, p_envoye boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invitations_artisans%rowtype;
begin
  select * into i from public.invitations_artisans where id = p_id for update;
  if not found or not public.invitation_artisan_par_proprietaire(i.organization_id) then
    raise exception 'Accès refusé';
  end if;
  if i.etat <> 'en_attente' then return; end if;
  update public.invitations_artisans
     set envoye_le = case when p_envoye then now() else envoye_le end,
         erreur_envoi = not coalesce(p_envoye, false)
   where id = p_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), i.organization_id,
          case when p_envoye then 'invitation_artisan_envoyee' else 'invitation_artisan_envoi_echec' end,
          jsonb_build_object('invitation', p_id));
end $$;

-- 5. Le carnet du propriétaire : les artisans rattachés (artisan_agences) et ses invitations, la plus récente par
-- adresse. Les données de l'artisan (raison sociale, téléphone, métiers, zones) n'apparaissent qu'une fois la relation
-- établie, c'est-à-dire après son acceptation ; avant, seulement ce que le propriétaire a lui-même saisi.
-- Une fois la relation établie, la règle de lecture existante (`artisan_lisible`, commune aux agences) lui ouvre aussi
-- toute la fiche de l'artisan (SIRET, e-mail, état de l'inscription et motifs) : la page d'invitation le dit à l'artisan
-- avant qu'il accepte (VISIBLE_APRES_ACCEPTATION, src/lib/invitations-artisan.ts).
-- La supervision lit (traversée d'un espace client), elle n'invite pas.
create or replace function public.carnet_artisans_proprietaire(p_org uuid)
returns table(
  invitation_id uuid, email text, nom_memo text, metier_memo public.artisan_metier, etat_invitation text,
  invite_le timestamptz, envoye_le timestamptz, erreur_envoi boolean, expire_le timestamptz, repondu_le timestamptz,
  artisan_id uuid, raison_sociale text, telephone text, statut_plateforme public.artisan_statut_plateforme,
  sollicitable_plateforme boolean, relation_statut public.artisan_relation_statut, liste_noire boolean,
  metiers text[], codes_postaux text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_org is null
     or not (p_org in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[])))
     or not exists (select 1 from public.organizations o where o.id = p_org and o.type = 'proprietaire_direct') then
    raise exception 'Accès refusé';
  end if;
  return query
  select * from (
    select inv.id as invitation_id, inv.email as email, inv.nom_memo as nom_memo, inv.metier_memo as metier_memo,
           case when inv.id is null then null::text else 'acceptee'::text end as etat_invitation,
           inv.cree_le as invite_le, inv.envoye_le as envoye_le, coalesce(inv.erreur_envoi, false) as erreur_envoi,
           inv.expire_le as expire_le, inv.repondu_le as repondu_le,
           a.id as artisan_id, a.raison_sociale as raison_sociale, a.telephone as telephone,
           a.statut_plateforme as statut_plateforme,
           (a.statut_plateforme = 'valide' and a.siret_etat = 'verifie' and a.blacklist_globale_le is null) as sollicitable_plateforme,
           aa.statut as relation_statut, aa.blacklist_le is not null as liste_noire,
           (select array_agg(m.metier::text order by m.metier) from public.artisan_metiers m where m.artisan_id = a.id) as metiers,
           (select array_agg(z.code_postal order by z.code_postal) from public.artisan_zones z where z.artisan_id = a.id) as codes_postaux
    from public.artisan_agences aa
    join public.artisans a on a.id = aa.artisan_id
    left join lateral (
      select i.* from public.invitations_artisans i
       where i.organization_id = aa.organization_id and i.artisan_id = aa.artisan_id and i.etat = 'acceptee'
       order by i.repondu_le desc nulls last, i.cree_le desc limit 1) inv on true
    where aa.organization_id = p_org
    union all
    select d.id, d.email, d.nom_memo, d.metier_memo,
           case when d.etat = 'en_attente' and d.expire_le <= now() then 'expiree' else d.etat end,
           d.cree_le, d.envoye_le, d.erreur_envoi, d.expire_le, d.repondu_le,
           null::uuid, null::text, null::text, null::public.artisan_statut_plateforme, null::boolean,
           null::public.artisan_relation_statut, null::boolean, null::text[], null::text[]
    from (select distinct on (i.email) i.* from public.invitations_artisans i
           where i.organization_id = p_org order by i.email, i.cree_le desc) d
    where not (d.etat = 'acceptee' and exists (
      select 1 from public.artisan_agences aa2 where aa2.organization_id = p_org and aa2.artisan_id = d.artisan_id))
  ) lignes
  order by (lignes.artisan_id is null), lignes.raison_sociale, lignes.invite_le desc;
end $$;

-- 6. Ce que l'artisan connecté voit de SON invitation : rien, si l'adresse confirmée de sa session n'est pas celle
-- de l'invitation (aucun indice sur l'organisation ni sur l'adresse invitée).
create or replace function public.mon_invitation_artisan(p_id uuid)
returns table(id uuid, organisation text, etat text, expire_le timestamptz, a_une_fiche boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, o.name,
         case when i.etat = 'en_attente' and i.expire_le <= now() then 'expiree' else i.etat end,
         i.expire_le,
         exists (select 1 from public.artisans a where a.account_id = (select auth.uid()))
  from public.invitations_artisans i
  join public.organizations o on o.id = i.organization_id
  join auth.users u on u.id = (select auth.uid())
  where i.id = p_id
    and u.email_confirmed_at is not null
    and lower(btrim(u.email)) = i.email;
$$;

-- 7. Répondre. Accepter rattache l'artisan au carnet du propriétaire — jamais s'il est sur la liste noire de cette
-- organisation ou sur la liste noire de Gerimmo. Idempotent (une acceptation rejouée ne refait rien) et sûr en
-- concurrence (invitation verrouillée, verrou par couple organisation × artisan, insertion sans doublon).
-- Accepter n'ouvre AUCUNE adhésion à l'organisation et ne valide rien : la validation reste celle de Gerimmo.
create or replace function public.repondre_invitation_artisan(p_id uuid, p_accepter boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  i public.invitations_artisans%rowtype;
  a public.artisans%rowtype;
  aa public.artisan_agences%rowtype;
  v_relation text;
  c_bloquee constant text := 'Cette invitation ne peut pas aboutir. Contactez la personne qui vous a invité.';
begin
  if (select auth.uid()) is null or p_id is null or p_accepter is null then raise exception 'Accès refusé'; end if;
  select lower(btrim(u.email)) into v_email
    from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if v_email is null or not exists (select 1 from public.invitations_artisans where id = p_id and email = v_email) then
    raise exception 'Invitation introuvable pour ce compte. Connectez-vous avec l’adresse qui a reçu l’invitation';
  end if;
  select * into i from public.invitations_artisans where id = p_id for update;

  if i.etat = 'acceptee' then return jsonb_build_object('etat', 'acceptee'); end if;
  if i.etat = 'en_attente' and i.expire_le <= now() then
    update public.invitations_artisans set etat = 'expiree', repondu_le = now() where id = p_id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), i.organization_id, 'invitation_artisan_expiree', jsonb_build_object('invitation', p_id));
    i.etat := 'expiree';
  end if;
  if i.etat = 'expiree' then
    return jsonb_build_object('etat', 'expiree',
      'erreur', 'Cette invitation a expiré. Demandez-en une nouvelle à la personne qui vous a invité.');
  end if;
  if i.etat <> 'en_attente' then
    return jsonb_build_object('etat', i.etat,
      'erreur', 'Cette invitation n’est plus valable. Demandez-en une nouvelle à la personne qui vous a invité.');
  end if;

  if not p_accepter then
    update public.invitations_artisans set etat = 'refusee', repondu_le = now() where id = p_id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), i.organization_id, 'invitation_artisan_refusee', jsonb_build_object('invitation', p_id));
    return jsonb_build_object('etat', 'refusee');
  end if;

  -- La fiche de l'entreprise du compte lui-même (jamais celle qu'une session de supervision examinerait).
  select * into a from public.artisans where account_id = (select auth.uid()) for share;
  if not found then
    return jsonb_build_object('etat', 'en_attente', 'inscription_requise', true,
      'erreur', 'Inscrivez d’abord votre entreprise : vous pourrez ensuite accepter cette invitation.');
  end if;
  if a.blacklist_globale_le is not null then
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), i.organization_id, 'invitation_artisan_bloquee',
            jsonb_build_object('invitation', p_id, 'artisan_id', a.id, 'motif', 'liste_noire_globale'));
    return jsonb_build_object('etat', 'en_attente', 'erreur', c_bloquee);
  end if;
  if not exists (select 1 from public.organizations o where o.id = i.organization_id and o.status <> 'archivee') then
    return jsonb_build_object('etat', 'en_attente', 'erreur', c_bloquee);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('artisan-agence:' || i.organization_id::text || ':' || a.id::text, 0));
  select * into aa from public.artisan_agences
   where organization_id = i.organization_id and artisan_id = a.id for update;
  if not found then
    insert into public.artisan_agences (organization_id, artisan_id, statut, created_by)
    values (i.organization_id, a.id, 'actif', i.cree_par)
    on conflict (organization_id, artisan_id) do nothing;
    select * into aa from public.artisan_agences
     where organization_id = i.organization_id and artisan_id = a.id for update;
    v_relation := 'creee';
  end if;
  if aa.blacklist_le is not null then
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), i.organization_id, 'invitation_artisan_bloquee',
            jsonb_build_object('invitation', p_id, 'artisan_id', a.id, 'motif', 'liste_noire_locale'));
    return jsonb_build_object('etat', 'en_attente', 'erreur', c_bloquee);
  end if;
  if aa.statut = 'desactive' then
    update public.artisan_agences set statut = 'actif' where id = aa.id;
    v_relation := 'reactivee';
  end if;
  v_relation := coalesce(v_relation, 'existante');

  update public.invitations_artisans set etat = 'acceptee', repondu_le = now(), artisan_id = a.id where id = p_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), i.organization_id, 'invitation_artisan_acceptee',
          jsonb_build_object('invitation', p_id, 'artisan_id', a.id, 'relation', v_relation));
  return jsonb_build_object('etat', 'acceptee');
end $$;

-- 8. Pour la supervision qui valide : de quelle(s) organisation(s) vient l'artisan en attente de validation. Une aide
-- à l'examen, jamais une validation : celle-ci reste un geste explicite de /admin/artisans.
create or replace function public.invitations_des_artisans_a_valider()
returns table(artisan_id uuid, organisation text, acceptee boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;
  return query
    select distinct a.id, o.name, (i.etat = 'acceptee')
    from public.artisans a
    join auth.users u on u.id = a.account_id
    join public.invitations_artisans i
      on (i.etat = 'acceptee' and i.artisan_id = a.id)
      or (i.etat = 'en_attente' and i.expire_le > now() and u.email_confirmed_at is not null
          and i.email = lower(btrim(u.email)))
    join public.organizations o on o.id = i.organization_id
    where a.statut_plateforme = 'en_attente'
    order by a.id, o.name;
end $$;

-- Droits explicites : les clients connectés seulement, jamais `anon` ni PUBLIC.
revoke all on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier),
  public.renvoyer_invitation_artisan(uuid), public.annuler_invitation_artisan(uuid),
  public.noter_envoi_invitation_artisan(uuid, boolean), public.carnet_artisans_proprietaire(uuid),
  public.mon_invitation_artisan(uuid), public.repondre_invitation_artisan(uuid, boolean),
  public.invitations_des_artisans_a_valider()
  from public, anon;
grant execute on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier),
  public.renvoyer_invitation_artisan(uuid), public.annuler_invitation_artisan(uuid),
  public.noter_envoi_invitation_artisan(uuid, boolean), public.carnet_artisans_proprietaire(uuid),
  public.mon_invitation_artisan(uuid), public.repondre_invitation_artisan(uuid, boolean),
  public.invitations_des_artisans_a_valider()
  to authenticated;

select public.fermer_fonctions_a_anon();
