-- RETOUR ARRIÈRE de 20261120200000 (date de bascule : un bail repris en cours ne réclame pas les loyers d'avant son
-- arrivée sur Gerimmo).
--
-- Rend à `generer_appels_loyer_interne` sa forme d'avant (remplacement exact inverse), retire les déclencheurs
-- `baux_loyers_suivis_depuis` et `regularisations_avant_bascule`, leurs fonctions, `premier_mois_suivi`, puis la
-- colonne `baux.loyers_suivis_depuis`.
--
-- LE RETOUR SE REFUSE tant qu'un bail porte une date de bascule. Sans elle, le générateur rétabli repartirait de la
-- date d'entrée : au prochain « Générer l'échéancier » ou au cycle du 1er du mois, ce bail recevrait d'un coup tous
-- les termes d'avant Gerimmo, affichés « impayés ». Décider d'abord du sort de ces baux (les garder suivis depuis
-- leur bascule suppose de garder cette migration).
--
-- LE CODE. La fiche du bail lit `loyers_suivis_depuis` par une lecture à part, tolérante : elle s'affiche sans la
-- colonne. Depuis le lot du 22/11/2026, lib/actions-attendues.ts la lit aussi dans sa lecture principale des baux :
-- remettre le code d'AVANT le 22/11 avant de jouer ce retour, sinon l'accueil ne saurait plus lire les baux en cours.
--
-- Atomique et rejouable : une définition déjà rétablie est laissée ; une forme inattendue arrête tout sans rien changer.
do $retour$
declare
  v_def text;
  v_avant text;
  v_apres text;
  n_avant integer;
  n_apres integer;
  n_baux integer;
begin
  -- 0. Aucun bail ne doit dépendre de la date de bascule.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'baux' and column_name = 'loyers_suivis_depuis'
  ) then
    execute 'select count(*) from public.baux where loyers_suivis_depuis is not null' into n_baux;
    if n_baux > 0 then
      raise exception 'Retour refusé : % bail(aux) repris en cours portent une date de bascule. Sans elle, le prochain échéancier appellerait tous leurs loyers depuis l''entrée du locataire.', n_baux;
    end if;
  end if;

  -- 1. generer_appels_loyer_interne : l'échéancier repart de la date d'entrée.
  v_def := pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure);
  v_apres := $sql$
  -- Date de bascule (20/11/2026) : un bail repris en cours n'appelle que les loyers suivis dans Gerimmo, à partir du
  -- mois de son activation (baux.loyers_suivis_depuis). Sans date de bascule, rien ne change : on part de l'entrée.
  v_mois := greatest(date_trunc('month', v.date_debut)::date,
                     coalesce(v.loyers_suivis_depuis, date_trunc('month', v.date_debut)::date));
$sql$;
  v_avant := $sql$
  v_mois := date_trunc('month', v.date_debut)::date;
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    execute replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : generer_appels_loyer_interne a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  -- Droits de la fonction interne : redits, jamais élargis.
  revoke all on function public.generer_appels_loyer_interne(uuid) from public, anon, authenticated;
  grant execute on function public.generer_appels_loyer_interne(uuid) to service_role;

  -- 2. Les deux déclencheurs, leurs fonctions, la règle, puis la colonne (vide, vérifié plus haut).
  drop trigger if exists regularisations_avant_bascule on public.regularisations_charges;
  drop function if exists public.refuser_regularisation_avant_bascule();
  drop trigger if exists baux_loyers_suivis_depuis on public.baux;
  drop function if exists public.poser_loyers_suivis_depuis();
  drop function if exists public.premier_mois_suivi(date);
  alter table public.baux drop constraint if exists baux_loyers_suivis_depuis_premier_du_mois;
  alter table public.baux drop column if exists loyers_suivis_depuis;

  delete from supabase_migrations.schema_migrations where version = '20261120200000';
end $retour$;
notify pgrst, 'reload schema';
