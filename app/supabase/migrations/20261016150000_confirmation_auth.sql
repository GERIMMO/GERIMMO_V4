create table if not exists public.tentatives_confirmation_auth (
  id bigint generated always as identity primary key,
  empreinte_email text not null,
  empreinte_ip text not null,
  cree_le timestamptz not null default clock_timestamp()
);
create index if not exists tentatives_confirmation_auth_email_idx on public.tentatives_confirmation_auth (empreinte_email, cree_le);
create index if not exists tentatives_confirmation_auth_ip_idx on public.tentatives_confirmation_auth (empreinte_ip, cree_le);
create index if not exists tentatives_confirmation_auth_date_idx on public.tentatives_confirmation_auth (cree_le);
alter table public.tentatives_confirmation_auth enable row level security;
revoke all on public.tentatives_confirmation_auth from public, anon, authenticated;

create or replace function public.autoriser_confirmation_auth(p_email text, p_ip text, p_type text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip inet;
  v_email_hash text;
  v_ip_hash text;
  v_maintenant timestamptz;
  v_compte record;
begin
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_token_hash is null or p_token_hash !~ '^(pkce_)?[a-f0-9]{56}$'
     or p_type is null or p_type not in ('signup', 'invite', 'recovery', 'magiclink', 'email', 'email_change') then
    return null;
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when invalid_text_representation then
    return null;
  end;
  if v_ip is null then return null; end if;
  v_email_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
  v_ip_hash := encode(sha256(convert_to(host(v_ip), 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('confirmation_email:' || v_email_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('confirmation_ip:' || v_ip_hash, 0));
  v_maintenant := clock_timestamp();
  delete from public.tentatives_confirmation_auth where cree_le < v_maintenant - interval '1 day';
  if (select count(*) from public.tentatives_confirmation_auth where empreinte_email = v_email_hash and cree_le > v_maintenant - interval '1 hour') >= 10
     or (select count(*) from public.tentatives_confirmation_auth where empreinte_ip = v_ip_hash and cree_le > v_maintenant - interval '1 hour') >= 60 then
    return null;
  end if;
  insert into public.tentatives_confirmation_auth(empreinte_email, empreinte_ip, cree_le) values (v_email_hash, v_ip_hash, v_maintenant);
  select u.id, u.email_confirmed_at into v_compte
  from auth.one_time_tokens t join auth.users u on u.id = t.user_id
  where t.token_hash = p_token_hash
    and ((p_type <> 'email_change' and lower(u.email) = v_email)
      or (p_type = 'email_change' and t.token_type::text = 'email_change_token_current' and lower(u.email) = v_email)
      or (p_type = 'email_change' and t.token_type::text = 'email_change_token_new' and lower(u.email_change) = v_email))
    and ((p_type in ('signup', 'invite') and t.token_type::text = 'confirmation_token')
      or (p_type in ('recovery', 'magiclink') and t.token_type::text = 'recovery_token')
      or (p_type = 'email' and t.token_type::text in ('confirmation_token', 'recovery_token'))
      or (p_type = 'email_change' and t.token_type::text in ('email_change_token_current', 'email_change_token_new')))
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('user_id', v_compte.id, 'premiere_confirmation', v_compte.email_confirmed_at is null);
end;
$$;
revoke all on function public.autoriser_confirmation_auth(text, text, text, text) from public, anon, authenticated;
grant execute on function public.autoriser_confirmation_auth(text, text, text, text) to service_role;
select public.fermer_fonctions_a_anon();
