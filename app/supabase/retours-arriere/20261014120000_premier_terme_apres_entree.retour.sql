-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014120000_premier_terme_apres_entree.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014120000_premier_terme_apres_entree.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (PROP-14) : le premier terme d'un bail qui entre en cours de mois redevient exigible le
-- jour d'échéance du mois, donc avant l'entrée (le locataire apparaît « Impayé » avant d'avoir emménagé).
-- Ne modifie aucun appel : les appels générés pendant que la migration était en place gardent leur échéance (le 16, par exemple).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- D01 : échéance du premier terme
select pg_temp.restaurer_fonction('public.generer_appels_loyer_interne(uuid)',
  $marque$Décision D01 du 14/10 (PROP-14)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.generer_appels_loyer_interne(p_bail uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_mois date;
  v_fin date;
  v_jours_mois int;
  v_jours_dus int;
  v_premier int;   -- premier jour facturé du mois
  v_dernier int;   -- dernier jour facturé du mois
  v_loyer numeric;
  v_charges numeric;
  v_crees int := 0;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if v.etat not in ('actif', 'preavis', 'termine') then
    raise exception 'Les appels de loyer ne se génèrent que sur un bail actif';
  end if;
  if v.date_debut is null then raise exception 'Le bail n''a pas de date de début'; end if;

  v_mois := date_trunc('month', v.date_debut)::date;
  v_fin := least(
    date_trunc('month', current_date)::date,
    coalesce(date_trunc('month', v.date_fin)::date, date_trunc('month', current_date)::date)
  );

  while v_mois <= v_fin loop
    if not exists (select 1 from public.appels_loyer a where a.bail_id = p_bail and a.periode = v_mois) then
      v_jours_mois := extract(day from (v_mois + interval '1 month' - interval '1 day'))::int;

      -- Bornes de facturation dans le mois : entrée en cours de mois et/ou
      -- sortie en cours de mois réduisent la période due.
      v_premier := case
        when v_mois = date_trunc('month', v.date_debut)::date then extract(day from v.date_debut)::int
        else 1 end;
      v_dernier := case
        when v.date_fin is not null and v_mois = date_trunc('month', v.date_fin)::date
          then extract(day from v.date_fin)::int
        else v_jours_mois end;
      v_jours_dus := greatest(0, v_dernier - v_premier + 1);

      -- Un seul arrondi, à la fin, sur chaque composante.
      if v_jours_dus = v_jours_mois then
        v_loyer := round(coalesce(v.loyer_hc, 0), 2);
        v_charges := round(coalesce(v.charges, 0), 2);
      else
        v_loyer := round(coalesce(v.loyer_hc, 0) * v_jours_dus / v_jours_mois, 2);
        v_charges := round(coalesce(v.charges, 0) * v_jours_dus / v_jours_mois, 2);
      end if;

      insert into public.appels_loyer
        (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
      values (
        v.organization_id, p_bail, v_mois, v_loyer, v_charges,
        v_loyer + v_charges,   -- le total EST la somme des lignes affichées
        -- Audit 27/09 : à terme échu, le terme du mois se paie le mois suivant.
        ((case when v.paiement_echeance = 'echu' then v_mois + interval '1 month' else v_mois end)::date
          + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_jours_dus < v_jours_mois
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014120000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
