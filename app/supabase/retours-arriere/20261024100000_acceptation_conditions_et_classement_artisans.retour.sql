-- Retour de 20261024100000 (conformité V1, lot 1A : classement des artisans à partir de trois évaluations, R10 ;
-- non-reconduction sans accord exprès, R19). Remettre d'abord le code précédent : la tâche quotidienne des abonnements
-- de cette livraison appelle les deux fonctions retirées ici (sans elles, son étape « non-reconduction » échoue, compte
-- un échec et laisse le reste de la passe se faire ; elle ne s'exécute de toute façon qu'à la date d'effet d'une
-- version substantielle publiée avec la règle de l'accord exprès).
--
-- Ce qui est défait :
--  · `artisans_disponibles_bien` retrouve le tri de 20261023180000 (`order by n.note_publiee desc nulls last, …`), et
--    `artisans_affectables_interne` celui de 20260911180000 : remplacement inverse à compte exact de la forme convertie,
--    avec ou sans la collation `fr-x-icu` ; forme d'origine déjà présente : rien à faire ; toute autre forme : arrêt
--    sans rien modifier, en nommant la fonction ;
--  · `abonnements_sans_accord_conditions(text)` et `abonnement_non_reconduction_conditions(uuid, text, text, boolean,
--    boolean)` sont supprimées.
-- Ce qui est conservé : les lignes `abonnement_non_reconduit_conditions` déjà écrites au journal d'audit, et l'état des
-- abonnements (une non-reconduction posée chez Stripe le reste : elle se lève depuis « Mon abonnement » ou Stripe).
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Joué dans la chaîne « Ordre complet » du LISEZ-MOI, bien que la
-- migration ne cite pas `aujourdhui_paris()` (retours du plan de conformité du 24/10, ordre inverse du manifeste : 140000,
-- 130000, 120000, 110000, 100000, 090000). À jouer AVANT le retour de 20261023180000 si celui-ci devait l'être.
do $retour_atomique$
declare
  r record;
  f regprocedure;
  d text;
  avec_icu text;
  sans_icu text;
  n_ancien integer;
  n_icu integer;
  n_sans integer;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 1. Le tri d'origine des artisans proposés et des artisans affectables.
  for r in
    select * from (values
      ('public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux)', 'artisans_disponibles_bien',
       'order by n.note_publiee desc nulls last,a.raison_sociale,a.id;',
       'order by case when n.publiable then n.note_publiee end desc nulls last,%s,a.id;'),
      ('public.artisans_affectables_interne(uuid,public.artisan_metier,public.nature_travaux,text)', 'artisans_affectables_interne',
       'order by n.note_publiee desc nulls last, a.raison_sociale;',
       'order by case when n.publiable then n.note_publiee end desc nulls last, %s, a.id;')
    ) v(signature, nom, ancien, gabarit)
  loop
    f := to_regprocedure(r.signature);
    continue when f is null;
    d := pg_get_functiondef(f);
    avec_icu := format(r.gabarit, 'a.raison_sociale collate "fr-x-icu"');
    sans_icu := format(r.gabarit, 'a.raison_sociale');
    n_ancien := (length(d) - length(replace(d, r.ancien, ''))) / length(r.ancien);
    n_icu := (length(d) - length(replace(d, avec_icu, ''))) / length(avec_icu);
    n_sans := (length(d) - length(replace(d, sans_icu, ''))) / length(sans_icu);
    if n_icu = 1 and n_sans = 0 and n_ancien = 0 then
      execute replace(d, avec_icu, r.ancien);
    elsif n_sans = 1 and n_icu = 0 and n_ancien = 0 then
      execute replace(d, sans_icu, r.ancien);
    elsif not (n_ancien = 1 and n_icu = 0 and n_sans = 0) then
      raise exception 'définition inattendue de % (tri converti : % occurrence(s), tri d''origine : %)',
        r.nom, n_icu + n_sans, n_ancien;
    end if;
  end loop;

  -- 2. Les deux fonctions de la non-reconduction.
  drop function if exists public.abonnements_sans_accord_conditions(text);
  drop function if exists public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean);

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261024100000';
  end if;
end;
$retour_atomique$;
