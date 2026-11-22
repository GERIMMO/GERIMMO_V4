-- RETOUR ARRIÈRE de 20261122235500_artisan_absences_semaine_type.sql (audit palier 1, P2-03 : absences et semaine type
-- de l'artisan).
--
-- 1. Retire de `solliciter_artisan_interne` le bloc qui refuse une demande pendant une absence, par remplacement
--    exact : la fonction redevient mot pour mot celle d'avant, et un artisan absent redevient sollicitable.
-- 2. Supprime les six fonctions de ce lot.
-- 3. Les tables `artisan_absences` et `artisan_semaine_type` RESTENT, fermées, avec ce que les artisans y ont écrit :
--    rien n'est effacé. Après le retour de l'application, plus aucun écran ne les lit ni ne les écrit.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente, et AVANT tout retour d'une migration plus
-- ancienne qui touche `solliciter_artisan_interne` ou la fonction du jour de Paris. Rejouable.
do $retour$
declare d text; bloc text;
begin
  select pg_get_functiondef('public.solliciter_artisan_interne(uuid,uuid,uuid)'::regprocedure) into d;
  bloc := $code$  -- P2-03 absence déclarée par l'artisan (22/11/2026) : aucune nouvelle demande pendant la période.
  if exists (select 1 from public.artisan_absences ab
             where ab.artisan_id = p_artisan and public.aujourdhui_paris() between ab.du and ab.au) then
    raise exception 'Cet artisan a indiqué être absent jusqu''au % : aucune demande ne peut lui être envoyée d''ici là',
      (select to_char(max(ab.au), 'DD/MM/YYYY') from public.artisan_absences ab
        where ab.artisan_id = p_artisan and public.aujourdhui_paris() between ab.du and ab.au);
  end if;

$code$;
  if position('P2-03 absence déclarée' in d) > 0 then
    if (length(d) - length(replace(d, bloc, ''))) <> length(bloc) then
      raise exception 'Retour P2-03 absences : bloc inattendu dans la fonction de sollicitation, rien n''est modifié';
    end if;
    execute replace(d, bloc, '');
  end if;
  drop function if exists public.mes_absences_artisan();
  drop function if exists public.declarer_mon_absence(date, date);
  drop function if exists public.retirer_mon_absence(uuid);
  drop function if exists public.absences_artisans_en_cours(uuid, uuid[]);
  drop function if exists public.ma_semaine_type();
  drop function if exists public.enregistrer_ma_semaine_type(jsonb);
  delete from supabase_migrations.schema_migrations where version = '20261122235500';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
