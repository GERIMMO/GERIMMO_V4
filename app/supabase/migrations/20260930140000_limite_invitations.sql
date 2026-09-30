-- LA LIMITE DES INVITATIONS PAR ORGANISATION (audit du 30/09/2026, M4)
--
-- Les liens « créer mon mot de passe » des invitations (agent, locataire,
-- renvoi depuis la console) sont fabriqués par l'API d'administration, qui
-- n'a pas de limite de fréquence. Une demande anonyme est déjà bornée par
-- adresse et par IP (20260930130000_limite_liens_mot_de_passe.sql) ; une
-- invitation, elle, part d'un compte connecté et autorisé — mais un compte
-- d'agence compromis, ou un script sur son formulaire, ferait partir des
-- centaines de courriers signés Gerimmo. La garde est ici : au plus `p_max`
-- liens par CLÉ (l'application passe `organisation:<uuid>`, avec 30) sur une
-- heure glissante. Seules les demandes acceptées comptent.
--
-- Même table, même mécanique que la limite anonyme : une empreinte (SHA-256)
-- de la clé, préfixée pour ne jamais croiser l'empreinte d'une adresse ;
-- aucune IP. Accès : `service_role` seul, comme la fonction sœur.

create function public.autoriser_lien_mot_de_passe_cle(p_cle text, p_max integer default 30)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cle text := btrim(coalesce(p_cle, ''));
  v_empreinte text;
begin
  if v_cle = '' or p_max is null or p_max < 1 then
    return false;
  end if;
  v_empreinte := encode(sha256(convert_to('cle:' || v_cle, 'UTF8')), 'hex');

  -- Deux invitations simultanées de la même organisation ne passent pas
  -- toutes les deux sous la limite.
  perform pg_advisory_xact_lock(hashtext('lien_mot_de_passe:' || v_empreinte));

  delete from public.demandes_lien_mot_de_passe where cree_le < now() - interval '1 day';

  if (select count(*) from public.demandes_lien_mot_de_passe
       where empreinte_email = v_empreinte and cree_le > now() - interval '1 hour') >= p_max then
    return false;
  end if;

  insert into public.demandes_lien_mot_de_passe (empreinte_email, ip) values (v_empreinte, null);
  return true;
end $$;

revoke execute on function public.autoriser_lien_mot_de_passe_cle(text, integer) from public, anon, authenticated;
grant execute on function public.autoriser_lien_mot_de_passe_cle(text, integer) to service_role;

select public.fermer_fonctions_a_anon();
