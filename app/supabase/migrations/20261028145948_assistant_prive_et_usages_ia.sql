-- L’historique du chat reste dans la mémoire de l’onglet, jamais dans la messagerie partagée.
-- La base ne conserve que des compteurs, sans message ni identité d’un tiers.
create table if not exists public.ia_appels_comptes_jour (
 account_id uuid not null references public.accounts(id) on delete cascade,
 jour date not null,
 usage text not null check(usage in ('conversation_privee','lecture_document')),
 appels integer not null default 0 check(appels >= 0),
 dernier_appel timestamptz,
 primary key(account_id,jour,usage)
);
alter table public.ia_appels_comptes_jour enable row level security;
revoke all on public.ia_appels_comptes_jour from public,anon,authenticated,service_role;
grant select on public.ia_appels_comptes_jour to authenticated,service_role;
drop policy if exists ia_compte_prive on public.ia_appels_comptes_jour;
create policy ia_compte_prive on public.ia_appels_comptes_jour for select to authenticated
 using(account_id=(select auth.uid()));

create or replace function public.reserver_appel_ia(p_usage text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle text;
  v_jour date := public.aujourdhui_paris();
  v_plafond integer;
begin
  -- Le traitement (client de service) ou un superviseur doublement vérifié : un compte ordinaire épuiserait la limite
  -- de tous.
  if auth.role() is distinct from 'service_role' and public.is_super_admin() is not true then
    raise exception 'Accès réservé au traitement ou à la supervision';
  end if;
  if p_usage is null or p_usage not in ('veille', 'redaction_veille', 'visuel_marketing', 'article', 'brief', 'devis', 'atelier', 'conversation_privee', 'lecture_document') then
    raise exception 'Usage de l''IA inconnu';
  end if;
  v_cle := case p_usage
             when 'veille' then 'veille'
             when 'redaction_veille' then 'marketing'
             when 'visuel_marketing' then 'marketing'
             when 'article' then 'marketing'
           end;
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
  if exists (select 1 from public.supervision_arrets a where a.arrete and (a.cle = 'global' or a.cle = v_cle)) then
    return 'arret';
  end if;
  select r.plafond_jour into v_plafond from public.ia_plafond_reglage r where r.singleton;
  if v_plafond is null then
    -- Réglage absent : par prudence, aucun appel (l'application le dit « contrôle indisponible »).
    raise exception 'Limite des appels à l''IA non réglée';
  end if;
  insert into public.ia_appels_jour (jour) values (v_jour) on conflict (jour) do nothing;
  -- La place se prend ici, ou pas du tout : la condition est relue sous le verrou de la ligne.
  update public.ia_appels_jour set appels = appels + 1 where jour = v_jour and appels < v_plafond;
  if found then
    return 'accorde';
  end if;
  update public.ia_appels_jour set refus = refus + 1 where jour = v_jour;
  return 'plafond';
end;
$$;
comment on function public.reserver_appel_ia(text) is
  'Décision X19 (SA-10) : à appeler juste avant chaque appel payant à l''IA. Consulte l''arrêt d''urgence puis réserve une place sous la limite du jour de Paris, atomiquement. Rend accorde, arret ou plafond.';
revoke all on function public.reserver_appel_ia(text) from public, anon, authenticated, service_role;
grant execute on function public.reserver_appel_ia(text) to authenticated, service_role;


-- Même plafond global que les autres appels ; le compte ne peut ni choisir son identité,
-- ni contourner sa limite en passant dans une autre organisation ou par une clé de service.
create or replace function public.reserver_appel_ia_prive(p_org uuid,p_usage text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_compte uuid:=auth.uid(); v_jour date:=public.aujourdhui_paris(); v_plafond integer;
 v_limite integer; v_appels integer; v_dernier timestamptz;
begin
 if v_compte is null or not exists(
   select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
   where m.account_id=v_compte and m.organization_id=p_org and m.status='active'
   and m.role in ('proprietaire_direct','locataire') and o.status in ('active','essai')
 ) or not coalesce(public.org_ecriture_ouverte(p_org),false) then raise exception 'Accès refusé'; end if;
 if p_usage is null or p_usage not in ('conversation_privee','lecture_document') then raise exception 'Usage de l’IA inconnu'; end if;
 if exists(select 1 from public.supervision_arrets where arrete and cle='global') then return 'arret'; end if;
 -- Un compte unique pour tous ses espaces. Le verrou sérialise aussi ses deux usages.
 perform 1 from public.accounts where id=v_compte for update;
 insert into public.ia_appels_comptes_jour(account_id,jour,usage) values(v_compte,v_jour,p_usage) on conflict do nothing;
 select appels,dernier_appel into v_appels,v_dernier from public.ia_appels_comptes_jour where account_id=v_compte and jour=v_jour and usage=p_usage;
 v_limite:=case p_usage when 'conversation_privee' then 10 else 20 end;
 if v_appels>=v_limite then return 'limite_compte'; end if;
 if v_dernier>clock_timestamp()-interval '3 seconds' then return 'patientez'; end if;
 select plafond_jour into v_plafond from public.ia_plafond_reglage where singleton;
 if v_plafond is null then raise exception 'Contrôle indisponible'; end if;
 insert into public.ia_appels_jour(jour) values(v_jour) on conflict do nothing;
 update public.ia_appels_jour set appels=appels+1 where jour=v_jour and appels<v_plafond;
 if not found then
  update public.ia_appels_jour set refus=refus+1 where jour=v_jour;
  return 'plafond';
 end if;
 update public.ia_appels_comptes_jour set appels=appels+1,dernier_appel=clock_timestamp() where account_id=v_compte and jour=v_jour and usage=p_usage;
 return 'accorde';
end $$;
revoke all on function public.reserver_appel_ia_prive(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.reserver_appel_ia_prive(uuid,text) to authenticated;
select public.fermer_fonctions_a_anon();
