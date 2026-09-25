-- FICHE DE DÉBOGAGE D'UN COMPTE, POUR LA SUPERVISION (25/09).
--
-- LA DEMANDE, PRÉCISÉE PAR LE PORTEUR. « Je ne veux pas me faire passer pour
-- l'utilisateur, je veux être le super admin, que toutes les actions soient
-- enregistrées, je veux juste pouvoir déboguer au besoin. » La supervision lit
-- déjà toutes les tables d'organisation (`is_super_admin()` dans la RLS), entre
-- dans tout espace avec SA PROPRE identité (traversée journalisée par
-- `log_sa_access`), et agit avec ses droits. Ce qui manquait : réunir en un
-- écran ce que la base sait d'un compte — dont ce que seul le schéma `auth`
-- connaît (dernière connexion, second facteur, blocage) — et tout son journal.
--
-- Cette fonction ne change aucun droit : elle expose au superviseur permanent,
-- en AAL2, quelques colonnes de `auth.users` et `auth.mfa_factors` que
-- PostgREST ne sert pas. Rien n'est écrit, aucune identité n'est empruntée.
create or replace function public.dossier_compte_supervision(p_account uuid)
returns table (
  account_id uuid, email text, cree_le timestamptz, derniere_connexion timestamptz,
  email_confirme_le timestamptz, facteurs_mfa integer, bloque_jusqu_au timestamptz,
  est_super_admin boolean, artisan_id uuid, artisan_raison_sociale text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_mfa integer := null;
begin
  if not public.is_permanent_super_admin() then return; end if;
  -- `auth.mfa_factors` existe sur Supabase, pas sur le banc local d'essai.
  if to_regclass('auth.mfa_factors') is not null then
    execute 'select count(*)::integer from auth.mfa_factors f where f.user_id = $1 and f.status = ''verified''' into v_mfa using p_account;
  end if;
  return query
  select a.id, a.email, a.created_at, u.last_sign_in_at, u.email_confirmed_at, v_mfa, u.banned_until,
         exists (select 1 from public.memberships m where m.account_id = a.id and m.role = 'super_admin' and m.status = 'active'),
         ar.id, ar.raison_sociale
  from public.accounts a
  left join auth.users u on u.id = a.id
  left join public.artisans ar on ar.account_id = a.id
  where a.id = p_account;
end $$;
comment on function public.dossier_compte_supervision(uuid) is
  'Ce que la base sait d''un compte, pour la fiche de débogage de la console. Superviseur permanent en AAL2 seulement ; lecture seule.';
revoke all on function public.dossier_compte_supervision(uuid) from public, anon;
grant execute on function public.dossier_compte_supervision(uuid) to authenticated;

-- Les comptes trouvés par la recherche de la console (⌘K), par adresse.
create or replace function public.rechercher_comptes_supervision(p_texte text)
returns table (account_id uuid, email text, roles text, derniere_connexion timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.email,
         (select string_agg(distinct m.role::text, ', ') from public.memberships m where m.account_id = a.id and m.status = 'active'),
         u.last_sign_in_at
  from public.accounts a
  left join auth.users u on u.id = a.id
  where public.is_permanent_super_admin()
    and length(btrim(coalesce(p_texte, ''))) >= 2
    and a.email ilike '%' || replace(replace(btrim(p_texte), '%', ''), '_', '') || '%'
  order by a.email
  limit 8;
$$;
comment on function public.rechercher_comptes_supervision(text) is
  'Comptes dont l''adresse contient le texte, pour la recherche de la console. Superviseur permanent en AAL2 seulement.';
revoke all on function public.rechercher_comptes_supervision(text) from public, anon;
grant execute on function public.rechercher_comptes_supervision(text) to authenticated;

select public.fermer_fonctions_a_anon();
