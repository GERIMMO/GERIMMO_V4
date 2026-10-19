-- Retour de 20261019123000 (identité de l'éditeur : clés des prestataires). Repose la contrainte des treize clés
-- d'origine et la borne de 20 000 octets, puis retire sa version de l'historique. Se joue dans une transaction externe
-- (psql --single-transaction -v ON_ERROR_STOP=1 -f <retour>), dans la chaîne « Ordre complet » du LISEZ-MOI, après le retour 20261019124000 et avant 20261018231827.
--
-- Le formulaire écrit TOUTES ses clés, nulles quand le champ est vide : après un premier enregistrement, les douze clés
-- nouvelles sont présentes. Le retour les retire si elles sont vides ; si l'une porte une valeur saisie, il REFUSE sans
-- rien modifier : la retirer est une décision du dirigeant, pas celle d'un script. Le retrait ne passe pas par le
-- déclencheur de traçage (supervision_identite_trace) : une session de maintenance n'a pas d'auteur (auth.uid() nul),
-- que supervision_registre exige ; la révision avance d'un cran pour que l'écran recharge, et modifie_le est posé.
-- Il REFUSE aussi, sans rien modifier, si les treize faits d'éditeur pèsent à eux seuls 20 000 octets ou plus (admis
-- depuis la migration, borne 40 000) : la borne d'origine ne pourrait pas être reposée, et les raccourcir est une
-- décision du dirigeant (relecture du 19/10 : sans cette garde, l'erreur brute de Postgres n'expliquait pas la cause).
-- Remettre le code d'avant AVANT ce retour : le nouveau formulaire serait refusé dès son premier enregistrement.
do $identite$
declare
  nouvelles constant text[] := array['coordonneesSupabase','coordonneesVercel','coordonneesResend','coordonneesStripe','coordonneesZohoSign','coordonneesYousign','coordonneesOpenai','coordonneesScaleway','coordonneesGithub','localisationBan','coordonneesBan','coordonneesMeta'];
  def text;
begin
  perform set_config('lock_timeout','10s',true);

  if exists (
    select 1 from public.supervision_identite i, jsonb_each(i.valeurs) e
    where e.key = any(nouvelles) and jsonb_typeof(e.value) <> 'null'
  ) then
    raise exception 'Retour refusé : des coordonnées ou localisations de prestataires sont enregistrées dans supervision_identite ; décision du dirigeant requise avant de les retirer';
  end if;

  if exists (select 1 from public.supervision_identite where octet_length((valeurs - nouvelles)::text) >= 20000) then
    raise exception 'Retour refusé : les treize faits d''éditeur pèsent % octets, au-delà de la borne d''origine (20 000) ; décision du dirigeant requise avant de les raccourcir',
      (select octet_length((valeurs - nouvelles)::text) from public.supervision_identite where singleton);
  end if;

  if exists (select 1 from public.supervision_identite where singleton and valeurs ?| nouvelles) then
    alter table public.supervision_identite disable trigger supervision_identite_trace;
    update public.supervision_identite
      set valeurs = valeurs - nouvelles, revision = revision + 1, modifie_le = now()
      where singleton and valeurs ?| nouvelles;
    alter table public.supervision_identite enable trigger supervision_identite_trace;
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'identite_champs_connus';
  if def is null or def like '%''localisationBan''%' then
    alter table public.supervision_identite drop constraint if exists identite_champs_connus;
    alter table public.supervision_identite add constraint identite_champs_connus check (
      valeurs - array['denomination','forme','capital','siege','rcs','siret','tvaIntracommunautaire','directeurPublication','email','telephone','mediateurNom','mediateurAdresse','mediateurSite']::text[] = '{}'::jsonb
    );
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'supervision_identite_valeurs_check';
  if def is null or def like '%< 40000%' then
    alter table public.supervision_identite drop constraint if exists supervision_identite_valeurs_check;
    alter table public.supervision_identite add constraint supervision_identite_valeurs_check
      check (jsonb_typeof(valeurs) = 'object' and octet_length(valeurs::text) < 20000);
  end if;
end $identite$;

-- Même transaction externe que le retour ; permettre une réapplication tracée.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261019123000';
  end if;
end $historique$;
