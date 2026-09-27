-- AUDIT SÉCURITÉ DU 27/09 — DÉTAILS.
--
-- 1. Tables RLS sans politique (`abonnements`, `abonnement_evenements`,
--    `signature_evenements`) : c'est VOULU (lecture et écriture serveur
--    seulement : webhooks, tâches, fonctions definer). Un commentaire le dit,
--    pour que l'alerte « RLS enabled, no policy » soit reconnue comme attendue.
-- 2. `accounts.mfa_actif` : modifiable par son titulaire et lue nulle part —
--    une donnée trompeuse. Le droit de mise à jour est retiré ; l'état réel du
--    second facteur se lit dans Supabase Auth.
-- 3. `anon` gardait `SELECT` sur 36 tables et vues de gestion (encaissements,
--    quittances, écritures, messages…). Aucune fuite (les politiques rendent
--    vide sans `auth.uid()`), mais un droit inutile : défense en profondeur,
--    il est retiré, sauf pour ce que le site public lit réellement
--    (`publications`, `site_pages`, `tarif_tranches`) et `demandes_devis`
--    (formulaire public, traité à part).
--
-- Idempotent : COMMENT, REVOKE.

do $$
begin
  if to_regclass('public.abonnements') is not null then
    comment on table public.abonnements is
      'RLS sans politique VOULUE : lecture/écriture serveur seulement (webhook Stripe, /api/cron/abonnements, fonctions definer mon_abonnement/etat_abonnement).';
  end if;
  if to_regclass('public.abonnement_evenements') is not null then
    comment on table public.abonnement_evenements is
      'RLS sans politique VOULUE : journal d''idempotence du webhook Stripe, écrit et lu par le serveur seulement.';
  end if;
  if to_regclass('public.signature_evenements') is not null then
    comment on table public.signature_evenements is
      'RLS sans politique VOULUE : file des événements Youtrust, écrite par le webhook et traitée par la tâche signatures (serveur seulement).';
  end if;
end $$;

revoke update (mfa_actif) on public.accounts from authenticated, anon;

do $$
declare t record;
begin
  for t in
    select distinct g.table_name
    from information_schema.role_table_grants g
    where g.grantee = 'anon' and g.table_schema = 'public' and g.privilege_type = 'SELECT'
      and g.table_name not in ('publications', 'site_pages', 'tarif_tranches', 'demandes_devis')
  loop
    execute format('revoke select on public.%I from anon', t.table_name);
  end loop;
end $$;
