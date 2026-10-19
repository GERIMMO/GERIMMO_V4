-- RETOUR ARRIÈRE de 20261019120500_relance_abonnement_periodicite.sql
-- Recrée `abonnements_a_relancer(integer)` avec ses huit colonnes d'origine (texte relevé en production le 19/10, au
-- jour de Paris : 4 aujourdhui_paris(), 0 current_date), mêmes droits (service_role seul), et retire sa seule ligne
-- d'historique. Aucune donnée touchée.
-- Remettre le code applicatif précédent avant ce retour (lib/relances-paiement.ts lit periodicite et montant_periode_cents).
-- À jouer AVANT le retour de 20261018231827, qui réécrit cette fonction par compte exact.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
drop function if exists public.abonnements_a_relancer(integer);
create function public.abonnements_a_relancer(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  palier smallint,
  jours_ecoules integer,
  jours_restants integer,
  lecture_seule_le date,
  montant_mensuel numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with delai as (select public.delai_defaut_paiement_jours() as j)
  select
    a.organization_id,
    o.name,
    coalesce(
      nullif(btrim(coalesce(o.email_contact, '')), ''),
      (select c.email from public.memberships m
         join public.accounts c on c.id = m.account_id
        where m.organization_id = o.id and m.status = 'active'
          and m.role in ('admin_agence', 'proprietaire_direct')
        order by m.created_at limit 1)
    ),
    v.palier,
    (public.aujourdhui_paris() - a.paiement_en_defaut_depuis)::integer,
    greatest(0, d.j - (public.aujourdhui_paris() - a.paiement_en_defaut_depuis))::integer,
    (a.paiement_en_defaut_depuis + d.j)::date,
    round(a.montant_mensuel_cents / 100.0, 2)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  cross join delai d
  cross join lateral (
    select a.relances_paiement::smallint as palier
  ) v
  where a.paiement_en_defaut_depuis is not null
    and o.status not in ('archivee', 'suspendue')
    -- Le palier suivant n'est dû qu'à partir de son jour. Le premier (l'alerte)
    -- l'est immédiatement : c'est précisément son intérêt.
    and (public.aujourdhui_paris() - a.paiement_en_defaut_depuis) >= case a.relances_paiement
          when 0 then 0
          when 1 then 7
          when 2 then d.j - 1
          when 3 then d.j
          else 99999 end
    -- Jamais deux courriers le même jour, quoi qu'il arrive : une tâche rejouée
    -- ne doit pas doubler l'envoi.
    and (a.derniere_relance_le is null or a.derniere_relance_le < public.aujourdhui_paris())
  order by a.paiement_en_defaut_depuis
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
comment on function public.abonnements_a_relancer(integer) is
  'Les organisations dont un courrier de relance de paiement est dû aujourd''hui, avec son palier (0 alerte, 1 rappel, 2 avis, 3 constat de lecture seule).';
revoke execute on function public.abonnements_a_relancer(integer) from public, anon, authenticated;
grant execute on function public.abonnements_a_relancer(integer) to service_role;
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261019120500';
  end if;
end $retour_arriere$;
commit;
