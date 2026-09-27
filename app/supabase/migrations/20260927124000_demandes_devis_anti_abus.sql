-- ══════════════════════════════════════════════════════════════════════════
-- Le formulaire public de devis : une limite de débit tenue par la BASE
-- (audit du 27/09, majeur)
-- ══════════════════════════════════════════════════════════════════════════
--
-- LE DÉFAUT. `demandes_devis_insert_public` (with check true, rôles anon et
-- authenticated) acceptait l'insertion anonyme sans limite. La clé publique
-- étant dans le navigateur, un robot écrit directement par PostgREST : il
-- contourne le pot de miel de l'action serveur et peut remplir la table sans
-- fin (4 000 caractères par message).
--
-- LA CORRECTION, en base parce que c'est la seule porte que PostgREST ne
-- contourne pas :
--  · des bornes de longueur en contraintes (l'action tronquait ; PostgREST,
--    non) — posées NOT VALID pour ne pas refuser d'anciennes lignes ;
--  · un déclencheur BEFORE INSERT qui, sous verrou transactionnel :
--      - ignore en silence le doublon exact (même e-mail, même message, moins
--        de 24 h) — double clic ou robot qui rejoue ;
--      - refuse au-delà de 3 demandes par adresse e-mail et par heure ;
--      - refuse au-delà de 30 demandes par heure, toutes adresses confondues
--        (un robot change d'adresse à chaque envoi ; ce plafond borne la
--        table, au prix d'un refus poli aux prospects d'une heure de crue).
--  Ces seuils sont techniques, pas des règles métier : aucune page du wiki
--  ne fixe de volume de prospection ; ils se relèvent ici sans autre effet.
--
-- Le déclencheur n'est pas une RPC : une fonction `returns trigger` ne
-- s'appelle pas par /rest/v1/rpc, et son droit d'exécution n'est vérifié qu'à
-- la création du déclencheur — on le retire donc à tous les rôles.
--
-- Rejouable : `if not exists` / `drop … if exists` / `create or replace`.

alter table public.demandes_devis drop constraint if exists demandes_devis_longueurs;
alter table public.demandes_devis add constraint demandes_devis_longueurs check (
  length(btrim(nom)) between 1 and 200
  and length(email) between 3 and 320
  and (agence is null or length(agence) <= 200)
  and (telephone is null or length(telephone) <= 40)
  and (nb_lots is null or length(nb_lots) <= 40)
  and (message is null or length(message) <= 4000)
) not valid;

create index if not exists demandes_devis_email_recent_idx
  on public.demandes_devis (lower(email), created_at desc);
create index if not exists demandes_devis_recent_idx
  on public.demandes_devis (created_at desc);

create or replace function public.demandes_devis_limiter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_par_adresse integer; v_total integer;
begin
  -- Une seule insertion compte à la fois : sans ce verrou, cent envois
  -- simultanés liraient tous « zéro demande dans l'heure ».
  perform pg_advisory_xact_lock(hashtext('public.demandes_devis'));

  new.email := lower(btrim(new.email));

  if exists (select 1 from public.demandes_devis d
             where lower(d.email) = new.email
               and coalesce(d.message, '') = coalesce(new.message, '')
               and d.created_at > now() - interval '24 hours') then
    return null; -- doublon : rien n'est écrit, l'envoyeur n'en sait rien
  end if;

  select count(*) into v_par_adresse from public.demandes_devis d
  where lower(d.email) = new.email and d.created_at > now() - interval '1 hour';
  if v_par_adresse >= 3 then
    raise exception 'Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.demandes_devis d
  where d.created_at > now() - interval '1 hour';
  if v_total >= 30 then
    raise exception 'Le formulaire reçoit beaucoup de demandes en ce moment : réessayez dans une heure.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.demandes_devis_limiter() from public, anon, authenticated;

drop trigger if exists demandes_devis_limiter on public.demandes_devis;
create trigger demandes_devis_limiter
  before insert on public.demandes_devis
  for each row execute function public.demandes_devis_limiter();

select public.fermer_fonctions_a_anon();
