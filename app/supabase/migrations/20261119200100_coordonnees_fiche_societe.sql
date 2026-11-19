-- SCI-2 (audit après publication de la PR #347, 19/11/2026) : la fiche de la société naît avec les coordonnées connues,
-- et le profil complète ensuite ce qu'elle n'a pas.
--
-- LE DÉFAUT. À l'ouverture de l'espace d'une société, `initialiser_espace_proprietaire()` crée la fiche titulaire de la
-- société (qualité SCI, SCI familiale ou personne morale, rattachée au compte) sans e-mail, et l'adresse saisie plus
-- tard dans le profil n'y arrive jamais. Le récapitulatif du bail réclame « Adresse du propriétaire » et « Adresse
-- e-mail des parties » (bail-nu.ts / bail-meuble.ts lisent l'adresse et l'e-mail du premier détenteur) ; la personne doit
-- deviner qu'il faut compléter la fiche de la société.
--
-- 1. À la création, la fiche de la société reçoit l'e-mail du compte, comme la fiche d'un particulier. Elle recevait déjà
--    l'adresse, le code postal, la ville et le téléphone des métadonnées d'inscription, quand il y en a. La fiche de la
--    personne qui gère la société garde aussi cet e-mail (index par nature, migration 20261119200000). Particulier :
--    inchangé (sa fiche recevait déjà l'e-mail). Les espaces déjà ouverts ne sont pas touchés (fonction idempotente).
-- 2. `completer_fiche_societe_depuis_profil(org)`, appelée après l'enregistrement du profil d'un espace propriétaire
--    (app/actions/organisation.ts) : recopie l'adresse, le téléphone et l'e-mail du profil sur la fiche titulaire de la
--    société, champ par champ, SEULEMENT là où la fiche est vide — jamais par-dessus ce que la personne a saisi. Une
--    adresse partielle déjà portée par la fiche n'est complétée que si elle concorde avec celle du profil : on ne fabrique
--    pas une adresse mêlée de deux sources. Un e-mail déjà porté par une autre société de l'espace est laissé de côté.
--    Aucune donnée existante n'est réécrite par cette migration : les espaces SCI déjà ouverts sont complétés au prochain
--    enregistrement de leur profil.
--
-- Rejouable : remplacement à compte exact (une occurrence), la forme déjà convertie est acceptée ; `create or replace`.

do $migration$
declare
  definition text := pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure);
  avant text := $sql$coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, case when v_societe is null then v_email end, v_telephone,$sql$;
  apres text := $sql$coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, v_email, v_telephone,$sql$;
  n_avant integer;
  n_apres integer;
begin
  -- La fiche de la société et celle de son gérant portent la même adresse : l'ancien index strict doit être parti.
  if to_regclass('public.persons_email_unique_par_agence') is not null
     or to_regclass('public.persons_email_unique_par_agence_et_nature') is null then
    raise exception 'initialiser_espace_proprietaire : appliquer d''abord 20261119200000_email_partage_societe_gerant';
  end if;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_avant = 0 and n_apres = 1 then
    return; -- déjà convertie
  end if;
  if n_avant <> 1 or n_apres <> 0 then
    raise exception 'initialiser_espace_proprietaire : création de la fiche titulaire inattendue (% ancienne(s), % nouvelle(s)) — vérifier la migration avant application', n_avant, n_apres;
  end if;
  execute replace(definition, avant, apres);
end;
$migration$;

create or replace function public.completer_fiche_societe_depuis_profil(p_org uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_adresse text;
  v_cp text;
  v_ville text;
  v_telephone text;
  v_email text;
  v_fiche uuid;
  v_change boolean;
  v_n integer := 0;
begin
  -- Le propriétaire de l'espace, pour sa propre fiche titulaire. Sous ses droits (security invoker) : la RLS de
  -- `persons` et de `organizations` s'applique comme à une modification faite depuis l'annuaire.
  if v_uid is null or not exists (
    select 1 from public.memberships m
     where m.account_id = v_uid and m.organization_id = p_org
       and m.role = 'proprietaire_direct' and m.status = 'active'
  ) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select nullif(btrim(o.address_line1), ''), nullif(btrim(o.postal_code), ''), nullif(btrim(o.city), ''),
         nullif(btrim(o.telephone), ''), nullif(btrim(o.email_contact), '')
    into v_adresse, v_cp, v_ville, v_telephone, v_email
    from public.organizations o
   where o.id = p_org;
  if not found then
    return 0;
  end if;
  -- L'adresse ne se recopie que complète.
  if v_adresse is null or v_cp is null or v_ville is null then
    v_adresse := null; v_cp := null; v_ville := null;
  end if;

  for v_fiche in
    select p.id
      from public.persons p
     where p.organization_id = p_org
       and p.account_id = v_uid
       and p.archived_at is null
       and p.qualite in ('SCI', 'SCI familiale', 'Personne morale')
     order by p.created_at, p.id
  loop
    v_change := false;

    -- Adresse et téléphone : seuls les champs vides reçoivent la valeur du profil. Une adresse déjà commencée sur la
    -- fiche n'est complétée que si ce qu'elle porte concorde avec le profil (même voie, même code postal, même ville).
    update public.persons p
       set address_line1 = case when nullif(btrim(p.address_line1), '') is null then v_adresse else p.address_line1 end,
           postal_code   = case when nullif(btrim(p.postal_code), '') is null then v_cp else p.postal_code end,
           city          = case when nullif(btrim(p.city), '') is null then v_ville else p.city end
     where p.id = v_fiche
       and v_adresse is not null
       and (nullif(btrim(p.address_line1), '') is null or nullif(btrim(p.postal_code), '') is null or nullif(btrim(p.city), '') is null)
       and (nullif(btrim(p.address_line1), '') is null or lower(btrim(p.address_line1)) = lower(v_adresse))
       and (nullif(btrim(p.postal_code), '') is null or btrim(p.postal_code) = v_cp)
       and (nullif(btrim(p.city), '') is null or lower(btrim(p.city)) = lower(v_ville));
    if found then v_change := true; end if;

    update public.persons p
       set telephone = v_telephone
     where p.id = v_fiche
       and v_telephone is not null
       and nullif(btrim(p.telephone), '') is null;
    if found then v_change := true; end if;

    -- E-mail : l'index par nature laisse la société partager l'adresse de la personne qui la gère, pas celle d'une
    -- autre société de l'espace. Dans ce cas, la fiche garde son e-mail vide (à compléter depuis l'annuaire).
    if v_email is not null then
      begin
        update public.persons p
           set email = v_email
         where p.id = v_fiche
           and nullif(btrim(p.email), '') is null;
        if found then v_change := true; end if;
      exception when unique_violation then
        null;
      end;
    end if;

    if v_change then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

comment on function public.completer_fiche_societe_depuis_profil(uuid) is
  'SCI-2 (19/11/2026) : recopie l''adresse, le téléphone et l''e-mail du profil d''un espace propriétaire sur la fiche titulaire de la société, uniquement dans les champs vides. Rend le nombre de fiches complétées.';

revoke all on function public.completer_fiche_societe_depuis_profil(uuid) from public, anon;
grant execute on function public.completer_fiche_societe_depuis_profil(uuid) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
