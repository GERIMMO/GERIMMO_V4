alter table public.factures_fourniture add constraint factures_fourniture_id_org_unique unique(id,organization_id);
-- Relie la collecte existante aux factures, sans dupliquer les index ni les demandes.
create table public.factures_demandes_releves (
 id uuid not null default gen_random_uuid() unique,
 organization_id uuid not null references public.organizations(id),
 facture_id uuid not null, demande_id uuid not null,
 primary key(facture_id,demande_id),
 foreign key(facture_id,organization_id) references public.factures_fourniture(id,organization_id),
 foreign key(demande_id,organization_id) references public.demandes_releves(id,organization_id)
);
create index factures_demandes_releves_org on public.factures_demandes_releves(organization_id);
create index factures_demandes_releves_demande on public.factures_demandes_releves(demande_id,organization_id);
alter table public.factures_demandes_releves enable row level security;
revoke all on public.factures_demandes_releves from anon,authenticated;
grant select on public.factures_demandes_releves to authenticated;
create policy gestionnaire_facture on public.factures_demandes_releves for select to authenticated using (
 exists(select 1 from public.factures_fourniture f join public.contrats_fourniture c on c.id=f.contrat_id and c.organization_id=f.organization_id
 where f.id=facture_id and f.organization_id=factures_demandes_releves.organization_id
 and consommations_interne.gerant(f.organization_id,c.bien_id,c.lot_id))
);
create or replace function consommations_interne.demander_index_facture(p_org uuid,p_facture uuid,p_compteur uuid,p_jour date)
returns void language plpgsql security definer set search_path='' as $$
declare m public.compteurs_consommation; f public.factures_fourniture; c public.contrats_fourniture; v_bail uuid; v_personne uuid; v_nombre integer; v_demande uuid;
begin
 select * into m from public.compteurs_consommation where id=p_compteur and organization_id=p_org for update;
 if m.id is null or not consommations_interne.gerant(p_org,m.bien_id,m.lot_id) or not public.org_ecriture_ouverte(p_org) then raise exception 'Accès refusé'; end if;
 select * into f from public.factures_fourniture where organization_id=p_org and id=p_facture;
 select * into c from public.contrats_fourniture where organization_id=p_org and id=f.contrat_id;
 if c.id is null or c.bien_id<>m.bien_id or (c.lot_id is not null and c.lot_id is distinct from m.lot_id)
 or not (c.categorie='eau' and m.type in ('eau_froide','eau_chaude') or c.categorie='electricite_commune' and m.type='electricite' or c.categorie=m.type)
 or p_jour is null or p_jour not in (f.periode_debut,f.periode_fin) or p_jour>public.aujourdhui_paris()
 then raise exception 'Vérifiez le compteur et la période de la facture'; end if;
 -- Réutiliser le destinataire configuré ; sinon proposer le seul bail occupé autorisé.
 if m.bail_referent is null and m.personne_referente is null then
  select count(*),min(b.id::text)::uuid,min(p.id::text)::uuid into v_nombre,v_bail,v_personne
  from public.baux b join public.persons p on p.id=b.locataire_principal and p.organization_id=p_org
  join public.memberships a on a.account_id=p.account_id and a.organization_id=p_org and a.role='locataire' and a.status='active'
  where b.organization_id=p_org and b.lot_id=m.lot_id and b.etat in ('actif','preavis')
  and p_jour between b.date_debut and coalesce(b.date_fin,'infinity'::date);
  if v_nombre<>1 then raise exception 'Choisissez le locataire responsable du compteur : aucun destinataire unique avec un accès actif'; end if;
  update public.compteurs_consommation set bail_referent=v_bail,personne_referente=v_personne where id=m.id;
  m.bail_referent:=v_bail; m.personne_referente:=v_personne;
 end if;
 if not m.actif or m.lot_id is null or not exists(
 select 1 from public.baux b join public.persons p on p.id=m.personne_referente and p.organization_id=p_org
 join public.memberships a on a.account_id=p.account_id and a.organization_id=p_org and a.role='locataire' and a.status='active'
 where b.id=m.bail_referent and b.organization_id=p_org and b.lot_id=m.lot_id and b.etat in ('actif','preavis')
 and p_jour between b.date_debut and coalesce(b.date_fin,'infinity'::date)
 and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire' and bp.date_depart is null)))
 then raise exception 'Aucun locataire autorisé pour ce relevé'; end if;
 if p_jour<=m.date_index_initial or exists(select 1 from public.releves_consommation where compteur_id=m.id and date_releve>=p_jour)
 then raise exception 'Pour un index historique, saisissez le relevé justifié depuis la fiche du compteur'; end if;
 select id into v_demande from public.demandes_releves where compteur_id=m.id and echeance=p_jour and bail_id=m.bail_referent and personne_id=m.personne_referente and statut='attendue';
 if v_demande is null then
  if exists(select 1 from public.demandes_releves where compteur_id=m.id and (statut='attendue' or echeance=p_jour)) then raise exception 'Une demande existe déjà pour ce compteur. Vérifiez son suivi'; end if;
  insert into public.demandes_releves(organization_id,compteur_id,bail_id,personne_id,echeance)
  values(p_org,m.id,m.bail_referent,m.personne_referente,p_jour) returning id into v_demande;
 end if;
 insert into public.factures_demandes_releves(organization_id,facture_id,demande_id)
 values(p_org,p_facture,v_demande) on conflict do nothing;
end $$;
notify pgrst,'reload schema';
-- Lecture réservée au planificateur. Aucun destinataire sorti du logement ni membre inactif.
create function public.releves_a_rappeler(p_demande uuid default null)
returns table(id uuid,organization_id uuid,personne_id uuid,created_at timestamptz,libelle text)
language sql stable security definer set search_path='' as $$
 select d.id,d.organization_id,d.personne_id,d.created_at,c.libelle
 from public.demandes_releves d
 join public.compteurs_consommation c on c.id=d.compteur_id and c.organization_id=d.organization_id
 join public.baux b on b.id=d.bail_id and b.organization_id=d.organization_id
 join public.persons p on p.id=d.personne_id and p.organization_id=d.organization_id and p.archived_at is null
 join public.memberships m on m.account_id=p.account_id and m.organization_id=d.organization_id and m.role='locataire' and m.status='active'
 where (p_demande is null or d.id=p_demande) and d.statut='attendue'
 and exists(select 1 from public.factures_demandes_releves fd where fd.demande_id=d.id and fd.organization_id=d.organization_id) and c.actif
 and c.bail_referent=b.id and c.personne_referente=p.id
 and b.etat in ('actif','preavis') and public.aujourdhui_paris() between b.date_debut and coalesce(b.date_fin,'infinity'::date)
 and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire' and bp.date_depart is null))
 order by d.created_at desc limit 500;
$$;
revoke all on function public.releves_a_rappeler(uuid) from public,anon,authenticated;
grant execute on function public.releves_a_rappeler(uuid) to service_role;
notify pgrst,'reload schema';
