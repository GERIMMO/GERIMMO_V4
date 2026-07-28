-- Sprint 1 — Socle : GED et exploitation.
-- Tables documents / document_liens (module 12 : rattachement multiple, sans
-- arborescence, le type pilote droits et conservation), alerts (module 14 :
-- criticités, escalade nominative, fermeture par l'action), retention_rules
-- (matrice A2 : finalité écrite, sort final), journaux tech_log (6 mois) et
-- acces_pieces_log (1 an), bucket Storage privé, purge pg_cron quotidienne.
-- Appliquée le 2026-07-28 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- Types
-- ============================================================
-- Le type du document pilote droits, affichage et conservation (RM-12.x).
-- Les types des modules futurs sont déclarés dès maintenant (l'énum est
-- extensible par ALTER TYPE ... ADD VALUE sans réécriture).
create type public.document_type as enum (
  'piece_identite', 'justificatif', 'attestation_assurance',
  'quittance', 'bail', 'etat_des_lieux', 'mandat', 'diagnostic',
  'courrier', 'photo_incident', 'rapport_gestion', 'autre',
  'document_test'  -- durée de conservation nulle : support du test de purge en recette
);

-- Entités rattachables (S1 : organisation et personne ; le reste arrive avec
-- ses modules — pas de FK polymorphe possible, l'intégrité est applicative)
create type public.entite_liee as enum (
  'organisation', 'personne', 'lot', 'bail', 'mandat', 'incident'
);

create type public.alerte_criticite as enum ('informative', 'normale', 'critique');
create type public.alerte_statut as enum ('ouverte', 'fermee');

-- Les trois sorts finaux de la matrice A2 (RM-A2.3)
create type public.retention_sort as enum ('suppression', 'anonymisation', 'conservation');

-- ============================================================
-- Tables
-- ============================================================

-- GED sans arborescence : un document, des rattachements (module 12)
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  type public.document_type not null,
  titre text,
  storage_path text,
  mime_type text,
  taille_octets bigint check (taille_octets is null or taille_octets between 1 and 10485760),
  empreinte text,          -- SHA-256 du contenu : détection de doublon
  deposited_by uuid references public.accounts (id),
  -- Le compteur de conservation : aujourd'hui la date de dépôt, demain la fin
  -- du bail / du mandat, posée par les modules concernés (déclencheurs A2)
  retention_reference_date date not null default current_date,
  purged_at timestamptz,   -- mention « purgé le … » (RM-12.5.7)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un document vivant a un fichier ; un document purgé n'en a plus
  constraint documents_contenu_ou_purge check (
    purged_at is not null
    or (storage_path is not null and mime_type is not null
        and taille_octets is not null and empreinte is not null)
  )
);
create index documents_org_idx on public.documents (organization_id);
create index documents_org_type_idx on public.documents (organization_id, type);
-- Anti-doublon : le même contenu ne se dépose pas deux fois dans la même agence
create unique index documents_empreinte_unique
  on public.documents (organization_id, empreinte)
  where purged_at is null;

create table public.document_liens (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  entite public.entite_liee not null,
  entite_id uuid not null,
  created_at timestamptz not null default now(),
  constraint document_liens_unique unique (document_id, entite, entite_id)
);
create index document_liens_document_idx on public.document_liens (document_id);
create index document_liens_entite_idx on public.document_liens (organization_id, entite, entite_id);

-- Alertes (module 14) : escalade nominative (déplace, ne duplique jamais),
-- fermeture par l'action — l'action qui ferme est enregistrée
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  type text not null default 'manuelle',
  criticite public.alerte_criticite not null default 'normale',
  titre text not null,
  details jsonb not null default '{}'::jsonb,
  echeance date,
  assignee_account_id uuid references public.accounts (id),
  statut public.alerte_statut not null default 'ouverte',
  escalades jsonb not null default '[]'::jsonb,  -- historique [{de, vers, le}]
  closed_at timestamptz,
  closed_by uuid references public.accounts (id),
  closed_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alerts_fermeture_coherente check (
    (statut = 'ouverte' and closed_at is null)
    or (statut = 'fermee' and closed_at is not null)
  )
);
create index alerts_org_statut_idx on public.alerts (organization_id, statut);
create index alerts_closed_idx on public.alerts (closed_at) where closed_at is not null;

-- La matrice de conservation A2 en table (32 types à terme) : chaque durée
-- découle d'une finalité écrite (RM-A2.1/2), sort final explicite (RM-A2.3)
create table public.retention_rules (
  id uuid primary key default gen_random_uuid(),
  data_type text not null unique,   -- 'journal:tech_log', 'document:quittance', 'alerte:traitee'…
  libelle text not null,
  finalite text not null,
  declencheur text not null,
  duree_mois integer not null check (duree_mois >= 0),
  sort public.retention_sort not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Journal technique (6 mois — RM-A2.6) : connexions, erreurs, événements de compte
create table public.tech_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  evenement text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index tech_log_created_idx on public.tech_log (created_at);

-- Journal d'accès aux pièces (1 an — RM-A2.6, RM-0b.7.5) : toute consultation tracée
create table public.acces_pieces_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_id uuid not null,
  document_id uuid not null references public.documents (id),
  action text not null check (action in ('consultation', 'telechargement')),
  created_at timestamptz not null default now()
);
create index acces_pieces_log_document_idx on public.acces_pieces_log (document_id);
create index acces_pieces_log_created_idx on public.acces_pieces_log (created_at);

create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger alerts_updated_at before update on public.alerts
  for each row execute function public.set_updated_at();
create trigger retention_rules_updated_at before update on public.retention_rules
  for each row execute function public.set_updated_at();

-- ============================================================
-- Règles de conservation : lignes documentées de la matrice A2.
-- Les autres types arrivent avec leurs modules (bail, compta, incidents…).
-- ============================================================
insert into public.retention_rules (data_type, libelle, finalite, declencheur, duree_mois, sort) values
  ('journal:tech_log',        'Journal technique',                  'Diagnostic des incidents techniques et sécurité',            'Événement',                 6,   'suppression'),
  ('journal:audit_log',       'Journal d''audit',                   'Traçabilité des actions sensibles (recommandation CNIL)',    'Action',                    36,  'suppression'),
  ('journal:acces_pieces',    'Journal d''accès aux pièces',        'Contrôle des consultations de pièces sensibles',             'Consultation',              12,  'suppression'),
  ('alerte:traitee',          'Alertes traitées',                   'Historique opérationnel court',                              'Fermeture de l''alerte',    12,  'suppression'),
  ('document:piece_identite', 'Pièces d''identité (dossier)',       'Constitution du dossier locataire',                          'Fin du dernier bail',       60,  'suppression'),
  ('document:justificatif',   'Justificatifs (revenus, imposition)','Constitution du dossier locataire',                          'Fin du dernier bail',       60,  'suppression'),
  ('document:attestation_assurance', 'Attestations d''assurance',   'Preuve des diligences du gérant',                            'Fin du bail',               60,  'suppression'),
  ('document:quittance',      'Quittances',                         'Obligation comptable',                                       'Émission',                  120, 'anonymisation'),
  ('document:bail',           'Baux',                               'Prescription des actions nées du bail',                      'Fin du bail',               60,  'anonymisation'),
  ('document:etat_des_lieux', 'États des lieux',                    'Prescription des actions nées du bail',                      'Fin du bail',               60,  'anonymisation'),
  ('document:mandat',         'Mandats de gestion',                 'Prescription contractuelle',                                 'Fin du mandat',             60,  'anonymisation'),
  ('document:diagnostic',     'Diagnostics',                        'Gestion du bien (décision 2026-07-25 : gestion + 5 ans)',    'Fin de gestion du bien',    60,  'suppression'),
  ('document:courrier',       'Courriers',                          'Suivi de la relation locative',                              'Fin du bail',               60,  'suppression'),
  ('document:photo_incident', 'Photos d''incident',                 'Documentation des interventions',                            'Clôture de l''incident',    24,  'suppression'),
  ('document:rapport_gestion','Rapports de gestion',                'Obligation comptable',                                       'Émission',                  120, 'anonymisation'),
  ('document:autre',          'Autres documents',                   'Gestion courante',                                           'Dépôt',                     60,  'suppression'),
  ('document:document_test',  'Documents de test (recette)',        'Vérification de la mécanique de purge',                      'Dépôt',                     0,   'suppression');

-- ============================================================
-- Stockage : bucket privé, formats limités, 10 Mo (RM-A4.9/10)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png']);

-- Chemin : <organization_id>/<uuid>.<ext> — le 1er segment porte l'isolation
create policy ged_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in (
        select o::text from public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o)
      or (select public.is_super_admin())
    )
  );
create policy ged_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select o::text from public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o)
  );
-- Ni update ni delete côté client : un fichier ne se modifie pas, la purge
-- passe par la fonction definer (et le Super Admin par la console, plus tard)

-- ============================================================
-- Fonctions
-- ============================================================

-- Trace d'accès aux pièces (RM-0b.7.5) : appelée par l'app à chaque
-- consultation/téléchargement. Definer : le journal n'est pas modifiable client.
create function public.log_document_access(doc uuid, acces text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if acces not in ('consultation', 'telechargement') then
    raise exception 'log_document_access: action inconnue %', acces;
  end if;
  select d.organization_id into v_org from public.documents d where d.id = doc;
  if v_org is null then
    raise exception 'log_document_access: document inconnu';
  end if;
  if not (
    v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or public.is_super_admin()
  ) then
    raise exception 'log_document_access: acces refuse';
  end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), doc, acces);
end;
$$;

-- Journal technique : événements de compte (changement de mot de passe…)
create function public.log_tech(evenement text, details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tech_log (account_id, evenement, details)
  values ((select auth.uid()), evenement, details);
$$;

-- La purge : applique les règles de conservation actives.
-- Appelée chaque nuit par pg_cron, et à la demande par le Super Admin (recette).
-- Chaque passage est journalisé dans audit_log (on doit pouvoir répondre :
-- « purgé le X en application de la règle Y »).
-- Limite documentée : la suppression retire la ligne storage.objects (le fichier
-- devient inaccessible, aucun lien signé possible) ; le nettoyage physique du
-- stockage sous-jacent sera traité au durcissement production (S15).
create function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  -- Réservée au cron (session postgres) et au Super Admin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  -- 1) Journaux : chacun sa durée (RM-A2.6)
  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  -- 2) Alertes traitées
  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  -- 3) Documents : règle par type, compteur = retention_reference_date.
  -- Sort « suppression » comme « anonymisation » : le fichier disparaît et la
  -- ligne devient une trace neutre « purgé le … » (RM-12.5.7) sans donnée
  -- personnelle ; les rattachements aux personnes sont coupés.
  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    delete from storage.objects
      where bucket_id = 'documents' and name = v_doc.storage_path;
    delete from public.document_liens where document_id = v_doc.id;
    update public.documents
      set purged_at = now(), storage_path = null, mime_type = null,
          taille_octets = null, empreinte = null, titre = null,
          deposited_by = null
      where id = v_doc.id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges);
end;
$$;

revoke execute on function public.log_document_access(uuid, text) from public, anon;
revoke execute on function public.log_tech(text, jsonb) from public, anon;
revoke execute on function public.appliquer_retention() from public, anon;

-- ============================================================
-- Purge quotidienne (03h00 UTC)
-- ============================================================
create extension if not exists pg_cron;
select cron.schedule('retention-quotidienne', '0 3 * * *',
                     $$select public.appliquer_retention()$$);

-- ============================================================
-- RLS
-- ============================================================
alter table public.documents enable row level security;
alter table public.document_liens enable row level security;
alter table public.alerts enable row level security;
alter table public.retention_rules enable row level security;
alter table public.tech_log enable row level security;
alter table public.acces_pieces_log enable row level security;

-- documents : réservés aux gérants de l'agence (module 12 — l'accès du
-- locataire à « ses documents » arrive au S3 via document_liens)
create policy documents_select on public.documents
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
-- Pas d'update client : un document déposé ne se modifie pas (nouvelle version
-- = nouveau dépôt, module 0b) ; pas de delete : la purge est le seul effaceur.

create policy document_liens_select on public.document_liens
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy document_liens_insert on public.document_liens
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy document_liens_delete on public.document_liens
  for delete to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

-- alerts : visibles et gérées par les gérants de l'agence
create policy alerts_select on public.alerts
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy alerts_update on public.alerts
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy alerts_delete on public.alerts
  for delete to authenticated
  using ((select public.is_super_admin()));

-- retention_rules : lecture par tout gérant (seuils affichés avec leur
-- fondement) ; écriture réservée au Super Admin (seuils légaux — module 14)
create policy retention_rules_select on public.retention_rules
  for select to authenticated
  using (true);
create policy retention_rules_write on public.retention_rules
  for insert to authenticated
  with check ((select public.is_super_admin()));
create policy retention_rules_update on public.retention_rules
  for update to authenticated
  using ((select public.is_super_admin()));
create policy retention_rules_delete on public.retention_rules
  for delete to authenticated
  using ((select public.is_super_admin()));

-- tech_log : lecture Super Admin ; écriture par fonction definer uniquement
create policy tech_log_select on public.tech_log
  for select to authenticated
  using ((select public.is_super_admin()));

-- acces_pieces_log : lecture par l'admin de l'agence et le Super Admin
create policy acces_pieces_log_select on public.acces_pieces_log
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence']::public.membership_role[]))
    or (select public.is_super_admin())
  );

-- ============================================================
-- Privilèges : ceintures et bretelles au-delà des politiques
-- ============================================================
revoke update, delete on public.documents from authenticated;
revoke update on public.document_liens from authenticated;
revoke insert, update, delete on public.tech_log from authenticated;
revoke insert, update, delete on public.acces_pieces_log from authenticated;
revoke all on public.documents, public.document_liens, public.alerts,
  public.retention_rules, public.tech_log, public.acces_pieces_log from anon;
