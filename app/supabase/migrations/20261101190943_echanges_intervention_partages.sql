-- Discussion privée attachée à une intervention, autorisée par ses participants réels.
create function public.role_echange_intervention(p_intervention uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare m public.incident_interventions; i public.incidents;
begin
 if auth.uid() is null then return null; end if;
 select * into m from public.incident_interventions where id=p_intervention;
 if not found then return null; end if;
 select * into i from public.incidents where id=m.incident_id and organization_id=m.organization_id;
 if m.organization_id in (select public.org_ids_avec_roles(array['admin_agence','proprietaire_direct','agent']::public.membership_role[])) and not public.lot_hors_portefeuille(m.organization_id,i.lot_id) then return 'gerant'; end if;
 if m.artisan_id=public.mon_artisan_id() and m.statut::text in ('acceptee','planifiee','en_cours') then return 'artisan'; end if;
 if exists(select 1 from public.baux b join public.persons p on p.organization_id=b.organization_id and p.account_id=auth.uid()
   where b.id=i.bail_id and b.organization_id=m.organization_id and b.etat::text in ('actif','preavis')
   and p.organization_id in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))
   and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.organization_id=b.organization_id and bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire' and (bp.date_depart is null or bp.date_depart>=public.aujourdhui_paris())))) then return 'locataire'; end if;
 return null;
end $$;
revoke all on function public.role_echange_intervention(uuid) from public,anon;
grant execute on function public.role_echange_intervention(uuid) to authenticated;

create table public.intervention_echanges_etat(
 intervention_id uuid primary key references public.incident_interventions(id),
 fermee_le timestamptz, modifie_par uuid references public.accounts(id), modifie_le timestamptz not null default now()
);
create table public.intervention_messages(
 id uuid primary key default gen_random_uuid(), intervention_id uuid not null references public.incident_interventions(id),
 auteur_id uuid not null references public.accounts(id), auteur_role text not null check(auteur_role in('gerant','artisan','locataire')),
 texte text not null check(length(btrim(texte)) between 1 and 4000), commande uuid not null,
 cree_le timestamptz not null default now(), unique(intervention_id,commande)
);
create index intervention_messages_lecture on public.intervention_messages(intervention_id,cree_le,id);
alter table public.intervention_echanges_etat enable row level security;
alter table public.intervention_messages enable row level security;
revoke all on public.intervention_echanges_etat,public.intervention_messages from public,anon,authenticated;
grant select on public.intervention_echanges_etat,public.intervention_messages to authenticated;
create policy echanges_etat_lecture on public.intervention_echanges_etat for select to authenticated using(public.role_echange_intervention(intervention_id) is not null);
create policy echanges_messages_lecture on public.intervention_messages for select to authenticated using(public.role_echange_intervention(intervention_id) is not null);

create function public.envoyer_message_intervention(p_intervention uuid,p_texte text,p_commande uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r text; m public.incident_interventions; deja public.intervention_messages; ident uuid;
begin
 select * into m from public.incident_interventions where id=p_intervention for update;
 r:=public.role_echange_intervention(p_intervention);
 if public.est_traversee_organisation(m.organization_id) then raise exception 'Consultation uniquement.'; end if;
 if r is null then raise exception 'Cette discussion n’est pas accessible.'; end if;
 if p_commande is null or length(btrim(coalesce(p_texte,''))) not between 1 and 4000 then raise exception 'Écrivez un message de 1 à 4 000 caractères.'; end if;
 select * into deja from public.intervention_messages where intervention_id=p_intervention and commande=p_commande;
 if found then
  if deja.auteur_id<>auth.uid() or deja.texte<>btrim(p_texte) then raise exception 'Cette commande a déjà été utilisée.'; end if;
  return deja.id;
 end if;
 if m.statut::text not in ('acceptee','planifiee','en_cours') or exists(select 1 from public.intervention_echanges_etat where intervention_id=p_intervention and fermee_le is not null) then raise exception 'Cette discussion est fermée.'; end if;
 insert into public.intervention_messages(intervention_id,auteur_id,auteur_role,texte,commande) values(p_intervention,auth.uid(),r,btrim(p_texte),p_commande) returning id into ident;
 return ident;
end $$;
revoke all on function public.envoyer_message_intervention(uuid,text,uuid) from public,anon;
grant execute on function public.envoyer_message_intervention(uuid,text,uuid) to authenticated;

create function public.fermer_echange_intervention(p_intervention uuid,p_fermer boolean) returns void
language plpgsql security definer set search_path='' as $$
declare m public.incident_interventions;
begin
 select * into m from public.incident_interventions where id=p_intervention for update;
 if public.est_traversee_organisation(m.organization_id) then raise exception 'Consultation uniquement.'; end if;
 if public.role_echange_intervention(p_intervention) is distinct from 'gerant' then raise exception 'Seul le gestionnaire peut fermer ou rouvrir cette discussion.'; end if;
 if p_fermer is null then raise exception 'Choisissez l’action à effectuer.'; end if;
 if not p_fermer and m.statut::text not in('acceptee','planifiee','en_cours') then raise exception 'Cette intervention n’est plus en cours.'; end if;
 insert into public.intervention_echanges_etat(intervention_id,fermee_le,modifie_par) values(p_intervention,case when p_fermer then now() else null end,auth.uid())
 on conflict(intervention_id) do update set fermee_le=excluded.fermee_le,modifie_par=excluded.modifie_par,modifie_le=now();
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),m.organization_id,'discussion_intervention',jsonb_build_object('intervention_id',p_intervention,'fermee',p_fermer));
end $$;
revoke all on function public.fermer_echange_intervention(uuid,boolean) from public,anon;
grant execute on function public.fermer_echange_intervention(uuid,boolean) to authenticated;

create function public.contexte_echange_intervention(p_intervention uuid) returns table(role_participant text,statut_intervention text)
language sql stable security definer set search_path='' as $$
 select public.role_echange_intervention(m.id),m.statut::text from public.incident_interventions m
 where m.id=p_intervention and public.role_echange_intervention(m.id) is not null;
$$;
revoke all on function public.contexte_echange_intervention(uuid) from public,anon;
grant execute on function public.contexte_echange_intervention(uuid) to authenticated;

-- Rendre les nouvelles fonctions disponibles sans attendre un redémarrage de l’API.
notify pgrst, 'reload schema';
