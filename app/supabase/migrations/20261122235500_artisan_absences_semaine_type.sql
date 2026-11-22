-- ARTISAN : PÉRIODES D'ABSENCE ET SEMAINE TYPE (audit palier 1 du 22/11/2026, P2-03).
--
-- L'ÉCART. Un artisan en congé restait sollicité comme les autres : la demande partait, restait sans réponse, et le
-- gestionnaire perdait des jours. Et pour chaque intervention, l'artisan ressaisissait à la main ses trois créneaux.
--
-- CE QUE FAIT CETTE MIGRATION.
--   1. `artisan_absences` : les périodes d'absence que l'artisan déclare lui-même (du … au …, jours de Paris, bornes
--      comprises). Lui seul les écrit, par trois fonctions : `mes_absences_artisan`, `declarer_mon_absence`,
--      `retirer_mon_absence`. Personne d'autre : ni agence, ni propriétaire, ni super admin.
--   2. PENDANT une absence, aucune NOUVELLE demande ne peut lui être envoyée : `solliciter_artisan_interne`, seul
--      endroit où naît une demande, la refuse en disant jusqu'à quand il est absent (bloc ajouté par remplacement
--      exact, le reste de la fonction est inchangé). RIEN D'AUTRE NE CHANGE pour lui : ses demandes en cours, ses
--      devis déposés, ses interventions suivent leur cours, et son devis peut toujours être retenu
--      (`artisan_affectable`, qui sert aussi à retenir un devis, n'est pas touchée).
--   3. `absences_artisans_en_cours` : le gestionnaire d'un espace lit, pour les artisans qu'on lui propose, lesquels
--      sont absents aujourd'hui et jusqu'à quand — rien de plus (ni le début, ni les absences à venir).
--   4. `artisan_semaine_type` : une plage horaire par jour de la semaine, que l'artisan règle par
--      `ma_semaine_type` et `enregistrer_ma_semaine_type`. Elle ne sert qu'à LUI : préremplir les trois créneaux
--      qu'il propose pour une intervention. Personne d'autre ne la lit, et elle ne réserve rien.
--
-- LES DEUX TABLES sont fermées (cloisonnement activé, aucun droit direct) : on n'y accède que par ces fonctions.
-- Aucune donnée existante n'est modifiée ; les deux tables naissent vides.
--
-- Retour arrière : supabase/retours-arriere/20261122235500_artisan_absences_semaine_type.retour.sql.

-- ── 1. Les absences ───────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.artisan_absences (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  du date not null,
  au date not null,
  created_at timestamptz not null default now(),
  constraint artisan_absences_bornes check (au >= du and au - du <= 366)
);
create index if not exists artisan_absences_artisan_idx on public.artisan_absences (artisan_id, au);
alter table public.artisan_absences enable row level security;
revoke all on public.artisan_absences from anon, authenticated;
grant all on public.artisan_absences to service_role;
drop trigger if exists diagnostic_artisan_lecture on public.artisan_absences;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.artisan_absences
  for each row execute function public.refuser_mutation_diagnostic_artisan();
comment on table public.artisan_absences is
  'P2-03 (22/11/2026) : périodes d''absence déclarées par l''artisan (jours de Paris, bornes comprises). Pendant une absence, aucune nouvelle demande ne lui est envoyée.';

create or replace function public.mes_absences_artisan()
returns table (id uuid, du date, au date, en_cours boolean)
language sql stable security definer set search_path = '' as $$
  select ab.id, ab.du, ab.au, public.aujourdhui_paris() between ab.du and ab.au
  from public.artisan_absences ab
  where public.mon_artisan_id() is not null
    and ab.artisan_id = public.mon_artisan_id()
    and ab.au >= public.aujourdhui_paris()
  order by ab.du, ab.id;
$$;

create or replace function public.declarer_mon_absence(p_du date, p_au date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid := public.mon_artisan_id();
  v_jour date := public.aujourdhui_paris();
  v_autre record;
  v_id uuid;
begin
  if (select auth.uid()) is null or v_artisan is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_du is null or p_au is null then
    raise exception 'Indiquez le premier et le dernier jour de votre absence';
  end if;
  if p_au < p_du then
    raise exception 'Le dernier jour d''absence ne peut pas précéder le premier';
  end if;
  if p_au < v_jour then
    raise exception 'Cette période est déjà passée';
  end if;
  if p_au - p_du > 366 then
    raise exception 'Une absence dure au plus un an : déclarez-la en plusieurs périodes';
  end if;
  if p_du > v_jour + 730 then
    raise exception 'Une absence se déclare au plus deux ans à l''avance';
  end if;

  -- Deux déclarations simultanées du même artisan ne se croisent pas.
  perform pg_advisory_xact_lock(hashtextextended('artisan_absence:' || v_artisan::text, 0));
  select ab.du, ab.au into v_autre from public.artisan_absences ab
   where ab.artisan_id = v_artisan and ab.du <= p_au and ab.au >= p_du
   order by ab.du limit 1;
  if found then
    raise exception 'Cette période chevauche une absence déjà déclarée, du % au % : retirez-la d''abord',
      to_char(v_autre.du, 'DD/MM/YYYY'), to_char(v_autre.au, 'DD/MM/YYYY');
  end if;
  if (select count(*) from public.artisan_absences ab where ab.artisan_id = v_artisan and ab.au >= v_jour) >= 24 then
    raise exception 'Vous avez déjà 24 absences à venir : retirez-en une avant d''en déclarer une autre';
  end if;

  insert into public.artisan_absences (artisan_id, du, au) values (v_artisan, p_du, p_au) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.retirer_mon_absence(p_absence uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid := public.mon_artisan_id();
begin
  if (select auth.uid()) is null or v_artisan is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  delete from public.artisan_absences where id = p_absence and artisan_id = v_artisan;
  if not found then
    raise exception 'Absence introuvable';
  end if;
end;
$$;

-- Le gestionnaire ne lit que ceci : parmi les artisans qu'on lui propose, lesquels sont absents AUJOURD'HUI, et
-- jusqu'à quand. Un artisan qu'il ne peut pas voir (profil privé sans relation avec son espace) n'est jamais rendu.
create or replace function public.absences_artisans_en_cours(p_org uuid, p_artisans uuid[])
returns table (artisan_id uuid, au date)
language sql stable security definer set search_path = '' as $$
  select ab.artisan_id, max(ab.au)
  from public.artisan_absences ab
  join public.artisans a on a.id = ab.artisan_id
  where p_org in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and cardinality(coalesce(p_artisans, '{}'::uuid[])) <= 200
    and ab.artisan_id = any (coalesce(p_artisans, '{}'::uuid[]))
    and public.aujourdhui_paris() between ab.du and ab.au
    and (a.visibilite = 'publique'
         or exists (select 1 from public.artisan_agences aa
                    where aa.artisan_id = a.id and aa.organization_id = p_org))
  group by ab.artisan_id;
$$;

-- ── 2. Pas de nouvelle demande pendant une absence ────────────────────────────────────────────────────────────────────
do $migration$
declare d text; ancre text;
begin
  select pg_get_functiondef('public.solliciter_artisan_interne(uuid,uuid,uuid)'::regprocedure) into d;
  if position('P2-03 absence déclarée' in d) > 0 then return; end if;
  ancre := $code$  select count(*) into v_nb from public.incident_sollicitations s$code$;
  if (length(d) - length(replace(d, ancre, ''))) <> length(ancre) then
    raise exception 'P2-03 absences : fonction de sollicitation inattendue';
  end if;
  d := replace(d, ancre, $code$  -- P2-03 absence déclarée par l'artisan (22/11/2026) : aucune nouvelle demande pendant la période.
  if exists (select 1 from public.artisan_absences ab
             where ab.artisan_id = p_artisan and public.aujourdhui_paris() between ab.du and ab.au) then
    raise exception 'Cet artisan a indiqué être absent jusqu''au % : aucune demande ne peut lui être envoyée d''ici là',
      (select to_char(max(ab.au), 'DD/MM/YYYY') from public.artisan_absences ab
        where ab.artisan_id = p_artisan and public.aujourdhui_paris() between ab.du and ab.au);
  end if;

$code$ || ancre);
  execute d;
end $migration$;

-- ── 3. La semaine type ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.artisan_semaine_type (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  jour smallint not null,
  debut time not null,
  fin time not null,
  updated_at timestamptz not null default now(),
  primary key (artisan_id, jour),
  constraint artisan_semaine_type_jour check (jour between 1 and 7),
  constraint artisan_semaine_type_plage check (fin > debut)
);
alter table public.artisan_semaine_type enable row level security;
revoke all on public.artisan_semaine_type from anon, authenticated;
grant all on public.artisan_semaine_type to service_role;
drop trigger if exists diagnostic_artisan_lecture on public.artisan_semaine_type;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.artisan_semaine_type
  for each row execute function public.refuser_mutation_diagnostic_artisan();
comment on table public.artisan_semaine_type is
  'P2-03 (22/11/2026) : la semaine type de l''artisan, une plage par jour (1 = lundi … 7 = dimanche). Sert à préremplir ses créneaux ; ne réserve rien.';

create or replace function public.ma_semaine_type()
returns table (jour smallint, debut text, fin text)
language sql stable security definer set search_path = '' as $$
  select s.jour, to_char(s.debut, 'HH24:MI'), to_char(s.fin, 'HH24:MI')
  from public.artisan_semaine_type s
  where public.mon_artisan_id() is not null and s.artisan_id = public.mon_artisan_id()
  order by s.jour;
$$;

create or replace function public.enregistrer_ma_semaine_type(p_jours jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid := public.mon_artisan_id();
  v_ligne jsonb;
  v_jour integer;
  v_debut time;
  v_fin time;
  v_nombre integer := 0;
begin
  if (select auth.uid()) is null or v_artisan is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_jours is null or jsonb_typeof(p_jours) <> 'array' or jsonb_array_length(p_jours) > 7 then
    raise exception 'Semaine type illisible';
  end if;
  for v_ligne in select value from jsonb_array_elements(p_jours) loop
    if jsonb_typeof(v_ligne) <> 'object'
       or coalesce(v_ligne->>'jour', '') !~ '^[1-7]$'
       or coalesce(v_ligne->>'debut', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_ligne->>'fin', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Semaine type illisible';
    end if;
    if (v_ligne->>'fin')::time <= (v_ligne->>'debut')::time then
      raise exception 'L''heure de fin doit suivre l''heure de début';
    end if;
  end loop;
  if (select count(distinct value->>'jour') from jsonb_array_elements(p_jours)) <> jsonb_array_length(p_jours) then
    raise exception 'Un jour ne peut figurer qu''une fois dans la semaine type';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('artisan_semaine_type:' || v_artisan::text, 0));
  delete from public.artisan_semaine_type where artisan_id = v_artisan;
  for v_ligne in select value from jsonb_array_elements(p_jours) loop
    v_jour := (v_ligne->>'jour')::integer; v_debut := (v_ligne->>'debut')::time; v_fin := (v_ligne->>'fin')::time;
    insert into public.artisan_semaine_type (artisan_id, jour, debut, fin) values (v_artisan, v_jour, v_debut, v_fin);
    v_nombre := v_nombre + 1;
  end loop;
  return v_nombre;
end;
$$;

-- ── 4. Droits : personne d'autre qu'un compte connecté, et chaque fonction refait son contrôle ─────────────────────────
revoke all on function public.mes_absences_artisan() from public, anon;
revoke all on function public.declarer_mon_absence(date, date) from public, anon;
revoke all on function public.retirer_mon_absence(uuid) from public, anon;
revoke all on function public.absences_artisans_en_cours(uuid, uuid[]) from public, anon;
revoke all on function public.ma_semaine_type() from public, anon;
revoke all on function public.enregistrer_ma_semaine_type(jsonb) from public, anon;
grant execute on function public.mes_absences_artisan() to authenticated;
grant execute on function public.declarer_mon_absence(date, date) to authenticated;
grant execute on function public.retirer_mon_absence(uuid) to authenticated;
grant execute on function public.absences_artisans_en_cours(uuid, uuid[]) to authenticated;
grant execute on function public.ma_semaine_type() to authenticated;
grant execute on function public.enregistrer_ma_semaine_type(jsonb) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
