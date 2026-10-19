-- Relance d'un prélèvement échoué : le courrier annonce le montant réellement demandé par le prélèvement.
--
-- Audit du 19/10 (lot mineurs, a). Pour un abonnement annuel, `montant_mensuel_cents` est un douzième calculé
-- (tarification 2026) : le courrier du palier 0 disait « 4,99 € par mois » quand la banque avait refusé 59,90 €
-- pour l'année. `abonnements_a_relancer` rend donc aussi la périodicité et le montant de la période ; le code
-- (lib/relances-paiement.ts, lib/relance-paiement-email.ts) écrit « par an » ou « par mois ». L'équivalent mensuel
-- reste rendu (« Mon abonnement » l'affiche).
--
-- Le type de retour change : PostgreSQL impose DROP puis CREATE, et le CREATE repart des droits par défaut du schéma
-- (ouverts à anon) — d'où le revoke/grant explicite et `fermer_fonctions_a_anon()` en fin. Corps identique à la
-- définition relevée en production le 19/10 (4 `public.aujourdhui_paris()`, 0 `current_date` : la migration
-- 20261018231827 et son retour, qui comptent ces occurrences, restent sans effet et valables), deux colonnes ajoutées.
-- Aucune donnée touchée. Rejouable.
-- Retour : supabase/retours-arriere/20261019120000_relance_abonnement_periodicite.retour.sql
drop function if exists public.abonnements_a_relancer(integer);
create function public.abonnements_a_relancer(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  palier smallint,              -- 0 alerte · 1 rappel · 2 avis · 3 constat
  jours_ecoules integer,
  jours_restants integer,
  lecture_seule_le date,
  montant_mensuel numeric,      -- équivalent mensuel, conservé pour l'affichage
  periodicite text,             -- 'mensuel' | 'annuel' : ce que le prélèvement couvre
  montant_periode_cents bigint  -- le montant du prélèvement, en centimes
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
    round(a.montant_mensuel_cents / 100.0, 2),
    -- Grille historique (aucun montant de période enregistré) : c'est le montant mensuel qui est prélevé.
    case when a.montant_periode_cents is null then 'mensuel' else a.periodicite end,
    coalesce(a.montant_periode_cents, a.montant_mensuel_cents)
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
  'Les organisations dont un courrier de relance de paiement est dû aujourd''hui, avec son palier (0 alerte, 1 rappel, 2 avis, 3 constat de lecture seule), la périodicité et le montant de la période prélevée.';
revoke execute on function public.abonnements_a_relancer(integer) from public, anon, authenticated;
grant execute on function public.abonnements_a_relancer(integer) to service_role;

select public.fermer_fonctions_a_anon();
