-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014223000_alerte_relais_reprise_destinataire_parti.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base sur laquelle 20261014221000 était appliquée
-- et 20261014223000 non, puis recopiée ici par un générateur — elle n'est pas écrite à la main. Rejouable : sans la
-- marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- ORDRE : ce script se joue AVANT celui de 20261014221000 (qui défait ensuite l'accusé réservé au destinataire).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014223000_alerte_relais_reprise_destinataire_parti.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (relecture de D09, SUP-03) : une alerte de relais dont le destinataire a perdu son
-- habilitation n'est plus reprenable que si elle est « non acheminée » ; une alerte escaladée vers un créateur parti
-- reste alors sans personne pour l'accuser. C'est aussi le retour à D09-A à la lettre, si le dirigeant refuse l'écart.
-- Les lignes déjà accusées (accusee_par, supervision_operations) restent telles quelles : aucune donnée n'est défaite.
-- L'écran (app/src/app/admin/relais/vacances.tsx) proposerait alors un bouton que la base refuserait : à revenir avec le code.

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

-- accuser_alerte_vacances (SUP-03, reprise)
select pg_temp.restaurer_fonction('public.accuser_alerte_vacances(uuid)',
  $marque$Audit du 14/10 (SUP-03, reprise)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.accuser_alerte_vacances(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Responsable habilité et double vérification requis'; end if;
 -- Audit du 14/10 (SUP-03) : décision D09, seul le destinataire accuse réception. Après une
 -- escalade, `destinataire` est la personne vers qui l'alerte a été escaladée. Une alerte non
 -- acheminée (destinataire plus habilité) reste reprenable, faute de quoi nul ne pourrait la fermer.
 update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee'
  and (destinataire=auth.uid() or (statut='non_acheminee' and not public.responsable_supervision_habilite(destinataire)));
 if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid());
 elsif exists(select 1 from public.supervision_alertes_internes where id=p_id and statut<>'accusee') then
  raise exception 'Cette alerte est adressée à un autre responsable : seul son destinataire peut en accuser réception';
 end if;
end $function$
$definition_anterieure$);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014223000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
