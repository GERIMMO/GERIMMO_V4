-- RETOUR ARRIÈRE de 20261014847000_invitation_artisan_echeance_jour_paris.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : l'échéance d'une invitation tombe à la fin d'un jour de Paris).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : le défaut de `invitations_artisans.expire_le` redevient celui de 20261014840000 (`now() + 30 days`) et
-- le commentaire de la colonne est retiré. Aucune ligne n'est touchée : les invitations créées entre-temps gardent leur
-- échéance à minuit, heure de Paris. Rejouable : sans la table (retour de 20261014840000 déjà joué), rien n'est fait.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014847000_invitation_artisan_echeance_jour_paris.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : une invitation expire de nouveau à l'heure de son envoi, 30 jours plus tard, alors que
-- l'écran annonce « valable jusqu'au <jour> ». Ordre indifférent avec le code. À jouer AVANT le retour de
-- 20261014840000 (qui supprime la table).

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

do $retour_arriere$
begin
  if to_regclass('public.invitations_artisans') is null then
    raise notice 'invitations_artisans : table absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  alter table public.invitations_artisans alter column expire_le set default (now() + interval '30 days');
  comment on column public.invitations_artisans.expire_le is null;
  raise notice 'invitations_artisans.expire_le : défaut d''origine rétabli';
end $retour_arriere$;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014847000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'invitations_artisans.expire_le (défaut)' as objet,
       case when to_regclass('public.invitations_artisans') is null then 'absente'
            when pg_get_expr(d.adbin, d.adrelid) like '%Europe/Paris%' then 'migrée (B)'
            else 'antérieure (A)' end as etat
from (select 1) x
left join pg_attrdef d on d.adrelid = to_regclass('public.invitations_artisans')
  and d.adnum = (select attnum from pg_attribute where attrelid = to_regclass('public.invitations_artisans') and attname = 'expire_le');
