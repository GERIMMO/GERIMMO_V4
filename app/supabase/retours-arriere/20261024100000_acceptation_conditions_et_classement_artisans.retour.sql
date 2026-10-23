-- Retour de 20261024100000 (conformité V1, lot 1A : classement des artisans à partir de trois évaluations, R10 ;
-- non-reconduction sans accord exprès, R19). Remettre d'abord le code précédent : la tâche quotidienne des abonnements
-- de cette livraison appelle les deux fonctions retirées ici (sans elles, son étape « non-reconduction » échoue, compte
-- un échec et laisse le reste de la passe se faire ; elle ne s'exécute de toute façon qu'à la date d'effet d'une
-- version substantielle publiée avec la règle de l'accord exprès).
--
-- Ce qui est défait :
--  · `artisans_disponibles_bien` retrouve le tri de 20261023180000 (`order by n.note_publiee desc nulls last, …`) :
--    remplacement inverse à compte exact ; forme d'origine déjà présente : rien à faire ; toute autre forme : arrêt
--    sans rien modifier, en nommant la fonction ;
--  · `abonnements_sans_accord_conditions(text)` et `abonnement_non_reconduction_conditions(uuid, text, text, boolean,
--    boolean)` sont supprimées.
-- Ce qui est conservé : les lignes `abonnement_non_reconduit_conditions` déjà écrites au journal d'audit, et l'état des
-- abonnements (une non-reconduction posée chez Stripe le reste : elle se lève depuis « Mon abonnement » ou Stripe).
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Hors de la chaîne « Ordre complet » du LISEZ-MOI (la
-- migration ne cite pas `aujourdhui_paris()`). À jouer AVANT le retour de 20261023180000 si celui-ci devait l'être.
do $retour_atomique$
declare
  f regprocedure;
  d text;
  ancien constant text := 'order by n.note_publiee desc nulls last,a.raison_sociale,a.id;';
  nouveau constant text := 'order by case when n.publiable then n.note_publiee end desc nulls last,a.raison_sociale,a.id;';
  n_ancien integer;
  n_nouveau integer;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 1. Le tri d'origine des artisans proposés.
  f := to_regprocedure('public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux)');
  if f is not null then
    d := pg_get_functiondef(f);
    n_ancien := (length(d) - length(replace(d, ancien, ''))) / length(ancien);
    n_nouveau := (length(d) - length(replace(d, nouveau, ''))) / length(nouveau);
    if n_nouveau = 1 and n_ancien = 0 then
      execute replace(d, nouveau, ancien);
    elsif not (n_nouveau = 0 and n_ancien = 1) then
      raise exception 'définition inattendue de artisans_disponibles_bien (tri converti : % occurrence(s), tri d''origine : %)',
        n_nouveau, n_ancien;
    end if;
  end if;

  -- 2. Les deux fonctions de la non-reconduction.
  drop function if exists public.abonnements_sans_accord_conditions(text);
  drop function if exists public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean);

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261024100000';
  end if;
end;
$retour_atomique$;
