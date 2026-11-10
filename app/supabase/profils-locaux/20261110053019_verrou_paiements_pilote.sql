begin;
-- Verrou de l'instance isolée : aucun rôle applicatif ne peut le modifier.
-- Sa levée éventuelle exige une opération DBA explicite ; ne jamais appliquer sans revue hors pilote.
create table public.securite_instance_pilote(id boolean primary key default true check(id),paiements_bloques boolean not null default true);
insert into public.securite_instance_pilote values(true,true);
alter table public.securite_instance_pilote enable row level security;
revoke all on public.securite_instance_pilote from public,anon,authenticated,service_role;
grant select on public.securite_instance_pilote to service_role;
create function public.refuser_finance_pilote() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (select paiements_bloques from public.securite_instance_pilote where id) then return new; end if;
 if tg_table_name='abonnements' then
  if tg_op='INSERT' and new.stripe_customer_id is null and new.stripe_subscription_id is null and new.stripe_statut is null then return new; end if;
  if tg_op='UPDATE' and (to_jsonb(new)-array['quantite','a_resynchroniser','updated_at'])=(to_jsonb(old)-array['quantite','a_resynchroniser','updated_at']) then return new; end if;
 elsif tg_table_name='organizations' then
  if new.status::text<>'active' then return new; end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 end if;
 raise exception 'Opération financière interdite dans cette instance pilote' using errcode='42501';
end $$;
revoke all on function public.refuser_finance_pilote() from public,anon,authenticated,service_role;
create trigger verrou_paiements_pilote before insert or update on public.abonnements for each row execute function public.refuser_finance_pilote();
create trigger verrou_droits_payants_pilote before insert or update of status on public.organizations for each row execute function public.refuser_finance_pilote();
do $$ declare t text; begin
 foreach t in array array['intentions_souscription','mois_offerts','abonnement_evenements'] loop
 execute format('create trigger verrou_paiements_pilote before insert or update on public.%I for each row execute function public.refuser_finance_pilote()',t);
 end loop;
end $$;
commit;
