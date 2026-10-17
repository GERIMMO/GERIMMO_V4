-- D22 : seul un arrêt certain AVANT l'appel au prestataire rend une réservation.
-- L'identifiant interdit à un nettoyage tardif de libérer une tentative suivante.
alter table public.intervention_demandes_rdv
  add column if not exists relance_reservation_id uuid;

do $migration$
declare d text; a text;
begin
  select pg_get_functiondef('public.reserver_relance_report_rdv(uuid)'::regprocedure) into d;
  if position('relance_reservation_id=gen_random_uuid()' in d)>0 then return; end if;
  a:='set relance_reservee_le=now() where id=d.id;';
  if (length(d)-length(replace(d,a,'')))<>length(a) then raise exception 'D22 reprise : réservation inattendue'; end if;
  d:=replace(d,a,'set relance_reservee_le=now(), relance_reservation_id=gen_random_uuid() where id=d.id returning * into d;');
  a:='''demande_id'',d.id,''intervention_id'',i.id';
  if (length(d)-length(replace(d,a,'')))<>length(a) then raise exception 'D22 reprise : résultat de réservation inattendu'; end if;
  execute replace(d,a,'''demande_id'',d.id,''reservation_id'',d.relance_reservation_id,''intervention_id'',i.id');
end $migration$;

create or replace function public.liberer_relance_report_rdv(p_demande uuid,p_reservation uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.intervention_demandes_rdv
  set relance_reservee_le=null, relance_reservation_id=null
  where id=p_demande and relance_reservation_id=p_reservation
    and relance_reservee_le is not null and relance_envoyee_le is null and relance_echec is null;
  return found;
end $$;
revoke all on function public.liberer_relance_report_rdv(uuid,uuid) from public,anon,authenticated;
grant execute on function public.liberer_relance_report_rdv(uuid,uuid) to service_role;
select public.fermer_fonctions_a_anon();
