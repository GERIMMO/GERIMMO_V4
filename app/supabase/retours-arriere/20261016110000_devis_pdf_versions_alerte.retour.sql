-- D18-A compléments du 16/10. Revenir d'abord au code précédent. Les traces métier restent conservées.
drop function if exists public.lire_devis_pdf_version(uuid,integer);
do $retour$
declare d text; debut text; fin text; bloc text;
begin
  select pg_get_functiondef('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)'::regprocedure) into d;
  debut := '-- D18 complément 16/10 alerte durable : RETURN NULL, car RAISE annulerait aussi l''alerte.';
  fin := '      return null;';
  if position(debut in d)>0 then
    bloc := substring(d from position(debut in d));
    bloc := substring(bloc from 1 for position(fin in bloc)+length(fin)-1);
    if bloc not like '%revision_non_affectable_signalee_le%' then raise exception 'Retour D18 alerte : définition inattendue'; end if;
    d := replace(d,bloc,$code$raise exception 'Votre profil ne permet plus de répondre à cette demande (attestation, validation ou zone) : la nouvelle version n''a pas été déposée.';$code$);
    execute d;
  end if;
  select pg_get_functiondef('public.envoyer_mon_devis_prepare(uuid,integer)'::regprocedure) into d;
  d := replace(d,$code$-- D18 complément 16/10 conserver la préparation quand le dépôt est refusé (alerte déjà écrite).
  if v is null then return null; end if;
  $code$,'');
  execute d;
end $retour$;
-- Ne pas supprimer le marqueur ni les alertes : preuves des refus déjà survenus, réapplication sans doublon.
select public.fermer_fonctions_a_anon();

-- Même transaction externe que le DDL ci-dessus (psql --single-transaction).
-- Le chantier peut alors réappliquer exactement cette migration, sans historique mensonger.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from supabase_migrations.schema_migrations where version=$1' using '20261016110000';
  end if;
end $historique$;
