-- Conformité V1 (plan juriste/DPO du 23/10/2026, lot 1D), telle que la décision du dirigeant du 23/10 « Cautionnement
-- et état des lieux signés dans Gerimmo » la remplace : rien n'est fermé, mais ces deux actes ne partent plus en
-- signature sans une confirmation donnée par la bonne personne.
--
-- 1. `public.confirmations_mobile_caution` — la caution confirme elle-même son numéro de mobile.
--    Quand le bailleur lance la signature électronique d'un acte de cautionnement, Gerimmo n'utilise plus le mobile
--    saisi par le bailleur (le créancier de la caution) : il envoie à la caution un lien à usage unique, valable
--    sept jours au plus, vers une page publique où elle lit qui lui demande quoi, puis saisit et confirme son numéro.
--    La demande Zoho est créée ensuite, avec ce numéro. Une ligne par lien envoyé :
--    · le jeton n'est JAMAIS gardé en clair : seule son empreinte SHA-256 (`jeton_empreinte`) est en base ;
--    · `demander_confirmation_mobile_caution` (clé de service, propriétaire actif de l'organisation) : acte de
--      cautionnement prêt, un seul garant, dont l'adresse n'est ni celle d'un autre signataire, ni celle d'un détenteur
--      du lot, d'un compte gestionnaire de l'espace ou de l'organisation (sinon le bailleur recevrait le lien) ; refus
--      quand la caution a déjà confirmé son numéro ; au plus cinq liens par caution et par bail sur vingt-quatre heures,
--      toutes préparations confondues ; annule le lien précédent encore ouvert ; l'échéance est la plus proche de sept
--      jours et de la veille de l'expiration de la préparation (l'envoi exige ensuite un jour de marge) ;
--    · `consommer_confirmation_mobile_caution` (clé de service) : lien inconnu, annulé, expiré ou déjà utilisé refusé ;
--      acte qui n'est plus prêt refusé ; numéro d'une autre personne du dossier (mêmes personnes que ci-dessus) refusé,
--      sans consommer le lien ; sinon, en une transaction et sous verrou, le lien est marqué utilisé et le numéro posé
--      sur le garant du circuit (`telephone`, `telephoneConfirmeLe`) ;
--    · `coordonnees_autres_parties_caution` : ces adresses et numéros (format international), lus sans session ;
--    · une ligne utilisée ou annulée ne change plus (preuve) ; seules les deux transitions depuis « ouverte » passent ;
--      un acte de cautionnement qui quitte l'état « prêt » clôt son lien encore ouvert (`fermer_liens_caution_hors_pret`).
--    Aucune politique : ni anon ni authenticated ne lisent la table ; le serveur la lit avec la clé de service, après
--    le contrôle d'accès de l'action.
--    Décision du 24/10 (choix logique délégué à Claude, point « à trancher » du domaine signature) : le garant qui signe
--    aussi le BAIL suit le même chemin. Chaque lien porte son garant (`garant_id`, le `personId` du signataire) et son
--    acte (`acte` : « cautionnement » ou « bail ») ; un lien ouvert au plus par garant et par circuit ; la limite de
--    cinq liens sur vingt-quatre heures vaut par garant et par bail, les deux actes confondus.
--    · `reprendre_mobiles_garants_bail` (clé de service) : sur un bail prêt, pose sur chaque garant qui n'a pas encore
--      de numéro confirmé le dernier numéro qu'il a confirmé lui-même pour un acte du même bail (acte de cautionnement,
--      ou bail préparé avant), s'il n'est pas celui d'une autre personne du dossier ; clôt alors son lien ouvert ;
--    · les garants qui restent sans numéro reçoivent un lien ; le bail attend, puis part quand tous ont confirmé ;
--    · `coordonnees_autres_parties_caution` prend le garant visé (`p_garant`) : les autres garants du bail sont aussi
--      « d'autres parties ».
--
-- 2. `bail_signature_circuits.confirmation_sur_place` — l'état des lieux a été établi ensemble, sur place.
--    `confirmer_edl_sur_place` (clé de service, propriétaire actif) pose, juste avant l'envoi, le texte exact de la
--    case cochée par le bailleur, la date de la visite (celle que porte l'état des lieux, jamais postérieure au jour de
--    Paris), l'instant et l'auteur ; une ligne `audit_log` en garde la trace. Ces informations restent sur le circuit,
--    affichées dans son suivi.
--
-- 3. Garde de l'envoi (`garder_envoi_signature_caution_edl`, déclencheur sur `bail_signature_circuits`) :
--    · un acte de cautionnement ou un état des lieux ne s'enregistre que « prêt » ;
--    · un circuit ne quitte l'état « prêt » vers l'envoi que si
--      - état des lieux : la confirmation sur place, complète, a moins d'une heure et porte la date de l'état des lieux ;
--      - cautionnement : le téléphone du garant est celui qu'il a lui-même confirmé par un lien utilisé de ce circuit,
--        et ni ce numéro ni son adresse ne sont ceux d'une autre personne du dossier ;
--      - bail (décision du 24/10) : le téléphone de CHAQUE garant est un numéro qu'il a lui-même confirmé par un lien
--        utilisé d'un acte du même bail (ce circuit, l'acte de cautionnement, ou un bail préparé avant), et ni ce numéro
--        ni son adresse ne sont ceux d'une autre personne du dossier ; un bail sans garant n'est pas concerné ;
--    · un bail qui a un garant ne s'enregistre lui aussi que « prêt » ;
--    · une fois l'acte de cautionnement ou le bail parti, le téléphone d'un garant ne change plus.
--    Seule la clé de service écrit dans cette table : ces règles tiennent pour tout appel qui la porte, y compris direct.
--
-- Rejouable : IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS ; `search_path = ''` ; aucune donnée existante
-- réécrite ; `fermer_fonctions_a_anon()` en fin. Ne cite pas `aujourdhui_paris()` (le jour de Paris se calcule dans
-- l'expression).
-- Retour : supabase/retours-arriere/20261024120000_signature_caution_mobile_et_edl_sur_place.retour.sql (hors de la
-- chaîne « Ordre complet »).

-- ── 1. Confirmations du mobile par la caution ───────────────────────────────────────────────────────────────────

create table if not exists public.confirmations_mobile_caution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  circuit_id uuid not null references public.bail_signature_circuits(id) on delete cascade,
  -- Le garant à qui le lien est envoyé (`personId` de son signataire) et l'acte à signer (décision du 24/10).
  garant_id text not null check (btrim(garant_id) <> ''),
  acte text not null check (acte in ('cautionnement', 'bail')),
  jeton_empreinte text not null unique check (jeton_empreinte ~ '^[0-9a-f]{64}$'),
  demande_par uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  utilise_le timestamptz,
  telephone_confirme text check (telephone_confirme ~ '^\+[1-9][0-9]{7,14}$'),
  annulee_le timestamptz,
  constraint confirmations_mobile_caution_echeance check (expire_le > cree_le and expire_le <= cree_le + interval '7 days'),
  constraint confirmations_mobile_caution_usage check ((utilise_le is null) = (telephone_confirme is null)),
  constraint confirmations_mobile_caution_issue check (utilise_le is null or annulee_le is null)
);
comment on table public.confirmations_mobile_caution is
  'Liens à usage unique envoyés à la caution pour qu''elle confirme elle-même son mobile avant la signature électronique d''un acte de cautionnement (décision du 23/10/2026), ou au garant qui signe aussi le bail (décision du 24/10/2026). Empreinte du jeton seulement, jamais le jeton.';

create unique index if not exists confirmations_mobile_caution_une_ouverte
  on public.confirmations_mobile_caution (circuit_id, garant_id) where utilise_le is null and annulee_le is null;
create index if not exists confirmations_mobile_caution_circuit
  on public.confirmations_mobile_caution (circuit_id, cree_le desc);
create index if not exists confirmations_mobile_caution_organisation
  on public.confirmations_mobile_caution (organization_id);
create index if not exists confirmations_mobile_caution_auteur
  on public.confirmations_mobile_caution (demande_par);

alter table public.confirmations_mobile_caution enable row level security;
revoke all on public.confirmations_mobile_caution from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.confirmations_mobile_caution to service_role;

-- Mêmes gardes que toute table d'organisation : compte en lecture seule, traversée du support.
drop trigger if exists abonnement_confirmations_mobile_caution on public.confirmations_mobile_caution;
create trigger abonnement_confirmations_mobile_caution before insert or update or delete on public.confirmations_mobile_caution
  for each row execute function public.refuser_ecriture_si_fermee();
drop trigger if exists traversee_lecture_seule on public.confirmations_mobile_caution;
create trigger traversee_lecture_seule before insert or update or delete on public.confirmations_mobile_caution
  for each row execute function support_interne.garder_ecriture_traversee();

-- Une ligne utilisée ou annulée est une preuve : elle ne change plus. Depuis « ouverte », deux issues seulement.
create or replace function public.confirmations_mobile_caution_garde()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
     or new.circuit_id is distinct from old.circuit_id or new.jeton_empreinte is distinct from old.jeton_empreinte
     or new.garant_id is distinct from old.garant_id or new.acte is distinct from old.acte
     or new.demande_par is distinct from old.demande_par or new.cree_le is distinct from old.cree_le
     or new.expire_le is distinct from old.expire_le then
    raise exception 'Une confirmation de mobile ne se modifie pas.' using errcode = '42501';
  end if;
  if old.utilise_le is not null or old.annulee_le is not null then
    raise exception 'Cette confirmation de mobile est close : elle ne change plus.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.confirmations_mobile_caution_garde() from public, anon, authenticated;
drop trigger if exists confirmations_mobile_caution_garde on public.confirmations_mobile_caution;
create trigger confirmations_mobile_caution_garde before update on public.confirmations_mobile_caution
  for each row execute function public.confirmations_mobile_caution_garde();

-- Les adresses (en minuscules) et numéros (format international) des personnes qui ne sont pas la caution : autres
-- signataires de l'acte, détenteurs en cours du lot du bail, comptes gestionnaires actifs de l'organisation, et
-- l'organisation elle-même. Ni le lien de la caution ni son numéro ne peuvent être les leurs (décision du 23/10 :
-- « jamais le numéro du bailleur »). Les numéros libres des fiches sont normalisés comme `telephoneSignature`.
-- `p_garant` (décision du 24/10) : le garant visé ; tout autre signataire, autre garant du bail compris, est une autre
-- partie. Sans lui, tous les garants sont écartés (un acte de cautionnement n'en a qu'un).
create or replace function public.coordonnees_autres_parties_caution(p_organization uuid, p_bail uuid, p_signataires jsonb, p_garant text default null)
returns table (email text, telephone text)
language sql
stable
set search_path = ''
as $$
  with brut(email, telephone) as (
    select s ->> 'email', s ->> 'telephone'
      from jsonb_array_elements(coalesce(p_signataires, '[]'::jsonb)) s
     where case when p_garant is null then coalesce(s ->> 'qualite', '') <> 'Garant'
                else coalesce(s ->> 'personId', '') <> p_garant end
    union all
    select p.email, p.telephone
      from public.baux b
      join public.detentions d on d.lot_id = b.lot_id and d.organization_id = b.organization_id and d.date_fin is null
      join public.persons p on p.id = d.person_id
     where b.id = p_bail and b.organization_id = p_organization
    union all
    select u.email, case when u.phone ~ '^[1-9][0-9]{7,14}$' then '+' || u.phone else u.phone end
      from public.memberships m
      join auth.users u on u.id = m.account_id
     where m.organization_id = p_organization and m.status = 'active'
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct', 'proprietaire_mandant')
    union all
    select o.email_contact, o.telephone from public.organizations o where o.id = p_organization
    union all
    select o.email_expediteur, null from public.organizations o where o.id = p_organization
  ), net as (
    select nullif(lower(btrim(email)), '') as email, regexp_replace(coalesce(telephone, ''), '[[:space:]().-]', '', 'g') as n
      from brut
  )
  select email,
         case
           when n ~ '^0[0-9]{9}$' then '+33' || substr(n, 2)
           when n ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(n, 3)
           when n ~ '^\+[1-9][0-9]{7,14}$' then n
         end
    from net;
$$;
revoke all on function public.coordonnees_autres_parties_caution(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.coordonnees_autres_parties_caution(uuid, uuid, jsonb, text) to service_role;

-- `p_garant` (décision du 24/10) : le garant visé, obligatoire pour un bail ; pour un acte de cautionnement, son seul
-- garant (déduit s'il est omis).
create or replace function public.demander_confirmation_mobile_caution(p_circuit uuid, p_actor uuid, p_jeton_empreinte text, p_garant text default null)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v public.bail_signature_circuits;
  v_expire timestamptz;
  v_garant jsonb;
begin
  if p_jeton_empreinte is null or p_jeton_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Jeton de confirmation invalide.' using errcode = '22023';
  end if;
  select * into v from public.bail_signature_circuits where id = p_circuit for update;
  if not found or not exists (select 1 from public.memberships m where m.account_id = p_actor
      and m.organization_id = v.organization_id and m.status = 'active' and m.role = 'proprietaire_direct') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v.modele not in ('cautionnement', 'bail') then
    raise exception 'Seul un acte de cautionnement, ou un bail que signe un garant, passe par la confirmation du mobile du garant.' using errcode = '22023';
  end if;
  if v.etat <> 'pret' then
    raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.' using errcode = '22023';
  end if;
  if v.modele = 'cautionnement' then
    if (select count(*) from jsonb_array_elements(v.signataires) s where s ->> 'qualite' = 'Garant') <> 1 then
      raise exception 'Un acte de caution doit concerner exactement un garant.' using errcode = '22023';
    end if;
    select s into v_garant from jsonb_array_elements(v.signataires) s where s ->> 'qualite' = 'Garant';
    if p_garant is not null and p_garant is distinct from v_garant ->> 'personId' then
      raise exception 'Ce garant ne signe pas cet acte.' using errcode = '22023';
    end if;
  else
    select s into v_garant from jsonb_array_elements(v.signataires) s
     where s ->> 'qualite' = 'Garant' and s ->> 'personId' = p_garant limit 1;
    if v_garant is null then
      raise exception 'Ce garant ne signe pas ce bail.' using errcode = '22023';
    end if;
  end if;
  if coalesce(btrim(v_garant ->> 'personId'), '') = '' then
    raise exception 'Le garant de ce circuit n’est pas identifié. Préparez un nouveau PDF.' using errcode = '22023';
  end if;
  -- Relecture du 24/10 : le lien ne part jamais chez le bailleur, qui y confirmerait son propre numéro.
  if exists (select 1 from public.coordonnees_autres_parties_caution(v.organization_id, v.bail_id, v.signataires, v_garant ->> 'personId') x
              where x.email = nullif(lower(btrim(v_garant ->> 'email')), '')) then
    if v.modele = 'cautionnement' then
      raise exception 'L’adresse e-mail de la caution est celle d’un bailleur ou d’un compte de votre espace : le lien lui permettrait de confirmer un autre numéro que le sien. Renseignez sur sa fiche l’adresse personnelle de la caution, puis préparez un nouveau PDF.'
        using errcode = '22023';
    end if;
    raise exception 'L’adresse e-mail du garant est celle d’une autre personne du bail ou d’un compte de votre espace : le lien lui permettrait de confirmer un autre numéro que le sien. Renseignez sur sa fiche l’adresse personnelle du garant, puis préparez un nouveau PDF.'
      using errcode = '22023';
  end if;
  if coalesce(v_garant ->> 'telephoneConfirmeLe', '') <> ''
     or exists (select 1 from public.confirmations_mobile_caution c where c.circuit_id = p_circuit
                   and c.garant_id = v_garant ->> 'personId' and c.utilise_le is not null) then
    if v.modele = 'cautionnement' then
      raise exception 'La caution a déjà confirmé son numéro : actualisez puis envoyez l’acte.' using errcode = '22023';
    end if;
    raise exception 'Ce garant a déjà confirmé son numéro : actualisez puis envoyez le bail.' using errcode = '22023';
  end if;
  -- Cinq liens par garant et par bail, toutes préparations et les deux actes confondus (une nouvelle préparation ne
  -- remet pas le compteur à zéro).
  if (select count(*) from public.confirmations_mobile_caution c
        join public.bail_signature_circuits b on b.id = c.circuit_id
       where b.organization_id = v.organization_id and b.bail_id is not distinct from v.bail_id
         and c.garant_id = v_garant ->> 'personId'
         and c.cree_le > now() - interval '24 hours') >= 5 then
    raise exception 'Cinq liens ont déjà été envoyés à ce garant pour ce bail en vingt-quatre heures. Réessayez demain.' using errcode = '54000';
  end if;
  v_expire := least(now() + interval '7 days', v.expire_le - interval '1 day');
  if v_expire < now() + interval '1 hour' then
    raise exception 'Cette préparation est trop ancienne. Actualisez le PDF avant de l’envoyer.' using errcode = '22023';
  end if;
  update public.confirmations_mobile_caution set annulee_le = now()
   where circuit_id = p_circuit and garant_id = v_garant ->> 'personId' and utilise_le is null and annulee_le is null;
  insert into public.confirmations_mobile_caution (organization_id, circuit_id, garant_id, acte, jeton_empreinte, demande_par, expire_le)
  values (v.organization_id, p_circuit, v_garant ->> 'personId', v.modele, p_jeton_empreinte, p_actor, v_expire);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (p_actor, v.organization_id, 'signature_caution_mobile_demande',
          jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'acte', v.modele, 'garant_id', v_garant ->> 'personId',
                             'expire_le', v_expire));
  return v_expire;
end $$;
revoke all on function public.demander_confirmation_mobile_caution(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.demander_confirmation_mobile_caution(uuid, uuid, text, text) to service_role;

create or replace function public.consommer_confirmation_mobile_caution(p_jeton_empreinte text, p_telephone text)
returns table (circuit_id uuid, organization_id uuid, demande_par uuid)
language plpgsql
set search_path = ''
as $$
declare
  c public.confirmations_mobile_caution;
  v public.bail_signature_circuits;
  v_circuit uuid;
  v_signataires jsonb;
begin
  if p_jeton_empreinte is null or p_jeton_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Ce lien n’est pas valable.' using errcode = '22023';
  end if;
  if p_telephone is null or p_telephone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Saisissez un numéro de mobile valide.' using errcode = '22023';
  end if;
  -- Même ordre de verrouillage que demander_confirmation_mobile_caution (le circuit, puis ses liens) : un renvoi du
  -- lien par le bailleur et la confirmation par la caution, simultanés, s'attendent au lieu de s'interbloquer.
  select x.circuit_id into v_circuit from public.confirmations_mobile_caution x where x.jeton_empreinte = p_jeton_empreinte;
  if v_circuit is not null then
    perform 1 from public.bail_signature_circuits b where b.id = v_circuit for update;
  end if;
  select * into c from public.confirmations_mobile_caution x where x.jeton_empreinte = p_jeton_empreinte for update;
  if not found or c.annulee_le is not null then
    raise exception 'Ce lien n’est plus valable. Demandez au bailleur de vous en envoyer un nouveau.' using errcode = '22023';
  end if;
  if c.utilise_le is not null then
    raise exception 'Ce lien a déjà été utilisé. Il ne sert qu’une fois.' using errcode = '22023';
  end if;
  if c.expire_le <= now() then
    raise exception 'Ce lien a expiré. Demandez au bailleur de vous en envoyer un nouveau.' using errcode = '22023';
  end if;
  select * into v from public.bail_signature_circuits b where b.id = c.circuit_id;
  if not found or v.modele <> c.acte or v.etat <> 'pret'
     or not exists (select 1 from jsonb_array_elements(v.signataires) s
                     where s ->> 'qualite' = 'Garant' and s ->> 'personId' = c.garant_id) then
    raise exception 'Ce lien n’est plus valable. Demandez au bailleur de vous en envoyer un nouveau.' using errcode = '22023';
  end if;
  -- Relecture du 24/10 : jamais le numéro du bailleur, d'un autre signataire (autre garant du bail compris) ou d'un
  -- compte de l'espace. Le lien reste ouvert (l'exception annule tout) : le garant saisit alors son propre numéro.
  if exists (select 1 from public.coordonnees_autres_parties_caution(v.organization_id, v.bail_id, v.signataires, c.garant_id) x
              where x.telephone = p_telephone) then
    raise exception 'Ce numéro est déjà enregistré pour une autre personne de ce dossier. Saisissez votre propre numéro de mobile.'
      using errcode = '22023';
  end if;
  select jsonb_agg(case when e.s ->> 'qualite' = 'Garant' and e.s ->> 'personId' = c.garant_id
                        then e.s || jsonb_build_object('telephone', p_telephone, 'telephoneConfirmeLe', now(), 'confirmationMobile', c.id)
                        else e.s end order by e.rang)
    into v_signataires
    from jsonb_array_elements(v.signataires) with ordinality as e(s, rang);
  update public.confirmations_mobile_caution set utilise_le = now(), telephone_confirme = p_telephone where id = c.id;
  update public.bail_signature_circuits set signataires = v_signataires, updated_at = now() where id = v.id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, v.organization_id, 'signature_caution_mobile_confirme',
          jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'acte', c.acte, 'garant_id', c.garant_id, 'confirmation_id', c.id));
  return query select v.id, v.organization_id, c.demande_par;
end $$;
revoke all on function public.consommer_confirmation_mobile_caution(text, text) from public, anon, authenticated;
grant execute on function public.consommer_confirmation_mobile_caution(text, text) to service_role;

-- Garant qui signe aussi le bail (décision du 24/10) : sur un bail prêt, chaque garant sans numéro confirmé reprend le
-- dernier numéro qu'il a confirmé lui-même, par un lien utilisé, pour un acte du même bail (l'acte de cautionnement, ou
-- un bail préparé avant) — jamais un numéro saisi par le bailleur. Un numéro devenu celui d'une autre personne du
-- dossier n'est pas repris : un lien lui sera envoyé. Le lien encore ouvert d'un garant repris est clos. Rend les
-- signataires du circuit ; ceux sans `telephoneConfirmeLe` restent à confirmer. Clé de service, après le contrôle
-- d'accès de l'action (propriétaire) ou la confirmation d'un garant par son lien.
create or replace function public.reprendre_mobiles_garants_bail(p_circuit uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.bail_signature_circuits;
  v_signataires jsonb;
  g record;
  c record;
begin
  select * into v from public.bail_signature_circuits where id = p_circuit for update;
  if not found or v.modele <> 'bail' then
    raise exception 'Seul un bail reprend le numéro confirmé par son garant.' using errcode = '22023';
  end if;
  if v.etat <> 'pret' then
    raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.' using errcode = '22023';
  end if;
  v_signataires := v.signataires;
  for g in select e.s, e.rang from jsonb_array_elements(v.signataires) with ordinality as e(s, rang)
            where e.s ->> 'qualite' = 'Garant' and coalesce(e.s ->> 'telephoneConfirmeLe', '') = ''
              and coalesce(btrim(e.s ->> 'personId'), '') <> ''
            order by e.rang loop
    select x.id, x.telephone_confirme, x.utilise_le into c
      from public.confirmations_mobile_caution x
      join public.bail_signature_circuits b on b.id = x.circuit_id
     where b.organization_id = v.organization_id and b.bail_id = v.bail_id and b.modele in ('cautionnement', 'bail')
       and x.garant_id = g.s ->> 'personId' and x.utilise_le is not null
     order by x.utilise_le desc
     limit 1;
    continue when not found;
    continue when exists (select 1 from public.coordonnees_autres_parties_caution(v.organization_id, v.bail_id, v_signataires, g.s ->> 'personId') o
                           where o.telephone = c.telephone_confirme);
    v_signataires := jsonb_set(v_signataires, array[(g.rang - 1)::text],
      g.s || jsonb_build_object('telephone', c.telephone_confirme, 'telephoneConfirmeLe', c.utilise_le, 'confirmationMobile', c.id));
    update public.confirmations_mobile_caution set annulee_le = now()
     where circuit_id = v.id and garant_id = g.s ->> 'personId' and utilise_le is null and annulee_le is null;
    insert into public.audit_log (account_id, organization_id, action, details)
    values (null, v.organization_id, 'signature_garant_bail_mobile_repris',
            jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'garant_id', g.s ->> 'personId', 'confirmation_id', c.id));
  end loop;
  if v_signataires is distinct from v.signataires then
    update public.bail_signature_circuits set signataires = v_signataires, updated_at = now() where id = v.id;
  end if;
  return v_signataires;
end $$;
revoke all on function public.reprendre_mobiles_garants_bail(uuid) from public, anon, authenticated;
grant execute on function public.reprendre_mobiles_garants_bail(uuid) to service_role;

-- ── 2. Confirmation sur place de l'état des lieux ───────────────────────────────────────────────────────────────

alter table public.bail_signature_circuits add column if not exists confirmation_sur_place jsonb;
do $contrainte$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bail_signature_circuits'::regclass
                  and conname = 'bail_signature_circuits_confirmation_sur_place_check') then
    alter table public.bail_signature_circuits add constraint bail_signature_circuits_confirmation_sur_place_check
      check (confirmation_sur_place is null or jsonb_typeof(confirmation_sur_place) = 'object');
  end if;
end $contrainte$;
do $commentaire$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'bail_signature_circuits' and column_name = 'confirmation_sur_place') then
    comment on column public.bail_signature_circuits.confirmation_sur_place is
      'État des lieux : texte exact de la confirmation « établi contradictoirement, sur place » cochée par le bailleur avant l''envoi, date de la visite saisie, instant et auteur (décision du 23/10/2026).';
  end if;
end $commentaire$;

create or replace function public.confirmer_edl_sur_place(p_circuit uuid, p_actor uuid, p_visite_le date)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.bail_signature_circuits;
  v_confirmation jsonb;
  v_date_edl date;
begin
  select * into v from public.bail_signature_circuits where id = p_circuit for update;
  if not found or not exists (select 1 from public.memberships m where m.account_id = p_actor
      and m.organization_id = v.organization_id and m.status = 'active' and m.role = 'proprietaire_direct') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v.modele <> 'edl' then
    raise exception 'Cette confirmation ne concerne que l’état des lieux.' using errcode = '22023';
  end if;
  if v.etat <> 'pret' then
    raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.' using errcode = '22023';
  end if;
  if p_visite_le is null then
    raise exception 'Indiquez la date de la visite.' using errcode = '22023';
  end if;
  if p_visite_le > (now() at time zone 'Europe/Paris')::date then
    raise exception 'La date de la visite ne peut pas être postérieure à aujourd’hui.' using errcode = '22023';
  end if;
  -- Relecture du 24/10 : la visite confirmée est celle que porte l'état des lieux (« Établi le », imprimé dans le PDF
  -- signé) ; deux dates différentes rendraient les preuves contradictoires et le délai de dix jours ambigu.
  select e.date_edl into v_date_edl from public.etats_des_lieux e
   where e.id = v.cible_id and e.organization_id = v.organization_id;
  if not found then
    raise exception 'État des lieux inaccessible.' using errcode = '22023';
  end if;
  if p_visite_le is distinct from v_date_edl then
    raise exception 'La date de la visite doit être celle portée par l’état des lieux (%). Si elle est inexacte, corrigez l’état des lieux puis préparez un nouveau PDF.',
      to_char(v_date_edl, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  v_confirmation := jsonb_build_object(
    'texte', 'Je confirme que cet état des lieux a été établi contradictoirement, sur place, le '
             || to_char(p_visite_le, 'DD/MM/YYYY') || ', en présence du locataire ou de son représentant.',
    'visite_le', p_visite_le,
    'confirme_le', now(),
    'confirme_par', p_actor);
  update public.bail_signature_circuits set confirmation_sur_place = v_confirmation, updated_at = now() where id = v.id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (p_actor, v.organization_id, 'signature_edl_confirmation_sur_place',
          jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'edl_id', v.cible_id,
                             'visite_le', p_visite_le, 'texte', v_confirmation ->> 'texte'));
  return v_confirmation;
end $$;
revoke all on function public.confirmer_edl_sur_place(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.confirmer_edl_sur_place(uuid, uuid, date) to service_role;

-- ── 3. Garde de l'envoi ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.garder_envoi_signature_caution_edl()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Relecture du 24/10 : ces actes naissent « prêts » ; leur envoi passe toujours par les contrôles ci-dessous. Un bail
  -- n'est concerné que s'il a un garant (décision du 24/10) : les autres baux gardent leur chemin.
  if tg_op = 'INSERT' then
    if new.etat <> 'pret' and (new.modele in ('cautionnement', 'edl') or (new.modele = 'bail' and exists (
         select 1 from jsonb_array_elements(new.signataires) s where s ->> 'qualite' = 'Garant'))) then
      raise exception 'Un acte de cautionnement, un état des lieux ou un bail signé par un garant ne s’enregistre que prêt à relire : son envoi passe par les confirmations prévues.'
        using errcode = '23514';
    end if;
    return new;
  end if;
  -- Une fois l'acte de cautionnement ou le bail parti, le numéro de chaque garant (celui de l'invitation et du code SMS)
  -- est figé.
  if new.modele in ('cautionnement', 'bail') and old.etat <> 'pret' and new.etat <> 'pret'
     and exists (select 1 from jsonb_array_elements(old.signataires) o
                   join jsonb_array_elements(new.signataires) n on n ->> 'personId' is not distinct from o ->> 'personId'
                  where o ->> 'qualite' = 'Garant' and n ->> 'qualite' = 'Garant'
                    and (o ->> 'telephone') is distinct from (n ->> 'telephone')) then
    raise exception 'Le numéro d’un garant ne change plus une fois l’acte envoyé : annulez le circuit puis préparez un nouvel acte.'
      using errcode = '23514';
  end if;
  if old.etat = 'pret' and new.etat not in ('pret', 'annule') then
    if new.modele = 'edl' and (
         new.confirmation_sur_place is null
         or new.confirmation_sur_place ->> 'confirme_par' is null
         or new.confirmation_sur_place ->> 'visite_le' is null
         -- Sans instant, la confirmation est tenue pour périmée (une valeur nulle ne doit pas laisser passer).
         or coalesce((new.confirmation_sur_place ->> 'confirme_le')::timestamptz, '-infinity'::timestamptz) < now() - interval '1 hour'
         or (new.confirmation_sur_place ->> 'visite_le')::date is distinct from
            (select e.date_edl from public.etats_des_lieux e where e.id = new.cible_id and e.organization_id = new.organization_id)) then
      raise exception 'Confirmez que l’état des lieux a été établi contradictoirement, sur place, et indiquez la date de la visite avant l’envoi en signature.'
        using errcode = '23514';
    end if;
    if new.modele = 'cautionnement' and (
         (select count(*) from jsonb_array_elements(new.signataires) s where s ->> 'qualite' = 'Garant') <> 1
         or exists (select 1 from jsonb_array_elements(new.signataires) s
                     where s ->> 'qualite' = 'Garant'
                       and not exists (select 1 from public.confirmations_mobile_caution c
                                        where c.circuit_id = new.id and c.utilise_le is not null
                                          and c.telephone_confirme = s ->> 'telephone'))
         or exists (select 1 from jsonb_array_elements(new.signataires) s
                      join public.coordonnees_autres_parties_caution(new.organization_id, new.bail_id, new.signataires, s ->> 'personId') x
                        on x.telephone = s ->> 'telephone' or x.email = nullif(lower(btrim(s ->> 'email')), '')
                     where s ->> 'qualite' = 'Garant')) then
      raise exception 'La caution doit confirmer elle-même son numéro de mobile avant l’envoi en signature.'
        using errcode = '23514';
    end if;
    -- Décision du 24/10 : chaque garant du bail signe avec un numéro qu'il a confirmé lui-même pour un acte de ce bail
    -- (ce circuit, l'acte de cautionnement, ou un bail préparé avant), qui n'est ni le numéro ni l'adresse d'une autre
    -- personne du dossier. Jamais le numéro de sa fiche, saisi par le bailleur.
    if new.modele = 'bail' and exists (
         select 1 from jsonb_array_elements(new.signataires) s
          where s ->> 'qualite' = 'Garant'
            and (coalesce(s ->> 'telephone', '') !~ '^\+[1-9][0-9]{7,14}$'
                 or not exists (select 1 from public.confirmations_mobile_caution c
                                  join public.bail_signature_circuits b on b.id = c.circuit_id
                                 where c.garant_id = s ->> 'personId' and c.utilise_le is not null
                                   and c.telephone_confirme = s ->> 'telephone'
                                   and b.organization_id = new.organization_id and b.bail_id = new.bail_id
                                   and b.modele in ('cautionnement', 'bail'))
                 or exists (select 1 from public.coordonnees_autres_parties_caution(new.organization_id, new.bail_id, new.signataires, s ->> 'personId') x
                             where x.telephone = s ->> 'telephone' or x.email = nullif(lower(btrim(s ->> 'email')), '')))) then
      raise exception 'Chaque garant doit confirmer lui-même son numéro de mobile avant l’envoi du bail en signature.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.garder_envoi_signature_caution_edl() from public, anon, authenticated;
drop trigger if exists signature_garde_caution_edl on public.bail_signature_circuits;
create trigger signature_garde_caution_edl before insert or update of etat, signataires on public.bail_signature_circuits
  for each row execute function public.garder_envoi_signature_caution_edl();

-- Relecture du 24/10 : un acte de cautionnement (ou, décision du 24/10, un bail) qui quitte l'état « prêt » (envoi ou
-- annulation) clôt ses liens encore ouverts, pour que la preuve dise « annulé » et non « ouvert ». C'est une trace : le lien ne servait déjà plus
-- (`consommer_confirmation_mobile_caution` exige un acte prêt). Une écriture refusée sur la table des liens (abonnement
-- suspendu, traversée du support) ne bloque donc jamais le changement d'état du circuit.
create or replace function public.fermer_liens_caution_hors_pret()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  begin
    update public.confirmations_mobile_caution set annulee_le = now()
     where circuit_id = new.id and utilise_le is null and annulee_le is null;
  exception when check_violation or insufficient_privilege then
    raise notice 'Lien de confirmation du circuit % laissé ouvert : %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.fermer_liens_caution_hors_pret() from public, anon, authenticated;
drop trigger if exists signature_liens_caution_clos on public.bail_signature_circuits;
create trigger signature_liens_caution_clos after update of etat on public.bail_signature_circuits
  for each row when (old.etat = 'pret' and new.etat <> 'pret' and new.modele in ('cautionnement', 'bail'))
  execute function public.fermer_liens_caution_hors_pret();

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
