-- RETOUR ARRIÈRE de 20261014420000_capture_fiscale_ordre_des_lignes.sql (décision X11, FIN-09)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiée ici par un générateur — elle n'est pas écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014420000_capture_fiscale_ordre_des_lignes.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (FIN-09) : dans un INSERT à plusieurs lignes sur les encaissements d'un même bail,
-- « déjà encaissé avant » compte de nouveau toutes les autres lignes du même INSERT, et la ventilation loyer / charges
-- de ces lignes est fausse sans message. Aucun chemin actuel de l'application n'insère plusieurs encaissements d'un
-- même bail en une seule instruction : le risque ne revient qu'avec un import ou un script de support.
-- NE MODIFIE AUCUNE donnée : les captures déjà figées (fiscal_encaissements_composantes) restent exactement telles
-- quelles ; seul le calcul des futures captures redevient celui d'avant.

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

-- FIN-09 : calcul de « déjà encaissé avant » dans la capture fiscale
select pg_temp.restaurer_fonction('public.capturer_composantes_fiscales()',
  $marque$X11 (FIN-09)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.capturer_composantes_fiscales()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare origine public.fiscal_encaissements_composantes; enc public.encaissements;
 a record; avant numeric; cumul numeric:=0; gauche numeric; droite numeric;
 hc numeric:=0; ch numeric:=0; affecte numeric:=0; part numeric; partch numeric;
 details jsonb:='[]';
begin
 if new.contre_ecriture_de is not null then
  select * into origine from public.fiscal_encaissements_composantes where ecriture_id=new.contre_ecriture_de;
  if found then
   insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels,version_regle)
   values(new.id,new.organization_id,origine.loyer_hc,origine.charges,origine.non_ventile,origine.appels,origine.version_regle);
  end if;
  return new;
 end if;
 if new.encaissement_id is null or new.categorie<>'loyer' or new.sens<>'recette' then return new; end if;
 select * into enc from public.encaissements where id=new.encaissement_id and organization_id=new.organization_id;
 if not found then return new; end if;
 perform 1 from public.baux where id=enc.bail_id for update;
 select coalesce(sum(montant),0) into avant from public.encaissements
  where bail_id=enc.bail_id and organization_id=enc.organization_id and id<>enc.id;
 for a in select * from public.appels_loyer where bail_id=enc.bail_id and organization_id=enc.organization_id order by periode,id loop
  if a.montant_du<=0 or a.loyer_hc<0 or a.charges<0 or a.montant_du<>a.loyer_hc+a.charges then
   -- Un appel incohérent n'autorise jamais une ventilation inventée.
   cumul:=cumul+greatest(a.montant_du,0); continue;
  end if;
  gauche:=least(a.montant_du,greatest(0,avant-cumul));
  droite:=least(a.montant_du,greatest(0,avant+new.montant-cumul));
  part:=droite-gauche;
  if part>0 then
   partch:=round(droite*a.charges/a.montant_du,2)-round(gauche*a.charges/a.montant_du,2);
   hc:=hc+part-partch; ch:=ch+partch; affecte:=affecte+part;
   details:=details||jsonb_build_array(jsonb_build_object('appel_id',a.id,'periode',a.periode,'loyer_hc_appel',a.loyer_hc,'charges_appel',a.charges,'montant_du',a.montant_du,'couvert_avant',gauche,'couvert_apres',droite,'loyer_hc',part-partch,'charges',partch));
  end if;
  cumul:=cumul+a.montant_du;
 end loop;
 insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels)
 values(new.id,new.organization_id,hc,ch,round(new.montant-affecte,2),details);
 return new;
end $function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014420000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'public.capturer_composantes_fiscales()' as objet,
       case when position('X11 (FIN-09)' in pg_get_functiondef('public.capturer_composantes_fiscales()'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
