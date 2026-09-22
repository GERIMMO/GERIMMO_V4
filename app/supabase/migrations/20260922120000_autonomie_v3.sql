-- Gerimmo V3 : mesure d'automatisation, orchestration, devis protégés,
-- marque blanche, continuité, amélioration encadrée et données territoriales.

-- 1. Marque blanche par organisation.
alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists couleur_primaire text,
  add column if not exists couleur_secondaire text,
  add column if not exists domaine_personnalise text,
  add column if not exists email_expediteur text,
  add column if not exists nom_portail text,
  add column if not exists domaine_personnalise_verifie_le timestamptz,
  add column if not exists email_expediteur_verifie_le timestamptz;

alter table public.organizations add constraint organizations_domaine_format
  check(domaine_personnalise is null or (length(domaine_personnalise)<=253 and domaine_personnalise ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'));
alter table public.organizations add constraint organizations_email_expediteur_format
  check(email_expediteur is null or (length(email_expediteur)<=254 and email_expediteur ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
alter table public.organizations add constraint organizations_logo_https
  check(logo_url is null or (length(logo_url)<=2048 and logo_url ~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$') or (length(logo_url)<=280000 and logo_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));

create or replace function public.garder_verification_marque()
returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.role()) is distinct from 'service_role' and (
    (tg_op='INSERT' and (new.domaine_personnalise_verifie_le is not null or new.email_expediteur_verifie_le is not null)) or
    (tg_op='UPDATE' and (new.domaine_personnalise_verifie_le is distinct from old.domaine_personnalise_verifie_le or
    new.email_expediteur_verifie_le is distinct from old.email_expediteur_verifie_le))
  ) then raise exception 'La connexion doit être vérifiée par le service'; end if;
  if tg_op='UPDATE' and new.domaine_personnalise is distinct from old.domaine_personnalise then new.domaine_personnalise_verifie_le := null; end if;
  if tg_op='UPDATE' and new.email_expediteur is distinct from old.email_expediteur then new.email_expediteur_verifie_le := null; end if;
  return new;
end $$;
revoke all on function public.garder_verification_marque() from public,anon,authenticated;
create trigger organisations_verification_marque before insert or update on public.organizations
  for each row execute function public.garder_verification_marque();

alter table public.organizations drop constraint if exists organizations_couleur_primaire_check;
alter table public.organizations add constraint organizations_couleur_primaire_check
  check (couleur_primaire is null or couleur_primaire ~ '^#[0-9A-Fa-f]{6}$');
alter table public.organizations drop constraint if exists organizations_couleur_secondaire_check;
alter table public.organizations add constraint organizations_couleur_secondaire_check
  check (couleur_secondaire is null or couleur_secondaire ~ '^#[0-9A-Fa-f]{6}$');
create unique index if not exists organizations_domaine_personnalise_unique
  on public.organizations(lower(domaine_personnalise)) where domaine_personnalise is not null;

-- 2. Événements réels d'automatisation, par organisation.
create table if not exists public.automation_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  origine text not null check (origine in ('automatique','humaine')),
  domaine text not null check (domaine in ('location','incident','finance','document','message','marketing','territoire','qualite')),
  action text not null,
  cle_unique text unique,
  clics_evites integer not null default 0 check (clics_evites >= 0),
  messages_envoyes integer not null default 0 check (messages_envoyes >= 0),
  dossier_type text,
  dossier_id uuid,
  sans_appel boolean,
  actor_account_id uuid references public.accounts(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_events_org_date_idx
  on public.automation_events(organization_id,created_at desc);
create index if not exists automation_events_domaine_date_idx
  on public.automation_events(domaine,created_at desc);
alter table public.automation_events enable row level security;
drop policy if exists automation_events_lecture on public.automation_events;
create policy automation_events_lecture on public.automation_events for select to authenticated
  using (public.is_super_admin() or (organization_id is not null and public.can_manage_organization(organization_id)));
revoke all on public.automation_events from anon,authenticated;
grant select on public.automation_events to authenticated;
grant all on public.automation_events to service_role;
grant usage,select on sequence public.automation_events_id_seq to service_role;

create or replace function public.log_automation_event(
  p_org uuid, p_origine text, p_domaine text, p_action text,
  p_clics integer default 0, p_messages integer default 0,
  p_dossier_type text default null, p_dossier_id uuid default null,
  p_sans_appel boolean default null, p_details jsonb default '{}'::jsonb, p_cle text default null
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès refusé'; end if;
  insert into public.automation_events(organization_id,origine,domaine,action,
    clics_evites,messages_envoyes,dossier_type,dossier_id,sans_appel,
    actor_account_id,details,cle_unique)
  values(p_org,p_origine,p_domaine,p_action,greatest(0,coalesce(p_clics,0)),
    greatest(0,coalesce(p_messages,0)),p_dossier_type,p_dossier_id,
    p_sans_appel,(select auth.uid()),coalesce(p_details,'{}'::jsonb),p_cle)
  on conflict(cle_unique) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.automation_events where cle_unique=p_cle; end if;
  return v_id;
end $$;
revoke all on function public.log_automation_event(uuid,text,text,text,integer,integer,text,uuid,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.log_automation_event(uuid,text,text,text,integer,integer,text,uuid,boolean,jsonb,text) to service_role;

create or replace view public.automation_stats_30d with (security_invoker=true) as
select organization_id,
  count(*) filter(where origine='automatique')::integer actions_automatiques,
  count(*) filter(where origine='humaine')::integer interventions_humaines,
  coalesce(sum(clics_evites),0)::integer clics_evites,
  coalesce(sum(messages_envoyes),0)::integer messages_envoyes,
  count(distinct (dossier_type,dossier_id)) filter(where sans_appel and dossier_id is not null)::integer dossiers_sans_appel,
  case when count(*)=0 then null else
    round(100.0*count(*) filter(where origine='automatique')/count(*))::integer end taux_automatisation
from public.automation_events where created_at >= now()-interval '30 days'
group by organization_id;
grant select on public.automation_stats_30d to authenticated;

-- 3. Orchestrateur : une prochaine action unique par dossier, et seulement les
-- exceptions ou autorisations remontent à un humain.
create table if not exists public.orchestration_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dossier_type text not null check (dossier_type in ('bail','loyer','incident','document','intervention','rapport')),
  dossier_id uuid not null,
  etape text not null,
  prochaine_action text not null,
  mode text not null check (mode in ('automatique','autorisation','humaine')),
  etat text not null default 'a_faire' check (etat in ('a_faire','en_cours','en_attente','termine','bloque')),
  priorite text not null default 'normale' check (priorite in ('basse','normale','haute','urgente')),
  agir_apres timestamptz,
  derniere_action text,
  exception_message text,
  autorisation_demandee text,
  autorisee_le timestamptz,
  autorisee_par uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,dossier_type,dossier_id)
);
create index if not exists orchestration_cases_file_idx
  on public.orchestration_cases(etat,priorite,agir_apres);
alter table public.orchestration_cases enable row level security;
create policy orchestration_cases_lecture on public.orchestration_cases for select to authenticated
  using (public.is_super_admin() or public.can_manage_organization(organization_id));
revoke all on public.orchestration_cases from anon,authenticated;
grant select on public.orchestration_cases to authenticated;
grant all on public.orchestration_cases to service_role;

create or replace function public.autoriser_orchestration(p_dossier uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.orchestration_cases%rowtype;
begin
  select * into v from public.orchestration_cases where id=p_dossier for update;
  if (select auth.uid()) is null or v.id is null or public.is_super_admin() is not true then
    raise exception 'Accès refusé';
  end if;
  if v.mode<>'autorisation' or v.etat not in ('a_faire','en_attente') then
    raise exception 'Cette action ne demande plus d''autorisation';
  end if;
  update public.orchestration_cases set autorisee_le=now(),autorisee_par=(select auth.uid()),
    etat='a_faire',updated_at=now() where id=p_dossier;
end $$;
revoke all on function public.autoriser_orchestration(uuid) from public,anon;
grant execute on function public.autoriser_orchestration(uuid) to authenticated;

-- 4. Devis structuré et avenant obligatoire avant dépassement.
alter table public.incident_devis
  add column if not exists diagnostic text,
  add column if not exists montant_ht_cents bigint,
  add column if not exists montant_tva_cents bigint,
  add column if not exists lignes jsonb not null default '[]'::jsonb,
  add column if not exists delai_intervention text,
  add column if not exists duree_estimee text,
  add column if not exists contraintes text,
  add column if not exists observations text;

-- Calcul unique côté base. Les centimes sont entiers et les quantités ont
-- au plus trois décimales. Les arrondis se font par ligne, puis par TVA.
create or replace function public.calculer_devis_lignes(p_lignes jsonb)
returns table(lignes_normalisees jsonb,montant_ht_cents bigint,montant_tva_cents bigint,montant_ttc_cents bigint)
language plpgsql immutable set search_path='' as $$
declare l jsonb; q numeric; prix bigint; taux integer; ht bigint; tva bigint;
begin
  if jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) not between 1 and 100 then
    raise exception 'Ajoutez entre une et cent lignes au devis';
  end if;
  lignes_normalisees:='[]'::jsonb; montant_ht_cents:=0; montant_tva_cents:=0;
  for l in select value from jsonb_array_elements(p_lignes) loop
    if jsonb_typeof(l) is distinct from 'object'
       or length(btrim(coalesce(l->>'libelle',''))) not between 1 and 240
       or coalesce(l->>'quantite','') !~ '^[0-9]+(\.[0-9]{1,3})?$'
       or coalesce(l->>'prix_unitaire_ht_cents','') !~ '^[0-9]{1,10}$'
       or coalesce(l->>'tva_bps','') !~ '^[0-9]{1,4}$' then
      raise exception 'Vérifiez le libellé, la quantité, le prix et la TVA de chaque ligne';
    end if;
    q := (l->>'quantite')::numeric;
    prix := (l->>'prix_unitaire_ht_cents')::bigint;
    taux := (l->>'tva_bps')::integer;
    if q<=0 or q>1000000 or prix>1000000000 or taux not in (0,210,550,1000,2000) then
      raise exception 'Une quantité, un prix ou un taux de TVA est invalide';
    end if;
    ht := round(q*prix)::bigint;
    tva := round(ht::numeric*taux/10000)::bigint;
    montant_ht_cents := montant_ht_cents+ht;
    montant_tva_cents := montant_tva_cents+tva;
    if montant_ht_cents+montant_tva_cents>100000000000 then raise exception 'Le total du devis est trop élevé'; end if;
    lignes_normalisees := lignes_normalisees || jsonb_build_array(jsonb_build_object(
      'libelle',btrim(l->>'libelle'),'quantite',q,'prix_unitaire_ht_cents',prix,'tva_bps',taux,
      'montant_ht_cents',ht,'montant_tva_cents',tva,'montant_ttc_cents',ht+tva));
  end loop;
  montant_ttc_cents:=montant_ht_cents+montant_tva_cents;
  if montant_ttc_cents<=0 then raise exception 'Indiquez au moins une ligne payante'; end if;
  return next;
end $$;
revoke all on function public.calculer_devis_lignes(jsonb) from public,anon;
grant execute on function public.calculer_devis_lignes(jsonb) to authenticated,service_role;

create or replace function public.deposer_devis_structure(
  p_sollicitation uuid,p_lignes jsonb,p_diagnostic text,p_prestations text,
  p_delai text,p_duree text,p_contraintes text default null,p_observations text default null,
  p_valide_jusqu_au date default null,p_storage_path text default null,
  p_mime text default null,p_taille bigint default null,p_empreinte text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare calcul record; v_id uuid; description text; l jsonb;
begin
  if (select auth.uid()) is null or public.mon_artisan_id() is null then raise exception 'Accès refusé'; end if;
  -- Le verrou et le périmètre sont également vérifiés dans deposer_devis.
  if not exists(select 1 from public.incident_sollicitations s where s.id=p_sollicitation and s.artisan_id=public.mon_artisan_id()) then
    raise exception 'Accès refusé'; end if;
  if length(btrim(coalesce(p_diagnostic,''))) not between 1 and 4000
    or length(btrim(coalesce(p_prestations,''))) not between 1 and 6000
    or length(btrim(coalesce(p_delai,''))) not between 1 and 240
    or length(btrim(coalesce(p_duree,''))) not between 1 and 240
    or length(coalesce(p_contraintes,''))>3000 or length(coalesce(p_observations,''))>3000 then
    raise exception 'Complétez le diagnostic, les travaux, le délai et la durée estimée'; end if;
  select * into calcul from public.calculer_devis_lignes(p_lignes);
  description := 'Diagnostic : '||btrim(p_diagnostic)||E'\n\nTravaux proposés : '||btrim(p_prestations);
  for l in select value from jsonb_array_elements(calcul.lignes_normalisees) loop
    description := description||E'\n'||(l->>'libelle')||' : '||(l->>'quantite')||' × '||
      ((l->>'prix_unitaire_ht_cents')::numeric/100)::text||' € HT — TVA '||
      ((l->>'tva_bps')::numeric/100)::text||' % — '||((l->>'montant_ttc_cents')::numeric/100)::text||' € TTC';
  end loop;
  description := description||E'\n\nDélai d’intervention : '||btrim(p_delai)||E'\nDurée estimée : '||btrim(p_duree);
  if nullif(btrim(p_contraintes),'') is not null then description:=description||E'\nContraintes et accès : '||btrim(p_contraintes); end if;
  if nullif(btrim(p_observations),'') is not null then description:=description||E'\nObservations : '||btrim(p_observations); end if;
  v_id:=public.deposer_devis(p_sollicitation,calcul.montant_ttc_cents,description,p_valide_jusqu_au,p_storage_path,p_mime,p_taille,p_empreinte);
  update public.incident_devis set lignes=calcul.lignes_normalisees,diagnostic=btrim(p_diagnostic),
    montant_ht_cents=calcul.montant_ht_cents,montant_tva_cents=calcul.montant_tva_cents,
    delai_intervention=btrim(p_delai),duree_estimee=btrim(p_duree),
    contraintes=nullif(btrim(p_contraintes),''),observations=nullif(btrim(p_observations),'') where id=v_id;
  return v_id;
end $$;
revoke all on function public.deposer_devis_structure(uuid,jsonb,text,text,text,text,text,text,date,text,text,bigint,text) from public,anon;
grant execute on function public.deposer_devis_structure(uuid,jsonb,text,text,text,text,text,text,date,text,text,bigint,text) to authenticated;

create table if not exists public.devis_avenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intervention_id uuid not null,
  devis_id uuid not null,
  montant_initial_cents bigint not null check(montant_initial_cents>0),
  nouveau_montant_cents bigint not null check(nouveau_montant_cents>montant_initial_cents and nouveau_montant_cents<=100000000000),
  motif text not null check(length(btrim(motif)) between 10 and 4000),
  lignes jsonb not null check(jsonb_typeof(lignes)='array' and jsonb_array_length(lignes) between 1 and 100),
  statut text not null default 'a_decider' check(statut in ('a_decider','accepte','refuse','annule')),
  demande_par uuid not null references public.accounts(id),
  demande_le timestamptz not null default now(),
  decide_par uuid references public.accounts(id),
  decide_le timestamptz,
  decision_motif text,
  constraint devis_avenants_intervention_fk foreign key(intervention_id,organization_id)
    references public.incident_interventions(id,organization_id),
  constraint devis_avenants_devis_fk foreign key(devis_id,organization_id)
    references public.incident_devis(id,organization_id),
  constraint devis_avenants_decision_coherente check(
    (statut='a_decider' and decide_par is null and decide_le is null) or
    (statut<>'a_decider' and decide_par is not null and decide_le is not null))
);
create unique index if not exists devis_avenants_un_ouvert on public.devis_avenants(intervention_id) where statut='a_decider';
create index if not exists devis_avenants_org_statut_idx on public.devis_avenants(organization_id,statut,demande_le desc);
alter table public.devis_avenants enable row level security;
create or replace function public.artisan_possede_intervention(p_id uuid,p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.incident_interventions i
    where i.id=p_id and i.organization_id=p_org and i.artisan_id=public.mon_artisan_id());
$$;
revoke all on function public.artisan_possede_intervention(uuid,uuid) from public,anon;
grant execute on function public.artisan_possede_intervention(uuid,uuid) to authenticated;
create policy devis_avenants_lecture on public.devis_avenants for select to authenticated using(
  public.is_super_admin() or public.can_manage_organization(organization_id)
  or public.artisan_possede_intervention(intervention_id,organization_id));
revoke all on public.devis_avenants from public,anon,authenticated;
grant select on public.devis_avenants to authenticated;
grant all on public.devis_avenants to service_role;

create or replace function public.demander_avenant_devis(p_intervention uuid,p_montant bigint,p_motif text,p_lignes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.incident_interventions%rowtype; v_id uuid; plafond bigint; calcul record;
begin
  if (select auth.uid()) is null or public.mon_artisan_id() is null then raise exception 'Accès refusé'; end if;
  select * into v from public.incident_interventions i where i.id=p_intervention
    and i.artisan_id=public.mon_artisan_id() for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.devis_id is null then raise exception 'Cette mission ne comporte aucun devis retenu'; end if;
  if v.statut not in ('acceptee','planifiee','en_cours') then raise exception 'Cette mission ne peut plus recevoir d’avenant'; end if;
  select greatest(d.montant_ttc_cents,coalesce((select max(a.nouveau_montant_cents) from public.devis_avenants a
    where a.intervention_id=v.id and a.organization_id=v.organization_id and a.statut='accepte'),0)) into plafond
    from public.incident_devis d where d.id=v.devis_id and d.organization_id=v.organization_id and d.artisan_id=v.artisan_id;
  if plafond is null then raise exception 'Le devis de cette mission est introuvable'; end if;
  if p_montant is null or p_montant<=plafond then raise exception 'Le nouveau total doit dépasser le dernier montant autorisé'; end if;
  if length(btrim(coalesce(p_motif,''))) not between 10 and 4000 then raise exception 'Expliquez précisément la raison du dépassement'; end if;
  if exists(select 1 from public.devis_avenants a where a.intervention_id=v.id and a.statut='a_decider') then
    raise exception 'Une demande est déjà en attente de décision'; end if;
  select * into calcul from public.calculer_devis_lignes(p_lignes);
  if p_montant<>calcul.montant_ttc_cents then raise exception 'Le total ne correspond pas au détail des travaux'; end if;
  insert into public.devis_avenants(organization_id,intervention_id,devis_id,montant_initial_cents,nouveau_montant_cents,motif,lignes,demande_par)
  values(v.organization_id,v.id,v.devis_id,plafond,p_montant,btrim(p_motif),calcul.lignes_normalisees,(select auth.uid())) returning id into v_id;
  insert into public.alerts(organization_id,type,criticite,titre,details,origine_type,origine_id)
  values(v.organization_id,'avenant_devis_a_decider','critique','Dépassement de devis à décider',
    jsonb_build_object('avenant_id',v_id,'intervention_id',v.id,'incident_id',v.incident_id,
      'montant_initial_cents',plafond,'nouveau_montant_cents',p_montant),'intervention',v.id);
  return v_id;
end $$;
revoke all on function public.demander_avenant_devis(uuid,bigint,text,jsonb) from public,anon;
grant execute on function public.demander_avenant_devis(uuid,bigint,text,jsonb) to authenticated;

create or replace function public.decider_avenant_devis(p_avenant uuid,p_accepter boolean,p_motif text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.devis_avenants%rowtype; mission public.incident_interventions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  select * into v from public.devis_avenants where id=p_avenant;
  if v.id is null or public.can_manage_organization(v.organization_id) is not true then raise exception 'Accès refusé'; end if;
  -- Ordre de verrou identique à la demande et au compte rendu, sans interblocage.
  select * into mission from public.incident_interventions where id=v.intervention_id for update;
  select * into v from public.devis_avenants where id=p_avenant for update;
  if v.statut<>'a_decider' then raise exception 'Cet avenant a déjà été décidé'; end if;
  if mission.statut not in ('acceptee','planifiee','en_cours') then raise exception 'Cette mission ne peut plus recevoir d’avenant'; end if;
  if p_accepter is null then raise exception 'Choisissez une décision'; end if;
  if length(coalesce(p_motif,''))>4000 then raise exception 'La justification est trop longue'; end if;
  if not p_accepter and length(btrim(coalesce(p_motif,'')))<10 then raise exception 'Expliquez le refus à l’artisan'; end if;
  update public.devis_avenants set statut=case when p_accepter then 'accepte' else 'refuse' end,
    decide_par=(select auth.uid()),decide_le=now(),decision_motif=nullif(btrim(coalesce(p_motif,'')),'') where id=p_avenant;
  update public.alerts set statut='fermee',closed_at=now(),closed_by=(select auth.uid()),
    closed_action=case when p_accepter then 'Dépassement accepté' else 'Dépassement refusé' end
    where organization_id=v.organization_id and type='avenant_devis_a_decider' and statut='ouverte' and details->>'avenant_id'=v.id::text;
end $$;
revoke all on function public.decider_avenant_devis(uuid,boolean,text) from public,anon;
grant execute on function public.decider_avenant_devis(uuid,boolean,text) to authenticated;

create or replace function public.garder_depassement_devis()
returns trigger language plpgsql security definer set search_path='' as $$
declare plafond bigint; mission public.incident_interventions%rowtype;
begin
  select * into mission from public.incident_interventions where id=new.intervention_id for update;
  if mission.id is null or mission.organization_id<>new.organization_id or mission.artisan_id<>new.artisan_id then
    raise exception 'Le compte rendu ne correspond pas à la mission'; end if;
  if new.montant_final_cents is not null and (new.montant_final_cents<0 or new.montant_final_cents>100000000000) then
    raise exception 'Le montant final doit être positif et raisonnable'; end if;
  if new.montant_final_cents is null then return new; end if;
  select greatest(d.montant_ttc_cents,coalesce((select max(a.nouveau_montant_cents) from public.devis_avenants a
    where a.intervention_id=mission.id and a.organization_id=mission.organization_id and a.statut='accepte'),0)) into plafond
    from public.incident_devis d where d.id=mission.devis_id and d.organization_id=mission.organization_id;
  if plafond is not null and new.montant_final_cents>plafond then
    raise exception 'Le montant final dépasse le devis autorisé. Demandez un avenant et attendez son acceptation avant de terminer l’intervention.'; end if;
  return new;
end $$;
revoke all on function public.garder_depassement_devis() from public,anon,authenticated;
drop trigger if exists intervention_compte_rendu_depassement on public.intervention_comptes_rendus;
create trigger intervention_compte_rendu_depassement before insert or update on public.intervention_comptes_rendus
  for each row execute function public.garder_depassement_devis();

-- 5. Développement autonome encadré : chaque proposition suit la chaîne
-- détection -> développement isolé -> contrôles -> préproduction -> décision.
create table if not exists public.development_proposals (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id uuid,
  titre text not null,
  probleme text not null,
  solution_proposee text,
  risque text not null default 'faible' check(risque in ('faible','moyen','eleve','critique')),
  statut text not null default 'detectee' check(statut in ('detectee','a_etudier','en_developpement','en_test','preproduction','autorisation','publiee','annulee','retour_arriere')),
  branche text,
  revision text,
  rapport_controles jsonb not null default '{}'::jsonb,
  autorisation_requise boolean not null default true,
  autorisee_par uuid references public.accounts(id),
  autorisee_le timestamptz,
  publiee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists development_proposals_file_idx on public.development_proposals(statut,risque,created_at desc);
alter table public.development_proposals enable row level security;
create policy development_proposals_supervision on public.development_proposals for all to authenticated
  using(public.is_super_admin()) with check(public.is_super_admin());
revoke all on public.development_proposals from anon,authenticated;
grant select,insert,update on public.development_proposals to authenticated;
grant all on public.development_proposals to service_role;

create or replace function public.proposer_amelioration_depuis_retour()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.nature in ('bug','idee') then
    insert into public.development_proposals(source,source_id,titre,probleme,risque,statut,autorisation_requise)
    values('retour utilisateur',new.id,new.titre,new.description,
      case new.gravite when 'N1' then 'critique' when 'N2' then 'moyen' else 'faible' end,
      'a_etudier',true)
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.proposer_amelioration_depuis_retour() from public,anon,authenticated;
drop trigger if exists retour_propose_amelioration on public.retours_utilisateurs;
create trigger retour_propose_amelioration after insert on public.retours_utilisateurs
for each row execute function public.proposer_amelioration_depuis_retour();

-- 6. Continuité : plusieurs superviseurs permanents sont déjà possibles.
-- Une délégation temporaire exige une MFA et ne peut être créée que par un
-- superviseur permanent.
create or replace function public.is_permanent_super_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.account_id=(select auth.uid())
    and m.organization_id is null and m.role='super_admin' and m.status='active')
    and coalesce((select auth.jwt()->>'aal'),'')='aal2';
$$;
revoke all on function public.is_permanent_super_admin() from public,anon;
grant execute on function public.is_permanent_super_admin() to authenticated;

create table if not exists public.supervision_delegations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  commence_le timestamptz not null,
  termine_le timestamptz not null,
  pouvoirs text[] not null default array['lecture'] check(cardinality(pouvoirs)>0 and pouvoirs <@ array['lecture','incidents','qualite']::text[]),
  motif text not null,
  active boolean not null default true,
  cree_par uuid not null references public.accounts(id),
  cree_le timestamptz not null default now(),
  revoquee_le timestamptz,
  check(termine_le>commence_le),
  check(termine_le<=commence_le+interval '90 days')
);
create index if not exists supervision_delegations_active_idx on public.supervision_delegations(account_id,commence_le,termine_le) where active;
alter table public.supervision_delegations enable row level security;
create policy supervision_delegations_permanents on public.supervision_delegations for all to authenticated
  using(public.is_permanent_super_admin()) with check(public.is_permanent_super_admin());
revoke all on public.supervision_delegations from anon,authenticated;
grant select,insert,update on public.supervision_delegations to authenticated;

-- Une délégation n'est jamais assimilée à un super administrateur.
-- Les contrôles métier existants restent inchangés.
create or replace function public.has_supervision_power(p_pouvoir text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_permanent_super_admin() or (
    (select auth.uid()) is not null and coalesce((select auth.jwt()->>'aal'),'')='aal2'
    and p_pouvoir in ('lecture','incidents','qualite')
    and exists(select 1 from public.supervision_delegations d
      where d.account_id=(select auth.uid()) and d.active and d.revoquee_le is null
      and now()>=d.commence_le and now()<d.termine_le and p_pouvoir=any(d.pouvoirs))
  );
$$;
revoke all on function public.has_supervision_power(text) from public,anon;
grant execute on function public.has_supervision_power(text) to authenticated;

create table if not exists public.supervision_presence (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  derniere_presence timestamptz not null default now()
);
alter table public.supervision_presence enable row level security;
create policy supervision_presence_soi on public.supervision_presence for all to authenticated
  using(account_id=(select auth.uid()) or public.is_permanent_super_admin())
  with check(account_id=(select auth.uid()) or public.is_permanent_super_admin());
grant select,insert,update on public.supervision_presence to authenticated;

create or replace function public.signaler_presence_supervision()
returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or public.is_super_admin() is not true then raise exception 'Accès refusé'; end if;
  insert into public.supervision_presence(account_id,derniere_presence) values((select auth.uid()),now())
  on conflict(account_id) do update set derniere_presence=excluded.derniere_presence;
end $$;
revoke all on function public.signaler_presence_supervision() from public,anon;
grant execute on function public.signaler_presence_supervision() to authenticated;

create table if not exists public.continuity_rules (
  cle text primary key,
  libelle text not null,
  delai_heures integer not null check(delai_heures between 1 and 8760),
  decision text not null check(decision in ('attendre','agir_seul','delegue_requis')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.continuity_rules(cle,libelle,delai_heures,decision) values
  ('incident_urgent','Sécuriser un incident urgent et prévenir les personnes concernées',1,'agir_seul'),
  ('paiement','Attendre une validation humaine avant tout mouvement d’argent',168,'delegue_requis'),
  ('publication_organique','Poursuivre les publications gratuites déjà autorisées',1,'agir_seul'),
  ('publicite_payante','Ne jamais augmenter seul un budget publicitaire',168,'delegue_requis'),
  ('correction_faible_risque','Publier une correction contrôlée et réversible',24,'agir_seul'),
  ('decision_juridique','Attendre un superviseur pour une décision juridique',168,'delegue_requis')
on conflict(cle) do nothing;
alter table public.continuity_rules enable row level security;
create policy continuity_rules_supervision on public.continuity_rules for all to authenticated
  using(public.is_super_admin()) with check(public.is_permanent_super_admin());
grant select,update on public.continuity_rules to authenticated;

-- Inventaire seulement : un mot dans le corps d'une fonction ne prouve pas
-- qu'elle protège chaque écriture. Les tests d'accès inter-organisations font foi.
create or replace view public.security_function_audit with (security_invoker=true) as
select p.oid::regprocedure::text fonction,
  has_function_privilege('authenticated',p.oid,'execute') accessible_aux_comptes,
  false verifie_le_contexte,
  case when not has_function_privilege('authenticated',p.oid,'execute')
    then 'Réservée au service' else 'Revue de sécurité nécessaire' end etat
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and public.is_super_admin();
revoke all on public.security_function_audit from public,anon,authenticated;
grant select on public.security_function_audit to authenticated;

-- 7. Marché territorial enrichi, avec origine et fraîcheur de chaque mesure.
create table if not exists public.territory_market_data (
  departement text primary key,
  logements_locatifs integer check(logements_locatifs>=0),
  agences_locales integer check(agences_locales>=0),
  tension_marche numeric(6,2),
  concurrence numeric(6,2),
  artisans_disponibles integer check(artisans_disponibles>=0),
  cout_publicitaire_cents integer check(cout_publicitaire_cents>=0),
  clics_publicitaires integer check(clics_publicitaires>=0),
  prospects integer check(prospects>=0),
  clients_gagnes integer check(clients_gagnes>=0),
  cout_acquisition_cents integer check(cout_acquisition_cents>=0),
  observations jsonb not null default '{}'::jsonb,
  source_concurrence text,
  cout_prospect_cents integer check(cout_prospect_cents>=0),
  periode_publicite_debut date,
  periode_publicite_fin date,
  source_logements text,
  source_agences text,
  source_tension text,
  source_artisans text,
  source_publicite text,
  mesure_le timestamptz not null default now(),
  check(departement ~ '^[0-9]{2,3}$' or departement in ('2A','2B'))
);
alter table public.territory_market_data enable row level security;
create policy territory_market_data_supervision on public.territory_market_data for select to authenticated using(public.is_super_admin());
revoke all on public.territory_market_data from anon,authenticated;
grant select on public.territory_market_data to authenticated;
grant all on public.territory_market_data to service_role;

create or replace function public.garder_delegation_supervision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or public.is_permanent_super_admin() is not true then raise exception 'Seul un superviseur permanent peut déléguer ou révoquer'; end if;
  if tg_op='INSERT' then
    if length(btrim(coalesce(new.motif,''))) not between 5 and 1000 then raise exception 'Expliquez la raison de la délégation'; end if;
    new.cree_par:=(select auth.uid()); new.cree_le:=now(); new.active:=true; new.revoquee_le:=null;
  else
    if (to_jsonb(new)-'active'-'revoquee_le') is distinct from (to_jsonb(old)-'active'-'revoquee_le') then
      raise exception 'Créez une nouvelle délégation pour changer sa durée ou ses pouvoirs'; end if;
    if new.active is not false or old.active is not true then raise exception 'Une délégation révoquée ne peut pas être réactivée'; end if;
    new.revoquee_le:=now();
  end if;
  return new;
end $$;
revoke all on function public.garder_delegation_supervision() from public,anon,authenticated;
create trigger supervision_delegations_garde before insert or update on public.supervision_delegations
  for each row execute function public.garder_delegation_supervision();
revoke insert,update on public.supervision_presence from authenticated;

-- Lecture minimale du budget de SA mission, sans ouvrir les tables de l'agence.
create or replace function public.mon_budget_intervention(p_intervention uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.incident_interventions%rowtype; devis public.incident_devis%rowtype; accepted public.devis_avenants%rowtype;
begin
  if (select auth.uid()) is null or public.mon_artisan_id() is null then raise exception 'Accès refusé'; end if;
  select * into v from public.incident_interventions i where i.id=p_intervention and i.artisan_id=public.mon_artisan_id();
  if not found then raise exception 'Accès refusé'; end if;
  select * into devis from public.incident_devis d where d.id=v.devis_id and d.organization_id=v.organization_id;
  select * into accepted from public.devis_avenants a where a.intervention_id=v.id and a.organization_id=v.organization_id
    and a.statut='accepte' order by a.nouveau_montant_cents desc limit 1;
  return jsonb_build_object('devis_id',devis.id,'plafond_cents',coalesce(accepted.nouveau_montant_cents,devis.montant_ttc_cents),
    'lignes',coalesce(accepted.lignes,devis.lignes,'[]'::jsonb),
    'avenants',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'statut',a.statut,'motif',a.motif,
      'nouveau_montant_cents',a.nouveau_montant_cents,'decision_motif',a.decision_motif) order by a.demande_le desc)
      from public.devis_avenants a where a.intervention_id=v.id and a.organization_id=v.organization_id),'[]'::jsonb));
end $$;
revoke all on function public.mon_budget_intervention(uuid) from public,anon;
grant execute on function public.mon_budget_intervention(uuid) to authenticated;

create or replace function public.lire_devis_structure(p_sollicitation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.incident_devis%rowtype; resultat jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  select * into d from public.incident_devis where sollicitation_id=p_sollicitation;
  if d.id is null then raise exception 'Accès refusé'; end if;
  -- Coalesce obligatoire : une identité artisan absente ne doit pas court-circuiter le refus.
  if not coalesce(public.is_super_admin() or d.artisan_id=public.mon_artisan_id() or
    (d.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.incident_hors_portefeuille(d.organization_id,d.incident_id)),false) then raise exception 'Accès refusé'; end if;
  select jsonb_build_object('id',d.id,'description',d.description,'lignes',d.lignes,
    'montant_ht_cents',d.montant_ht_cents,'montant_tva_cents',d.montant_tva_cents,'montant_ttc_cents',d.montant_ttc_cents,
    'diagnostic',d.diagnostic,'delai_intervention',d.delai_intervention,'duree_estimee',d.duree_estimee,
    'contraintes',d.contraintes,'observations',d.observations,'statut',d.statut,
    'depose_le',d.depose_le,'valide_jusqu_au',d.valide_jusqu_au,
    'artisan_nom',a.raison_sociale,'artisan_siret',a.siret,'artisan_telephone',a.telephone,
    'artisan_email',a.email,'agence_nom',o.name,'incident_numero',i.numero,
    'commune',b.city,'code_postal',b.postal_code)
  into resultat from public.artisans a join public.organizations o on o.id=d.organization_id
    join public.incidents i on i.id=d.incident_id and i.organization_id=d.organization_id
    join public.lots l on l.id=i.lot_id and l.organization_id=d.organization_id
    join public.biens b on b.id=l.bien_id and b.organization_id=d.organization_id
    where a.id=d.artisan_id;
  insert into public.audit_log(account_id,organization_id,action,details)
    values((select auth.uid()),d.organization_id,'devis_document_consulte',jsonb_build_object('devis_id',d.id));
  return resultat;
end $$;
revoke all on function public.lire_devis_structure(uuid) from public,anon;
grant execute on function public.lire_devis_structure(uuid) to authenticated;

-- 8. Chaque clé étrangère du schéma public reçoit un index dont les premières
-- colonnes suivent exactement la clé. PostgreSQL n'en crée pas automatiquement ;
-- sans eux, supprimer ou joindre un bail, un lot ou une écriture finit par
-- parcourir la table entière lorsque le portefeuille grandit.
do $$
declare
  fk record;
  colonnes text;
begin
  for fk in
    select c.oid, c.conrelid, c.conkey, n.nspname, t.relname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and n.nspname='public'
  loop
    if not exists (
      select 1 from pg_index i
      where i.indrelid=fk.conrelid and i.indisvalid and i.indisready
        and i.indpred is null and i.indnkeyatts>=cardinality(fk.conkey)
        and not exists (
          select 1 from unnest(fk.conkey) with ordinality k(attnum,ord)
          where i.indkey[(k.ord-1)::integer] is distinct from k.attnum
        )
    ) then
      select string_agg(format('%I',a.attname),',' order by u.ord)
        into colonnes
      from unnest(fk.conkey) with ordinality u(attnum,ord)
      join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=u.attnum;
      execute format('create index %I on %I.%I (%s)',
        left('fk_'||fk.relname||'_'||substr(md5(fk.oid::text),1,10),63),
        fk.nspname,fk.relname,colonnes);
    end if;
  end loop;
end $$;
