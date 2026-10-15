-- RETOUR ARRIÈRE de 20261014416000_quittance_jour_de_paris.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la date d'émission des quittances au jour de Paris — la fonction resynchroniser_quittances (marque `Décision X13 du 15/10 (FIN-13)`)
-- et le défaut de la colonne quittances.date_emission (retour à CURRENT_DATE, le jour du fuseau de la session).
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS cette
-- migration, puis recopiée ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque du correctif dans la
-- définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014416000_quittance_jour_de_paris.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (constat de relecture du 15/10 sur FIN-13) : entre minuit et 2 h à Paris, la quittance émise après « Encaisser »
-- porte la veille du règlement qu'elle atteste. Aucune quittance n'est redatée : seules les émissions à venir changent de jour.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;


begin;
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

-- X13 : resynchroniser_quittances sans la date de Paris
select pg_temp.restaurer_fonction('public.resynchroniser_quittances(uuid)',
  $marque$Décision X13 du 15/10 (FIN-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.resynchroniser_quittances(p_bail uuid)
 RETURNS TABLE(quittances integer, recus integer, retirees integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_quittances int := 0;
  v_recus int := 0;
  v_retirees int := 0;
  r record;
  v_maj int;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;

  for r in select * from public.etat_loyers_bail_brut(p_bail) loop
    if r.statut = 'paye' then
      -- Encaissement intégral : quittance libératoire du montant appelé
      if exists (select 1 from public.quittances q where q.appel_id = r.appel_id) then
        update public.quittances q
           set est_quittance = true, montant = r.montant_du,
               date_emission = current_date, email_envoye_at = null
         where q.appel_id = r.appel_id
           and (q.est_quittance is distinct from true or q.montant is distinct from r.montant_du);
        get diagnostics v_maj = row_count;
        v_quittances := v_quittances + v_maj;
      else
        insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
        values (v_org, p_bail, r.appel_id, true, r.montant_du);
        v_quittances := v_quittances + 1;
      end if;

    elsif r.montant_couvert > 0 then
      -- Paiement partiel : reçu qui CONSTATE, jamais quittance (RM-3.4.2)
      if exists (select 1 from public.quittances q where q.appel_id = r.appel_id) then
        update public.quittances q
           set est_quittance = false, montant = r.montant_couvert,
               date_emission = current_date, email_envoye_at = null
         where q.appel_id = r.appel_id
           and (q.est_quittance is distinct from false or q.montant is distinct from r.montant_couvert);
        get diagnostics v_maj = row_count;
        v_recus := v_recus + v_maj;
      else
        insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
        values (v_org, p_bail, r.appel_id, false, r.montant_couvert);
        v_recus := v_recus + 1;
      end if;

    else
      -- Plus rien de perçu sur cette période : il n'y a plus rien à attester.
      -- La quittance n'est pas une écriture comptable (RM-A6.3 ne s'y applique
      -- pas) : c'est un document dérivé de l'encaissé, il disparaît avec lui.
      delete from public.quittances q where q.appel_id = r.appel_id;
      get diagnostics v_maj = row_count;
      v_retirees := v_retirees + v_maj;
    end if;
  end loop;

  return query select v_quittances, v_recus, v_retirees;
end;
$function$
$definition_anterieure$);

-- Le défaut de la colonne revient au jour de la session, s'il est celui de la migration (sinon il a été changé depuis : on n'y touche pas).
do $retour_arriere$
begin
  if exists (select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
             where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission'
               and pg_get_expr(d.adbin, d.adrelid) like '%Europe/Paris%') then
    alter table public.quittances alter column date_emission set default current_date;
  end if;
end $retour_arriere$;


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014416000';
  end if;
end $retour_arriere$;

commit;
