-- LE LIEN DE CONFIRMATION DU MOBILE ENVOYÉ AU GARANT EST ADMIS PARMI LES E-MAILS QUI PARTENT
-- (audit palier 1 du 22/11/2026, P1-01).
--
-- LE DÉFAUT. Pour signer électroniquement un bail qui a un garant, ou un acte de cautionnement, Gerimmo envoie d'abord
-- au garant un lien à usage unique : il y confirme lui-même son numéro de mobile (migration 20261024120000). Cet e-mail
-- partait sans « contexte métier ». Depuis la liste fermée des e-mails (lot 1 du 09/11), tout envoi sans contexte
-- reconnu est suspendu : le garant ne recevait jamais son lien, et la signature électronique d'un bail avec garant
-- était bloquée.
--
-- LA RÈGLE. Un type de contexte de plus, « confirmation_mobile_garant », reconnu par les deux contrôles par lesquels
-- passe tout e-mail conservé :
--   1. `empreinte_metier_courriel` — la preuve, recalculée juste avant l'envoi et à chaque reprise : le lien visé (par
--      l'empreinte de son jeton) est toujours ouvert — ni utilisé, ni annulé, ni échu —, pour ce garant, ce circuit de
--      signature encore « prêt », cette organisation active, demandé par un propriétaire toujours membre actif, et
--      l'adresse du destinataire est toujours celle du garant figée dans le circuit. Sous arrêt d'urgence des
--      signatures (ou arrêt général), rien ne repart. Sinon : pas de preuve, pas d'envoi.
--   2. `finaliser_courriel_metier` — une fois l'e-mail accepté par le service d'envoi, sa ligne est close : rien
--      d'autre à consigner (l'usage du lien est suivi dans `confirmations_mobile_caution`).
--
-- Même construction que les types précédents (20261116201423) : la tête de chaîne est renommée et la nouvelle tête lui
-- délègue tout autre type, à l'identique. Rejouable : chaque maillon se crée d'abord sous son propre nom
-- (« …_maillon_lien_garant ») et ne prend la tête que s'il n'est pas déjà posé ; un second passage ne touche donc pas à
-- la chaîne, même si une migration plus récente l'a prolongée au-dessus de ce maillon.
-- Aucune donnée lue ni réécrite.
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261122130000_lien_garant_admis.retour.sql

-- 1. La preuve.
create or replace function public.empreinte_maillon_lien_garant(p_org uuid, p_contexte jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.confirmations_mobile_caution;
  dest text;
begin
  -- Tout autre type suit la chaîne existante, sans aucun changement (« is distinct from » : un type absent aussi).
  if p_contexte->>'type' is distinct from 'confirmation_mobile_garant' then
    return public.empreinte_avant_lien_garant(p_org, p_contexte);
  end if;
  -- Les formats d'abord : aucune conversion sur une valeur mal formée.
  if p_org is null
     or coalesce(p_contexte->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_contexte->>'acteur', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_contexte->>'jeton_empreinte', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_contexte->>'garant', '') = '' then
    return null;
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org and o.status in ('active', 'essai')) then
    return null;
  end if;
  -- Arrêt d'urgence des signatures, ou arrêt général : aucun lien ne repart tant qu'il n'est pas levé.
  if exists (select 1 from public.supervision_arrets a where a.arrete and a.cle in ('global', 'signatures')) then
    return null;
  end if;
  -- Le lien visé, toujours ouvert, pour ce garant, ce circuit, cette organisation et ce demandeur.
  select * into c from public.confirmations_mobile_caution x
   where x.jeton_empreinte = p_contexte->>'jeton_empreinte'
     and x.organization_id = p_org
     and x.circuit_id = (p_contexte->>'id')::uuid
     and x.garant_id = p_contexte->>'garant'
     and x.demande_par = (p_contexte->>'acteur')::uuid
     and x.utilise_le is null and x.annulee_le is null and x.expire_le > now();
  if not found then return null; end if;
  -- Le demandeur est toujours le propriétaire actif de cet espace (même règle que la demande du lien).
  if not exists (select 1 from public.memberships m
                  where m.organization_id = p_org and m.account_id = c.demande_par
                    and m.status = 'active' and m.role = 'proprietaire_direct') then
    return null;
  end if;
  -- Le circuit est toujours prêt, pour le même acte, et le garant y figure : son adresse est celle du destinataire.
  select nullif(lower(btrim(s->>'email')), '') into dest
    from public.bail_signature_circuits b
    cross join lateral jsonb_array_elements(b.signataires) s
   where b.id = c.circuit_id and b.organization_id = p_org and b.etat = 'pret' and b.modele = c.acte
     and s->>'qualite' = 'Garant' and s->>'personId' = c.garant_id
   limit 1;
  if dest is null
     or encode(sha256(convert_to(dest, 'UTF8')), 'hex') is distinct from p_contexte->>'destinataire' then
    return null;
  end if;
  -- Ni la liste des signataires ni la date de mise à jour du circuit n'entrent dans la preuve : la confirmation d'un
  -- AUTRE garant les modifie entre la conservation et l'envoi, sans rien changer à ce lien-ci.
  return encode(sha256(convert_to(jsonb_build_array(
    c.id, c.jeton_empreinte, c.circuit_id, c.garant_id, c.acte, c.demande_par, c.expire_le, dest)::text, 'UTF8')), 'hex');
end $$;
comment on function public.empreinte_maillon_lien_garant(uuid, jsonb) is
  'Preuve métier d''un e-mail conservé, recalculée avant l''envoi. Tête de chaîne du 22/11/2026 : traite « confirmation_mobile_garant » (lien du garant), délègue tout autre type à empreinte_avant_lien_garant.';
revoke all on function public.empreinte_maillon_lien_garant(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.empreinte_maillon_lien_garant(uuid, jsonb) to service_role;
do $chaine$
begin
  if to_regprocedure('public.empreinte_avant_lien_garant(uuid,jsonb)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_lien_garant;
    alter function public.empreinte_maillon_lien_garant(uuid,jsonb) rename to empreinte_metier_courriel;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.empreinte_maillon_lien_garant(uuid,jsonb);
  end if;
end $chaine$;
revoke all on function public.empreinte_avant_lien_garant(uuid,jsonb) from public, anon, authenticated, service_role;

-- 2. La clôture après l'envoi.
create or replace function public.finaliser_maillon_lien_garant(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m public.courriels_durables;
begin
  select * into m from public.courriels_durables where id = p_id for update;
  if m.contexte_metier is null or m.contexte_metier->>'type' is distinct from 'confirmation_mobile_garant' then
    return public.finaliser_avant_lien_garant(p_id);
  end if;
  if m.finalisation_etat = 'terminee' then return true; end if;
  if m.fournisseur_id is null or m.etat not in ('accepte', 'livre') then return false; end if;
  -- Rien d'autre à consigner : l'usage du lien est suivi dans confirmations_mobile_caution.
  update public.courriels_durables set finalisation_etat = 'terminee', motif = null where id = p_id;
  insert into public.courriels_evenements (courrier_id, etat) values (p_id, 'finalisation_terminee');
  return true;
end $$;
comment on function public.finaliser_maillon_lien_garant(text) is
  'Clôture d''un e-mail conservé après son envoi. Tête de chaîne du 22/11/2026 : traite « confirmation_mobile_garant », délègue tout autre type à finaliser_avant_lien_garant.';
revoke all on function public.finaliser_maillon_lien_garant(text) from public, anon, authenticated;
grant execute on function public.finaliser_maillon_lien_garant(text) to service_role;
do $chaine$
begin
  if to_regprocedure('public.finaliser_avant_lien_garant(text)') is null then
    -- Première pose : l'ancienne tête devient le maillon d'avant, le nouveau maillon prend la tête.
    alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_lien_garant;
    alter function public.finaliser_maillon_lien_garant(text) rename to finaliser_courriel_metier;
  else
    -- Déjà posé : on ne touche pas à la chaîne. Une migration plus récente a pu la prolonger au-dessus de ce
    -- maillon — recréer la tête ici écraserait le sien.
    drop function public.finaliser_maillon_lien_garant(text);
  end if;
end $chaine$;
revoke all on function public.finaliser_avant_lien_garant(text) from public, anon, authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
