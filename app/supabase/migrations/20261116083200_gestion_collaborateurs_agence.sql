-- Vérifier aussi l’adhésion lors d’un appel direct avec une ancienne session.
create or replace function public.lots_de_mon_portefeuille(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  with adhesion as (
    select 1 from public.memberships
    where organization_id = p_org and account_id = (select auth.uid())
      and status = 'active' and role in ('agent', 'admin_agence')
  )
  -- a) Les lots des mandats dont je suis titulaire — la règle d'origine.
  select ml.lot_id
  from public.mandats md
  join public.mandat_lignes ml on ml.mandat_id = md.id and ml.date_fin is null
  where exists (select from adhesion) and md.organization_id = p_org
    and md.agent_account_id = (select auth.uid())
    and md.etat in ('brouillon','a_signer','actif','preavis')
  union
  -- b) Les lots que j'ai saisis et que nul mandat ne couvre encore. Sans eux,
  --    un agent ne pourrait pas enregistrer un bien : il ne relirait pas ce
  --    qu'il vient d'écrire.
  select l.id
  from public.lots l
  where exists (select from adhesion) and l.organization_id = p_org
    and l.created_by = (select auth.uid())
    and not exists (
      select 1
      from public.mandats md2
      join public.mandat_lignes ml2 on ml2.mandat_id = md2.id and ml2.date_fin is null
      where md2.organization_id = p_org
        and ml2.lot_id = l.id
        and md2.etat in ('brouillon','a_signer','actif','preavis')
    );
$$;

-- Le gestionnaire choisit explicitement le successeur. Les mandats terminés
-- conservent leur titulaire historique. L’adhésion est conservée pour l’audit.
create function public.gerer_collaborateur_agence(
  p_org uuid, p_compte uuid, p_action text, p_repreneur uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  acteur uuid := auth.uid();
  cible public.memberships%rowtype;
  mandat uuid;
begin
  if acteur is null or acteur = p_compte or not exists (
    select from public.memberships m join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_org and o.type='agence' and m.account_id=acteur
      and m.status='active' and m.role='admin_agence'
  ) then raise exception 'Seul un autre responsable de cette agence peut modifier cet accès.'; end if;
  -- Sérialise les changements de rôle entre responsables de la même équipe.
  perform 1 from public.organizations where id=p_org for update;
  perform 1 from public.memberships where organization_id=p_org and account_id=acteur
    and role='admin_agence' and status='active' for update;
  if not found then raise exception 'Votre accès a changé.'; end if;
  select * into cible from public.memberships where organization_id=p_org and account_id=p_compte
    and role in ('agent','admin_agence') and status='active' for update;
  if not found then raise exception 'Ce collaborateur n’a plus d’accès actif.'; end if;

  if p_action='retirer' then
    if p_repreneur is null or p_repreneur=p_compte then raise exception 'Choisissez un responsable de reprise.'; end if;
    perform 1 from public.memberships where organization_id=p_org and account_id=p_repreneur
      and status='active' and role in ('agent','admin_agence') for update;
    if not found then raise exception 'Le repreneur doit faire partie de cette équipe.'; end if;
    for mandat in
      update public.mandats set agent_account_id=p_repreneur
      where organization_id=p_org and agent_account_id=p_compte and etat in ('brouillon','a_signer','actif','preavis')
      returning id
    loop
      insert into public.audit_log(account_id,organization_id,action,details)
      values(acteur,p_org,'mandat_reattribue',jsonb_build_object('mandat_id',mandat,'ancien',p_compte,'nouveau',p_repreneur));
    end loop;
    update public.memberships set status='inactive' where id=cible.id;
  elsif p_action in ('agent','admin_agence') and p_repreneur is null then
    update public.memberships set role=p_action::public.membership_role where id=cible.id;
  else raise exception 'Modification de rôle non autorisée.'; end if;
end $$;
revoke all on function public.gerer_collaborateur_agence(uuid,uuid,text,uuid) from public, anon, service_role;
grant execute on function public.gerer_collaborateur_agence(uuid,uuid,text,uuid) to authenticated;
