-- ══════════════════════════════════════════════════════════════════════════
-- Le dépôt de la facture de l'artisan — version simple du module 9.7
-- (audit du 27/09 : « le cycle s'arrête avant la facture »)
-- ══════════════════════════════════════════════════════════════════════════
--
-- CE QUE DIT LE WIKI (concepts/Devis, « Spécification V3 (module 9) » ;
-- sources/2026-07-24-gerimmo-v3-module-9-devis-et-facturation, affirmation 4) :
--   « Facture : pré-remplie du devis, écart alerté sans blocage (justifié par
--     l'artisan, tranché par l'agent) ; exige intervention terminée + photo ;
--     la validation crée l'écriture comptable selon l'imputation. »
--
-- CE QUE LIVRE CETTE MIGRATION — la moitié « artisan » de cette phrase :
--  · une table `intervention_factures` (une facture par intervention) ;
--  · `deposer_facture_artisan` : exige l'intervention TERMINÉE, le compte
--    rendu et la photo « après » ; le montant proposé à l'écran est le
--    plafond engagé (devis retenu, ou dernier avenant accepté) ; un montant
--    différent n'est PAS bloqué mais doit être justifié, et l'agence reçoit
--    une alerte critique qui le dit ;
--  · la pièce (PDF ou photo de la facture) entre dans la GED de l'agence
--    (type `facture_artisan`), liée à l'incident ;
--  · l'agence est prévenue par une alerte `facture_artisan_a_valider`.
--
-- CE QU'ELLE NE LIVRE PAS : la VALIDATION par l'agent et l'écriture
-- comptable qui en découle (RM-9.8.2–9.8.4). Elles touchent la comptabilité
-- du bail et du mandant, hors du périmètre de cette correction : l'agence
-- traite l'alerte à la main en attendant.
--
-- EN PASSANT (même audit, mineur) :
--  · `mon_agenda_artisan` rend le plafond engagé (devis OU avenant accepté),
--    le montant final du compte rendu, l'état de la facture et le nombre de
--    dates du locataire en attente de réponse — « Ma facturation » affichait
--    le seul devis initial, et l'accueil ne voyait pas la contre-proposition ;
--  · (le montant final du compte rendu au-delà de ce plafond est déjà REFUSÉ
--    par `garder_depassement_devis`, migration 20260922120000 : l'artisan
--    demande un avenant. L'« écart alerté sans blocage » du wiki vit donc ici,
--    à la facture.)
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.

alter type public.document_type add value if not exists 'facture_artisan';

-- ── 1. La table ───────────────────────────────────────────────────────────
create table if not exists public.intervention_factures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intervention_id uuid not null unique,
  artisan_id uuid not null references public.artisans(id),
  numero text not null,
  montant_ttc_cents bigint not null,
  -- Le plafond engagé au jour du dépôt : devis retenu, ou dernier avenant
  -- accepté. Figé ici pour que l'écart reste lisible même si l'avenant bouge.
  montant_reference_cents bigint,
  ecart_justification text,
  document_id uuid not null references public.documents(id),
  deposee_le timestamptz not null default now(),
  deposee_par uuid references public.accounts(id),
  constraint intervention_factures_intervention_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint intervention_factures_numero
    check (length(btrim(numero)) between 1 and 60),
  constraint intervention_factures_montant
    check (montant_ttc_cents > 0 and montant_ttc_cents <= 100000000000),
  constraint intervention_factures_justification
    check (ecart_justification is null or length(ecart_justification) <= 4000)
);

comment on table public.intervention_factures is
  'Facture déposée par l''artisan après l''intervention (module 9.7, version simple : dépôt et alerte ; la validation comptable reste à livrer).';

-- Chaque clé étrangère a son index (tests/schema-performance-securite).
create index if not exists intervention_factures_org_idx on public.intervention_factures (organization_id);
create index if not exists intervention_factures_intervention_org_idx on public.intervention_factures (intervention_id, organization_id);
create index if not exists intervention_factures_artisan_idx on public.intervention_factures (artisan_id);
create index if not exists intervention_factures_document_idx on public.intervention_factures (document_id);
create index if not exists intervention_factures_deposee_par_idx on public.intervention_factures (deposee_par);

alter table public.intervention_factures enable row level security;
revoke all on public.intervention_factures from anon, authenticated;
grant select on public.intervention_factures to authenticated;

drop policy if exists intervention_factures_lecture on public.intervention_factures;
create policy intervention_factures_lecture on public.intervention_factures
  for select to authenticated
  using (
    (select public.is_super_admin())
    -- L'agent tranche l'écart (concepts/Devis) : il lit donc la facture, dans
    -- son portefeuille seulement, comme le reste du dossier d'incident.
    or (organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
        and not public.intervention_hors_portefeuille(organization_id, intervention_id))
    or public.artisan_possede_intervention(intervention_id, organization_id)
  );

-- ── 2. Le plafond engagé d'une intervention ──────────────────────────────
-- Devis retenu, ou dernier avenant accepté (un avenant ne peut que monter :
-- contrainte devis_avenants_check). Interne : appelée par les fonctions
-- ci-dessous, jamais par un client.
create or replace function public.plafond_intervention(p_intervention uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.nouveau_montant_cents from public.devis_avenants a
      where a.intervention_id = p_intervention and a.statut = 'accepte'
      order by a.decide_le desc nulls last limit 1),
    (select d.montant_ttc_cents from public.incident_interventions i
       join public.incident_devis d on d.id = i.devis_id
      where i.id = p_intervention)
  );
$$;
revoke execute on function public.plafond_intervention(uuid) from public, anon, authenticated;

-- ── 3. Le dépôt ───────────────────────────────────────────────────────────
create or replace function public.deposer_facture_artisan(
  p_intervention uuid,
  p_numero text,
  p_montant_ttc_cents bigint,
  p_justification text,
  p_storage_path text,
  p_mime text,
  p_taille bigint,
  p_empreinte text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record; v_plafond bigint; v_doc uuid; v_facture uuid; v_numero_incident text;
  v_ecart boolean; v_justif text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;

  -- « Aucune facture sans intervention terminée + photo » (module 9).
  if v.statut <> 'terminee' then
    raise exception 'La facture se dépose une fois l''intervention terminée (état : %)', v.statut;
  end if;
  if not exists (select 1 from public.intervention_comptes_rendus cr
                 where cr.intervention_id = p_intervention) then
    raise exception 'Déposez d''abord le compte rendu : il conditionne la facturation';
  end if;
  if not exists (select 1 from public.intervention_photos ip
                 where ip.intervention_id = p_intervention and ip.moment = 'apres') then
    raise exception 'Ajoutez la photo du travail réalisé : sans elle, pas de facture (RM-7.5.2)';
  end if;
  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention) then
    raise exception 'La facture de cette intervention a déjà été déposée';
  end if;

  if length(btrim(coalesce(p_numero, ''))) not between 1 and 60 then
    raise exception 'Indiquez le numéro de votre facture';
  end if;
  if coalesce(p_montant_ttc_cents, 0) <= 0 or p_montant_ttc_cents > 100000000000 then
    raise exception 'Indiquez le montant TTC de la facture';
  end if;

  v_plafond := public.plafond_intervention(p_intervention);
  v_ecart := v_plafond is not null and p_montant_ttc_cents <> v_plafond;
  v_justif := nullif(btrim(coalesce(p_justification, '')), '');
  -- L'écart ne bloque pas ; il se JUSTIFIE (l'agent tranche).
  if v_ecart and v_justif is null then
    raise exception 'Le montant diffère du devis retenu : expliquez l''écart, l''agence le tranchera';
  end if;
  if length(coalesce(v_justif, '')) > 4000 then
    raise exception 'L''explication de l''écart est trop longue (4 000 caractères au plus)';
  end if;

  if p_storage_path is null
     or p_storage_path not like v.organization_id::text || '/factures-artisan/' || p_intervention::text || '/%' then
    raise exception 'Joignez votre facture (PDF ou photo)';
  end if;

  select numero into v_numero_incident from public.incidents where id = v.incident_id;
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values (v.organization_id, 'facture_artisan',
            'Facture ' || btrim(p_numero) || ' — incident ' || v_numero_incident,
            p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Ce fichier a déjà été déposé';
  end;
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v.organization_id, 'organisation', v.organization_id),
         (v_doc, v.organization_id, 'incident', v.incident_id);

  insert into public.intervention_factures
    (organization_id, intervention_id, artisan_id, numero, montant_ttc_cents,
     montant_reference_cents, ecart_justification, document_id, deposee_par)
  values (v.organization_id, p_intervention, v.artisan_id, btrim(p_numero),
          p_montant_ttc_cents, v_plafond, v_justif, v_doc, (select auth.uid()))
  returning id into v_facture;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'facture_deposee', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'facture_id', v_facture,
                             'numero', btrim(p_numero),
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'montant_reference_cents', v_plafond));

  insert into public.alerts (organization_id, type, criticite, titre, details,
                             origine_type, origine_id)
  values (v.organization_id, 'facture_artisan_a_valider',
          case when v_ecart then 'critique' else 'normale' end::public.alerte_criticite,
          case when v_ecart
               then 'Facture à valider, écart avec le devis — ' || v_numero_incident
               else 'Facture à valider — ' || v_numero_incident end,
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2
                                        where i2.id = v.incident_id),
                             'intervention_id', p_intervention,
                             'document_id', v_doc,
                             'facture_id', v_facture,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'montant_reference_cents', v_plafond,
                             'libelle', case when v_ecart
                               then 'Écart avec le devis retenu, justifié par l''artisan : ' || v_justif
                               else 'Montant conforme au devis retenu' end),
          'intervention', p_intervention);
  return v_facture;
end;
$$;

revoke execute on function public.deposer_facture_artisan(uuid, text, bigint, text, text, text, bigint, text) from public, anon;
grant execute on function public.deposer_facture_artisan(uuid, text, bigint, text, text, text, bigint, text) to authenticated;

-- ── 4. Le stockage : une intervention terminée sans facture ouvre l'écriture
-- Pas tout le dossier de l'agence : le seul sous-dossier de la facture de
-- cette intervention (`<org>/factures-artisan/<intervention>/`). Une mission
-- finie ne rouvre donc pas l'écriture chez l'agence.
drop function if exists public.orgs_de_mes_factures_a_deposer();
create or replace function public.dossiers_de_mes_factures_a_deposer()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select i.organization_id::text || '/factures-artisan/' || i.id::text || '/'
  from public.incident_interventions i
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut = 'terminee'
    and not exists (select 1 from public.intervention_factures f where f.intervention_id = i.id);
$$;
revoke execute on function public.dossiers_de_mes_factures_a_deposer() from public, anon;
grant execute on function public.dossiers_de_mes_factures_a_deposer() to authenticated;

drop policy if exists ged_insert_artisan on storage.objects;
create policy ged_insert_artisan on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_missions() o)
      or (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_sollicitations_ouvertes() o)
      or exists (select 1 from public.dossiers_de_mes_factures_a_deposer() d where name like d || '%')
      or (public.mon_artisan_id() is not null
          and name like 'artisans/' || public.mon_artisan_id()::text || '/%')
    )
  );

-- L'artisan relit sa facture comme ses devis et ses photos.
create or replace function public.chemins_fichiers_artisan()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select d.storage_path
  from public.intervention_photos ip
  join public.incident_interventions i on i.id = ip.intervention_id
  join public.documents d on d.id = ip.document_id
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.incident_devis dv
  join public.documents d on d.id = dv.document_id
  where dv.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.intervention_factures f
  join public.documents d on d.id = f.document_id
  where f.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and d.purged_at is null and d.storage_path is not null
  union
  select p.storage_path
  from public.artisan_pieces p
  where p.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null;
$$;

-- ── 5. L'agenda de l'artisan : plafond, montant final, facture, dates du
--      locataire. Nouveau type de retour : DROP puis CREATE, puis fermeture à
--      anon (voir tests/aucune-fonction-ouverte-a-anon.test.ts).
drop function if exists public.mon_agenda_artisan(timestamptz, timestamptz);
create function public.mon_agenda_artisan(
  p_du timestamptz default null,
  p_au timestamptz default null
) returns table (
  intervention_id uuid, organization_id uuid, agence_nom text, incident_numero text,
  statut public.intervention_statut, debut_prevu timestamptz, fin_prevue timestamptz,
  categorie text, description text, urgence public.incident_urgence, piece text,
  nature_travaux public.nature_travaux, adresse text, code_postal text, ville text,
  lot_nom text, etage text, occupant_nom text, occupant_prenom text,
  occupant_telephone text, montant_ttc_cents bigint, compte_rendu_depose boolean,
  photo_apres_deposee boolean, creneaux_en_attente integer,
  dates_locataire_en_attente integer, montant_plafond_cents bigint,
  montant_final_cents bigint, facture_deposee boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id, i.organization_id, o.name, inc.numero, i.statut,
    i.debut_prevu, i.fin_prevue,
    inc.categorie, inc.description, inc.urgence, inc.piece, i.nature_travaux,
    b.address_line1, b.postal_code, b.city, l.nom, l.etage,
    -- Ni avant l'acceptation, ni après la fin : le contact de l'occupant n'est
    -- lisible que pendant la mission vivante.
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.nom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.prenom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.telephone end,
    d.montant_ttc_cents,
    exists (select 1 from public.intervention_comptes_rendus cr where cr.intervention_id = i.id),
    exists (select 1 from public.intervention_photos ip
            where ip.intervention_id = i.id and ip.moment = 'apres'),
    (select count(*)::integer from public.intervention_creneaux cr
      where cr.intervention_id = i.id and cr.statut = 'propose'
        and cr.propose_par = 'artisan'),
    (select count(*)::integer from public.intervention_creneaux cr
      where cr.intervention_id = i.id and cr.statut = 'propose'
        and cr.propose_par = 'locataire' and cr.debut > now()),
    public.plafond_intervention(i.id),
    (select cr.montant_final_cents from public.intervention_comptes_rendus cr
      where cr.intervention_id = i.id limit 1),
    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id)
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = i.organization_id
  left join public.incident_devis d on d.id = i.devis_id
  left join public.baux ba on ba.id = inc.bail_id
  left join public.persons pe on pe.id = ba.locataire_principal
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee')
    and (p_du is null or i.debut_prevu is null or i.debut_prevu >= p_du)
    and (p_au is null or i.debut_prevu is null or i.debut_prevu < p_au)
  order by i.debut_prevu nulls first, i.confiee_le;
$$;
revoke execute on function public.mon_agenda_artisan(timestamptz, timestamptz) from public, anon;
grant execute on function public.mon_agenda_artisan(timestamptz, timestamptz) to authenticated;

-- La garde d'abonnement, posée sur CETTE table seulement (même déclencheur
-- que `poser_gardes_abonnement()`, qui reprendrait toutes les tables et
-- verrouillerait tout le schéma pour une table ajoutée).
drop trigger if exists abonnement_intervention_factures on public.intervention_factures;
create trigger abonnement_intervention_factures
  before insert or update or delete on public.intervention_factures
  for each row execute function public.refuser_ecriture_si_fermee();

select public.fermer_fonctions_a_anon();
