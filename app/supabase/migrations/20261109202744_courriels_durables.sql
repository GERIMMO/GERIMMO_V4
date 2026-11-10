begin;
create table public.courriels_durables (
 id text primary key check(length(id)=64), organization_id uuid references public.organizations(id),
 empreinte text not null, etat text not null check(etat in('en_attente','en_cours','accepte','echec','inconnu','livre')),
 jeton uuid, fournisseur_id text unique, tentatives integer not null default 0,
 reprendre_apres timestamptz not null default now(), verrou_jusqua timestamptz,
 cree_le timestamptz not null default now(), updated_at timestamptz not null default now(), verifie_le timestamptz, motif text
);
alter table public.courriels_durables enable row level security;
revoke all on public.courriels_durables from public,anon,authenticated;
grant select on public.courriels_durables to service_role;
create table public.courriels_evenements (
 id bigint generated always as identity primary key, courrier_id text not null references public.courriels_durables(id),
 etat text not null, cree_le timestamptz not null default now()
);
alter table public.courriels_evenements enable row level security;
revoke all on public.courriels_evenements from public,anon,authenticated;
grant select on public.courriels_evenements to service_role;
create function public.prendre_courriel(p_id text,p_org uuid,p_empreinte text,p_jeton uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 if p_jeton is null or p_empreinte is null then raise exception 'Référence requise'; end if;
 insert into public.courriels_durables(id,organization_id,empreinte,etat) values(p_id,p_org,p_empreinte,'en_attente') on conflict do nothing;
 select * into m from public.courriels_durables where id=p_id for update;
 if m.organization_id is distinct from p_org or m.empreinte<>p_empreinte then raise exception 'Identité de message incompatible'; end if;
 if m.etat in ('accepte','livre') then return jsonb_build_object('etat',m.etat,'id',m.fournisseur_id); end if;
 -- Un processus tué peut avoir déjà envoyé : pas de nouvelle émission après expiration.
 if m.etat='en_cours' and m.verrou_jusqua<now() then
  update public.courriels_durables set etat='inconnu',updated_at=now(),motif='Traitement interrompu' where id=p_id;
  insert into public.courriels_evenements(courrier_id,etat) values(p_id,'inconnu');
  return jsonb_build_object('etat','inconnu');
 end if;
 if m.etat in ('en_cours','inconnu','echec') or m.reprendre_apres>now() then return jsonb_build_object('etat',m.etat); end if;
 update public.courriels_durables set etat='en_cours',jeton=p_jeton,verrou_jusqua=now()+interval '1 minute',tentatives=tentatives+1,updated_at=now() where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'en_cours');
 return jsonb_build_object('etat','pris');
end $$;
create function public.finir_courriel(p_id text,p_jeton uuid,p_etat text,p_fournisseur text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 if p_etat not in ('accepte','en_attente','echec','inconnu') then raise exception 'État invalide'; end if;
 select * into m from public.courriels_durables where id=p_id and jeton=p_jeton for update;
 if not found then return false; end if;
 -- Un webhook confirmé a priorité sur une réponse HTTP tardive.
 if m.etat in ('livre','accepte') or (m.etat='echec' and m.fournisseur_id is not null) then return true; end if;
 if p_etat='accepte' and nullif(p_fournisseur,'') is null then p_etat:='inconnu'; end if;
 update public.courriels_durables set etat=case when p_etat='en_attente' and tentatives>=8 then 'echec' else p_etat end,
 fournisseur_id=coalesce(p_fournisseur,fournisseur_id),verrou_jusqua=null,updated_at=now(),
 reprendre_apres=now()+make_interval(secs=>least(3600,60*power(2,least(tentatives,6)-1)::int)) where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,p_etat);
 return true;
end $$;
-- Appelé uniquement après signature vérifiée ou GET authentifié du fournisseur.
create function public.rapprocher_courriel(p_id text,p_fournisseur text,p_etat text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 if p_etat not in ('accepte','livre','echec') or nullif(p_fournisseur,'') is null then raise exception 'Preuve invalide'; end if;
 select * into m from public.courriels_durables where id=p_id for update;
 if not found then return false; end if;
 if m.fournisseur_id is not null and m.fournisseur_id<>p_fournisseur then raise exception 'Fournisseur incompatible'; end if;
 if m.etat='livre' or (m.etat='echec' and m.fournisseur_id is not null and p_etat='accepte') then return true; end if;
 update public.courriels_durables set etat=p_etat,fournisseur_id=p_fournisseur,updated_at=now() where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,p_etat);
 return true;
end $$;
revoke all on function public.prendre_courriel(text,uuid,text,uuid),public.finir_courriel(text,uuid,text,text),public.rapprocher_courriel(text,text,text) from public,anon,authenticated;
grant execute on function public.prendre_courriel(text,uuid,text,uuid),public.finir_courriel(text,uuid,text,text),public.rapprocher_courriel(text,text,text) to service_role;
create function public.surveiller_courriels_interrompus() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 with modifies as (
  update public.courriels_durables set etat='inconnu',motif='Traitement interrompu',updated_at=now()
  where etat='en_cours' and verrou_jusqua<now() returning id
 ) insert into public.courriels_evenements(courrier_id,etat) select id,'inconnu' from modifies;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.surveiller_courriels_interrompus() from public,anon,authenticated;
grant execute on function public.surveiller_courriels_interrompus() to service_role;
-- Rotation équitable : un message sans événement terminal ne monopolise pas le contrôle.
create function public.courriels_a_rapprocher() returns setof public.courriels_durables
language sql security definer set search_path='' as $$
 with candidats as (
 select id from public.courriels_durables
 where etat in ('accepte','inconnu') and fournisseur_id is not null
 and (verifie_le is null or verifie_le<now()-interval '5 minutes')
 order by verifie_le nulls first,updated_at limit 10 for update skip locked
 ) update public.courriels_durables m set verifie_le=now() from candidats c where m.id=c.id returning m.*;
$$;
revoke all on function public.courriels_a_rapprocher() from public,anon,authenticated;
grant execute on function public.courriels_a_rapprocher() to service_role;
commit;
