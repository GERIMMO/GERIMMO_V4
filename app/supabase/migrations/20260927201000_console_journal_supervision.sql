-- AUDIT CONSOLE DU 27/09 — MAJEURS 5 ET 6 : CHAQUE ACTION DE LA CONSOLE EST ENREGISTRÉE.
--
-- « Chaque action enregistrée » n'était pas tenu : pause/reprise d'une mission,
-- demande commerciale traitée, plan de continuité, articles, Facebook,
-- réglages marketing, marque, territoire, idées, préparation du point… ne
-- laissaient aucune ligne dans `audit_log`. Et une simple visite d'une fiche
-- organisation en écrivait trois.
--
-- 1. `journaliser_supervision` : la ligne d'audit d'un geste de la console,
--    à l'auteur connecté (jamais au nom d'un autre), code d'action contrôlé.
-- 2. Les fonctions de geste qui ne journalisaient pas le font dans leur
--    transaction : `regler_mission`, `demande_devis_traitee` (qui dit aussi si
--    la demande était déjà traitée), `enregistrer_plan_continuite`.
-- 3. `log_sa_access` ne réécrit pas une consultation identique dans la minute.
--
-- Idempotent : create or replace, drop … if exists.

-- ── 1. La ligne d'audit d'un geste de la console ───────────────────────────
create or replace function public.journaliser_supervision(p_action text, p_organisation uuid default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or public.is_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_action is null or p_action !~ '^[a-z][a-z0-9_]{2,59}$' then raise exception 'Action inconnue'; end if;
 if p_details is not null and (jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 4000) then raise exception 'Détails invalides'; end if;
 insert into public.audit_log(account_id, organization_id, action, details)
 values ((select auth.uid()), p_organisation, p_action, coalesce(p_details, '{}'::jsonb));
end $$;
revoke all on function public.journaliser_supervision(text, uuid, jsonb) from public, anon;
grant execute on function public.journaliser_supervision(text, uuid, jsonb) to authenticated;

-- ── 2. Les gestes qui se journalisent dans leur transaction ────────────────
create or replace function public.regler_mission(p_cle text, p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_avant boolean;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_active is null then raise exception 'Choisissez pause ou reprise'; end if;
 select active into v_avant from public.agent_missions where cle=p_cle for update;
 if not found then raise exception 'Mission inconnue'; end if;
 update public.agent_missions set active=p_active,modifie_par=(select auth.uid()),updated_at=now() where cle=p_cle;
 insert into public.audit_log(account_id,action,details)
 values((select auth.uid()),case when p_active then 'mission_reprise' else 'mission_en_pause' end,jsonb_build_object('mission',p_cle,'avant_active',v_avant));
end $$;
revoke all on function public.regler_mission(text,boolean) from public, anon;
grant execute on function public.regler_mission(text,boolean) to authenticated;

-- La demande devient traitée une seule fois ; la fonction dit si elle l'était
-- déjà (plus de succès silencieux quand rien n'a changé).
drop function if exists public.demande_devis_traitee(uuid);
create or replace function public.demande_devis_traitee(p_demande uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Réservé au super admin'; end if;
 update public.demandes_devis set traitee_le = now() where id = p_demande and traitee_le is null;
 if not found then
  if not exists(select 1 from public.demandes_devis where id = p_demande) then raise exception 'Demande introuvable'; end if;
  return false;
 end if;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'demande_commerciale_traitee',jsonb_build_object('demande',p_demande));
 return true;
end $$;
revoke all on function public.demande_devis_traitee(uuid) from public, anon;
grant execute on function public.demande_devis_traitee(uuid) to authenticated;

create or replace function public.enregistrer_plan_continuite(p_email text, p_jours integer, p_consignes text) returns void
language plpgsql security definer set search_path='' as $$
declare compte uuid;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_jours is null or p_jours not between 1 and 90 or length(coalesce(p_consignes,''))>3000 then raise exception 'Délai ou consignes invalides'; end if;
 if nullif(btrim(p_email),'') is not null then
  select a.id into compte from public.accounts a where lower(a.email)=lower(btrim(p_email))
    and exists(select 1 from public.memberships m where m.account_id=a.id and m.role='super_admin' and m.organization_id is null and m.status='active');
  if compte is null or compte=(select auth.uid()) then raise exception 'Désignez un autre superviseur permanent déjà habilité'; end if;
 end if;
 update public.continuity_plan set responsable=compte,delai_jours=p_jours,consignes=coalesce(p_consignes,''),modifie_par=(select auth.uid()),updated_at=now() where id;
 insert into public.audit_log(account_id,action,details)
 values((select auth.uid()),'plan_continuite_enregistre',jsonb_build_object('remplacant_designe',compte is not null,'delai_jours',p_jours));
end $$;
revoke all on function public.enregistrer_plan_continuite(text,integer,text) from public, anon;
grant execute on function public.enregistrer_plan_continuite(text,integer,text) to authenticated;

-- ── 3. Une consultation, une ligne ─────────────────────────────────────────
-- Le rendu d'une page peut s'exécuter plusieurs fois (préchargement, double
-- rendu de développement) : la même consultation, par le même compte, de la
-- même organisation, dans la minute, n'est pas une nouvelle action.
create or replace function public.log_sa_access(org uuid, sa_action text, sa_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_super_admin() then
    raise exception 'log_sa_access: reserve au super admin';
  end if;
  if sa_action like 'consultation\_%' and exists (
    select 1 from public.audit_log l
    where l.account_id = (select auth.uid()) and l.action = sa_action
      and l.organization_id is not distinct from org
      and l.details = coalesce(sa_details, '{}'::jsonb)
      and l.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), org, sa_action, coalesce(sa_details, '{}'::jsonb));
end;
$$;

create index if not exists audit_log_compte_action_date_idx on public.audit_log(account_id, action, created_at desc);
