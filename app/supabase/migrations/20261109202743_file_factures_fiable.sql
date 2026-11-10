begin;
-- La file étend le consentement existant ; aucune règle de répartition ne change.
alter table public.factures_automatiques
 add column disponible_le timestamptz not null default now(),
 add column jeton uuid,
 add column verrou_jusqua timestamptz,
 add column prise_le timestamptz,
 add column tentatives integer not null default 0,
 add column revision bigint not null default 0,
 add column revision_prise bigint,
 add column dernier_resultat text;
create index factures_auto_disponibles on public.factures_automatiques(disponible_le) where actif and etat in ('a_traiter','releves_attendus');
create table public.factures_automatiques_evenements (
 id bigint generated always as identity primary key, facture_id uuid not null references public.factures_automatiques(id),
 organization_id uuid not null references public.organizations(id), evenement text not null, cree_le timestamptz not null default now()
);
alter table public.factures_automatiques_evenements enable row level security;
revoke all on public.factures_automatiques_evenements from public,anon,authenticated;
grant select on public.factures_automatiques_evenements to service_role;
create function public.prendre_facture_automatique(p_jeton uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.factures_automatiques;
begin
 if p_jeton is null then raise exception 'Jeton requis'; end if;
 -- Sérialise seulement la réservation, jamais le calcul/PDF. Équité entre organisations.
 perform pg_advisory_xact_lock(92026,1);
 update public.factures_automatiques set etat='a_verifier',dernier_resultat='reprises_epuisees',updated_at=now()
 where actif and tentatives>=8 and etat in ('a_traiter','releves_attendus') and (verrou_jusqua is null or verrou_jusqua<now());
 select f.* into j from public.factures_automatiques f
 where f.actif and f.etat in ('a_traiter','releves_attendus') and f.disponible_le<=now()
 and (f.verrou_jusqua is null or f.verrou_jusqua<now()) and f.tentatives<8
 order by (select max(x.prise_le) from public.factures_automatiques x where x.organization_id=f.organization_id) nulls first,
 f.disponible_le,f.id limit 1 for update of f skip locked;
 if not found then return null; end if;
 update public.factures_automatiques set jeton=p_jeton,verrou_jusqua=now()+interval '3 minutes',prise_le=now(),
 tentatives=tentatives+1,revision_prise=revision where id=j.id;
 insert into public.factures_automatiques_evenements(facture_id,organization_id,evenement) values(j.id,j.organization_id,'reservee');
 return jsonb_build_object('id',j.id,'organization_id',j.organization_id);
end $$;
-- Fencing : un ancien processus ne peut plus valider/partager après une reprise.
alter function public.geste_facture_automatique(uuid,text,jsonb) rename to geste_facture_automatique_metier;
revoke all on function public.geste_facture_automatique_metier(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.geste_facture_automatique(p_facture uuid,p_geste text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.factures_automatiques where id=p_facture and jeton=(p_args->>'_jeton')::uuid and verrou_jusqua>now() for update;
 if not found then raise exception 'Réservation expirée ou absente'; end if;
 return public.geste_facture_automatique_metier(p_facture,p_geste,p_args-'_jeton');
end $$;
create function public.finir_facture_automatique(p_facture uuid,p_jeton uuid,p_resultat text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.factures_automatiques;
begin
 select * into j from public.factures_automatiques where id=p_facture and jeton=p_jeton and verrou_jusqua>now() for update;
 if not found then return false; end if;
 if p_resultat not in ('terminee','releves_attendus','a_verifier','reprise') then raise exception 'Résultat invalide'; end if;
 update public.factures_automatiques set jeton=null,verrou_jusqua=null,dernier_resultat=p_resultat,
 etat=case when revision<>revision_prise then 'a_traiter' when p_resultat='reprise' and tentatives<8 then 'a_traiter' when p_resultat='reprise' then 'a_verifier' else p_resultat end,
 disponible_le=case when revision<>revision_prise then now() when p_resultat='releves_attendus' then now()+interval '15 minutes'
 when p_resultat='reprise' then now()+make_interval(secs=>least(1800,30*power(2,tentatives-1)::int)) else now() end,
 tentatives=case when p_resultat in ('terminee','releves_attendus') or revision<>revision_prise then 0 else tentatives end,
 updated_at=now() where id=j.id;
 insert into public.factures_automatiques_evenements(facture_id,organization_id,evenement) values(j.id,j.organization_id,p_resultat);
 return true;
end $$;
create function public.reveiller_factures_informations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Réveil ciblé au bien pour les relevés ; aucune notification externe ici.
 update public.factures_automatiques a set disponible_le=now(),revision=revision+1,tentatives=0,
 etat=case when verrou_jusqua>now() then etat else 'a_traiter' end
 from public.factures_fourniture f join public.contrats_fourniture c on c.id=f.contrat_id
 where a.id=f.id and a.organization_id=new.organization_id and a.actif and a.etat<>'terminee'
 and (tg_table_name<>'factures_fourniture' or a.id=new.id)
 and (tg_table_name<>'releves_consommation' or exists(select 1 from public.compteurs_consommation m where m.id=(to_jsonb(new)->>'compteur_id')::uuid and m.bien_id=c.bien_id));
 return new;
end $$;
create trigger factures_reveil_releves after insert or update on public.releves_consommation for each row execute function public.reveiller_factures_informations();
create trigger factures_reveil_facture after update on public.factures_fourniture for each row execute function public.reveiller_factures_informations();
create trigger factures_reveil_bail after update on public.baux for each row execute function public.reveiller_factures_informations();
create trigger factures_reveil_compteur after insert or update on public.compteurs_consommation for each row execute function public.reveiller_factures_informations();
create function public.reinitialiser_disponibilite_facture() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.actif and (not old.actif or new.autorise_par<>old.autorise_par or (new.etat='a_traiter' and old.etat='a_verifier')) then
  new.disponible_le:=now();new.tentatives:=0;new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create trigger factures_reactivation before update on public.factures_automatiques for each row execute function public.reinitialiser_disponibilite_facture();
revoke all on function public.reinitialiser_disponibilite_facture() from public,anon,authenticated;
revoke all on function public.prendre_facture_automatique(uuid),public.finir_facture_automatique(uuid,uuid,text),public.geste_facture_automatique(uuid,text,jsonb),public.reveiller_factures_informations() from public,anon,authenticated;
grant execute on function public.prendre_facture_automatique(uuid),public.finir_facture_automatique(uuid,uuid,text),public.geste_facture_automatique(uuid,text,jsonb) to service_role;
commit;
