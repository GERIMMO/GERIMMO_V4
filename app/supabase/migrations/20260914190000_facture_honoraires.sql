-- Facture d'honoraires — la dernière entrée du catalogue restée « en
-- préparation » (54 générables sur 55 au 14/09).
--
-- Ce qui manquait n'était pas un gabarit mais deux obligations qu'un
-- assembleur seul ne peut pas tenir :
--
--   1. La numérotation. L'article L441-9 du code de commerce exige un
--      « numéro unique basé sur une séquence chronologique continue ». Un
--      numéro calculé à la volée depuis l'identifiant du dossier (ce que
--      font les autres modèles avec `referenceCourte`) n'est ni
--      chronologique ni continu : il faut le persister au moment de
--      l'émission, donc une table.
--   2. Les mentions de l'émetteur. Sans SIRET ni adresse, le PDF produit
--      n'est pas une facture — la génération est refusée plutôt que de
--      consommer un numéro sur un document invalide.
--
-- La maquette v6 du 08/09 fixe la matière : honoraires au taux de chaque
-- mandat sur les sommes encaissées (déjà écrits au journal par le
-- déclencheur des encaissements), TVA 20 %, « une facture par mandant,
-- jointe à son CRG ». Son libellé « FH-2026-08 » désigne une période, pas
-- une facture : deux mandants du même mois le partageraient. Le numéro émis
-- ici est donc `FH-<année>-<rang>`, unique par organisation.
--
-- ⚠ Contradiction tranchée ici — HT ou TTC ?
--   · Le mandat de gestion réellement signé (modeles/mandat-gestion.ts)
--     intitule sa colonne « Taux d'honoraires % TTC » et stipule des
--     honoraires « calculés au taux ci-dessus sur les sommes encaissées ».
--   · La maquette v6 présente au contraire des honoraires HT auxquels
--     s'ajoutent 20 % de TVA.
--   Les deux ne peuvent pas coexister : suivre la maquette reviendrait à
--   facturer au mandant 20 % de plus que le taux qu'il a signé. Le contrat
--   l'emporte sur la maquette. L'écriture d'honoraires du journal est donc
--   un montant TTC, et la facture en extrait la TVA au lieu de l'ajouter.
--   Conséquence : le total TTC facturé est exactement la somme des
--   honoraires inscrits au journal, au centime — la facture se rapproche du
--   rapport de gestion sans écart. À rouvrir si le porteur du projet décide
--   que les taux de mandat s'entendent HT (il faudra alors reprendre les
--   mandats déjà signés, pas seulement ce fichier).
--
-- Périmètre inchangé côté doctrine (RM-A6.1) : aucun compte mandant, aucun
-- séquestre, aucun mouvement de fonds. La facture constate des honoraires
-- déjà inscrits au journal de gestion ; elle ne les crée pas et ne les
-- encaisse pas.

-- ============================================================
-- 1 ─ Identité fiscale de l'émetteur
-- ============================================================
-- L'organisation portait déjà siret, carte professionnelle et garantie
-- financière (loi Hoguet). Une facture réclame en plus le numéro de TVA
-- intracommunautaire, et le cas — minoritaire mais réel pour une petite
-- structure — de la franchise en base, qui interdit de facturer la TVA.
alter table public.organizations
  add column tva_intracom text check (tva_intracom is null or length(btrim(tva_intracom)) between 4 and 20),
  add column tva_franchise boolean not null default false;

comment on column public.organizations.tva_intracom is
  'Numéro de TVA intracommunautaire de l''organisation — mention obligatoire des factures (art. 242 nonies A annexe II CGI).';
comment on column public.organizations.tva_franchise is
  'Vrai si l''organisation relève de la franchise en base (art. 293 B CGI) : les factures portent alors la mention de franchise au lieu de la TVA.';

-- ============================================================
-- 2 ─ Le registre des factures émises
-- ============================================================
-- Une ligne par facture réellement émise. Le rang porte la séquence
-- chronologique par organisation et par année ; le numéro en est la forme
-- lisible. Les totaux sont figés à l'émission : ils font foi contre le
-- journal, et non l'inverse (une facture ne se réécrit pas, elle se
-- rectifie par avoir).
create table public.factures_honoraires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mandat_id uuid not null references public.mandats(id),
  -- Premier jour du mois facturé
  periode date not null check (periode = date_trunc('month', periode)::date),
  annee integer not null,
  rang integer not null check (rang > 0),
  numero text not null,
  total_ht numeric(12,2) not null check (total_ht > 0),
  taux_tva numeric(5,2) not null check (taux_tva >= 0 and taux_tva <= 100),
  tva numeric(12,2) not null check (tva >= 0),
  -- Le TTC est la somme des honoraires du journal ; le HT et la TVA en sont
  -- extraits. L'égalité est vérifiée ici pour qu'aucun centime ne se perde
  -- entre la facture et le rapport de gestion.
  total_ttc numeric(12,2) not null check (total_ttc > 0),
  check (total_ttc = total_ht + tva),
  emise_le date not null default current_date,
  emise_par uuid references auth.users(id),
  cree_le timestamptz not null default now(),
  -- Le numéro ne se répète jamais dans une organisation
  unique (organization_id, numero),
  unique (organization_id, annee, rang),
  -- Un mandat, un mois, une facture : régénérer le PDF reprend la même
  -- facture au lieu d'en émettre une seconde pour la même prestation
  unique (organization_id, mandat_id, periode)
);

create index factures_honoraires_org on public.factures_honoraires(organization_id, periode desc);
create index factures_honoraires_mandat on public.factures_honoraires(mandat_id, periode desc);

comment on table public.factures_honoraires is
  'Registre des factures d''honoraires de gestion émises. Numérotation chronologique continue par organisation et par année (art. L441-9 code de commerce). Écrit uniquement par emettre_facture_honoraires().';

alter table public.factures_honoraires enable row level security;
revoke all on public.factures_honoraires from public, anon, authenticated;
grant select on public.factures_honoraires to authenticated;

-- Lecture réservée au responsable de l'organisation : les honoraires et le
-- chiffre d'affaires de l'agence ne regardent ni les agents ni les tiers.
create policy factures_honoraires_select on public.factures_honoraires
  for select to authenticated
  using (
    organization_id in (
      select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[])
    )
  );

-- Aucune politique d'écriture : la table ne se remplit que par la fonction
-- d'émission ci-dessous, et rien ne s'y modifie ni ne s'y supprime.

-- ============================================================
-- 3 ─ Émission : attribution du numéro
-- ============================================================
-- `p_total_ttc` est la somme des honoraires inscrits au journal pour le
-- mandat sur le mois (contre-passations déduites). Le HT et la TVA en sont
-- extraits, jamais l'inverse : voir la contradiction tranchée en tête de
-- fichier.
create function public.emettre_facture_honoraires(
  p_organization_id uuid,
  p_mandat_id uuid,
  p_periode date,
  p_total_ttc numeric,
  p_taux_tva numeric
)
returns public.factures_honoraires
language plpgsql security definer set search_path = ''
as $$
declare
  v_facture public.factures_honoraires;
  v_mois date := date_trunc('month', p_periode)::date;
  v_annee integer := extract(year from v_mois)::integer;
  v_rang integer;
  v_ttc numeric(12,2);
  v_ht numeric(12,2);
  v_tva numeric(12,2);
begin
  -- Facturer engage l'agence : le geste est réservé à son responsable, comme
  -- la clôture mensuelle et le rapport de gestion.
  if p_organization_id not in (
    select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[])
  ) then
    raise exception 'Émission réservée au responsable de l’agence.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mandats m
    where m.id = p_mandat_id and m.organization_id = p_organization_id
  ) then
    raise exception 'Mandat introuvable dans cette organisation.' using errcode = 'P0002';
  end if;

  if p_total_ttc is null or p_total_ttc <= 0 then
    raise exception 'Aucun honoraire enregistré sur la période.' using errcode = '22023';
  end if;

  if p_taux_tva is null or p_taux_tva < 0 or p_taux_tva > 100 then
    raise exception 'Taux de TVA hors bornes.' using errcode = '22023';
  end if;

  -- Régénération : la facture déjà émise est rendue telle quelle. Son numéro
  -- et ses montants ne bougent pas, même si le journal a changé depuis —
  -- c'est l'assembleur qui confronte les deux et refuse en cas d'écart.
  select * into v_facture from public.factures_honoraires
   where organization_id = p_organization_id
     and mandat_id = p_mandat_id
     and periode = v_mois;
  if found then
    return v_facture;
  end if;

  -- Continuité de la séquence : un verrou de transaction, pas une séquence
  -- Postgres. Une séquence consomme son numéro même quand la transaction
  -- échoue — elle laisserait des trous, précisément ce que la loi interdit.
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || v_annee::text));

  select coalesce(max(f.rang), 0) + 1 into v_rang
    from public.factures_honoraires f
   where f.organization_id = p_organization_id and f.annee = v_annee;

  -- Le TTC est intangible (c'est le journal) ; la TVA est le reste de la
  -- soustraction, pour que HT + TVA retombe exactement dessus. En franchise
  -- en base, le taux vaut 0 et le HT égale le TTC.
  v_ttc := round(p_total_ttc, 2);
  v_ht := round(v_ttc / (1 + p_taux_tva / 100), 2);
  v_tva := v_ttc - v_ht;

  insert into public.factures_honoraires (
    organization_id, mandat_id, periode, annee, rang, numero,
    total_ht, taux_tva, tva, total_ttc, emise_par
  ) values (
    p_organization_id, p_mandat_id, v_mois, v_annee, v_rang,
    'FH-' || v_annee::text || '-' || lpad(v_rang::text, 4, '0'),
    v_ht, p_taux_tva, v_tva, v_ttc,
    auth.uid()
  )
  returning * into v_facture;

  return v_facture;
end;
$$;

comment on function public.emettre_facture_honoraires(uuid, uuid, date, numeric, numeric) is
  'Attribue (ou retrouve) le numéro de la facture d''honoraires d''un mandat pour un mois. Idempotente : régénérer le PDF ne crée pas une seconde facture.';

revoke execute on function public.emettre_facture_honoraires(uuid, uuid, date, numeric, numeric) from public, anon;
grant execute on function public.emettre_facture_honoraires(uuid, uuid, date, numeric, numeric) to authenticated;

-- ============================================================
-- 4 ─ Garde d'abonnement
-- ============================================================
-- Toute table portant `organization_id` doit reposer le refus d'écriture des
-- comptes fermés (le test « aucune table d'organisation n'échappe au verrou »
-- le vérifie). Le sens métier tombe juste : une agence dont l'abonnement est
-- suspendu ne doit pas émettre de nouvelles factures — ses factures déjà
-- émises, elles, restent lisibles.
select public.poser_gardes_abonnement();
