-- RETOUR ARRIÈRE de 20261014410000_encaissement_reste_jour_de_paris.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la date explicite du jour de Paris posée par « Encaisser » (encaisser_reste_atomique).
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS cette
-- migration, puis recopiée ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque du correctif dans la
-- définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014410000_encaissement_reste_jour_de_paris.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (FIN-13) : « Encaisser » n'envoie plus de date, la base pose le jour de son fuseau (UTC) ; entre
-- minuit et 2 h à Paris, le règlement et la pièce comptable portent la veille (et, le 1er janvier, l'année précédente).
-- Aucune donnée n'est touchée : les règlements enregistrés pendant que la migration était en place gardent leur date.

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

-- X13 : encaisser_reste_atomique sans date explicite
select pg_temp.restaurer_fonction('public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)',
  $marque$Décision X13 du 15/10 (FIN-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.encaisser_reste_atomique(p_org uuid, p_bail uuid, p_appel uuid, p_commande uuid, p_reste_attendu numeric, p_dette_anterieure_attendue numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_org uuid; v_reste numeric; v_anterieure numeric; v_periode date;
 v_avant jsonb; v_apres jsonb; v_resultat jsonb; v_requete jsonb;
 v_commande public.commandes_encaissement_reste%rowtype; v_encaissement uuid;
begin
 if auth.uid() is null or p_commande is null or p_reste_attendu is null
    or p_dette_anterieure_attendue is null or p_reste_attendu <= 0
    or p_reste_attendu::text in ('NaN','Infinity','-Infinity')
    or p_dette_anterieure_attendue::text in ('NaN','Infinity','-Infinity')
    or p_dette_anterieure_attendue < 0 then
   raise exception 'La demande d''encaissement est incomplète. Rechargez les loyers.';
 end if;
 if not exists(select 1 from public.org_ids_avec_roles(
   array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) x where x=p_org)
   or public.bail_hors_portefeuille(p_org,p_bail)
   or not coalesce(public.org_ecriture_ouverte(p_org),false) then
   raise exception 'Accès refusé.';
 end if;
 select organization_id into v_org from public.baux where id=p_bail for update;
 if v_org is distinct from p_org then raise exception 'Accès refusé.'; end if;
 select periode into v_periode from public.appels_loyer
 where id=p_appel and bail_id=p_bail and organization_id=p_org;
 if not found then raise exception 'Appel de loyer introuvable.'; end if;
 v_requete:=jsonb_build_object('reste',p_reste_attendu,'anterieure',p_dette_anterieure_attendue);
 select * into v_commande from public.commandes_encaissement_reste where id=p_commande;
 if found then
   if v_commande.organization_id<>p_org or v_commande.bail_id<>p_bail
      or v_commande.appel_id<>p_appel or v_commande.auteur<>auth.uid()
      or v_commande.requete<>v_requete then raise exception 'Cette demande a déjà été utilisée.'; end if;
   if v_commande.encaissement_id is not null and not exists(
     select 1 from public.encaissements where id=v_commande.encaissement_id) then
     return jsonb_build_object('statut','annule','montant',0,'rejoue',true);
   end if;
   return v_commande.resultat || jsonb_build_object('rejoue',true);
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),'[]'::jsonb)
 into v_avant from public.etat_loyers_bail_brut(p_bail) e;
 select montant_du-montant_couvert into v_reste from public.etat_loyers_bail_brut(p_bail) where appel_id=p_appel;
 select coalesce(sum(montant_du-montant_couvert),0) into v_anterieure
 from public.etat_loyers_bail_brut(p_bail) where periode<v_periode;
 if v_reste<=0 then
   v_resultat:=jsonb_build_object('statut','deja_couvert','montant',0);
 elsif round(v_reste,2)<>round(p_reste_attendu,2)
    or round(v_anterieure,2)<>round(p_dette_anterieure_attendue,2) then
   v_resultat:=jsonb_build_object('statut','solde_modifie','montant',0);
 else
   insert into public.encaissements(organization_id,bail_id,montant,mode,note)
   values(p_org,p_bail,round(v_reste,2),'virement','Encaissé depuis le quittancement') returning id into v_encaissement;
   select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),'[]'::jsonb)
   into v_apres from public.etat_loyers_bail_brut(p_bail) e;
   v_resultat:=jsonb_build_object('statut','enregistre','montant',round(v_reste,2),
     'encaissement_id',v_encaissement,'avant',v_avant,'apres',v_apres);
 end if;
 insert into public.commandes_encaissement_reste(id,organization_id,bail_id,appel_id,auteur,encaissement_id,requete,resultat)
 values(p_commande,p_org,p_bail,p_appel,auth.uid(),v_encaissement,v_requete,v_resultat);
 return v_resultat || jsonb_build_object('rejoue',false);
end $function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014410000';
  end if;
end $retour_arriere$;

commit;
