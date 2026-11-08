-- Retour avant utilisation uniquement. Aucune donnée métier ne peut être supprimée.
do $retour$
begin
 if to_regclass('public.factures_fourniture') is null then return; end if;
 if to_regclass('public.factures_demandes_releves') is not null then
 lock table public.factures_demandes_releves in access exclusive mode;
 if exists(select 1 from public.factures_demandes_releves) then raise exception 'Retour refusé : des données de factures_demandes_releves sont conservées. Corriger en avant.'; end if;
 end if;
 drop function if exists public.releves_a_rappeler(uuid);
 drop table if exists public.factures_demandes_releves;
 alter table public.factures_fourniture drop constraint if exists factures_fourniture_id_org_unique;
 execute $restaurer$create or replace function consommations_interne.demander_index_facture(p_org uuid,p_facture uuid,p_compteur uuid,p_jour date)
returns void language plpgsql security definer set search_path='' as $$
declare m public.compteurs_consommation; f public.factures_fourniture; c public.contrats_fourniture;
begin
 select * into m from public.compteurs_consommation where id=p_compteur and organization_id=p_org for update;
 if m.id is null or not consommations_interne.gerant(p_org,m.bien_id,m.lot_id) or not public.org_ecriture_ouverte(p_org) then raise exception 'Accès refusé'; end if;
 select * into f from public.factures_fourniture where organization_id=p_org and id=p_facture;
 select * into c from public.contrats_fourniture where organization_id=p_org and id=f.contrat_id;
 if c.id is null or c.bien_id<>m.bien_id or (c.lot_id is not null and c.lot_id is distinct from m.lot_id)
 or not (c.categorie='eau' and m.type in ('eau_froide','eau_chaude') or c.categorie='electricite_commune' and m.type='electricite' or c.categorie=m.type)
 or p_jour is null or p_jour not in (f.periode_debut,f.periode_fin) or p_jour>public.aujourdhui_paris()
 then raise exception 'Vérifiez le compteur et la période de la facture'; end if;
 if not m.actif or m.lot_id is null or not exists(
 select 1 from public.baux b join public.persons p on p.id=m.personne_referente and p.organization_id=p_org
 join public.memberships a on a.account_id=p.account_id and a.organization_id=p_org and a.role='locataire' and a.status='active'
 where b.id=m.bail_referent and b.organization_id=p_org and b.lot_id=m.lot_id and b.etat in ('actif','preavis')
 and p_jour between b.date_debut and coalesce(b.date_fin,'infinity'::date)
 and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire' and bp.date_depart is null)))
 then raise exception 'Aucun locataire autorisé pour ce relevé'; end if;
 if p_jour<=m.date_index_initial or exists(select 1 from public.releves_consommation where compteur_id=m.id and date_releve>=p_jour)
 then raise exception 'Pour un index historique, saisissez le relevé justifié depuis la fiche du compteur'; end if;
 if exists(select 1 from public.demandes_releves where compteur_id=m.id and echeance=p_jour and bail_id=m.bail_referent and personne_id=m.personne_referente and statut='attendue') then return; end if;
 if exists(select 1 from public.demandes_releves where compteur_id=m.id and (statut='attendue' or echeance=p_jour)) then raise exception 'Une demande existe déjà pour ce compteur. Vérifiez son suivi'; end if;
 insert into public.demandes_releves(organization_id,compteur_id,bail_id,personne_id,echeance)
 values(p_org,m.id,m.bail_referent,m.personne_referente,p_jour);
end $$;
$restaurer$;
 delete from supabase_migrations.schema_migrations where version='20261108090000';
end $retour$;
