-- SA005 : diagnostic motivé, lecture seule. Aucun rôle ni droit d'écriture ajouté.
-- Les sessions antérieures sont fermées : une ancienne autorisation d'écriture
-- ne devient pas silencieusement un consentement au nouveau périmètre.
update public.supervision_sessions_artisan set fermee_le=now() where fermee_le is null;
alter table public.supervision_sessions_artisan add column if not exists portee text not null default 'diagnostic';
alter table public.supervision_sessions_artisan add constraint supervision_artisan_portee_diagnostic check(portee='diagnostic');
alter table public.supervision_sessions_artisan add constraint supervision_artisan_motif_ouvert check(fermee_le is not null or length(btrim(coalesce(motif,''))) between 3 and 1000);

create or replace function public.session_artisan_diagnostic_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervision_sessions_artisan s
  where s.account_id=auth.uid() and s.fermee_le is null and s.expire_le>now());
$$;
revoke all on function public.session_artisan_diagnostic_active() from public,anon;
grant execute on function public.session_artisan_diagnostic_active() to authenticated;

create or replace function public.exiger_artisan_reel()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v uuid;
begin
 if public.session_artisan_diagnostic_active() then
  raise exception 'Diagnostic en lecture seule : quittez cette session pour agir avec votre propre compte';
 end if;
 select id into v from public.artisans where account_id=auth.uid();
 if v is null then raise exception 'Cette action exige le compte réel de l''artisan'; end if;
 return v;
end;
$$;
revoke all on function public.exiger_artisan_reel() from public,anon;
grant execute on function public.exiger_artisan_reel() to authenticated;

create or replace function public.artisan_supervise()
returns uuid language sql stable security definer set search_path='' as $$
 select s.artisan_id from public.supervision_sessions_artisan s
 where s.account_id=auth.uid() and s.fermee_le is null and s.expire_le>now()
   and s.portee='diagnostic' and public.is_permanent_super_admin() limit 1;
$$;

create or replace function public.ouvrir_session_artisan(p_artisan uuid,p_motif text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_permanent_super_admin() then raise exception 'ouvrir_session_artisan: reserve a la supervision permanente avec double verification'; end if;
 if length(btrim(coalesce(p_motif,''))) not between 3 and 1000 then raise exception 'Indiquez le motif du diagnostic (3 à 1000 caractères)'; end if;
 if not exists(select 1 from public.artisans where id=p_artisan) then raise exception 'Artisan inconnu.'; end if;
 perform public.fermer_session_artisan();
 insert into public.supervision_sessions_artisan(account_id,artisan_id,expire_le,motif,portee)
 values(auth.uid(),p_artisan,now()+interval '30 minutes',btrim(p_motif),'diagnostic') returning id into v_id;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(auth.uid(),null,'ouverture_session_artisan',jsonb_build_object('artisan_id',p_artisan,'session_id',v_id,'motif',btrim(p_motif),'portee','diagnostic','auteur_reel',auth.uid()));
 return v_id;
end;
$$;

create or replace function public.fermer_session_artisan()
returns void language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in update public.supervision_sessions_artisan set fermee_le=now()
  where account_id=auth.uid() and fermee_le is null returning id,artisan_id,portee loop
  insert into public.audit_log(account_id,organization_id,action,details)
  values(auth.uid(),null,'fermeture_session_artisan',jsonb_build_object('artisan_id',s.artisan_id,'session_id',s.id,'portee',s.portee,'auteur_reel',auth.uid()));
 end loop;
end;
$$;

create or replace function public.ma_session_artisan()
returns table(session_id uuid,artisan_id uuid,raison_sociale text,expire_le timestamptz)
language sql stable security definer set search_path='' as $$
 select s.id,s.artisan_id,a.raison_sociale,s.expire_le
 from public.supervision_sessions_artisan s join public.artisans a on a.id=s.artisan_id
 where s.account_id=auth.uid() and s.fermee_le is null and s.expire_le>now()
 and public.is_permanent_super_admin();
$$;

create or replace function public.ma_session_artisan_diagnostic()
returns table(session_id uuid,artisan_id uuid,raison_sociale text,expire_le timestamptz,motif text,portee text,auteur_reel uuid)
language sql stable security definer set search_path='' as $$
 select s.id,s.artisan_id,a.raison_sociale,s.expire_le,s.motif,s.portee,s.account_id
 from public.supervision_sessions_artisan s join public.artisans a on a.id=s.artisan_id
 where s.account_id=auth.uid() and s.fermee_le is null and s.expire_le>now()
 and public.is_permanent_super_admin();
$$;
revoke all on function public.ma_session_artisan_diagnostic() from public,anon;
grant execute on function public.ma_session_artisan_diagnostic() to authenticated;

-- Les RPC SECURITY DEFINER passent aussi par ces triggers : le contrôle ne
-- dépend ni du formulaire ni du propriétaire SQL de la fonction appelée.
-- audit_log garde l'auteur réel des ouvertures/fermetures ; la table des
-- sessions reste seulement modifiable par les deux RPC bornées ci-dessus.
create or replace function public.refuser_mutation_diagnostic_artisan()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.session_artisan_diagnostic_active() then
  raise exception 'Diagnostic artisan en lecture seule : aucune modification autorisée';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.refuser_mutation_diagnostic_artisan() from public,anon,authenticated;

create function public.poser_gardes_diagnostic_artisan()
returns void language plpgsql security definer set search_path='' as $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables
  where (schemaname='public' and tablename not in ('supervision_sessions_artisan','audit_log'))
     or (schemaname='storage' and tablename='objects') loop
  execute format('drop trigger if exists diagnostic_artisan_lecture on %I.%I',t.schemaname,t.tablename);
  execute format('create trigger diagnostic_artisan_lecture before insert or update or delete on %I.%I for each row execute function public.refuser_mutation_diagnostic_artisan()',t.schemaname,t.tablename);
 end loop;
end $$;
revoke all on function public.poser_gardes_diagnostic_artisan() from public,anon,authenticated;
select public.poser_gardes_diagnostic_artisan();

-- Seconde barrière pour le stockage appelé directement ; les lectures restent
-- soumises aux politiques existantes et ne reçoivent aucun nouveau droit.
create policy diagnostic_artisan_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(not public.session_artisan_diagnostic_active());
create policy diagnostic_artisan_storage_update on storage.objects as restrictive for update to authenticated
 using(not public.session_artisan_diagnostic_active()) with check(not public.session_artisan_diagnostic_active());
create policy diagnostic_artisan_storage_delete on storage.objects as restrictive for delete to authenticated
 using(not public.session_artisan_diagnostic_active());
