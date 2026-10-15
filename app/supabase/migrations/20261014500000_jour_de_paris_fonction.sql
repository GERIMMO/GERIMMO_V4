-- Lot « fuseau-paris » (décision du dirigeant du 15 octobre 2026) : une seule date de référence pour les loyers.
--
-- LE DÉFAUT. La base comparait des dates d'échéance de loyer à `current_date`, le jour du fuseau de la SESSION
-- (UTC chez Supabase), alors que toute l'application raisonne au jour de Paris (`aujourdhuiParis()`). Entre 22 h et
-- 24 h UTC (00 h à 02 h à Paris), un loyer échu la veille à Paris s'affichait « attendu » au lieu d'« impayé », et les
-- fonctions voisines divergeaient entre elles (l'état disait « impayé » pendant que `suivre_impayes_bail` en comptait
-- zéro). Reproduit le 15/10, disparu avec l'heure.
--
-- CETTE MIGRATION (1/5) ne change aucun comportement : elle pose l'unique fonction qui dit « quel jour sommes-nous à
-- Paris ». Les quatre suivantes (…501000 à …504000) y rattachent, famille par famille, les objets qui décident d'une règle
-- de loyer. Le dépôt n'avait aucune fonction de ce genre (seulement l'expression `(now() at time zone 'Europe/Paris')::date`
-- recopiée ici ou là) ; une fonction unique évite qu'un objet l'écrive de travers, et permet aux tests de figer le jour de
-- Paris sans toucher à l'horloge.
--
-- Le jour de Paris ne dépend ni du fuseau de la base ni de celui de la session : `now()` est un instant absolu, converti
-- en heure de Paris (heure d'été comprise) avant d'en prendre la date.
--
-- Droits : appelable par les comptes connectés (elle sert de valeur par défaut à des colonnes écrites sous leur identité)
-- et par la tâche planifiée ; jamais par `anon`. Elle ne lit aucune donnée.
-- Rejouable sans effet. Retour arrière : supabase/retours-arriere/20261014500000_jour_de_paris_fonction.retour.sql
-- (à jouer EN DERNIER : il refuse tant qu'un objet s'en sert encore).

create or replace function public.aujourdhui_paris()
returns date
language sql
stable
parallel safe
set search_path to ''
as $fonction$
  select (now() at time zone 'Europe/Paris')::date
$fonction$;

comment on function public.aujourdhui_paris() is
  'Le jour d''aujourd''hui à Paris (AAAA-MM-JJ), indépendant du fuseau de la session. Jour de référence de tout ce qui décide d''un loyer (échu, impayé, relance, quittance, encaissement).';

revoke all on function public.aujourdhui_paris() from public, anon;
grant execute on function public.aujourdhui_paris() to authenticated, service_role;

select public.fermer_fonctions_a_anon();
