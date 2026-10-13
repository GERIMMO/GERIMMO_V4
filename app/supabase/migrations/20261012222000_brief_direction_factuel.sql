-- SA004 : instantanés factuels préparés manuellement, sans diffusion.
create table public.brief_direction_snapshots (
 id uuid primary key default gen_random_uuid(),
 jour date not null,
 genere_le timestamptz not null default now(),
 auteur_reel uuid not null references public.accounts(id),
 version_regles integer not null default 1,
 sources jsonb not null check(jsonb_typeof(sources)='object'),
 indisponibles text[] not null default '{}'
);
create index brief_direction_jour_idx on public.brief_direction_snapshots(jour,genere_le desc);
create index brief_direction_auteur_idx on public.brief_direction_snapshots(auteur_reel);
alter table public.brief_direction_snapshots enable row level security;
revoke all on public.brief_direction_snapshots from anon,authenticated;
grant select on public.brief_direction_snapshots to authenticated;
create policy brief_direction_lecture on public.brief_direction_snapshots for select to authenticated
 using(public.is_permanent_super_admin());

-- Collecte bornée : chiffres complets, vingt liens de dossier au plus par
-- source. Les montants réemploient l'état des loyers existant, sans nouvelle
-- règle d'imputation, de fiscalité ou de paiement.
create function public.collecter_source_direction(p_source text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 case p_source
 when 'incidents' then
  select jsonb_build_object('mesures',jsonb_build_object('urgents_ouverts',count(*)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',i.numero||' · '||i.etat::text,'date',i.created_at,'href','/agence/'||i.organization_id||'/incidents?sel='||i.id) obj
    from public.incidents i where i.urgence='urgente' and i.etat<>'clos' order by i.created_at limit 20)x),'[]'::jsonb)) into r
  from public.incidents where urgence='urgente' and etat<>'clos';
 when 'interventions' then
  select jsonb_build_object('mesures',jsonb_build_object('rendez_vous_depasses',count(*) filter(where fin_prevue<now()),'missions_sans_date',count(*) filter(where fin_prevue is null)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',inc.numero||' · rendez-vous dépassé','date',iv.fin_prevue,'href','/agence/'||iv.organization_id||'/incidents?sel='||iv.incident_id) obj
    from public.incident_interventions iv join public.incidents inc on inc.id=iv.incident_id
    where iv.statut in ('acceptee','planifiee','en_cours') and iv.fin_prevue<now() order by iv.fin_prevue limit 20)x),'[]'::jsonb)) into r
  from public.incident_interventions where statut in ('acceptee','planifiee','en_cours');
 when 'loyers' then
  with etats as materialized(select b.organization_id,b.id bail_id,e.* from public.baux b cross join lateral public.etat_loyers_bail_brut(b.id)e),
   retards as(select * from etats where date_echeance<current_date and montant_couvert<montant_du),
   prochains as(select * from etats where date_echeance between current_date and current_date+7 and montant_couvert<montant_du)
  select jsonb_build_object('mesures',jsonb_build_object('echeances_en_retard',(select count(*) from retards),'reste_en_retard_eur',(select coalesce(sum(montant_du-montant_couvert),0) from retards),'echeances_prochains_7_jours',(select count(*) from prochains),'reste_prochains_7_jours_eur',(select coalesce(sum(montant_du-montant_couvert),0) from prochains)),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre','Échéance en retard · '||to_char(montant_du-montant_couvert,'FM999999999990.00')||' €','date',date_echeance,'href','/agence/'||organization_id||'/baux/'||bail_id) obj from retards order by date_echeance limit 20)x),'[]'::jsonb)) into r;
 when 'echeances' then
  select jsonb_build_object('mesures',jsonb_build_object('alertes_en_retard',count(*) filter(where echeance<current_date),'alertes_prochains_7_jours',count(*) filter(where echeance between current_date and current_date+7),'alertes_critiques',count(*) filter(where criticite='critique')),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre',titre,'date',echeance,'href','/agence/'||organization_id||'/alertes') obj from public.alerts where statut='ouverte' and echeance<=current_date+7 order by echeance limit 20)x),'[]'::jsonb)) into r
  from public.alerts where statut='ouverte';
 when 'service' then
  select jsonb_build_object('mesures',jsonb_build_object('passages_24h',count(*),'passages_en_echec_24h',count(*) filter(where etat in ('a_reprendre','interrompu'))),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre',mission||' · '||etat,'date',debut,'href','/admin/equipes') obj from public.agent_passages where debut>=now()-interval '24 hours' and etat in ('a_reprendre','interrompu') order by debut desc limit 20)x),'[]'::jsonb)) into r
  from public.agent_passages where debut>=now()-interval '24 hours';
 else raise exception 'Source de direction inconnue';
 end case;
 return r;
end;
$$;
revoke all on function public.collecter_source_direction(text) from public,anon;
grant execute on function public.collecter_source_direction(text) to authenticated;

create function public.preparer_faits_direction()
returns jsonb language plpgsql security definer set search_path='' as $$
declare cle text; donnees jsonb; precedent jsonb; sources jsonb:='{}'; manquantes text[]:='{}'; resultat public.brief_direction_snapshots;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 -- Sérialise deux clics : une préparation simultanée ne fait pas concurrence
 -- au choix du dernier état connu. Aucun envoi, tâche ni décision créé ici.
 perform pg_advisory_xact_lock(hashtext('brief_direction_manuel'));
 foreach cle in array array['incidents','interventions','loyers','echeances','service'] loop
  begin
   donnees:=public.collecter_source_direction(cle);
   if donnees is null or jsonb_typeof(donnees)<>'object' then raise exception 'Source vide'; end if;
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','disponible','observe_le',now(),'donnees',donnees));
  exception when others then
   select s.sources->cle into precedent from public.brief_direction_snapshots s
    where s.sources->cle->>'observe_le' is not null order by s.genere_le desc limit 1;
   manquantes:=array_append(manquantes,cle);
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','indisponible','observe_le',precedent->'observe_le','donnees',precedent->'donnees','erreur','Lecture indisponible ; dernier état connu conservé','code_erreur',SQLSTATE));
  end;
 end loop;
 insert into public.brief_direction_snapshots(jour,auteur_reel,sources,indisponibles)
 values((now() at time zone 'Europe/Paris')::date,auth.uid(),sources,manquantes) returning * into resultat;
 return to_jsonb(resultat);
end;
$$;
revoke all on function public.preparer_faits_direction() from public,anon;
grant execute on function public.preparer_faits_direction() to authenticated;

create function public.lire_faits_direction(p_jour date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 select to_jsonb(s) into r from public.brief_direction_snapshots s where s.jour=p_jour order by s.genere_le desc limit 1;
 return r;
end;
$$;
revoke all on function public.lire_faits_direction(date) from public,anon;
grant execute on function public.lire_faits_direction(date) to authenticated;
