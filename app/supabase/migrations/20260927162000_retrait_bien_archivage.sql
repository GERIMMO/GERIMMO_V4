-- Retirer un bien : archivage, et le bien cesse d'être compté — audit du 27/09
--
-- LE DÉFAUT. « Mon abonnement », la FAQ et la page d'accueil promettent :
-- « un bien retiré n'est plus compté le mois suivant ». Or aucun geste ne
-- retirait un bien : pas de politique DELETE sur `biens`, pas de colonne
-- d'archive, aucune action. Le propriétaire direct payait donc à vie un bien
-- créé par erreur (« Studio du Rhône », sans lot, 5,99 €/mois).
--
-- LA RÈGLE. [[Archivage plutôt que suppression]] : dans l'interface, on
-- archive, on ne supprime pas (colonnes `archived_at` / `archived_by`,
-- actions sensibles journalisées). [[Grille tarifaire]] : le propriétaire
-- direct paie par bien, le premier offert. Un bien archivé n'est plus un bien
-- du parc : il sort du comptage. La facturation ne change pas de mécanique —
-- `abonnement_quantite_cible` reste la seule source, et la tâche
-- `/api/cron/abonnements` aligne Stripe comme pour un bien ajouté (le
-- déclencheur de resynchronisation couvre désormais l'archivage).
--
-- GARDE-FOUS.
--   • Pas de retrait d'un bien qui porte un bail vivant (actif, en préavis)
--     ou en préparation (brouillon) : le bail se clôt d'abord. Pas non plus
--     d'un bien dont un lot est sous mandat actif (agence). La garde vit dans
--     un déclencheur : poser `archived_at` directement par l'API ne la
--     contourne pas.
--   • Réservé au responsable (admin d'agence, propriétaire direct), comme la
--     réactivation d'un lot archivé.
--   • Réversible : `retablir_bien` le remet au parc ; ses lots, archivés avec
--     lui, se réactivent un par un depuis la fiche du bien.
-- Idempotent.

alter table public.biens add column if not exists archived_at timestamptz;
alter table public.biens add column if not exists archived_by uuid references public.accounts(id);

create index if not exists biens_actifs_org_idx on public.biens (organization_id) where archived_at is null;
-- Chaque clé étrangère a son index couvrant (schema-performance-securite).
create index if not exists biens_archived_by_idx on public.biens (archived_by);

-- ── La garde : un bien vivant ne s'archive pas ──────────────────────────────
create or replace function public.garde_archivage_bien()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    if exists (select 1 from public.baux b join public.lots l on l.id = b.lot_id
               where l.bien_id = new.id and b.etat in ('actif', 'preavis')) then
      raise exception 'Ce bien porte un bail en cours : il ne peut pas être retiré. Le bail se clôt d''abord (congé, état des lieux de sortie).'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.baux b join public.lots l on l.id = b.lot_id
               where l.bien_id = new.id and b.etat = 'brouillon') then
      raise exception 'Un bail est en préparation sur ce bien : supprimez ce brouillon avant de retirer le bien.'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.mandat_lignes ml
               join public.mandats m on m.id = ml.mandat_id
               join public.lots l on l.id = ml.lot_id
               where l.bien_id = new.id and m.etat in ('actif', 'preavis')
                 and (ml.date_fin is null or ml.date_fin >= current_date)) then
      raise exception 'Un lot de ce bien est sous mandat de gestion en cours : le mandat se résilie d''abord.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Une fonction déclencheur n'est pas une API (durcissement du 10/09).
revoke execute on function public.garde_archivage_bien() from public, anon, authenticated;

drop trigger if exists biens_garde_archivage on public.biens;
create trigger biens_garde_archivage
  before update of archived_at on public.biens
  for each row execute function public.garde_archivage_bien();

-- Le parc a changé : la quantité facturée se réaligne (même mécanique qu'un
-- bien ajouté ou supprimé).
drop trigger if exists biens_abonnement_resynchro_archive on public.biens;
create trigger biens_abonnement_resynchro_archive
  after update of archived_at on public.biens
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function public.abonnement_marquer_a_resynchroniser();

-- ── Le geste : retirer ─────────────────────────────────────────────────────
create or replace function public.retirer_bien(p_org uuid, p_bien uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bien record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Retrait réservé au responsable du compte';
  end if;
  select id, archived_at, nom into v_bien from public.biens
   where id = p_bien and organization_id = p_org for update;
  if not found then raise exception 'Bien introuvable'; end if;
  if v_bien.archived_at is not null then return; end if;

  -- Le bien d'abord : sa garde refuse avant qu'un lot ne bouge.
  update public.biens set archived_at = now(), archived_by = (select auth.uid())
   where id = p_bien;
  -- Ses lots sans bail sortent avec lui (brouillon, disponible → archivé).
  update public.lots set etat = 'archive'
   where bien_id = p_bien and etat in ('brouillon', 'disponible');

  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'bien_retire',
          jsonb_build_object('bien_id', p_bien, 'nom', v_bien.nom));
end;
$$;

comment on function public.retirer_bien(uuid, uuid) is
  'Archive un bien sans bail vivant ni mandat en cours (Archivage plutôt que suppression) : ses lots libres sont archivés et il sort du comptage de l''abonnement.';
revoke execute on function public.retirer_bien(uuid, uuid) from public, anon;
grant execute on function public.retirer_bien(uuid, uuid) to authenticated;

-- ── Le geste inverse : rétablir ─────────────────────────────────────────────
create or replace function public.retablir_bien(p_org uuid, p_bien uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bien record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Rétablissement réservé au responsable du compte';
  end if;
  select id, archived_at, nom into v_bien from public.biens
   where id = p_bien and organization_id = p_org for update;
  if not found then raise exception 'Bien introuvable'; end if;
  if v_bien.archived_at is null then return; end if;

  update public.biens set archived_at = null, archived_by = null where id = p_bien;

  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'bien_retabli',
          jsonb_build_object('bien_id', p_bien, 'nom', v_bien.nom));
end;
$$;

comment on function public.retablir_bien(uuid, uuid) is
  'Remet au parc un bien retiré : il est de nouveau compté dans l''abonnement ; ses lots archivés se réactivent un par un.';
revoke execute on function public.retablir_bien(uuid, uuid) from public, anon;
grant execute on function public.retablir_bien(uuid, uuid) to authenticated;

-- ── Le comptage : un bien retiré n'est plus compté ──────────────────────────
create or replace function public.abonnement_quantite_cible(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select case o.type
    -- L'AGENCE : les lots sous mandat actif (RM-18.6). Un mandat en préavis
    -- court encore — il produit des quittances, des relevés, des incidents :
    -- le compter serait injuste s'il ne travaillait plus, mais il travaille.
    -- Un mandat en brouillon ou à signer, non : rien n'a été confié.
    when 'agence' then (
      select count(distinct ml.lot_id)::integer
      from public.mandat_lignes ml
      join public.mandats m on m.id = ml.mandat_id
      where ml.organization_id = o.id
        and m.etat in ('actif', 'preavis')
        and ml.date_debut <= current_date
        and (ml.date_fin is null or ml.date_fin >= current_date)
    )
    -- LE PROPRIÉTAIRE DIRECT : ses biens au parc, le premier offert à vie.
    -- Un bien retiré (archivé, 27/09) n'est plus compté.
    else greatest(0, (select count(*) from public.biens b
                      where b.organization_id = o.id
                        and b.archived_at is null) - 1)::integer
  end
  from public.organizations o where o.id = p_org;
$function$;

create or replace function public.etat_abonnement(p_org uuid)
returns table(statut text, ecriture_ouverte boolean, essai_fin date, jours_essai_restants integer,
              public_tarif public.organization_type, unite text, unites_total integer,
              unites_facturees integer, mensuel numeric, en_ligne_possible boolean)
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
    case when o.type = 'agence'
         then public.abonnement_quantite_cible(o.id)
         else (select count(*)::integer from public.biens b
               where b.organization_id = o.id and b.archived_at is null)
    end,
    public.abonnement_quantite_cible(o.id),
    round(public.montant_abonnement_cents(o.type, public.abonnement_quantite_cible(o.id)) / 100.0, 2),
    public.abonnement_en_ligne_possible(o.id)
  from public.organizations o
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$function$;
