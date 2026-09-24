-- Suivi sans décision métier : aucune relance, aucun versement ni travaux
-- supplémentaires ne sont autorisés par cette migration.
alter table public.orchestration_cases add column rang_priorite integer generated always as
 (case priorite when 'urgente' then 0 when 'haute' then 1 when 'normale' then 2 else 3 end) stored;
create index orchestration_file_active_idx on public.orchestration_cases(rang_priorite,updated_at,id) where etat<>'termine';
create table public.orchestration_history (
 id bigint generated always as identity primary key,
 case_id uuid not null references public.orchestration_cases(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 action text not null, etat text not null, priorite text not null,
 created_at timestamptz not null default now()
);
create index orchestration_history_case_idx on public.orchestration_history(case_id,created_at desc);
create index orchestration_history_org_idx on public.orchestration_history(organization_id);
alter table public.orchestration_history enable row level security;
create policy orchestration_history_lecture on public.orchestration_history for select to authenticated using(
 exists(select 1 from public.orchestration_cases c where c.id=case_id and c.organization_id=orchestration_history.organization_id));
revoke all on public.orchestration_history from public,anon,authenticated;
grant select on public.orchestration_history to authenticated;
grant all on public.orchestration_history to service_role;
grant usage,select on sequence public.orchestration_history_id_seq to service_role;
create function public.conserver_etape_dossier() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (new.etape,new.prochaine_action,new.etat,new.priorite) is distinct from (old.etape,old.prochaine_action,old.etat,old.priorite) then
  insert into public.orchestration_history(case_id,organization_id,action,etat,priorite)
  values(new.id,new.organization_id,case when new.etat='termine' then 'Le dossier ne demande plus d’action dans le suivi' else new.prochaine_action end,new.etat,new.priorite);
 end if;
 return new;
end $$;
revoke all on function public.conserver_etape_dossier() from public,anon,authenticated;
create trigger conserver_etape_dossier after insert or update on public.orchestration_cases for each row execute function public.conserver_etape_dossier();

-- Le socle conserve sa logique validée. Il devient strictement interne.
alter function public.actualiser_orchestration() rename to actualiser_orchestration_socle;
revoke all on function public.actualiser_orchestration_socle() from public,anon,authenticated,service_role;
create function public.actualiser_orchestration() returns integer language plpgsql security definer set search_path='' as $$
declare n integer; ajoutes integer;
begin
 if (select auth.role()) is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Réservé à la supervision'; end if;
 if not pg_try_advisory_xact_lock(72192212) then return 0; end if;
 n:=public.actualiser_orchestration_socle();
 with attendus as (
  select b.organization_id,'loyer'::text dossier_type,b.id dossier_id,
   'impaye'::text etape,
   case when o.relances_envoi_auto and not existe.escalade then 'Suivre les relances autorisées et vérifier les règlements reçus' else 'Vérifier le solde puis décider de la suite du recouvrement' end prochaine_action,
   case when o.relances_envoi_auto and not existe.escalade then 'automatique' else 'humaine' end mode,
   case when o.relances_envoi_auto and not existe.escalade then 'en_attente' else 'a_faire' end etat,
   case when solde.echeance<current_date-30 then 'haute' else 'normale' end priorite,
   '/agence/'||b.organization_id||'/baux/'||b.id||'#loyers' lien_action,
   case when existe.escalade then 'Les relances ont déjà été engagées. La suite demande une décision du gestionnaire.' else 'Un solde reste dû après l’échéance. Vérifier les paiements avant tout nouvel envoi.' end exception_message,
   solde.echeance::timestamptz agir_apres
  from public.baux b join public.organizations o on o.id=b.organization_id
  cross join lateral (select min(e.date_echeance) echeance from public.etat_loyers_bail_brut(b.id) e where e.date_echeance<current_date and e.montant_du>e.montant_couvert) solde
  cross join lateral (select exists(select 1 from public.relances r where r.bail_id=b.id and r.organization_id=b.organization_id and r.niveau in ('relance_2','mise_en_demeure') and r.date_envoi>=solde.echeance) escalade) existe
  where b.etat::text in ('actif','preavis','termine') and solde.echeance is not null
  union all
  select v.organization_id,'intervention',v.id,v.statut::text,
   case when v.statut::text='proposee' then 'Attendre la réponse de l’artisan à la mission'
    when v.statut::text='acceptee' and v.debut_prevu is null then 'Convenir du rendez-vous avec le locataire et l’artisan'
    when v.statut::text='terminee' then 'Vérifier le compte rendu et la résolution de l’incident'
    when v.fin_prevue<now() then 'Vérifier le retard et confirmer la nouvelle date avec les personnes concernées'
    else 'Suivre le rendez-vous et l’avancement des travaux' end,
   'humaine',case when v.statut::text='terminee' or v.fin_prevue<now() or (v.statut::text='acceptee' and v.debut_prevu is null) then 'a_faire' else 'en_attente' end,
   case when i.urgence::text='urgente' then 'urgente' when v.fin_prevue<now() then 'haute' else 'normale' end,
   '/agence/'||v.organization_id||'/incidents?sel='||v.incident_id,
   case when v.fin_prevue<now() and v.statut::text<>'terminee' then 'La fin prévue est dépassée. Aucun nouveau délai n’a été confirmé dans le dossier.' end,
   case when v.statut::text='terminee' then null else coalesce(v.fin_prevue,v.debut_prevu) end
  from public.incident_interventions v join public.incidents i on i.id=v.incident_id and i.organization_id=v.organization_id
  where v.statut::text in ('proposee','acceptee','planifiee','en_cours','terminee') and i.etat::text<>'clos'
 ), clos as (
  update public.orchestration_cases c set etat='termine',updated_at=now()
  where c.dossier_type in ('loyer','intervention') and c.etat<>'termine' and not exists(select 1 from attendus a where a.organization_id=c.organization_id and a.dossier_type=c.dossier_type and a.dossier_id=c.dossier_id)
  returning c.id
 )
 insert into public.orchestration_cases(organization_id,dossier_type,dossier_id,etape,prochaine_action,mode,etat,priorite,lien_action,exception_message,agir_apres)
 select organization_id,dossier_type,dossier_id,etape,prochaine_action,mode,etat,priorite,lien_action,exception_message,agir_apres from attendus
 on conflict(organization_id,dossier_type,dossier_id) do update set etape=excluded.etape,prochaine_action=excluded.prochaine_action,mode=excluded.mode,etat=excluded.etat,priorite=excluded.priorite,lien_action=excluded.lien_action,exception_message=excluded.exception_message,agir_apres=excluded.agir_apres,updated_at=now()
 where (orchestration_cases.etape,orchestration_cases.prochaine_action,orchestration_cases.mode,orchestration_cases.etat,orchestration_cases.priorite,orchestration_cases.lien_action,orchestration_cases.exception_message,orchestration_cases.agir_apres)
 is distinct from (excluded.etape,excluded.prochaine_action,excluded.mode,excluded.etat,excluded.priorite,excluded.lien_action,excluded.exception_message,excluded.agir_apres);
 get diagnostics ajoutes=row_count;
 return n+ajoutes;
end $$;
revoke all on function public.actualiser_orchestration() from public,anon;
grant execute on function public.actualiser_orchestration() to authenticated,service_role;

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
                           'automation_events', 'orchestration_cases', 'orchestration_history'];
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
