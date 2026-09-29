-- LA TARIFICATION DU 28/09/2026 — formules pour les particuliers, barème
-- progressif pour les agences, plus aucune formule gratuite.
--
-- LA DÉCISION (porteur, 28/09). Le premier bien n'est plus offert à vie.
--   · Particuliers et SCI gérant leurs propres biens (organisation
--     `proprietaire_direct`) : quatre formules TTC selon le nombre de biens
--     — Solo 1, Bailleur 3, Investisseur 10, Patrimoine 20 —, mensuelles ou
--     annuelles (deux mois offerts) ; au-delà de 20, 1 €/mois ou 10 €/an par
--     bien supplémentaire.
--   · Agences : mensuel HT, socle de 39 € jusqu'à 10 lots sous mandat actif,
--     puis 2 € (11ᵉ–50ᵉ), 1,50 € (51ᵉ–200ᵉ), 1 € (à partir du 201ᵉ) — tranches
--     cumulatives. Plus de plafond « sur devis » à 600 lots.
--   · Essai de 14 jours sans carte ; à son terme, souscription explicite.
--
-- LA MÊME GRILLE VIT DANS src/lib/tarifs.ts ; `tests/tarification-2026.test.ts`
-- compare les deux unité par unité.
--
-- LES ORGANISATIONS EXISTANTES (décisions du porteur, même jour) : « le
-- premier bien n'est plus offert ; seuls 14 jours sont offerts, puis gel
-- avec possibilité de visualiser jusqu'au paiement ; bascule dès l'ajout de
-- bien ; pas de cumul ». Chaque organisation porte sa grille
-- (`organizations.grille_tarifaire`). Celles sans souscription en cours
-- basculent ici (section 12) ; celles qui paient encore sur l'ancienne
-- grille la gardent jusqu'à leur prochain ajout de bien. La bascule ne
-- touche pas Stripe : aucun débit n'est déclenché. Recensement et suivi :
-- supabase/procedures/migration-grille-2026-09-28.sql.
--
-- Idempotent.

-- ── 1. La grille de chaque organisation ─────────────────────────────────────
-- Ajoutée avec « historique » comme valeur des lignes EXISTANTES, puis le
-- défaut passe à la nouvelle grille pour les organisations à venir.
alter table public.organizations
  add column if not exists grille_tarifaire text not null default 'historique';
alter table public.organizations
  alter column grille_tarifaire set default '2026-09-28';
alter table public.organizations drop constraint if exists organizations_grille_tarifaire_check;
alter table public.organizations
  add constraint organizations_grille_tarifaire_check
  check (grille_tarifaire in ('historique', '2026-09-28'));
comment on column public.organizations.grille_tarifaire is
  'Grille tarifaire applicable. « historique » : premier bien offert et barème du 12/09, pour les organisations antérieures au 28/09/2026 tant que la procédure de migration ne les a pas basculées. « 2026-09-28 » : formules particuliers et tranches agences, sans gratuité permanente.';

-- La grille est un champ réservé, comme le statut et l'essai : un
-- responsable qui se reposerait sur « historique » se rendrait son premier
-- bien gratuit.
create or replace function public.organizations_champs_reserves_sa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return new;
  end if;
  if (new.status is distinct from old.status
      or new.type is distinct from old.type
      or new.essai_fin is distinct from old.essai_fin
      or new.grille_tarifaire is distinct from old.grille_tarifaire)
     and not public.is_super_admin() then
    raise exception 'Seul le super admin modifie le statut, le type, l''essai ou la grille tarifaire d''une organisation';
  end if;
  return new;
end;
$$;
revoke execute on function public.organizations_champs_reserves_sa() from public, anon, authenticated;

-- ── 2. Les barèmes, en données ─────────────────────────────────────────────
-- Les tranches du 12/09 restent lisibles (grille « historique ») : les
-- organisations qui y sont encore sont facturées selon elles.
alter table public.tarif_tranches add column if not exists grille text not null default 'historique';
alter table public.tarif_tranches drop constraint if exists tarif_tranches_pkey;
alter table public.tarif_tranches add primary key (grille, public, rang);

delete from public.tarif_tranches where grille = '2026-09-28';
insert into public.tarif_tranches (grille, public, rang, borne_haute, prix_unitaire_cents, forfait_cents) values
  -- AGENCE, HT : socle de 39 € jusqu'à 10 lots, puis tranches cumulatives.
  ('2026-09-28', 'agence', 1,   10,   0, 3900),
  ('2026-09-28', 'agence', 2,   50, 200,    0),
  ('2026-09-28', 'agence', 3,  200, 150,    0),
  ('2026-09-28', 'agence', 4, null, 100,    0);

create table if not exists public.tarif_formules (
  code text primary key,
  nom text not null,
  biens_max integer not null check (biens_max > 0),
  mensuel_cents integer not null check (mensuel_cents > 0),
  annuel_cents integer not null check (annuel_cents > 0),
  rang smallint not null unique
);
comment on table public.tarif_formules is
  'Formules des particuliers et SCI gérant leurs propres biens (grille du 28/09/2026), prix TTC. Même chiffres que src/lib/tarifs.ts.';
alter table public.tarif_formules enable row level security;
drop policy if exists tarif_formules_lecture on public.tarif_formules;
create policy tarif_formules_lecture on public.tarif_formules for select to anon, authenticated using (true);
revoke insert, update, delete on public.tarif_formules from anon, authenticated;
grant select on public.tarif_formules to anon, authenticated, service_role;

insert into public.tarif_formules (code, nom, biens_max, mensuel_cents, annuel_cents, rang) values
  ('solo', 'Solo', 1, 599, 5990, 1),
  ('bailleur', 'Bailleur', 3, 999, 9990, 2),
  ('investisseur', 'Investisseur', 10, 1999, 19990, 3),
  ('patrimoine', 'Patrimoine', 20, 2999, 29990, 4)
on conflict (code) do update set
  nom = excluded.nom, biens_max = excluded.biens_max,
  mensuel_cents = excluded.mensuel_cents, annuel_cents = excluded.annuel_cents,
  rang = excluded.rang;

-- Au-delà de 20 biens : Patrimoine + ce prix TTC par bien supplémentaire.
create or replace function public.tarif_supplement_bien_cents(p_periodicite text)
returns integer language sql immutable set search_path = ''
as $$ select case when p_periodicite = 'annuel' then 1000 else 100 end $$;

-- L'ancien montant (grille historique) ne lit plus que ses propres tranches.
create or replace function public.montant_abonnement_cents(
  p_type public.organization_type, p_unites integer
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with bornes as (
    select coalesce(lag(t.borne_haute) over (order by t.rang), 0) as bas,
           coalesce(t.borne_haute, 2147483647) as haut,
           t.prix_unitaire_cents, t.forfait_cents
    from public.tarif_tranches t
    where t.public = p_type and t.grille = 'historique'
  )
  select case when coalesce(p_unites, 0) <= 0 then 0 else coalesce((
    select sum(b.forfait_cents
               + greatest(0, least(p_unites, b.haut) - b.bas) * b.prix_unitaire_cents)::bigint
    from bornes b
    where b.bas < p_unites
  ), 0) end;
$$;
comment on function public.montant_abonnement_cents(public.organization_type, integer) is
  'Grille HISTORIQUE (avant le 28/09/2026) : montant mensuel pour n unités facturables. La nouvelle grille passe par montant_offre_cents.';

-- ── 3. La nouvelle grille, en centimes ─────────────────────────────────────
-- La formule la moins chère qui couvre n biens (zéro bien : Solo).
create or replace function public.formule_couvrante(p_biens integer, p_periodicite text default 'mensuel')
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select f.code
  from public.tarif_formules f
  where f.biens_max >= greatest(coalesce(p_biens, 0), 1)
     or f.rang = (select max(rang) from public.tarif_formules)
  order by case when p_periodicite = 'annuel' then f.annuel_cents else f.mensuel_cents end
         + case when f.rang = (select max(rang) from public.tarif_formules)
                then greatest(0, coalesce(p_biens, 0) - f.biens_max)
                     * public.tarif_supplement_bien_cents(p_periodicite)
                else 0 end,
           f.rang
  limit 1;
$$;

-- Le montant d'une PÉRIODE (mois ou an) de la nouvelle grille : TTC pour un
-- particulier, HT pour une agence. Une agence souscrite paie son socle même à
-- zéro lot ; un particulier paie au moins Solo.
create or replace function public.montant_offre_cents(
  p_type public.organization_type, p_unites integer, p_periodicite text default 'mensuel'
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_type = 'agence' then (
      with bornes as (
        select coalesce(lag(t.borne_haute) over (order by t.rang), 0) as bas,
               coalesce(t.borne_haute, 2147483647) as haut,
               t.prix_unitaire_cents, t.forfait_cents
        from public.tarif_tranches t
        where t.public = 'agence' and t.grille = '2026-09-28'
      )
      select sum(b.forfait_cents
                 + greatest(0, least(greatest(coalesce(p_unites, 0), 0), b.haut) - b.bas)
                   * b.prix_unitaire_cents)::bigint
      from bornes b
    )
    else (
      select (case when p_periodicite = 'annuel' then f.annuel_cents else f.mensuel_cents end
              + case when f.rang = (select max(rang) from public.tarif_formules)
                     then greatest(0, coalesce(p_unites, 0) - f.biens_max)
                          * public.tarif_supplement_bien_cents(p_periodicite)
                     else 0 end)::bigint
      from public.tarif_formules f
      where f.code = public.formule_couvrante(p_unites, p_periodicite)
    )
  end;
$$;
comment on function public.montant_offre_cents(public.organization_type, integer, text) is
  'Grille du 28/09/2026 : montant d''une période (mensuel ou annuel) pour n biens (particulier, TTC, formule la moins chère) ou n lots sous mandat (agence, HT, mensuel, socle compris).';

revoke execute on function public.formule_couvrante(integer, text) from public, anon;
revoke execute on function public.montant_offre_cents(public.organization_type, integer, text) from public, anon;
revoke execute on function public.tarif_supplement_bien_cents(text) from public, anon;
grant execute on function public.formule_couvrante(integer, text) to authenticated, service_role;
grant execute on function public.montant_offre_cents(public.organization_type, integer, text) to authenticated, service_role;
grant execute on function public.tarif_supplement_bien_cents(text) to authenticated, service_role;

-- ── 4. Ce que l'abonnement couvre ──────────────────────────────────────────
alter table public.abonnements
  add column if not exists periodicite text not null default 'mensuel',
  add column if not exists formule text references public.tarif_formules(code),
  add column if not exists unites_souscrites integer,
  add column if not exists montant_periode_cents bigint,
  add column if not exists periode_debut timestamptz,
  add column if not exists periodicite_suivante text,
  add column if not exists changement_applique_pour timestamptz;
alter table public.abonnements drop constraint if exists abonnements_periodicite_check;
alter table public.abonnements add constraint abonnements_periodicite_check
  check (periodicite in ('mensuel', 'annuel'));
alter table public.abonnements drop constraint if exists abonnements_periodicite_suivante_check;
alter table public.abonnements add constraint abonnements_periodicite_suivante_check
  check (periodicite_suivante is null or periodicite_suivante in ('mensuel', 'annuel'));
alter table public.abonnements drop constraint if exists abonnements_unites_souscrites_check;
alter table public.abonnements add constraint abonnements_unites_souscrites_check
  check (unites_souscrites is null or unites_souscrites >= 0);
create index if not exists abonnements_formule_idx on public.abonnements (formule);
comment on column public.abonnements.unites_souscrites is
  'Capacité payée et confirmée (grille du 28/09/2026) : biens couverts par la formule et ses suppléments, ou lots sous mandat facturés. Une hausse au-delà exige une confirmation ; null = pas d''abonnement de la nouvelle grille (aucune garde).';
comment on column public.abonnements.periodicite_suivante is
  'Changement de périodicité demandé explicitement par le client, appliqué à la prochaine échéance (jamais en cours de période).';

-- ── 5. Ce qu'on compte ─────────────────────────────────────────────────────
-- Nouvelle grille :
--   · PARTICULIER — les biens activement gérés, occupés ou vacants : chaque
--     lot non archivé d'un bien non retiré est une unité louée séparément. Un
--     logement et ses annexes louées au même bail forment UN lot, donc un
--     bien ; un parking loué à part est son propre lot, donc un bien.
--   · AGENCE — les lots DISTINCTS sous mandat actif ou en préavis, vacants
--     compris, que le lot soit archivé ou non (archiver un lot n'en retire
--     pas le mandat) ; une ligne de mandat déjà engagée mais qui commence plus
--     tard est comptée dès l'activation.
create or replace function public.unites_a_couvrir(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case o.type
    when 'agence' then (
      select count(distinct ml.lot_id)::integer
      from public.mandat_lignes ml
      join public.mandats m on m.id = ml.mandat_id
      where ml.organization_id = o.id
        and m.etat in ('actif', 'preavis')
        and (ml.date_fin is null or ml.date_fin >= current_date)
    )
    else (
      select count(*)::integer
      from public.lots l
      join public.biens b on b.id = l.bien_id
      where l.organization_id = o.id
        and l.etat <> 'archive'
        and b.archived_at is null
    )
  end
  from public.organizations o where o.id = p_org;
$$;
comment on function public.unites_a_couvrir(uuid) is
  'Grille du 28/09/2026 : biens activement gérés (lots non archivés de biens non retirés) pour un particulier ; lots distincts sous mandat actif ou en préavis pour une agence.';
revoke execute on function public.unites_a_couvrir(uuid) from public, anon, authenticated;
grant execute on function public.unites_a_couvrir(uuid) to service_role;

-- La quantité « cible » garde son sens historique pour la grille historique ;
-- pour la nouvelle, elle rend les unités à couvrir.
create or replace function public.abonnement_quantite_cible(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when o.grille_tarifaire = '2026-09-28' then public.unites_a_couvrir(o.id)
    when o.type = 'agence' then (
      select count(distinct ml.lot_id)::integer
      from public.mandat_lignes ml
      join public.mandats m on m.id = ml.mandat_id
      where ml.organization_id = o.id
        and m.etat in ('actif', 'preavis')
        and ml.date_debut <= current_date
        and (ml.date_fin is null or ml.date_fin >= current_date)
    )
    -- Grille historique : ses biens au parc, le premier offert à vie.
    else greatest(0, (select count(*) from public.biens b
                      where b.organization_id = o.id
                        and b.archived_at is null) - 1)::integer
  end
  from public.organizations o where o.id = p_org;
$function$;

-- La capacité payée, quand un abonnement de la nouvelle grille est en cours.
create or replace function public.capacite_souscrite(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select a.unites_souscrites
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where a.organization_id = p_org
    and o.grille_tarifaire = '2026-09-28'
    and a.stripe_subscription_id is not null
    and a.stripe_statut in ('active', 'trialing', 'past_due')
    and a.unites_souscrites is not null;
$$;
revoke execute on function public.capacite_souscrite(uuid) from public, anon, authenticated;
grant execute on function public.capacite_souscrite(uuid) to service_role;

-- ── 6. La garde : aucune hausse payante sans confirmation ──────────────────
-- Un bien créé, restauré ou réactivé, un mandat activé ou élargi : si le
-- portefeuille dépasse la capacité payée, l'écriture est refusée et le
-- message dit quoi faire. Les données restent intactes ; la confirmation se
-- fait sur « Mon abonnement », qui montre le nouveau montant, sa date
-- d'effet et le prorata avant tout paiement.
create or replace function public.garde_capacite(p_org uuid, p_en_plus integer default 0)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_capacite integer := public.capacite_souscrite(p_org);
  v_besoin integer;
  v_type public.organization_type;
begin
  if v_capacite is null then return; end if;
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then return; end if;
  v_besoin := public.unites_a_couvrir(p_org) + coalesce(p_en_plus, 0);
  if v_besoin <= v_capacite then return; end if;
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type = 'agence' then
    raise exception 'Votre abonnement couvre % lot% sous mandat : ce changement en porterait % sous mandat. Ouvrez « Mon abonnement » pour voir le nouveau montant et le confirmer ; rien n''a été modifié.',
      v_capacite, case when v_capacite > 1 then 's' else '' end, v_besoin
      using errcode = 'GRM01';
  end if;
  raise exception 'Votre formule couvre % bien% : ce changement en porterait % en gestion. Ouvrez « Mon abonnement » pour voir le nouveau montant et le confirmer ; rien n''a été modifié.',
    v_capacite, case when v_capacite > 1 then 's' else '' end, v_besoin
    using errcode = 'GRM01';
end;
$$;
revoke execute on function public.garde_capacite(uuid, integer) from public, anon, authenticated;

create or replace function public.garde_capacite_biens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Un bien arrive toujours avec au moins un lot : on compte ce lot à venir,
    -- pour refuser AVANT d'écrire le bien plutôt que de le laisser sans lot.
    perform public.garde_capacite(new.organization_id, 1);
    return new;
  end if;
  if old.archived_at is not null and new.archived_at is null then
    perform public.garde_capacite(new.organization_id, 0);
  end if;
  return null;
end;
$$;
revoke execute on function public.garde_capacite_biens() from public, anon, authenticated;

drop trigger if exists biens_garde_capacite_insert on public.biens;
create trigger biens_garde_capacite_insert
  before insert on public.biens
  for each row execute function public.garde_capacite_biens();
drop trigger if exists biens_garde_capacite_restauration on public.biens;
create trigger biens_garde_capacite_restauration
  after update of archived_at on public.biens
  for each row when (old.archived_at is not null and new.archived_at is null)
  execute function public.garde_capacite_biens();

create or replace function public.garde_capacite_apres()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.garde_capacite(new.organization_id, 0);
  return null;
end;
$$;
revoke execute on function public.garde_capacite_apres() from public, anon, authenticated;

drop trigger if exists lots_garde_capacite on public.lots;
create trigger lots_garde_capacite
  after insert or update of etat on public.lots
  for each row when (new.etat <> 'archive')
  execute function public.garde_capacite_apres();

drop trigger if exists mandats_garde_capacite on public.mandats;
create trigger mandats_garde_capacite
  after update of etat, date_fin on public.mandats
  for each row when (new.etat in ('actif', 'preavis'))
  execute function public.garde_capacite_apres();

drop trigger if exists mandat_lignes_garde_capacite on public.mandat_lignes;
create trigger mandat_lignes_garde_capacite
  after insert or update of lot_id, mandat_id, date_fin on public.mandat_lignes
  for each row execute function public.garde_capacite_apres();

-- ── 7. L'écriture après l'essai ────────────────────────────────────────────
-- Nouvelle grille : l'essai fini, il faut souscrire — quel que soit le
-- nombre de biens. Grille historique : inchangée (écriture ouverte tant qu'il
-- n'y a rien à payer, décision du 24/09).
create or replace function public.org_ecriture_ouverte(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case o.status
           when 'essai' then o.essai_fin is null
                          or o.essai_fin >= current_date
                          or (o.grille_tarifaire = 'historique'
                              and public.abonnement_quantite_cible(o.id) < 1)
           when 'active' then
             a.paiement_en_defaut_depuis is null
             or (current_date - a.paiement_en_defaut_depuis) < public.delai_defaut_paiement_jours()
           else false
         end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;
comment on function public.org_ecriture_ouverte(uuid) is
  'L''écriture est-elle ouverte ? Essai non expiré, ou compte actif dont le prélèvement n''est pas en défaut depuis quinze jours. Grille historique seulement : essai expiré sans rien à payer reste ouvert (24/09). Fermée, les données restent lisibles et exportables.';
revoke execute on function public.org_ecriture_ouverte(uuid) from public, anon;

-- Plus de plafond « sur devis » dans la nouvelle grille.
create or replace function public.abonnement_en_ligne_possible(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.type <> 'agence' then true
    when o.grille_tarifaire = '2026-09-28' then true
    when a.stripe_subscription_id is not null then true
    else public.abonnement_quantite_cible(o.id) <= public.seuil_devis_agence()
  end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;
revoke execute on function public.abonnement_en_ligne_possible(uuid) from public, anon, authenticated;

-- ── 8. Ce que l'écran lit ──────────────────────────────────────────────────
drop function if exists public.etat_abonnement(uuid);
create function public.etat_abonnement(p_org uuid)
returns table (
  statut text,
  ecriture_ouverte boolean,
  essai_fin date,
  jours_essai_restants integer,
  public_tarif public.organization_type,
  unite text,
  unites_total integer,
  unites_facturees integer,
  mensuel numeric,
  en_ligne_possible boolean,
  grille text,
  unites_a_couvrir integer,
  unites_souscrites integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.status::text,
    public.org_ecriture_ouverte(o.id),
    o.essai_fin,
    case when o.status = 'essai' and o.essai_fin is not null
         then greatest(0, (o.essai_fin - current_date))::integer end,
    o.type,
    case when o.type = 'agence' then 'lot sous mandat' else 'bien' end,
    case
      when o.grille_tarifaire = '2026-09-28' then public.unites_a_couvrir(o.id)
      when o.type = 'agence' then public.abonnement_quantite_cible(o.id)
      else (select count(*)::integer from public.biens b
            where b.organization_id = o.id and b.archived_at is null)
    end,
    case when o.grille_tarifaire = '2026-09-28'
         then coalesce(public.capacite_souscrite(o.id), public.unites_a_couvrir(o.id))
         else public.abonnement_quantite_cible(o.id) end,
    case when o.grille_tarifaire = '2026-09-28'
         then round(public.montant_offre_cents(o.type,
                coalesce(public.capacite_souscrite(o.id), public.unites_a_couvrir(o.id)), 'mensuel') / 100.0, 2)
         else round(public.montant_abonnement_cents(o.type, public.abonnement_quantite_cible(o.id)) / 100.0, 2) end,
    public.abonnement_en_ligne_possible(o.id),
    o.grille_tarifaire,
    case when o.grille_tarifaire = '2026-09-28' then public.unites_a_couvrir(o.id) end,
    public.capacite_souscrite(o.id)
  from public.organizations o
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$function$;
comment on function public.etat_abonnement(uuid) is
  'Ce que « Mon abonnement » et l''accueil affichent. Nouvelle grille : unites_a_couvrir (portefeuille réel) et unites_souscrites (capacité payée). Grille historique : inchangée.';
revoke execute on function public.etat_abonnement(uuid) from public, anon;

drop function if exists public.mon_abonnement(uuid);
create function public.mon_abonnement(p_org uuid)
returns table (
  stripe_statut text,
  paye boolean,
  periode_fin timestamptz,
  annulation_demandee boolean,
  quantite_cible integer,
  montant_mensuel numeric,
  paiement_en_retard boolean,
  lecture_seule_le date,
  jours_avant_lecture_seule integer,
  grille text,
  periodicite text,
  formule text,
  unites_souscrites integer,
  montant_periode_cents bigint,
  periode_debut timestamptz,
  periodicite_suivante text,
  souscrit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.stripe_statut,
    coalesce(a.stripe_statut in ('active', 'trialing'), false),
    a.periode_fin,
    coalesce(a.annulation_demandee, false),
    public.abonnement_quantite_cible(o.id),
    case when o.grille_tarifaire = '2026-09-28'
         then round(coalesce(a.montant_mensuel_cents, 0) / 100.0, 2)
         else round(public.montant_abonnement_cents(o.type, public.abonnement_quantite_cible(o.id)) / 100.0, 2) end,
    a.paiement_en_defaut_depuis is not null,
    (a.paiement_en_defaut_depuis + public.delai_defaut_paiement_jours())::date,
    case when a.paiement_en_defaut_depuis is not null
         then greatest(0, public.delai_defaut_paiement_jours()
                          - (current_date - a.paiement_en_defaut_depuis))::integer end,
    o.grille_tarifaire,
    coalesce(a.periodicite, 'mensuel'),
    a.formule,
    a.unites_souscrites,
    a.montant_periode_cents,
    a.periode_debut,
    a.periodicite_suivante,
    a.stripe_subscription_id is not null
      and coalesce(a.stripe_statut, '') in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
comment on function public.mon_abonnement(uuid) is
  'État de paiement pour « Mon abonnement ». Réservé au responsable ; ne rend aucun identifiant Stripe.';
revoke execute on function public.mon_abonnement(uuid) from public, anon;

-- ── 9. Le miroir de Stripe ─────────────────────────────────────────────────
-- Le montant historique ne se recalcule que pour la grille historique ; la
-- nouvelle grille reçoit le montant RÉEL de Stripe par abonnement_details.
create or replace function public.abonnement_synchro_faite(
  p_org uuid, p_quantite integer, p_erreur text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnements a set
    quantite = case when p_erreur is null then p_quantite else a.quantite end,
    montant_mensuel_cents = case
      when p_erreur is not null or o.grille_tarifaire <> 'historique' then a.montant_mensuel_cents
      else public.montant_abonnement_cents(o.type, p_quantite) end,
    a_resynchroniser = p_erreur is not null,
    derniere_synchro = now(),
    derniere_erreur = p_erreur,
    updated_at = now()
  from public.organizations o
  where a.organization_id = p_org and o.id = a.organization_id;
$$;
revoke execute on function public.abonnement_synchro_faite(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.abonnement_synchro_faite(uuid, integer, text) to service_role;

-- abonnement_appliquer : même corps, mais le montant historique n'écrase plus
-- celui d'une souscription de la nouvelle grille.
create or replace function public.abonnement_appliquer(
  p_customer text,
  p_subscription text,
  p_statut text,
  p_quantite integer,
  p_periode_fin timestamptz,
  p_annulation boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_type public.organization_type;
  v_grille text;
  v_statut_actuel public.organization_status;
  v_essai_fin date;
  v_cible public.organization_status;
  v_defaut_avant date;
begin
  select a.organization_id, a.paiement_en_defaut_depuis
    into v_org, v_defaut_avant
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then
    return null;
  end if;
  select o.type, o.status, o.essai_fin, o.grille_tarifaire
    into v_type, v_statut_actuel, v_essai_fin, v_grille
  from public.organizations o where o.id = v_org;

  update public.abonnements set
    stripe_subscription_id = coalesce(nullif(btrim(coalesce(p_subscription,'')),''), stripe_subscription_id),
    stripe_statut = p_statut,
    quantite = coalesce(p_quantite, quantite),
    montant_mensuel_cents = case when v_grille = 'historique'
      then public.montant_abonnement_cents(v_type, coalesce(p_quantite, quantite))
      else montant_mensuel_cents end,
    periode_fin = coalesce(p_periode_fin, periode_fin),
    annulation_demandee = coalesce(p_annulation, false),
    paiement_en_defaut_depuis = case
      when p_statut in ('past_due', 'unpaid')
        then coalesce(paiement_en_defaut_depuis, current_date)
      when p_statut in ('active', 'trialing') then null
      else paiement_en_defaut_depuis
    end,
    relances_paiement = case
      when p_statut in ('active', 'trialing') then 0 else relances_paiement end,
    derniere_relance_le = case
      when p_statut in ('active', 'trialing') then null else derniere_relance_le end,
    derniere_synchro = now(),
    derniere_erreur = null,
    updated_at = now()
  where organization_id = v_org;

  if v_statut_actuel = 'archivee' then
    return v_org;
  end if;

  v_cible := case
    when p_statut in ('active', 'trialing') then 'active'::public.organization_status
    when p_statut = 'past_due' then v_statut_actuel
    when p_statut = 'incomplete' then v_statut_actuel
    when p_statut in ('canceled', 'unpaid', 'incomplete_expired', 'paused') then
      case when v_essai_fin is not null and v_essai_fin >= current_date
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
    else v_statut_actuel
  end;

  if v_cible is distinct from v_statut_actuel then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set status = v_cible, updated_at = now()
    where id = v_org;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_statut',
            jsonb_build_object('stripe', p_statut, 'avant', v_statut_actuel,
                               'apres', v_cible, 'souscription', p_subscription));
  end if;

  if v_defaut_avant is null and p_statut in ('past_due', 'unpaid') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_en_defaut',
            jsonb_build_object('stripe', p_statut,
                               'lecture_seule_le', current_date + public.delai_defaut_paiement_jours()));
  elsif v_defaut_avant is not null and p_statut in ('active', 'trialing') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_regularise',
            jsonb_build_object('en_defaut_depuis', v_defaut_avant));
  end if;

  return v_org;
end;
$$;
revoke execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) to service_role;

-- Le détail de l'offre souscrite, tel que Stripe le facture : formule,
-- périodicité, capacité, montant d'une période. Écrit par le webhook et par
-- l'action qui vient de modifier la souscription — jamais par le client.
create or replace function public.abonnement_details(
  p_customer text,
  p_periodicite text,
  p_formule text,
  p_unites integer,
  p_montant_periode_cents bigint,
  p_periode_debut timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_avant integer;
begin
  select a.organization_id, a.unites_souscrites into v_org, v_avant
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then return null; end if;
  if p_periodicite not in ('mensuel', 'annuel') then
    raise exception 'Périodicité inconnue : %', p_periodicite;
  end if;
  update public.abonnements set
    periodicite = p_periodicite,
    formule = nullif(btrim(coalesce(p_formule, '')), ''),
    unites_souscrites = p_unites,
    montant_periode_cents = p_montant_periode_cents,
    montant_mensuel_cents = case when p_periodicite = 'annuel'
      then round(coalesce(p_montant_periode_cents, 0) / 12.0)::bigint
      else coalesce(p_montant_periode_cents, 0) end,
    periode_debut = coalesce(p_periode_debut, periode_debut),
    -- La périodicité demandée est atteinte : la demande est soldée.
    periodicite_suivante = case when periodicite_suivante = p_periodicite then null
                                else periodicite_suivante end,
    updated_at = now()
  where organization_id = v_org;
  if v_avant is distinct from p_unites then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_capacite',
            jsonb_build_object('avant', v_avant, 'apres', p_unites, 'formule', p_formule,
                               'periodicite', p_periodicite, 'montant_periode_cents', p_montant_periode_cents));
  end if;
  return v_org;
end;
$$;
revoke execute on function public.abonnement_details(text, text, text, integer, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.abonnement_details(text, text, text, integer, bigint, timestamptz) to service_role;

-- La demande explicite de changer de périodicité à la prochaine échéance.
-- Réservée au responsable ; ne touche ni Stripe ni le montant en cours.
create or replace function public.demander_periodicite_suivante(p_org uuid, p_periodicite text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.org_ids_avec_roles(
       array['proprietaire_direct']::public.membership_role[]) i where i = p_org) then
    raise exception 'Réservé au responsable de l''espace propriétaire';
  end if;
  if p_periodicite is not null and p_periodicite not in ('mensuel', 'annuel') then
    raise exception 'Périodicité inconnue';
  end if;
  update public.abonnements
     set periodicite_suivante = case when p_periodicite = periodicite then null else p_periodicite end,
         changement_applique_pour = null,
         updated_at = now()
   where organization_id = p_org and stripe_subscription_id is not null;
  if not found then
    raise exception 'Aucun abonnement en cours : choisissez la périodicité à la souscription';
  end if;
  insert into public.audit_log (organization_id, account_id, action, details)
  values (p_org, auth.uid(), 'abonnement_periodicite_demandee', jsonb_build_object('periodicite', p_periodicite));
end;
$$;
revoke execute on function public.demander_periodicite_suivante(uuid, text) from public, anon;
grant execute on function public.demander_periodicite_suivante(uuid, text) to authenticated;

-- ── 10. La tâche de nuit : baisses et changements à l'échéance ─────────────
-- Les souscriptions de la nouvelle grille dont l'échéance tombe dans les trois
-- jours : c'est là, et pas avant, qu'une baisse s'applique (un bien retiré
-- puis rétabli dans la même période ne coûte rien de plus).
create or replace function public.abonnements_echeance_a_preparer(p_jours integer default 3)
returns table (
  organization_id uuid,
  organisation text,
  public_tarif public.organization_type,
  stripe_subscription_id text,
  periodicite text,
  periodicite_suivante text,
  formule text,
  unites_souscrites integer,
  unites_a_couvrir integer,
  periode_fin timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, o.type, a.stripe_subscription_id, a.periodicite,
         a.periodicite_suivante, a.formule, a.unites_souscrites,
         public.unites_a_couvrir(a.organization_id), a.periode_fin
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where o.grille_tarifaire = '2026-09-28'
    and o.status <> 'archivee'
    and a.stripe_subscription_id is not null
    and a.stripe_statut in ('active', 'trialing', 'past_due')
    and not coalesce(a.annulation_demandee, false)
    and a.periode_fin is not null
    and a.periode_fin <= now() + make_interval(days => greatest(1, coalesce(p_jours, 3)))
    and a.changement_applique_pour is distinct from a.periode_fin
  order by a.periode_fin
  limit 200;
$$;
revoke execute on function public.abonnements_echeance_a_preparer(integer) from public, anon, authenticated;
grant execute on function public.abonnements_echeance_a_preparer(integer) to service_role;

create or replace function public.abonnement_echeance_preparee(p_org uuid, p_periode_fin timestamptz, p_erreur text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnements set
    changement_applique_pour = case when p_erreur is null then p_periode_fin else changement_applique_pour end,
    derniere_erreur = p_erreur,
    derniere_synchro = now(),
    updated_at = now()
  where organization_id = p_org;
$$;
revoke execute on function public.abonnement_echeance_preparee(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.abonnement_echeance_preparee(uuid, timestamptz, text) to service_role;

-- La synchronisation automatique de la quantité (hausse comprise) ne vaut
-- plus que pour la grille historique : dans la nouvelle, une hausse attend la
-- confirmation du client, une baisse attend l'échéance.
create or replace function public.abonnements_a_synchroniser(p_limite integer default 100)
returns table (
  organization_id uuid,
  organisation text,
  stripe_subscription_id text,
  quantite_posee integer,
  quantite_cible integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, a.stripe_subscription_id,
         a.quantite, public.abonnement_quantite_cible(a.organization_id)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where a.stripe_subscription_id is not null
    and o.status <> 'archivee'
    and o.grille_tarifaire = 'historique'
    and (a.a_resynchroniser
         or a.quantite is distinct from public.abonnement_quantite_cible(a.organization_id))
  order by a.updated_at
  limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;
revoke execute on function public.abonnements_a_synchroniser(integer)
  from public, anon, authenticated;
grant execute on function public.abonnements_a_synchroniser(integer) to service_role;

-- ── 11. Le parrainage ne se cumule pas avec la nouvelle grille ─────────────
-- Décision du porteur (28/09/2026) : « il n'y a pas de cumul ». Pour une
-- organisation de la nouvelle grille, le parrainage reste ENREGISTRÉ (qui a
-- amené qui) mais n'ouvre aucun avantage : l'essai reste de 14 jours, aucun
-- mois n'est offert. L'avantage est inscrit « sans_objet », pour que l'écran
-- le dise. Les avantages déjà accordés (grille historique) sont conservés.
-- L'état « en_attente » reste admis pour d'anciennes lignes éventuelles.
alter table public.avantages_parrainage drop constraint if exists avantages_parrainage_etat_check;
alter table public.avantages_parrainage add constraint avantages_parrainage_etat_check
  check (etat in ('a_appliquer', 'applique', 'sans_objet', 'en_attente'));

create or replace function public.parrainage_avantage_filleul(p_parrainage uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filleul uuid;
  v_statut public.organization_status;
  v_essai date;
  v_grille text;
  v_cible date := current_date + public.parrainage_jours_filleul();
begin
  select p.filleul_organization_id into v_filleul
  from public.parrainages p where p.id = p_parrainage;
  if v_filleul is null then return; end if;

  select o.status, o.essai_fin, o.grille_tarifaire into v_statut, v_essai, v_grille
  from public.organizations o where o.id = v_filleul;

  if v_grille = '2026-09-28' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', 0, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  if v_statut <> 'essai' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', 0, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  perform set_config('gerimmo.systeme', 'on', true);
  update public.organizations
     set essai_fin = greatest(coalesce(v_essai, v_cible), v_cible), updated_at = now()
   where id = v_filleul;
  perform set_config('gerimmo.systeme', '', true);

  insert into public.avantages_parrainage
    (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
  values (p_parrainage, v_filleul, 'essai_filleul',
          public.parrainage_jours_filleul(), 'applique', now())
  on conflict (parrainage_id, nature) do nothing;
end $$;
revoke execute on function public.parrainage_avantage_filleul(uuid) from public, anon, authenticated;

create or replace function public.parrainage_recompenser(p_filleul uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parrainage uuid;
  v_parrain uuid;
  v_statut public.organization_status;
  v_essai date;
  v_grille text;
  v_mensuel bigint;
begin
  select p.id, p.parrain_organization_id into v_parrainage, v_parrain
  from public.parrainages p where p.filleul_organization_id = p_filleul;
  if v_parrainage is null then return; end if;

  if exists (
    select 1 from public.avantages_parrainage a
    where a.parrainage_id = v_parrainage and a.nature in ('essai_parrain', 'avoir_parrain')
  ) then
    return;
  end if;

  select o.status, o.essai_fin, o.grille_tarifaire into v_statut, v_essai, v_grille
  from public.organizations o where o.id = v_parrain;
  if v_statut is null or v_statut = 'archivee' then return; end if;

  if v_grille = '2026-09-28' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, etat, applique_le)
    values (v_parrainage, v_parrain,
            case when v_statut = 'essai' then 'essai_parrain' else 'avoir_parrain' end,
            'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
  elsif v_statut = 'essai' then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations
       set essai_fin = greatest(coalesce(v_essai, current_date), current_date)
                       + public.parrainage_jours_parrain(),
           updated_at = now()
     where id = v_parrain;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (v_parrainage, v_parrain, 'essai_parrain',
            public.parrainage_jours_parrain(), 'applique', now())
    on conflict (parrainage_id, nature) do nothing;
  else
    select a.montant_mensuel_cents into v_mensuel
    from public.abonnements a where a.organization_id = v_parrain;

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, montant_cents, etat, applique_le)
    values (v_parrainage, v_parrain, 'avoir_parrain', coalesce(v_mensuel, 0),
            case when coalesce(v_mensuel, 0) > 0 then 'a_appliquer' else 'sans_objet' end,
            case when coalesce(v_mensuel, 0) > 0 then null else now() end)
    on conflict (parrainage_id, nature) do nothing;
  end if;

  insert into public.audit_log (organization_id, action, details)
  values (v_parrain, 'avantage_parrainage',
          jsonb_build_object('filleul', p_filleul, 'parrainage', v_parrainage, 'grille', v_grille));
end $$;
revoke execute on function public.parrainage_recompenser(uuid) from public, anon, authenticated;

-- Le détail par tranche lit les tranches de LA grille de l'organisation, et
-- pour la nouvelle grille, la capacité payée (ou le portefeuille en essai).
create or replace function public.detail_tranches_abonnement(p_org uuid)
returns table (
  rang smallint,
  libelle text,
  unites integer,
  prix_unitaire numeric,
  sous_total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with orga as (
    select o.type, o.grille_tarifaire as grille,
           case when o.grille_tarifaire = '2026-09-28'
                then coalesce(public.capacite_souscrite(o.id), public.unites_a_couvrir(o.id))
                else public.abonnement_quantite_cible(o.id) end as n
    from public.organizations o
    where o.id = p_org
      and o.id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  ),
  bornes as (
    select t.rang,
           coalesce(lag(t.borne_haute) over (order by t.rang), 0) as bas,
           coalesce(t.borne_haute, 2147483647) as haut,
           t.prix_unitaire_cents, t.forfait_cents
    from public.tarif_tranches t, orga
    where t.public = orga.type and t.grille = orga.grille
  )
  select
    b.rang,
    case
      when b.forfait_cents > 0 then format('Jusqu''à %s', b.haut)
      when b.haut = 2147483647 then format('Au-delà de %s', b.bas)
      else format('Du %s%s au %s%s', b.bas + 1,
                  case when b.bas + 1 = 1 then 'ᵉʳ' else 'ᵉ' end, b.haut, 'ᵉ')
    end,
    greatest(0, least(orga.n, b.haut) - b.bas)::integer,
    round(b.prix_unitaire_cents / 100.0, 2),
    round((b.forfait_cents
           + greatest(0, least(orga.n, b.haut) - b.bas) * b.prix_unitaire_cents) / 100.0, 2)
  from bornes b, orga
  where b.bas < orga.n or (orga.grille = '2026-09-28' and b.forfait_cents > 0)
  order by b.rang;
$$;
revoke execute on function public.detail_tranches_abonnement(uuid) from public, anon;

-- La souscription Stripe de l'organisation, pour son SEUL responsable : les
-- actions « confirmer une hausse » et « résilier » en ont besoin pour parler à
-- Stripe. Même garde que mon_client_stripe. Elle n'écrit rien : la capacité
-- n'est relevée que par le webhook, d'après ce que Stripe facture.
create or replace function public.ma_souscription_stripe(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.stripe_subscription_id
  from public.abonnements a
  where a.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.ma_souscription_stripe(uuid) from public, anon;
grant execute on function public.ma_souscription_stripe(uuid) to authenticated;

-- L'impact d'une activation de mandat sur le volume facturé : lots sous
-- mandat avant, après, et capacité payée. Réservé à l'administrateur de
-- l'agence ; sert à montrer le nouveau montant AVANT le geste.
create or replace function public.impact_activation_mandat(p_mandat uuid)
returns table (avant integer, apres integer, capacite integer)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select md.id, md.organization_id from public.mandats md
    where md.id = p_mandat
      and md.organization_id in (select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))
  ),
  deja as (
    select distinct ml.lot_id
    from public.mandat_lignes ml
    join public.mandats x on x.id = ml.mandat_id, m
    where ml.organization_id = m.organization_id
      and x.etat in ('actif', 'preavis')
      and (ml.date_fin is null or ml.date_fin >= current_date)
  ),
  nouveaux as (
    select distinct ml.lot_id
    from public.mandat_lignes ml, m
    where ml.mandat_id = m.id
      and (ml.date_fin is null or ml.date_fin >= current_date)
      and ml.lot_id not in (select lot_id from deja)
  )
  select (select count(*) from deja)::integer,
         ((select count(*) from deja) + (select count(*) from nouveaux))::integer,
         public.capacite_souscrite(m.organization_id)
  from m;
$$;
revoke execute on function public.impact_activation_mandat(uuid) from public, anon;
grant execute on function public.impact_activation_mandat(uuid) to authenticated;

-- La console : l'abonnement d'une organisation, pour le super admin seul
-- (grille, offre, volume facturé, montant réel, changements programmés,
-- avantages de parrainage en attente d'arbitrage).
create or replace function public.supervision_abonnement(p_org uuid)
returns table (
  grille text,
  public_tarif public.organization_type,
  stripe_statut text,
  periodicite text,
  formule text,
  unites_a_couvrir integer,
  unites_souscrites integer,
  montant_periode_cents bigint,
  periode_fin timestamptz,
  annulation_demandee boolean,
  periodicite_suivante text,
  paiement_en_defaut_depuis date,
  avantages_en_attente integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.grille_tarifaire, o.type, a.stripe_statut, a.periodicite, a.formule,
         public.unites_a_couvrir(o.id), a.unites_souscrites, a.montant_periode_cents,
         a.periode_fin, coalesce(a.annulation_demandee, false), a.periodicite_suivante,
         a.paiement_en_defaut_depuis,
         (select count(*)::integer from public.avantages_parrainage ap
           where ap.beneficiaire_organization_id = o.id and ap.etat = 'en_attente')
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org and public.is_super_admin();
$$;
revoke execute on function public.supervision_abonnement(uuid) from public, anon;
grant execute on function public.supervision_abonnement(uuid) to authenticated;

-- ── 12. Bascule des organisations existantes (décision du 28/09/2026) ──────
-- « Le premier bien n'est plus offert ; la seule chose offerte, ce sont 14
-- jours, puis gel avec possibilité de visualiser jusqu'au paiement. Bascule
-- dès l'ajout de bien. »
--   · Toute organisation SANS souscription en cours passe tout de suite à la
--     nouvelle grille : un essai en cours garde sa date ; un essai échu ou un
--     compte « premier bien offert » passe en lecture seule jusqu'au
--     paiement, données intactes et consultables.
--   · Une organisation qui paie encore sur l'ancienne grille (souscription
--     Stripe en cours) garde son abonnement tel quel ; elle bascule dès
--     qu'elle ajoute un bien (déclencheur ci-dessous).
-- Aucun débit n'est déclenché : la bascule ne touche pas Stripe.
do $bascule$
begin
  perform set_config('gerimmo.systeme', 'on', true);
  with basculees as (
    update public.organizations o
       set grille_tarifaire = '2026-09-28', updated_at = now()
     where o.grille_tarifaire = 'historique'
       and not exists (select 1 from public.abonnements a
                       where a.organization_id = o.id
                         and a.stripe_subscription_id is not null
                         and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid'))
    returning o.id
  )
  insert into public.audit_log (organization_id, action, details)
  select id, 'grille_tarifaire_basculee', jsonb_build_object('vers', '2026-09-28', 'motif', 'decision_2026_09_28')
  from basculees;
  perform set_config('gerimmo.systeme', '', true);
end
$bascule$;

create or replace function public.basculer_grille_a_l_ajout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o
             where o.id = new.organization_id and o.grille_tarifaire = 'historique') then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
     where id = new.organization_id;
    perform set_config('gerimmo.systeme', '', true);
    insert into public.audit_log (organization_id, action, details)
    values (new.organization_id, 'grille_tarifaire_basculee',
            jsonb_build_object('vers', '2026-09-28', 'motif', 'ajout_de_bien'));
  end if;
  return new;
end;
$$;
revoke execute on function public.basculer_grille_a_l_ajout() from public, anon, authenticated;

-- Avant la garde de capacité (ordre alphabétique des déclencheurs : « biens_
-- bascule… » passe avant « biens_garde… »).
drop trigger if exists biens_bascule_grille on public.biens;
create trigger biens_bascule_grille
  before insert on public.biens
  for each row execute function public.basculer_grille_a_l_ajout();

select public.fermer_fonctions_a_anon();
