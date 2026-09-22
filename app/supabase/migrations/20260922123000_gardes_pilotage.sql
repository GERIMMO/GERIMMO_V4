-- Les nouvelles écritures métier respectent les abonnements.
-- Les mesures et le suivi de supervision sont des journaux internes : leur
-- entretien ne doit pas arrêter les capteurs quand une organisation est fermée.
create or replace function public.poser_gardes_abonnement()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  -- Les journaux : jamais gardés. Lire une pièce écrit dans `acces_pieces_log`,
  -- toute action écrit dans `audit_log` : les bloquer bloquerait la LECTURE
  -- elle-même, et ferait perdre la trace au moment précis où elle compte.
  --
  -- L'abonnement : jamais gardé non plus, et pour la raison inverse. C'est la
  -- table par laquelle un compte fermé se rouvre. La garder, c'est exiger d'un
  -- client qu'il paie avec un compte qu'on lui a fermé faute de paiement.
  v_jamais text[] := array['acces_pieces_log', 'audit_log',
                           'abonnements', 'abonnement_evenements',
                           'retours_utilisateurs', 'retours_soutiens',
                           'automation_events', 'orchestration_cases'];
  -- Gardées en création et suppression seulement : leur UPDATE est un effet de
  -- LECTURE (marquage « lu »), pas un geste de gestion. Sans cette exception,
  -- un locataire ne pourrait plus ouvrir son courrier parce que son agence ne
  -- paie plus.
  v_sans_update text[] := array['messages'];
  v_ops text;
  v_n integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'organization_id'
                    and a.attnum > 0 and not a.attisdropped)
    order by c.relname
  loop
    if t.relname = any(v_jamais) then
      -- Rattrapage : une garde a pu être posée avant cette exclusion.
      execute format('drop trigger if exists %I on public.%I',
                     'abonnement_' || t.relname, t.relname);
      continue;
    end if;
    v_ops := case when t.relname = any(v_sans_update)
                  then 'insert or delete' else 'insert or update or delete' end;
    execute format('drop trigger if exists %I on public.%I',
                   'abonnement_' || t.relname, t.relname);
    execute format(
      'create trigger %I before %s on public.%I for each row execute function public.refuser_ecriture_si_fermee()',
      'abonnement_' || t.relname, v_ops, t.relname);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function public.poser_gardes_abonnement() is
  'Repose le refus d''écriture sur toutes les tables d''organisation. À APPELER EN FIN DE TOUTE MIGRATION qui crée une table portant organization_id. Exclut les journaux et les tables d''abonnement : c''est par elles qu''un compte fermé se rouvre.';
revoke execute on function public.poser_gardes_abonnement() from public, anon, authenticated;
select public.poser_gardes_abonnement();
select public.fermer_fonctions_a_anon();
