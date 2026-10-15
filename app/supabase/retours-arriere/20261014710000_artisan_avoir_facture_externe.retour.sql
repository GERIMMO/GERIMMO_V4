-- RETOUR ARRIÈRE de 20261014710000_artisan_avoir_facture_externe.sql (lot « avoir-facture-externe », décision D24-C)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Méthode : CHIRURGICALE, comme 20261014310000 et 20261014311000. La migration a AJOUTÉ (a) dans artisan_externe_ecrire,
-- un bloc délimité par « -- >> Audit du 14/10 (ARC-07, D24-C) » et « -- << Audit du 14/10 (ARC-07, D24-C) » (la branche
-- « annuler_facture ») et, sur la garde du chantier terminé, « p_action in ('facture','annuler_facture') » à la place de
-- « p_action='facture' » ; (b) dans artisan_reglement_ecrire, un bloc délimité par les mêmes marques ; (c) dans
-- mon_activite_artisan_privee, la clé 'annulee_le' de la facture externe et la clé 'avoirs' ; (d) la table
-- artisan_avoirs_externes, ses deux déclencheurs et leur fonction ; (e) la colonne artisan_factures_externes.annulee_le
-- et l'index unique partiel « une facture EN VIGUEUR par chantier », à la place de la contrainte unique(chantier_id).
-- Ce script relit les définitions d'AUJOURD'HUI et en retire exactement ces ajouts : il n'efface aucune modification
-- apportée depuis par une autre migration, et aucune définition n'est écrite de mémoire. Il se rejoue sans effet. S'il
-- trouve une marque sans bloc intact, il s'arrête sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014710000_artisan_avoir_facture_externe.retour.sql
--
-- REFUSE (sans rien modifier) dès qu'un avoir a été émis ou qu'une facture a été annulée : un avoir est une pièce
-- comptable numérotée, le supprimer laisserait un trou dans la suite, et une facture annulée redeviendrait « en vigueur »
-- à côté de celle qui la remplace. Ce cas relève d'une décision du dirigeant (et de l'avis comptable), pas d'un script.
-- Le module « clients externes » étant désactivé en production, aucun avoir n'y est attendu.
--
-- RÉINTRODUIT le défaut corrigé (ARC-07) : une facture externe déposée ne peut plus être annulée ; une seule facture par
-- chantier. NE TOUCHE AUCUNE DONNÉE : la table et la colonne ne sont retirées que vides (vérifié avant tout travail).
--
-- À jouer AVANT le retour de 20261014500000 (la fonction du jour de Paris), qui refuse tant qu'une fonction la cite.
-- Indépendant des retours de 20261014310000 et 20261014311000 (blocs différents, dans l'un ou l'autre ordre).

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

-- Pré-contrôle en lecture seule, avant tout travail : aucun avoir émis, aucune facture annulée, jamais deux factures sur
-- un même chantier (la contrainte d'origine ne pourrait pas revenir), et aucune AUTRE fonction ne lit la table des avoirs.
do $retour_arriere$
declare v_avoirs bigint := 0; v_annulees bigint := 0; v_chantiers bigint := 0; v_autres text;
begin
  if to_regclass('public.artisan_avoirs_externes') is not null then
    execute 'select count(*) from public.artisan_avoirs_externes' into v_avoirs;
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.artisan_factures_externes'::regclass and attname = 'annulee_le' and not attisdropped) then
    execute 'select count(*) from public.artisan_factures_externes where annulee_le is not null' into v_annulees;
  end if;
  select count(*) into v_chantiers from (
    select 1 from public.artisan_factures_externes group by chantier_id having count(*) > 1
  ) q;
  if v_avoirs > 0 or v_annulees > 0 or v_chantiers > 0 then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : % avoir(s) émis, % facture(s) annulée(s), % chantier(s) à plusieurs factures. Un avoir est une pièce numérotée : la décision revient au dirigeant (voir LISEZ-MOI.md).', v_avoirs, v_annulees, v_chantiers;
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_autres
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not in ('artisan_externe_ecrire', 'artisan_reglement_ecrire', 'mon_activite_artisan_privee', 'artisan_avoirs_externes_garde')
     and p.prosrc like '%artisan_avoirs_externes%';
  if v_autres is not null then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : la table artisan_avoirs_externes est lue par % (écrit(e) après la migration). Voir LISEZ-MOI.md.', v_autres;
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- 1/6. artisan_externe_ecrire : la branche « annuler_facture » retirée, la garde du chantier terminé rétablie.
do $retour_arriere$
declare
  v_def text;
  v_debut text := '-- >> Audit du 14/10 (ARC-07, D24-C)';
  v_fin text := E'-- << Audit du 14/10 (ARC-07, D24-C)\n  ';
  v_garde text := $garde$not(p_action in ('facture','annuler_facture') and h.statut='termine')$garde$;
  v_garde_origine text := $garde$not(p_action='facture' and h.statut='termine')$garde$;
  p_debut int; p_fin int;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  p_debut := position(v_debut in v_def);
  if p_debut = 0 then
    raise notice 'artisan_externe_ecrire : marque ARC-07 (D24-C) absente, rien à faire';
    return;
  end if;
  p_fin := position(v_fin in v_def);
  if p_fin = 0 or p_fin < p_debut
     or (length(v_def) - length(replace(v_def, v_debut, ''))) <> length(v_debut)
     or (length(v_def) - length(replace(v_def, v_fin, ''))) <> length(v_fin)
     or (length(v_def) - length(replace(v_def, v_garde, ''))) <> length(v_garde) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc ARC-07 (D24-C) de artisan_externe_ecrire n''est plus intact (marques ou garde retouchées ou répétées). Le retirer à la main.';
  end if;
  v_def := left(v_def, p_debut - 1) || substr(v_def, p_fin + length(v_fin));
  execute replace(v_def, v_garde, v_garde_origine);
  raise notice 'artisan_externe_ecrire : bloc ARC-07 (D24-C) retiré, garde du chantier terminé rétablie';
end $retour_arriere$;

-- 2/6. artisan_reglement_ecrire : le refus d'un règlement sur une facture annulée.
do $retour_arriere$
declare
  v_def text;
  v_debut text := E'\n  -- >> Audit du 14/10 (ARC-07, D24-C)';
  v_fin text := '-- << Audit du 14/10 (ARC-07, D24-C)';
  p_debut int; p_fin int;
begin
  select pg_get_functiondef('public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)'::regprocedure) into v_def;
  p_debut := position(v_debut in v_def);
  if p_debut = 0 then
    raise notice 'artisan_reglement_ecrire : marque ARC-07 (D24-C) absente, rien à faire';
    return;
  end if;
  p_fin := position(v_fin in v_def);
  if p_fin = 0 or p_fin < p_debut
     or (length(v_def) - length(replace(v_def, v_debut, ''))) <> length(v_debut)
     or (length(v_def) - length(replace(v_def, v_fin, ''))) <> length(v_fin) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc ARC-07 (D24-C) de artisan_reglement_ecrire n''est plus intact (marques retouchées ou répétées). Le retirer à la main.';
  end if;
  execute left(v_def, p_debut - 1) || substr(v_def, p_fin + length(v_fin));
  raise notice 'artisan_reglement_ecrire : bloc ARC-07 (D24-C) retiré';
end $retour_arriere$;

-- 3/6. mon_activite_artisan_privee : les clés 'annulee_le' et 'avoirs' (l'export garde tout le reste).
do $retour_arriere$
declare
  v_def text;
  v_annulee text := $ajout$'annulee_le',f.annulee_le,$ajout$;
  v_avoirs text := $ajout$'avoirs',coalesce((select jsonb_agg(to_jsonb(av)||jsonb_build_object('facture_numero',fe.numero,'chantier_id',fe.chantier_id) order by av.rang) from public.artisan_avoirs_externes av join public.artisan_factures_externes fe on fe.id=av.facture_id where av.artisan_id=a),'[]'),
 $ajout$;
begin
  select pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure) into v_def;
  if position(v_avoirs in v_def) = 0 and position(v_annulee in v_def) = 0 then
    raise notice 'mon_activite_artisan_privee : clés annulee_le et avoirs absentes, rien à faire';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_avoirs, ''))) <> length(v_avoirs)
     or (length(v_def) - length(replace(v_def, v_annulee, ''))) <> length(v_annulee) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : les clés annulee_le et avoirs de mon_activite_artisan_privee ne sont plus intactes (retouchées ou répétées). Les retirer à la main.';
  end if;
  execute replace(replace(v_def, v_avoirs, ''), v_annulee, '');
  raise notice 'mon_activite_artisan_privee : clés annulee_le et avoirs retirées';
end $retour_arriere$;

revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;
revoke all on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) from public, anon;
grant execute on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.mon_activite_artisan_privee() from public, anon;
grant execute on function public.mon_activite_artisan_privee() to authenticated;

-- 4/6. La table des avoirs (vide, vérifié plus haut), puis la fonction de ses déclencheurs. SANS cascade : une
-- dépendance inattendue arrête tout.
drop table if exists public.artisan_avoirs_externes;
drop function if exists public.artisan_avoirs_externes_garde();

-- 5/6. Une seule facture par chantier, comme avant ; la colonne annulee_le (vide, vérifié plus haut).
do $retour_arriere$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.artisan_factures_externes'::regclass and conname = 'artisan_factures_externes_chantier_id_key') then
    alter table public.artisan_factures_externes add constraint artisan_factures_externes_chantier_id_key unique (chantier_id);
  end if;
end $retour_arriere$;
drop index if exists public.artisan_factures_externes_chantier_en_vigueur_key;
alter table public.artisan_factures_externes drop column if exists annulee_le;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 6/6. La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014710000';
  end if;
end $retour_arriere$;

commit;
