-- LA LIMITE DES LIENS « MOT DE PASSE » DEMANDÉS SANS ÊTRE CONNECTÉ (30/09/2026)
--
-- Les liens de création / réinitialisation du mot de passe ne passent plus
-- par `resetPasswordForEmail` (flux PKCE : le lien ne marchait que dans le
-- navigateur qui l'avait DEMANDÉ — celui du super admin ou de l'admin
-- d'agence, jamais celui du destinataire). L'application fabrique désormais
-- le jeton par l'API d'administration (`auth.admin.generateLink`) et envoie
-- elle-même l'e-mail (src/lib/lien-mot-de-passe.ts).
--
-- L'API d'administration n'a PAS la limite de fréquence que Supabase Auth
-- applique à « mot de passe oublié ». Sans garde, le formulaire public
-- deviendrait une machine à envoyer des e-mails à n'importe quelle adresse.
-- La garde est ici : au plus 3 envois par adresse et 20 par adresse IP sur
-- une heure glissante. Seules les demandes ACCEPTÉES comptent : un refus ne
-- prolonge pas l'attente.
--
-- Ce qui est conservé : une empreinte (SHA-256) de l'adresse, jamais
-- l'adresse elle-même, l'IP telle que la plateforme la transmet, l'heure.
-- Les lignes de plus d'un jour sont effacées à chaque appel.
--
-- Accès : la table n'est lisible par aucun rôle de l'application (RLS active,
-- aucune politique, aucun droit) ; la fonction n'est exécutable que par
-- `service_role` — l'application l'appelle avec le client de service, juste
-- avant de fabriquer le lien.

create table public.demandes_lien_mot_de_passe (
  id bigint generated always as identity primary key,
  empreinte_email text not null,
  ip text,
  cree_le timestamptz not null default now()
);
create index demandes_lien_mdp_email_idx on public.demandes_lien_mot_de_passe (empreinte_email, cree_le);
create index demandes_lien_mdp_ip_idx on public.demandes_lien_mot_de_passe (ip, cree_le);

alter table public.demandes_lien_mot_de_passe enable row level security;
revoke all on table public.demandes_lien_mot_de_passe from public, anon, authenticated;

create function public.autoriser_lien_mot_de_passe(p_email text, p_ip text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_empreinte text;
begin
  if v_email = '' then
    return false;
  end if;
  v_empreinte := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- Deux demandes simultanées pour la même adresse ne passent pas toutes les
  -- deux sous la limite.
  perform pg_advisory_xact_lock(hashtext('lien_mot_de_passe:' || v_empreinte));

  delete from public.demandes_lien_mot_de_passe where cree_le < now() - interval '1 day';

  if (select count(*) from public.demandes_lien_mot_de_passe
       where empreinte_email = v_empreinte and cree_le > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  if v_ip is not null and (select count(*) from public.demandes_lien_mot_de_passe
       where ip = v_ip and cree_le > now() - interval '1 hour') >= 20 then
    return false;
  end if;

  insert into public.demandes_lien_mot_de_passe (empreinte_email, ip) values (v_empreinte, v_ip);
  return true;
end $$;

revoke execute on function public.autoriser_lien_mot_de_passe(text, text) from public, anon, authenticated;
grant execute on function public.autoriser_lien_mot_de_passe(text, text) to service_role;

select public.fermer_fonctions_a_anon();
