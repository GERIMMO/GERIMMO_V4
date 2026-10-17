-- D22-B, compléments du 16/10 : une relance avant échéance, accusé d'annulation non bloquant, lecture pour l'agenda.
-- Les marqueurs suivent la conservation de leur demande ; aucune table ni identité nouvelle.
alter table public.intervention_demandes_rdv
  add column if not exists annulation_vue_le timestamptz,
  add column if not exists relance_reservee_le timestamptz,
  add column if not exists relance_envoyee_le timestamptz,
  add column if not exists relance_echec boolean;

create or replace function public.accuser_annulation_rdv(p_demande uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.intervention_demandes_rdv%rowtype;
begin
  if (select auth.uid()) is null or public.mon_artisan_id() is null then raise exception 'Accès refusé' using errcode='42501'; end if;
  select x.* into d from public.intervention_demandes_rdv x
  join public.incident_interventions i on i.id=x.intervention_id and i.organization_id=x.organization_id
  where x.id=p_demande and i.artisan_id=public.mon_artisan_id() and x.type='annulation'
  for update of x;
  if not found then raise exception 'Annulation indisponible' using errcode='42501'; end if;
  if d.annulation_vue_le is not null then return false; end if;
  update public.intervention_demandes_rdv set annulation_vue_le=now() where id=d.id;
  -- Aucun statut de mission, de créneau ou d'alerte ne change : le rendez-vous était déjà annulé.
  return true;
end $$;
revoke all on function public.accuser_annulation_rdv(uuid) from public,anon;
grant execute on function public.accuser_annulation_rdv(uuid) to authenticated;

-- Le contrat de lecture gagne uniquement le marqueur de prise de connaissance.
do $migration$
declare d text; a text;
begin
  select pg_get_functiondef('public.mes_demandes_rdv_artisan()'::regprocedure) into d;
  if position('annulation_vue_le' in d)>0 then return; end if;
  a:='tardive boolean)';
  if (length(d)-length(replace(d,a,'')))<>length(a) then raise exception 'D22 accusé : retour mes_demandes_rdv_artisan inattendu'; end if;
  d:=replace(d,a,'tardive boolean, annulation_vue_le timestamp with time zone)');
  a:='d.rdv_fin, d.tardive';
  if (length(d)-length(replace(d,a,'')))<>length(a) then raise exception 'D22 accusé : lecture mes_demandes_rdv_artisan inattendue'; end if;
  d:=replace(d,a,'d.rdv_fin, d.tardive, d.annulation_vue_le');
  drop function public.mes_demandes_rdv_artisan();
  execute d;
end $migration$;
revoke all on function public.mes_demandes_rdv_artisan() from public,anon;
grant execute on function public.mes_demandes_rdv_artisan() to authenticated;

create or replace function public.reports_rdv_a_relancer(p_limite integer default 10)
returns table(demande_id uuid)
language sql stable security definer set search_path='' as $$
  select d.id from public.intervention_demandes_rdv d
  join public.incident_interventions i on i.id=d.intervention_id and i.organization_id=d.organization_id
  join public.artisans a on a.id=i.artisan_id
  where d.type='report' and d.statut='en_attente' and d.expire_le>now()
    and d.relance_reservee_le is null and i.statut='planifiee'
    and nullif(btrim(a.email),'') is not null and public.org_ecriture_ouverte(d.organization_id)
  order by d.expire_le,d.id limit greatest(0,least(coalesce(p_limite,10),100))
$$;
revoke all on function public.reports_rdv_a_relancer(integer) from public,anon,authenticated;
grant execute on function public.reports_rdv_a_relancer(integer) to service_role;

create or replace function public.reserver_relance_report_rdv(p_demande uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.intervention_demandes_rdv%rowtype; i public.incident_interventions%rowtype; adresse text;
begin
  -- La réservation durable exclut les passes concurrentes et les reprises après réponse perdue.
  -- Même ordre que les gestes du rendez-vous : mission, puis demande.
  select x.* into i from public.incident_interventions x
  where x.id=(select r.intervention_id from public.intervention_demandes_rdv r where r.id=p_demande) for update;
  if not found or i.statut<>'planifiee' then return null; end if;
  select * into d from public.intervention_demandes_rdv where id=p_demande for update;
  if not found or d.type<>'report' or d.statut<>'en_attente' or d.expire_le<=now()
    or d.relance_reservee_le is not null or not public.org_ecriture_ouverte(d.organization_id) then return null; end if;
  select a.email into adresse from public.artisans a where a.id=i.artisan_id;
  if nullif(btrim(adresse),'') is null then return null; end if;
  update public.intervention_demandes_rdv set relance_reservee_le=now() where id=d.id;
  return jsonb_build_object('demande_id',d.id,'intervention_id',i.id,'organization_id',d.organization_id,
    'adresse',adresse,'expire_le',d.expire_le,'rdv_debut',d.rdv_debut,'rdv_fin',d.rdv_fin);
end $$;
revoke all on function public.reserver_relance_report_rdv(uuid) from public,anon,authenticated;
grant execute on function public.reserver_relance_report_rdv(uuid) to service_role;

create or replace function public.noter_relance_report_rdv(p_demande uuid,p_envoyee boolean)
returns void language sql security definer set search_path='' as $$
  update public.intervention_demandes_rdv set relance_envoyee_le=case when p_envoyee then now() else null end,
    relance_echec=not p_envoyee
  where id=p_demande and relance_reservee_le is not null and relance_echec is null
$$;
revoke all on function public.noter_relance_report_rdv(uuid,boolean) from public,anon,authenticated;
grant execute on function public.noter_relance_report_rdv(uuid,boolean) to service_role;
select public.fermer_fonctions_a_anon();
