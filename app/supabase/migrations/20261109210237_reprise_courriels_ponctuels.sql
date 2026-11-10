begin;
-- Complète le journal existant. Le contenu est chiffré dans l'application avant stockage.
alter table public.courriels_durables add column charge_chiffree text, add column expire_le timestamptz,
 add column reprise_autonome boolean not null default false;
create function public.conserver_courriel(p_id text,p_org uuid,p_empreinte text,p_charge text,p_expire timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 if p_charge is null or length(p_charge)>8388608 or p_expire<=now() or p_expire>now()+interval '1 day' then raise exception 'Charge ou durée invalide'; end if;
 insert into public.courriels_durables(id,organization_id,empreinte,etat,charge_chiffree,expire_le,reprise_autonome)
 values(p_id,p_org,p_empreinte,'en_attente',p_charge,p_expire,true) on conflict do nothing;
 select * into m from public.courriels_durables where id=p_id for update;
 if m.organization_id is distinct from p_org or m.empreinte<>p_empreinte then raise exception 'Message incompatible'; end if;
 return true;
end $$;
create function public.courriels_a_reprendre() returns setof public.courriels_durables
language plpgsql security definer set search_path='' as $$
begin
 with expires as (
 update public.courriels_durables set etat='echec',motif='Durée de validité dépassée',charge_chiffree=null,updated_at=now()
 where reprise_autonome and etat='en_attente' and expire_le<=now() returning id
 ) insert into public.courriels_evenements(courrier_id,etat) select id,'echec' from expires;
 update public.courriels_durables set charge_chiffree=null where expire_le<=now() and charge_chiffree is not null;
 return query select * from public.courriels_durables where reprise_autonome and etat='en_attente'
 and reprendre_apres<=now() and expire_le>now() and charge_chiffree is not null order by reprendre_apres,cree_le limit 10;
end $$;
create function public.purger_charge_courriel() returns trigger language plpgsql set search_path='' as $$
begin
 if new.etat in ('accepte','livre','echec') then new.charge_chiffree:=null; end if;
 return new;
end $$;
create trigger purge_charge_courriel before update on public.courriels_durables for each row execute function public.purger_charge_courriel();
revoke all on function public.conserver_courriel(text,uuid,text,text,timestamptz),public.courriels_a_reprendre(),public.purger_charge_courriel() from public,anon,authenticated;
grant execute on function public.conserver_courriel(text,uuid,text,text,timestamptz),public.courriels_a_reprendre() to service_role;
commit;
