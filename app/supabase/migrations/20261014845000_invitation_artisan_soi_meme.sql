-- Invitation d'artisan : on ne s'invite pas soi-même (relecture du 15/10/2026 du lot « invitation-artisan »).
--
-- Constat : `preparer_invitation_artisan` (20261014840000) acceptait l'adresse du propriétaire qui invite, ou celle de sa
-- propre fiche d'artisan (un même compte peut être propriétaire et artisan) ; l'invitation se trouvait ensuite acceptée
-- par le même compte, qui se rattachait lui-même à son carnet.
--
-- Correctif, en deux morceaux posés par marque :
--   1. `preparer_invitation_artisan` refuse une adresse dont la BOÎTE (même règle que la limite anti-abus :
--      `adresse_canonique_invitation_artisan`, sans « +étiquette » ni points Gmail) est celle du compte qui invite, ou
--      celle de la fiche d'artisan de ce compte : « Vous ne pouvez pas vous inviter vous-même » ;
--   2. `repondre_invitation_artisan` refuse que le compte qui a ENVOYÉ l'invitation l'accepte (cas d'une adresse changée
--      après l'envoi) : la réponse est un refus clair, rien n'est rattaché. Refuser reste possible.
-- Rien d'autre ne change (droits, autres gardes). Aucune ligne n'est touchée.
--
-- Modèle de rejeu à marques (20261013120000) : chaque définition en vigueur est RELUE (pg_get_functiondef) ; l'ancre,
-- UNE ligne, est précédée du bloc du correctif, qui porte la marque. Rejouée, la migration trouve ses marques et ne fait
-- rien ; si une ancre manque ou se répète, elle s'arrête (dans la transaction de `migrations.yml`, rien ne subsiste).
-- Retour arrière : app/supabase/retours-arriere/20261014845000_invitation_artisan_soi_meme.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

-- 1. Inviter : ni sa propre adresse, ni celle de sa propre fiche d'artisan.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  -- Deux envois simultanés vers la même adresse ne créent pas deux invitations.$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (s'inviter soi-même, à l'envoi) : ni sa propre adresse, ni celle de sa fiche d'artisan, voir 20261014845000.
  if exists (select 1 from auth.users u where u.id = (select auth.uid())
               and public.adresse_canonique_invitation_artisan(u.email) = public.adresse_canonique_invitation_artisan(v_email))
     or exists (select 1 from public.artisans a where a.account_id = (select auth.uid()) and a.email is not null
               and public.adresse_canonique_invitation_artisan(a.email) = public.adresse_canonique_invitation_artisan(v_email)) then
    raise exception 'Vous ne pouvez pas vous inviter vous-même : indiquez l’adresse e-mail de l’artisan';
  end if;
  -- Deux envois simultanés vers la même adresse ne créent pas deux invitations.$nouveau$;
begin
  select pg_get_functiondef('public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (s'inviter soi-même, à l'envoi)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014845000 : définition inattendue de preparer_invitation_artisan (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- 2. Accepter : jamais l'invitation qu'on a soi-même envoyée.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  select * into a from public.artisans where account_id = (select auth.uid()) for share;$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (s'inviter soi-même, à l'acceptation) : jamais l'invitation qu'on a envoyée, voir 20261014845000.
  if i.cree_par = (select auth.uid()) then
    return jsonb_build_object('etat', 'en_attente',
      'erreur', 'Vous ne pouvez pas accepter une invitation que vous avez vous-même envoyée.');
  end if;
  select * into a from public.artisans where account_id = (select auth.uid()) for share;$nouveau$;
begin
  select pg_get_functiondef('public.repondre_invitation_artisan(uuid,boolean)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (s'inviter soi-même, à l'acceptation)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014845000 : définition inattendue de repondre_invitation_artisan (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : les clients connectés, jamais `anon` ni PUBLIC.
revoke all on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier),
  public.repondre_invitation_artisan(uuid, boolean) from public, anon;
grant execute on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier),
  public.repondre_invitation_artisan(uuid, boolean) to authenticated;

select public.fermer_fonctions_a_anon();
