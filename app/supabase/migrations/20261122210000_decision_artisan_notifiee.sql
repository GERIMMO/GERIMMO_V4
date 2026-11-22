-- Audit palier 1, P1-16 — Les motifs d'un refus ou d'une suspension sont envoyés à l'artisan par e-mail.
--
-- LE DÉFAUT. Les conditions de l'espace artisan (article A10) disent que Gerimmo « communique les motifs par courriel,
-- au plus tard quand la mesure prend effet ». Le motif était bien enregistré et visible dans l'espace de l'artisan,
-- mais aucun e-mail ne partait : la décision se découvrait à la prochaine connexion.
--
-- CE QUE POSE CETTE MIGRATION.
--   1. `artisan_validations.notifie_le` : quand l'e-mail des motifs de CETTE décision a été accepté par le service
--      d'envoi. Vide : pas encore parti.
--   2. Un type d'e-mail de plus, « decision_artisan », reconnu par les deux contrôles de tout e-mail conservé :
--      - `empreinte_metier_courriel` (la preuve, refaite juste avant l'envoi et à chaque reprise) : la décision existe,
--        c'est un refus ou une suspension motivé, c'est TOUJOURS la dernière décision de cet artisan (un nouvel examen
--        ou une validation la rend caduque), l'inscription est toujours dans l'état que la décision a posé, elle n'a pas
--        déjà été notifiée, et l'adresse du destinataire est toujours celle de la fiche de l'artisan. Sous arrêt
--        d'urgence général, rien ne part. Sinon : pas de preuve, pas d'envoi.
--      - `finaliser_courriel_metier` (après l'acceptation par le service d'envoi) : la décision est marquée notifiée,
--        une seule fois.
--
-- CE QUI NE CHANGE PAS. La décision elle-même (qui la prend, son motif obligatoire, sa trace), ce que l'artisan lit
-- dans son espace, et les décisions passées : aucun e-mail n'est envoyé pour une décision antérieure à cette migration
-- sans un geste du superviseur.
--
-- Même construction que les maillons précédents (20261122130000, 20261122200000) : chaque maillon se crée d'abord sous
-- son propre nom (« …_maillon_decision_artisan ») et ne prend la tête que s'il n'est pas déjà posé. Rejouable.
-- Retour arrière : supabase/retours-arriere/20261122210000_decision_artisan_notifiee.retour.sql

-- ── 1. La trace de la notification ───────────────────────────────────────────────────────────────────────────────
alter table public.artisan_validations add column if not exists notifie_le timestamptz;
comment on column public.artisan_validations.notifie_le is
  'Quand l''e-mail des motifs de cette décision (refus, suspension) a été accepté par le service d''envoi (P1-16). Vide : pas encore parti.';

-- ── 2. La preuve avant l'envoi ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.empreinte_maillon_decision_artisan(p_org uuid, p_contexte jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.artisan_validations;
  a public.artisans;
  v_dest text := p_contexte->>'destinataire';
begin
  -- Tout autre type suit la chaîne existante, sans aucun changement (« is distinct from » : un type absent aussi).
  if p_contexte->>'type' is distinct from 'decision_artisan' then
    return public.empreinte_avant_decision_artisan(p_org, p_contexte);
  end if;
  -- Un artisan n'appartient à aucun espace : la preuve ne vaut que sans espace. Les formats d'abord.
  if p_org is not null
     or coalesce(p_contexte->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(v_dest, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if exists (select 1 from public.supervision_arrets s where s.arrete and s.cle = 'global') then
    return null;
  end if;

  select * into v from public.artisan_validations where id = (p_contexte->>'id')::uuid;
  if not found
     or v.decision::text not in ('refus', 'suspension')
     or v.notifie_le is not null
     or length(btrim(coalesce(v.motif, ''))) = 0 then
    return null;
  end if;
  -- Toujours la dernière décision de cet artisan : un nouvel examen ou une validation la rend caduque.
  if exists (select 1 from public.artisan_validations x
              where x.artisan_id = v.artisan_id and x.id <> v.id and (x.created_at, x.id) > (v.created_at, v.id)) then
    return null;
  end if;

  select * into a from public.artisans where id = v.artisan_id;
  if not found
     or a.email is null or length(btrim(a.email)) = 0
     or encode(sha256(convert_to(lower(btrim(a.email)), 'UTF8')), 'hex') <> v_dest then
    return null;
  end if;
  -- L'inscription est toujours dans l'état que cette décision a posé.
  if a.statut_plateforme::text <> (case v.decision::text when 'refus' then 'refuse' else 'en_attente' end) then
    return null;
  end if;

  return encode(sha256(convert_to(jsonb_build_array(
    v.id, v.artisan_id, v.decision::text, v.motif, v.created_at, v_dest)::text, 'UTF8')), 'hex');
end $$;
comment on function public.empreinte_maillon_decision_artisan(uuid, jsonb) is
  'Preuve métier d''un e-mail conservé, recalculée avant l''envoi. Tête de chaîne du 22/11/2026 (P1-16) : traite « decision_artisan » (motifs d''un refus ou d''une suspension, dernière décision non notifiée, adresse de la fiche), délègue tout autre type à empreinte_avant_decision_artisan.';
revoke all on function public.empreinte_maillon_decision_artisan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.empreinte_maillon_decision_artisan(uuid, jsonb) to service_role;
do $chaine$
begin
  if to_regprocedure('public.empreinte_avant_decision_artisan(uuid,jsonb)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_decision_artisan;
    alter function public.empreinte_maillon_decision_artisan(uuid,jsonb) rename to empreinte_metier_courriel;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.empreinte_maillon_decision_artisan(uuid,jsonb);
  end if;
end $chaine$;
revoke all on function public.empreinte_avant_decision_artisan(uuid,jsonb) from public, anon, authenticated, service_role;

-- ── 3. La clôture après l'envoi ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.finaliser_maillon_decision_artisan(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m public.courriels_durables;
begin
  select * into m from public.courriels_durables where id = p_id for update;
  if m.contexte_metier is null or m.contexte_metier->>'type' is distinct from 'decision_artisan' then
    return public.finaliser_avant_decision_artisan(p_id);
  end if;
  if m.finalisation_etat = 'terminee' then return true; end if;
  if m.fournisseur_id is null or m.etat not in ('accepte', 'livre') then return false; end if;
  -- La décision est marquée notifiée, une seule fois : sa date reste celle du premier envoi accepté.
  if coalesce(m.contexte_metier->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.artisan_validations set notifie_le = now()
     where id = (m.contexte_metier->>'id')::uuid and notifie_le is null;
  end if;
  update public.courriels_durables set finalisation_etat = 'terminee', motif = null where id = p_id;
  insert into public.courriels_evenements (courrier_id, etat) values (p_id, 'finalisation_terminee');
  return true;
end $$;
comment on function public.finaliser_maillon_decision_artisan(text) is
  'Clôture d''un e-mail conservé après son envoi. Tête de chaîne du 22/11/2026 (P1-16) : marque la décision notifiée (artisan_validations.notifie_le), délègue tout autre type à finaliser_avant_decision_artisan.';
revoke all on function public.finaliser_maillon_decision_artisan(text) from public, anon, authenticated;
grant execute on function public.finaliser_maillon_decision_artisan(text) to service_role;
do $chaine$
begin
  if to_regprocedure('public.finaliser_avant_decision_artisan(text)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_decision_artisan;
    alter function public.finaliser_maillon_decision_artisan(text) rename to finaliser_courriel_metier;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.finaliser_maillon_decision_artisan(text);
  end if;
end $chaine$;
revoke all on function public.finaliser_avant_decision_artisan(text) from public, anon, authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
