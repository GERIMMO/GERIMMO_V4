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
--      cautionnement prêt, un seul garant, au plus cinq liens par acte sur vingt-quatre heures ; annule le lien
--      précédent encore ouvert ; l'échéance est la plus proche de sept jours et de la veille de l'expiration de la
--      préparation (l'envoi exige ensuite un jour de marge) ;
--    · `consommer_confirmation_mobile_caution` (clé de service) : lien inconnu, annulé, expiré ou déjà utilisé refusé ;
--      acte qui n'est plus prêt refusé ; sinon, en une transaction et sous verrou, le lien est marqué utilisé et le
--      numéro posé sur le garant du circuit (`telephone`, `telephoneConfirmeLe`) ;
--    · une ligne utilisée ou annulée ne change plus (preuve) ; seules les deux transitions depuis « ouverte » passent.
--    Aucune politique : ni anon ni authenticated ne lisent la table ; le serveur la lit avec la clé de service, après
--    le contrôle d'accès de l'action.
--
-- 2. `bail_signature_circuits.confirmation_sur_place` — l'état des lieux a été établi ensemble, sur place.
--    `confirmer_edl_sur_place` (clé de service, propriétaire actif) pose, juste avant l'envoi, le texte exact de la
--    case cochée par le bailleur, la date de la visite qu'il a saisie (jamais postérieure au jour de Paris), l'instant
--    et l'auteur ; une ligne `audit_log` en garde la trace. Ces informations restent sur le circuit, avec le document
--    signé et le certificat de réalisation.
--
-- 3. Garde de l'envoi (`garder_envoi_signature_caution_edl`, déclencheur sur `bail_signature_circuits`) : un circuit ne
--    quitte l'état « prêt » vers l'envoi que si
--    · état des lieux : la confirmation sur place a moins d'une heure ;
--    · cautionnement : le téléphone du garant est celui qu'il a lui-même confirmé par un lien utilisé de ce circuit.
--    Le numéro saisi par le bailleur ne peut donc jamais servir à un acte de cautionnement, même par un appel direct.
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
  'Liens à usage unique envoyés à la caution pour qu''elle confirme elle-même son mobile avant la signature électronique d''un acte de cautionnement (décision du 23/10/2026). Empreinte du jeton seulement, jamais le jeton.';

create unique index if not exists confirmations_mobile_caution_une_ouverte
  on public.confirmations_mobile_caution (circuit_id) where utilise_le is null and annulee_le is null;
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

create or replace function public.demander_confirmation_mobile_caution(p_circuit uuid, p_actor uuid, p_jeton_empreinte text)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v public.bail_signature_circuits;
  v_expire timestamptz;
begin
  if p_jeton_empreinte is null or p_jeton_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Jeton de confirmation invalide.' using errcode = '22023';
  end if;
  select * into v from public.bail_signature_circuits where id = p_circuit for update;
  if not found or not exists (select 1 from public.memberships m where m.account_id = p_actor
      and m.organization_id = v.organization_id and m.status = 'active' and m.role = 'proprietaire_direct') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v.modele <> 'cautionnement' then
    raise exception 'Seul un acte de cautionnement passe par la confirmation du mobile de la caution.' using errcode = '22023';
  end if;
  if v.etat <> 'pret' then
    raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v.signataires) s where s ->> 'qualite' = 'Garant') <> 1 then
    raise exception 'Un acte de caution doit concerner exactement un garant.' using errcode = '22023';
  end if;
  if (select count(*) from public.confirmations_mobile_caution c
       where c.circuit_id = p_circuit and c.cree_le > now() - interval '24 hours') >= 5 then
    raise exception 'Cinq liens ont déjà été envoyés à la caution pour cet acte en vingt-quatre heures. Réessayez demain.' using errcode = '54000';
  end if;
  v_expire := least(now() + interval '7 days', v.expire_le - interval '1 day');
  if v_expire < now() + interval '1 hour' then
    raise exception 'Cette préparation est trop ancienne. Actualisez le PDF avant de l’envoyer.' using errcode = '22023';
  end if;
  update public.confirmations_mobile_caution set annulee_le = now()
   where circuit_id = p_circuit and utilise_le is null and annulee_le is null;
  insert into public.confirmations_mobile_caution (organization_id, circuit_id, jeton_empreinte, demande_par, expire_le)
  values (v.organization_id, p_circuit, p_jeton_empreinte, p_actor, v_expire);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (p_actor, v.organization_id, 'signature_caution_mobile_demande',
          jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'expire_le', v_expire));
  return v_expire;
end $$;
revoke all on function public.demander_confirmation_mobile_caution(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.demander_confirmation_mobile_caution(uuid, uuid, text) to service_role;

create or replace function public.consommer_confirmation_mobile_caution(p_jeton_empreinte text, p_telephone text)
returns table (circuit_id uuid, organization_id uuid, demande_par uuid)
language plpgsql
set search_path = ''
as $$
declare
  c public.confirmations_mobile_caution;
  v public.bail_signature_circuits;
  v_signataires jsonb;
begin
  if p_jeton_empreinte is null or p_jeton_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Ce lien n’est pas valable.' using errcode = '22023';
  end if;
  if p_telephone is null or p_telephone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Saisissez un numéro de mobile valide.' using errcode = '22023';
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
  select * into v from public.bail_signature_circuits b where b.id = c.circuit_id for update;
  if not found or v.modele <> 'cautionnement' or v.etat <> 'pret' then
    raise exception 'Ce lien n’est plus valable. Demandez au bailleur de vous en envoyer un nouveau.' using errcode = '22023';
  end if;
  select jsonb_agg(case when e.s ->> 'qualite' = 'Garant'
                        then e.s || jsonb_build_object('telephone', p_telephone, 'telephoneConfirmeLe', now())
                        else e.s end order by e.rang)
    into v_signataires
    from jsonb_array_elements(v.signataires) with ordinality as e(s, rang);
  update public.confirmations_mobile_caution set utilise_le = now(), telephone_confirme = p_telephone where id = c.id;
  update public.bail_signature_circuits set signataires = v_signataires, updated_at = now() where id = v.id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, v.organization_id, 'signature_caution_mobile_confirme',
          jsonb_build_object('circuit_id', v.id, 'bail_id', v.bail_id, 'confirmation_id', c.id));
  return query select v.id, v.organization_id, c.demande_par;
end $$;
revoke all on function public.consommer_confirmation_mobile_caution(text, text) from public, anon, authenticated;
grant execute on function public.consommer_confirmation_mobile_caution(text, text) to service_role;

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
  if old.etat = 'pret' and new.etat not in ('pret', 'annule') then
    if new.modele = 'edl' and (
         new.confirmation_sur_place is null
         or new.confirmation_sur_place ->> 'confirme_par' is null
         or new.confirmation_sur_place ->> 'visite_le' is null
         or (new.confirmation_sur_place ->> 'confirme_le')::timestamptz < now() - interval '1 hour') then
      raise exception 'Confirmez que l’état des lieux a été établi contradictoirement, sur place, et indiquez la date de la visite avant l’envoi en signature.'
        using errcode = '23514';
    end if;
    if new.modele = 'cautionnement' and (
         (select count(*) from jsonb_array_elements(new.signataires) s where s ->> 'qualite' = 'Garant') <> 1
         or exists (select 1 from jsonb_array_elements(new.signataires) s
                     where s ->> 'qualite' = 'Garant'
                       and not exists (select 1 from public.confirmations_mobile_caution c
                                        where c.circuit_id = new.id and c.utilise_le is not null
                                          and c.telephone_confirme = s ->> 'telephone'))) then
      raise exception 'La caution doit confirmer elle-même son numéro de mobile avant l’envoi en signature.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.garder_envoi_signature_caution_edl() from public, anon, authenticated;
drop trigger if exists signature_garde_caution_edl on public.bail_signature_circuits;
create trigger signature_garde_caution_edl before update of etat on public.bail_signature_circuits
  for each row execute function public.garder_envoi_signature_caution_edl();

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
