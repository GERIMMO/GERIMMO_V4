-- Plan d'apurement : une dette échue gelée à une date, étalée en tranches mensuelles.
--
-- Pourquoi : le wiki (« Relances et mise en demeure », RM-3.6.6) suspend les relances
-- tant qu'un plan d'apurement est respecté, mais aucune table ne portait de plan (audit de
-- gestion du 29/09). Seul le document « protocole d'apurement » existait, sans échéancier.
--
-- Ce que fait ce module, et rien d'autre :
--   1. Le gérant (ou le propriétaire direct) PROPOSE un plan sur un bail dont la dette échue
--      est positive : nombre de tranches, première échéance, acompte éventuel. La dette est
--      calculée en base depuis `etat_loyers_bail_brut`, jamais depuis l'écran.
--   2. Il l'ACTIVE quand le locataire l'a accepté (date d'acceptation, protocole signé ou non).
--   3. Le respect du plan se mesure sur la dette échue TOTALE du bail, pas sur l'imputation
--      d'un règlement à telle ou telle ligne : la règle « du plus ancien au plus récent » reste
--      intacte. Après la tranche k, la dette échue doit être au plus égale à
--      dette_initiale - acompte - somme des k premières tranches. Le loyer courant impayé
--      fait donc monter la dette et casse le plan, ce qui est voulu.
--   4. Une tranche non couverte à son échéance + tolérance est « manquée » ; le plan passe
--      « en défaut » et le gérant est alerté. À `seuil_caducite` tranches manquées, le plan
--      est « caduc » : les relances automatiques reprennent là où elles s'étaient arrêtées
--      (elles ne sont suspendues que pendant un plan vivant). Un locataire qui rattrape son
--      retard remet le plan « actif » ; une tranche manquée puis rattrapée reste tracée.
--   5. Dette échue nulle : le plan est « soldé ».
--   6. Le locataire peut DEMANDER un plan depuis son espace : message au gérant + alerte.
--
-- Aucun appel de loyer, aucune écriture comptable, aucun encaissement n'est créé ici.
-- Rejouable : create ... if not exists, create or replace, cron.schedule par nom.

create table if not exists public.plans_apurement (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bail_id uuid not null,
  etat text not null default 'propose' check (etat in ('propose','actif','en_defaut','caduc','solde','annule')),
  date_arrete date not null,
  dette_initiale numeric(12,2) not null check (dette_initiale > 0),
  acompte numeric(12,2) not null default 0 check (acompte >= 0),
  mensualite numeric(12,2) not null check (mensualite > 0),
  nombre_tranches smallint not null check (nombre_tranches between 1 and 60),
  premiere_echeance date not null,
  tolerance_jours smallint not null default 5 check (tolerance_jours between 0 and 30),
  seuil_caducite smallint not null default 2 check (seuil_caducite between 1 and 6),
  conditions text check (length(conditions) <= 2000),
  document_id uuid,
  document_signe_id uuid,
  date_acceptation date,
  activated_at timestamptz,
  clos_le timestamptz,
  motif_cloture text check (length(motif_cloture) <= 500),
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (bail_id, organization_id) references public.baux(id, organization_id),
  foreign key (document_id, organization_id) references public.documents(id, organization_id),
  foreign key (document_signe_id, organization_id) references public.documents(id, organization_id),
  check ((etat in ('actif','en_defaut','caduc','solde')) = (activated_at is not null) or etat = 'annule'),
  check ((etat in ('caduc','solde','annule')) = (clos_le is not null)),
  check (acompte < dette_initiale)
);
create index if not exists plans_apurement_org on public.plans_apurement(organization_id);
create index if not exists plans_apurement_bail on public.plans_apurement(bail_id, organization_id);
create index if not exists plans_apurement_created_by on public.plans_apurement(created_by);
create index if not exists plans_apurement_document on public.plans_apurement(document_id, organization_id);
create index if not exists plans_apurement_document_signe on public.plans_apurement(document_signe_id, organization_id);
-- Un seul plan vivant par bail.
create unique index if not exists plans_apurement_vivant on public.plans_apurement(bail_id)
  where etat in ('propose','actif','en_defaut');

create table if not exists public.plan_apurement_tranches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  plan_id uuid not null,
  rang smallint not null check (rang between 1 and 60),
  echeance date not null,
  montant numeric(12,2) not null check (montant > 0),
  statut text not null default 'a_venir' check (statut in ('a_venir','honoree','manquee','annulee')),
  constatee_le date,
  en_retard boolean not null default false,
  unique (plan_id, rang),
  foreign key (plan_id, organization_id) references public.plans_apurement(id, organization_id) on delete cascade
);
create index if not exists plan_apurement_tranches_plan on public.plan_apurement_tranches(plan_id, organization_id);
create index if not exists plan_apurement_tranches_org on public.plan_apurement_tranches(organization_id);

-- Qui gère ce bail : mêmes rôles que les loyers, même portefeuille, jamais une traversée.
create or replace function public.verifier_gerant_plan_apurement(p_org uuid, p_bail uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.bail_hors_portefeuille(p_org, p_bail)
    and not public.est_traversee_organisation(p_org)
    and exists (select 1 from public.baux b where b.id = p_bail and b.organization_id = p_org);
$$;
revoke all on function public.verifier_gerant_plan_apurement(uuid, uuid) from public, anon;
grant execute on function public.verifier_gerant_plan_apurement(uuid, uuid) to authenticated;

-- Le locataire du bail (principal ou colocataire), membre actif de l'organisation.
create or replace function public.verifier_locataire_du_bail(p_org uuid, p_bail uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.baux b
    join public.persons p on p.organization_id = b.organization_id and p.account_id = auth.uid()
    join public.memberships m on m.account_id = auth.uid() and m.organization_id = b.organization_id and m.role = 'locataire' and m.status = 'active'
    where b.id = p_bail and b.organization_id = p_org
      and (b.locataire_principal = p.id
           or exists (select 1 from public.bail_personnes bp where bp.bail_id = b.id and bp.person_id = p.id and bp.role = 'colocataire')));
$$;
revoke all on function public.verifier_locataire_du_bail(uuid, uuid) from public, anon;
grant execute on function public.verifier_locataire_du_bail(uuid, uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['plans_apurement','plan_apurement_tranches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists diagnostic_artisan_lecture on public.%I', t);
    execute format('create trigger diagnostic_artisan_lecture before insert or update or delete on public.%I for each row execute function public.refuser_mutation_diagnostic_artisan()', t);
    execute format('drop trigger if exists traversee_lecture_seule on public.%I', t);
    execute format('create trigger traversee_lecture_seule before insert or update or delete on public.%I for each row execute function support_interne.garder_ecriture_traversee()', t);
  end loop;
end $$;
drop policy if exists plans_apurement_lecture on public.plans_apurement;
create policy plans_apurement_lecture on public.plans_apurement for select to authenticated
  using (public.verifier_gerant_plan_apurement(organization_id, bail_id) or public.verifier_locataire_du_bail(organization_id, bail_id));
drop policy if exists plan_apurement_tranches_lecture on public.plan_apurement_tranches;
create policy plan_apurement_tranches_lecture on public.plan_apurement_tranches for select to authenticated
  using (exists (select 1 from public.plans_apurement p where p.id = plan_id));

create or replace function public.plan_apurement_touche()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then raise exception 'Le plan ne change pas d''organisation'; end if;
  if tg_op = 'UPDATE' and new.bail_id <> old.bail_id then raise exception 'Le plan ne change pas de bail'; end if;
  return new;
end $$;
revoke all on function public.plan_apurement_touche() from public, anon, authenticated;
drop trigger if exists plan_apurement_touche on public.plans_apurement;
create trigger plan_apurement_touche before update on public.plans_apurement for each row execute function public.plan_apurement_touche();

-- Dette échue du bail au jour de Paris : la seule mesure du plan.
create or replace function public.dette_echue_bail(p_bail uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select round(coalesce(sum(e.montant_du - e.montant_couvert), 0), 2)
  from public.etat_loyers_bail_brut(p_bail) e
  where e.montant_couvert < e.montant_du and e.date_echeance < public.aujourdhui_paris();
$$;
revoke all on function public.dette_echue_bail(uuid) from public, anon, authenticated;

-- Pendant un plan vivant (actif ou en défaut), les relances automatiques se taisent (RM-3.6.6).
create or replace function public.plan_apurement_suspend_relances(p_bail uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.plans_apurement p where p.bail_id = p_bail and p.etat in ('actif','en_defaut'));
$$;
revoke all on function public.plan_apurement_suspend_relances(uuid) from public, anon;
grant execute on function public.plan_apurement_suspend_relances(uuid) to authenticated, service_role;

do $$ declare definition text; begin
  select pg_get_functiondef('public.relances_loyer_dues(integer)'::regprocedure) into definition;
  if position('public.plan_apurement_suspend_relances' in definition) = 0 then
    if position('where not n.relance_du_jour' in definition) = 0 then raise exception 'Fonction relances inattendue'; end if;
    execute replace(definition, 'where not n.relance_du_jour', 'where not n.relance_du_jour and not public.plan_apurement_suspend_relances(n.bail_id)');
  end if;
end $$;

-- Proposition : la dette est arrêtée ici, en base, au jour de Paris.
create or replace function public.proposer_plan_apurement(
  p_org uuid, p_bail uuid, p_nombre_tranches integer, p_premiere_echeance date,
  p_acompte numeric default 0, p_conditions text default null, p_tolerance_jours integer default 5, p_seuil_caducite integer default 2
) returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.baux; v_dette numeric; v_reste_cents bigint; v_base bigint; v_reste bigint; v_id uuid; i integer; v_acompte numeric := coalesce(p_acompte, 0);
begin
  if not public.verifier_gerant_plan_apurement(p_org, p_bail) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if not public.org_ecriture_ouverte(p_org) then raise exception 'Les écritures de ce dossier sont fermées'; end if;
  select * into b from public.baux where id = p_bail and organization_id = p_org for update;
  if b.etat not in ('actif','preavis','termine') then raise exception 'Un plan se propose sur un bail engagé ou terminé'; end if;
  if exists (select 1 from public.plans_apurement p where p.bail_id = p_bail and p.etat in ('propose','actif','en_defaut')) then
    raise exception 'Un plan d''apurement est déjà en cours sur ce bail. Annulez-le avant d''en proposer un autre.';
  end if;
  if p_nombre_tranches is null or p_nombre_tranches not between 1 and 60 then raise exception 'Choisissez de 1 à 60 tranches mensuelles'; end if;
  if p_premiere_echeance is null or p_premiere_echeance < public.aujourdhui_paris() or p_premiere_echeance > public.aujourdhui_paris() + 92 then
    raise exception 'La première tranche se situe entre aujourd''hui et trois mois';
  end if;
  if p_tolerance_jours is null or p_tolerance_jours not between 0 and 30 or p_seuil_caducite is null or p_seuil_caducite not between 1 and 6 then
    raise exception 'Tolérance de 0 à 30 jours et seuil de caducité de 1 à 6 tranches';
  end if;
  if v_acompte < 0 or v_acompte <> round(v_acompte, 2) or v_acompte::text in ('NaN','Infinity','-Infinity') then raise exception 'Acompte invalide'; end if;
  v_dette := public.dette_echue_bail(p_bail);
  if v_dette <= 0 then raise exception 'Aucune dette échue n''est constatée sur ce bail : un plan n''a pas lieu d''être.'; end if;
  if v_acompte >= v_dette then raise exception 'L''acompte couvre toute la dette : enregistrez simplement l''encaissement.'; end if;
  v_reste_cents := round((v_dette - v_acompte) * 100)::bigint;
  v_base := v_reste_cents / p_nombre_tranches; v_reste := v_reste_cents % p_nombre_tranches;
  if v_base <= 0 then raise exception 'Trop de tranches pour cette dette'; end if;
  insert into public.plans_apurement(organization_id, bail_id, date_arrete, dette_initiale, acompte, mensualite, nombre_tranches, premiere_echeance,
    tolerance_jours, seuil_caducite, conditions, created_by)
  values (p_org, p_bail, public.aujourdhui_paris(), v_dette, v_acompte, v_base::numeric / 100, p_nombre_tranches, p_premiere_echeance,
    p_tolerance_jours, p_seuil_caducite, nullif(trim(p_conditions), ''), auth.uid())
  returning id into v_id;
  for i in 1..p_nombre_tranches loop
    insert into public.plan_apurement_tranches(organization_id, plan_id, rang, echeance, montant)
    values (p_org, v_id, i, (p_premiere_echeance + make_interval(months => i - 1))::date, (v_base + case when i <= v_reste then 1 else 0 end)::numeric / 100);
  end loop;
  insert into public.audit_log(account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'plan_apurement_propose', jsonb_build_object('plan_id', v_id, 'bail_id', p_bail, 'dette', v_dette, 'acompte', v_acompte, 'tranches', p_nombre_tranches, 'premiere_echeance', p_premiere_echeance));
  -- La demande du locataire, s'il y en avait une, est traitée.
  perform public.fermer_alertes_origine(p_org, 'bail', p_bail, 'Plan d''apurement proposé', array['plan_apurement_demande']);
  return v_id;
end $$;
revoke all on function public.proposer_plan_apurement(uuid, uuid, integer, date, numeric, text, integer, integer) from public, anon;
grant execute on function public.proposer_plan_apurement(uuid, uuid, integer, date, numeric, text, integer, integer) to authenticated;

create or replace function public.rattacher_document_plan_apurement(p_org uuid, p_plan uuid, p_document uuid, p_signe boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.plans_apurement;
begin
  select * into p from public.plans_apurement where id = p_plan and organization_id = p_org for update;
  if not found or not public.verifier_gerant_plan_apurement(p_org, p.bail_id) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if p.etat in ('caduc','solde','annule') then raise exception 'Ce plan est clos'; end if;
  if not exists (select 1 from public.documents d where d.id = p_document and d.organization_id = p_org and d.purged_at is null) then raise exception 'Document introuvable dans ce dossier'; end if;
  if p_signe then update public.plans_apurement set document_signe_id = p_document where id = p.id;
  else update public.plans_apurement set document_id = p_document where id = p.id; end if;
  insert into public.document_liens(organization_id, document_id, entite, entite_id) values (p_org, p_document, 'bail', p.bail_id) on conflict do nothing;
  insert into public.audit_log(account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'plan_apurement_document', jsonb_build_object('plan_id', p.id, 'document_id', p_document, 'signe', p_signe));
end $$;
revoke all on function public.rattacher_document_plan_apurement(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.rattacher_document_plan_apurement(uuid, uuid, uuid, boolean) to authenticated;

-- Suivi d'un plan : constate les tranches, l'état, et pose ou ferme les alertes. Sans garde
-- d'identité : appelé par les fonctions gardées ci-dessous, par le déclencheur d'encaissement
-- et par la tâche quotidienne.
create or replace function public.suivre_plan_apurement(p_plan uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.plans_apurement; t record; v_jour date := public.aujourdhui_paris(); v_dette numeric; v_attendu numeric; v_cumul numeric := 0;
  v_manquees integer; v_nouvel_etat text; v_lot text; v_locataire text; v_titre text;
begin
  select * into p from public.plans_apurement where id = p_plan for update;
  if not found or p.etat not in ('actif','en_defaut') then return coalesce(p.etat, 'inconnu'); end if;
  v_dette := public.dette_echue_bail(p.bail_id);
  for t in select * from public.plan_apurement_tranches x where x.plan_id = p.id order by x.rang loop
    v_cumul := v_cumul + t.montant;
    v_attendu := greatest(0, p.dette_initiale - p.acompte - v_cumul);
    if t.statut in ('a_venir','manquee') and (v_dette <= v_attendu + 0.005) then
      update public.plan_apurement_tranches set statut = 'honoree', constatee_le = v_jour,
        en_retard = (t.statut = 'manquee' or v_jour > t.echeance + p.tolerance_jours) where id = t.id;
    elsif t.statut = 'a_venir' and v_jour > t.echeance + p.tolerance_jours then
      update public.plan_apurement_tranches set statut = 'manquee', constatee_le = v_jour where id = t.id;
    end if;
  end loop;
  select count(*) into v_manquees from public.plan_apurement_tranches x where x.plan_id = p.id and x.statut = 'manquee';
  select l.nom, nullif(concat_ws(' ', pe.prenom, pe.nom), '') into v_lot, v_locataire
  from public.baux b join public.lots l on l.id = b.lot_id left join public.persons pe on pe.id = b.locataire_principal where b.id = p.bail_id;
  if v_dette <= 0.005 then
    v_nouvel_etat := 'solde';
    update public.plan_apurement_tranches set statut = 'honoree', constatee_le = v_jour where plan_id = p.id and statut in ('a_venir','manquee');
    update public.plans_apurement set etat = 'solde', clos_le = now(), motif_cloture = 'Dette soldée' where id = p.id;
    perform public.fermer_alertes_origine(p.organization_id, 'plan_apurement', p.id, 'Plan d''apurement soldé');
    insert into public.alerts(organization_id, type, criticite, titre, details, origine_type, origine_id)
    values (p.organization_id, 'plan_apurement_solde', 'informative', 'Plan d''apurement soldé · ' || coalesce(v_lot, 'logement'),
      jsonb_build_object('bail_id', p.bail_id, 'plan_id', p.id, 'locataire', v_locataire), 'plan_apurement', p.id);
  elsif v_manquees >= p.seuil_caducite then
    v_nouvel_etat := 'caduc';
    update public.plan_apurement_tranches set statut = 'annulee' where plan_id = p.id and statut = 'a_venir';
    update public.plans_apurement set etat = 'caduc', clos_le = now(), motif_cloture = v_manquees || ' tranche(s) manquée(s)' where id = p.id;
    perform public.fermer_alertes_origine(p.organization_id, 'plan_apurement', p.id, 'Plan caduc', array['plan_apurement_defaut']);
    insert into public.alerts(organization_id, type, criticite, titre, details, origine_type, origine_id, echeance)
    values (p.organization_id, 'plan_apurement_caduc', 'critique', 'Plan d''apurement caduc · ' || coalesce(v_lot, 'logement'),
      jsonb_build_object('bail_id', p.bail_id, 'plan_id', p.id, 'locataire', v_locataire, 'manquees', v_manquees, 'dette', v_dette), 'plan_apurement', p.id, v_jour);
  elsif v_manquees > 0 then
    v_nouvel_etat := 'en_defaut';
    if p.etat <> 'en_defaut' then update public.plans_apurement set etat = 'en_defaut' where id = p.id; end if;
    if not exists (select 1 from public.alerts a where a.organization_id = p.organization_id and a.type = 'plan_apurement_defaut' and a.statut = 'ouverte' and a.origine_id = p.id) then
      v_titre := 'Tranche du plan d''apurement manquée · ' || coalesce(v_lot, 'logement');
      insert into public.alerts(organization_id, type, criticite, titre, details, origine_type, origine_id, echeance)
      values (p.organization_id, 'plan_apurement_defaut', 'critique', v_titre,
        jsonb_build_object('bail_id', p.bail_id, 'plan_id', p.id, 'locataire', v_locataire, 'manquees', v_manquees, 'dette', v_dette), 'plan_apurement', p.id, v_jour);
    end if;
  else
    v_nouvel_etat := 'actif';
    if p.etat <> 'actif' then
      update public.plans_apurement set etat = 'actif' where id = p.id;
      perform public.fermer_alertes_origine(p.organization_id, 'plan_apurement', p.id, 'Retard rattrapé', array['plan_apurement_defaut']);
    end if;
  end if;
  return v_nouvel_etat;
end $$;
revoke all on function public.suivre_plan_apurement(uuid) from public, anon, authenticated;

create or replace function public.activer_plan_apurement(p_org uuid, p_plan uuid, p_date_acceptation date)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.plans_apurement;
begin
  select * into p from public.plans_apurement where id = p_plan and organization_id = p_org for update;
  if not found or not public.verifier_gerant_plan_apurement(p_org, p.bail_id) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if not public.org_ecriture_ouverte(p_org) then raise exception 'Les écritures de ce dossier sont fermées'; end if;
  if p.etat <> 'propose' then raise exception 'Seul un plan proposé peut être activé'; end if;
  if p_date_acceptation is null or p_date_acceptation > public.aujourdhui_paris() or p_date_acceptation < p.created_at::date - 1 then
    raise exception 'La date d''acceptation se situe entre la proposition et aujourd''hui';
  end if;
  update public.plans_apurement set etat = 'actif', activated_at = now(), date_acceptation = p_date_acceptation where id = p.id;
  insert into public.audit_log(account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'plan_apurement_active', jsonb_build_object('plan_id', p.id, 'bail_id', p.bail_id, 'date_acceptation', p_date_acceptation));
  perform public.fermer_alertes_origine(p_org, 'bail', p.bail_id, 'Plan d''apurement activé', array['plan_apurement_demande']);
  return public.suivre_plan_apurement(p.id);
end $$;
revoke all on function public.activer_plan_apurement(uuid, uuid, date) from public, anon;
grant execute on function public.activer_plan_apurement(uuid, uuid, date) to authenticated;

create or replace function public.annuler_plan_apurement(p_org uuid, p_plan uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.plans_apurement;
begin
  select * into p from public.plans_apurement where id = p_plan and organization_id = p_org for update;
  if not found or not public.verifier_gerant_plan_apurement(p_org, p.bail_id) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if p.etat not in ('propose','actif','en_defaut') then raise exception 'Ce plan est déjà clos'; end if;
  if p_motif is null or length(trim(p_motif)) < 3 then raise exception 'Indiquez le motif de l''annulation'; end if;
  update public.plans_apurement set etat = 'annule', clos_le = now(), motif_cloture = trim(p_motif) where id = p.id;
  update public.plan_apurement_tranches set statut = 'annulee' where plan_id = p.id and statut = 'a_venir';
  perform public.fermer_alertes_origine(p_org, 'plan_apurement', p.id, 'Plan annulé : ' || trim(p_motif));
  insert into public.audit_log(account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'plan_apurement_annule', jsonb_build_object('plan_id', p.id, 'bail_id', p.bail_id, 'motif', trim(p_motif)));
end $$;
revoke all on function public.annuler_plan_apurement(uuid, uuid, text) from public, anon;
grant execute on function public.annuler_plan_apurement(uuid, uuid, text) to authenticated;

-- Un encaissement (ou sa suppression) met le plan à jour sans attendre la nuit.
create or replace function public.encaissement_actualise_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bail uuid := coalesce(new.bail_id, old.bail_id); v_plan uuid;
begin
  select id into v_plan from public.plans_apurement where bail_id = v_bail and etat in ('actif','en_defaut') limit 1;
  if v_plan is not null then perform public.suivre_plan_apurement(v_plan); end if;
  return null;
end $$;
revoke all on function public.encaissement_actualise_plan() from public, anon, authenticated;
drop trigger if exists encaissement_plan on public.encaissements;
create trigger encaissement_plan after insert or delete or update of bail_id, montant on public.encaissements
  for each row execute function public.encaissement_actualise_plan();

-- Tâche quotidienne, après l'alerte d'impayé (05 h 30 UTC) : 05 h 35.
create or replace function public.suivre_plans_apurement_interne()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_plan record; n integer := 0; v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
  if not public.tache_planifiee_autorisee('plans-apurement-quotidiens') then return 0; end if;
  perform public.tache_systeme();
  for v_plan in select p.id from public.plans_apurement p join public.organizations o on o.id = p.organization_id
    where p.etat in ('actif','en_defaut') and public.org_ecriture_ouverte(o.id) order by p.id loop
    perform public.suivre_plan_apurement(v_plan.id); n := n + 1;
  end loop;
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return n;
exception when others then
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  raise;
end $$;
revoke all on function public.suivre_plans_apurement_interne() from public, anon, authenticated, service_role;
insert into public.supervision_taches_arret(tache, cle) values ('plans-apurement-quotidiens', 'relances') on conflict do nothing;
select cron.schedule('plans-apurement-quotidiens', '35 5 * * *', $$select public.suivre_plans_apurement_interne()$$);

-- Espace locataire : demander un plan, voir le sien.
create or replace function public.demander_plan_apurement(p_org uuid, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_person uuid; v_bail uuid; v_message uuid; v_nom text; v_dette numeric;
begin
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
  select b.id into v_bail from public.baux b where b.organization_id = p_org and b.etat in ('actif','preavis')
    and (b.locataire_principal = v_person or exists (select 1 from public.bail_personnes bp where bp.bail_id = b.id and bp.person_id = v_person and bp.role = 'colocataire'))
    order by b.created_at desc limit 1;
  if v_bail is null then raise exception 'Aucun bail en cours'; end if;
  if exists (select 1 from public.plans_apurement p where p.bail_id = v_bail and p.etat in ('propose','actif','en_defaut')) then
    raise exception 'Un plan est déjà proposé ou en cours sur votre bail.';
  end if;
  v_dette := public.dette_echue_bail(v_bail);
  if v_dette <= 0 then raise exception 'Aucune échéance en retard : un plan n''est pas nécessaire.'; end if;
  v_message := public.envoyer_message_locataire(p_org, 'Demande de plan d''apurement (dette échue : ' || to_char(v_dette, 'FM999999990.00') || ' €). ' || coalesce(trim(p_message), ''));
  if not exists (select 1 from public.alerts a where a.organization_id = p_org and a.type = 'plan_apurement_demande' and a.statut = 'ouverte' and (a.details ->> 'bail_id')::uuid = v_bail) then
    select trim(coalesce(p.prenom || ' ', '') || p.nom) into v_nom from public.persons p where p.id = v_person;
    insert into public.alerts(organization_id, type, criticite, titre, details, origine_type, origine_id)
    values (p_org, 'plan_apurement_demande', 'normale', 'Demande de plan d''apurement de ' || coalesce(v_nom, 'votre locataire'),
      jsonb_build_object('bail_id', v_bail, 'person_id', v_person, 'message_id', v_message, 'dette', v_dette), 'bail', v_bail);
  end if;
  insert into public.audit_log(account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'plan_apurement_demande', jsonb_build_object('bail_id', v_bail, 'message_id', v_message, 'dette', v_dette));
  return v_message;
end $$;
revoke all on function public.demander_plan_apurement(uuid, text) from public, anon;
grant execute on function public.demander_plan_apurement(uuid, text) to authenticated;

create or replace function public.mon_plan_apurement(p_org uuid)
returns table (plan_id uuid, bail_id uuid, etat text, date_arrete date, dette_initiale numeric, acompte numeric, mensualite numeric,
  nombre_tranches smallint, premiere_echeance date, date_acceptation date, conditions text, document_id uuid, document_signe_id uuid,
  dette_restante numeric, tranches jsonb, demande_en_cours boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.bail_id, p.etat, p.date_arrete, p.dette_initiale, p.acompte, p.mensualite, p.nombre_tranches, p.premiere_echeance,
    p.date_acceptation, p.conditions, p.document_id, p.document_signe_id,
    case when p.etat in ('actif','en_defaut') then public.dette_echue_bail(p.bail_id) else null end,
    (select coalesce(jsonb_agg(jsonb_build_object('rang', t.rang, 'echeance', t.echeance, 'montant', t.montant, 'statut', t.statut, 'constatee_le', t.constatee_le, 'en_retard', t.en_retard) order by t.rang), '[]'::jsonb)
       from public.plan_apurement_tranches t where t.plan_id = p.id),
    exists (select 1 from public.alerts a where a.organization_id = p_org and a.type = 'plan_apurement_demande' and a.statut = 'ouverte' and (a.details ->> 'bail_id')::uuid = p.bail_id)
  from public.plans_apurement p
  where p.organization_id = p_org and public.verifier_locataire_du_bail(p_org, p.bail_id)
  order by (p.etat in ('propose','actif','en_defaut')) desc, p.created_at desc;
$$;
revoke all on function public.mon_plan_apurement(uuid) from public, anon;
grant execute on function public.mon_plan_apurement(uuid) to authenticated;

-- Le locataire a-t-il une demande de plan en attente, sans plan vivant ?
create or replace function public.ma_demande_plan_apurement(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.alerts a join public.baux b on b.id = (a.details ->> 'bail_id')::uuid
    where a.organization_id = p_org and a.type = 'plan_apurement_demande' and a.statut = 'ouverte' and public.verifier_locataire_du_bail(p_org, b.id));
$$;
revoke all on function public.ma_demande_plan_apurement(uuid) from public, anon;
grant execute on function public.ma_demande_plan_apurement(uuid) to authenticated;

-- Lecture gérant : le plan vivant ou le dernier plan du bail, avec sa dette courante.
create or replace function public.plan_apurement_bail(p_org uuid, p_bail uuid)
returns table (plan_id uuid, etat text, date_arrete date, dette_initiale numeric, acompte numeric, mensualite numeric, nombre_tranches smallint,
  premiere_echeance date, tolerance_jours smallint, seuil_caducite smallint, conditions text, document_id uuid, document_signe_id uuid,
  date_acceptation date, clos_le timestamptz, motif_cloture text, dette_restante numeric, tranches jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.etat, p.date_arrete, p.dette_initiale, p.acompte, p.mensualite, p.nombre_tranches, p.premiere_echeance, p.tolerance_jours, p.seuil_caducite,
    p.conditions, p.document_id, p.document_signe_id, p.date_acceptation, p.clos_le, p.motif_cloture, public.dette_echue_bail(p.bail_id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'rang', t.rang, 'echeance', t.echeance, 'montant', t.montant, 'statut', t.statut, 'constatee_le', t.constatee_le, 'en_retard', t.en_retard) order by t.rang), '[]'::jsonb)
       from public.plan_apurement_tranches t where t.plan_id = p.id)
  from public.plans_apurement p
  where p.organization_id = p_org and p.bail_id = p_bail and public.verifier_gerant_plan_apurement(p_org, p_bail)
  order by (p.etat in ('propose','actif','en_defaut')) desc, p.created_at desc
  limit 1;
$$;
revoke all on function public.plan_apurement_bail(uuid, uuid) from public, anon;
grant execute on function public.plan_apurement_bail(uuid, uuid) to authenticated;

-- Libellés sans nom pour les faits de direction (20261014230000) : quatre lignes de plus, par relecture de la définition.
do $$ declare definition text; begin
  select pg_get_functiondef('public.libelle_generique_alerte(text)'::regprocedure) into definition;
  if position('plan_apurement_demande' in definition) = 0 then
    if position('when ''loyer_impaye'' then ''Loyer impayé''' in definition) = 0 then raise exception 'Fonction libelle_generique_alerte inattendue'; end if;
    execute replace(definition, 'when ''loyer_impaye'' then ''Loyer impayé''',
      'when ''loyer_impaye'' then ''Loyer impayé''
    when ''plan_apurement_demande'' then ''Demande de plan d’apurement''
    when ''plan_apurement_defaut'' then ''Tranche de plan d’apurement manquée''
    when ''plan_apurement_caduc'' then ''Plan d’apurement caduc''
    when ''plan_apurement_solde'' then ''Plan d’apurement soldé''');
  end if;
end $$;

notify pgrst, 'reload schema';
select public.poser_gardes_abonnement();
select public.fermer_fonctions_a_anon();
