-- Un remplacement est déclaré explicitement. Aucun rapprochement historique par nom ou numéro.
create table public.remplacements_compteur (
  ancien_id uuid primary key references public.compteurs_consommation(id),
  nouveau_id uuid not null unique references public.compteurs_consommation(id),
  date_pose date not null,
  check (ancien_id <> nouveau_id)
);
alter table public.remplacements_compteur enable row level security;
revoke all on public.remplacements_compteur from public, anon, authenticated;
grant select on public.remplacements_compteur to authenticated;
create policy remplacement_visible on public.remplacements_compteur for select to authenticated
using (exists (select 1 from public.compteurs_consommation m where m.id = ancien_id));

create function consommations_interne.remplacer_compteur(p_org uuid, p_ancien uuid, p_date date, p_fin numeric, p_debut numeric, p_numero text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  m public.compteurs_consommation;
  nouveau uuid;
begin
  select * into m from public.compteurs_consommation where id=p_ancien and organization_id=p_org for update;
  if not found or not consommations_interne.gerant(m.organization_id,m.bien_id,m.lot_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if p_date is null or p_date <= m.date_index_initial or p_date > public.aujourdhui_paris()
      or nullif(trim(p_numero),'') is null or length(trim(p_numero))>120 or p_debut is null
      or p_debut < 0 or p_debut >= 1000000000000 or p_debut <> round(p_debut,3) then
    raise exception 'Vérifiez la date, le numéro et l’index du nouveau compteur';
  end if;
  select r.nouveau_id into nouveau from public.remplacements_compteur r
    join public.compteurs_consommation n on n.id=r.nouveau_id
    join public.releves_consommation l on l.compteur_id=r.ancien_id and l.date_releve=r.date_pose
    where r.ancien_id=m.id and r.date_pose=p_date and n.numero=trim(p_numero) and n.index_initial=p_debut and l.index_releve=p_fin;
  if found then return nouveau; end if;
  if not m.actif or exists(select 1 from public.remplacements_compteur where ancien_id=m.id)
     or exists(select 1 from public.releves_consommation where compteur_id=m.id and date_releve>p_date) then
    raise exception 'Ce compteur a été arrêté, remplacé ou relevé après la date indiquée';
  end if;
  if m.lot_id is null and exists(select 1 from public.compteurs_consommation where compteur_principal_id=m.id) then
    raise exception 'Ce compteur principal a des divisionnaires : vérifiez leur rattachement historique avant son remplacement';
  end if;
  perform public.enregistrer_releve_compteur(p_org,m.id,p_fin,p_date);
  update public.compteurs_consommation set actif=false where id=m.id;
  update public.demandes_releves set statut='annulee' where compteur_id=m.id and statut='attendue';
  insert into public.compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,numero,emplacement,index_initial,date_index_initial,periodicite_mois,prochaine_demande,compteur_principal_id)
    values(p_org,m.bien_id,m.lot_id,m.type,m.unite,m.libelle,trim(p_numero),m.emplacement,p_debut,p_date,m.periodicite_mois,
      greatest(m.prochaine_demande,(p_date+make_interval(months=>m.periodicite_mois))::date),m.compteur_principal_id)
    returning id into nouveau;
  insert into public.remplacements_compteur values(m.id,nouveau,p_date);
  return nouveau;
end $$;
revoke all on function consommations_interne.remplacer_compteur(uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function consommations_interne.remplacer_compteur(uuid,uuid,date,numeric,numeric,text) to authenticated;
create function public.remplacer_compteur(p_org uuid,p_ancien uuid,p_date date,p_fin numeric,p_debut numeric,p_numero text)
returns uuid language sql security invoker set search_path='' as $$
 select consommations_interne.remplacer_compteur(p_org,p_ancien,p_date,p_fin,p_debut,p_numero);
$$;
revoke all on function public.remplacer_compteur(uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.remplacer_compteur(uuid,uuid,date,numeric,numeric,text) to authenticated;

-- Préserver les contrôles de bail, de montant et les évolutions précédentes de la fonction.
do $migration$
declare definition text := pg_get_functiondef('consommations_interne.preparer_repartition(uuid,jsonb,text,text,jsonb)'::regprocedure);
ancien text := $avant$  if exists(with segments as (
   select distinct x.compteur_id,coalesce(x.periode_debut,f.periode_debut) as debut,coalesce(x.periode_fin,f.periode_fin) as fin
   from jsonb_to_recordset(p_parts) as x(compteur_id uuid,periode_debut date,periode_fin date)
  ), suite as (select *,lag(fin) over(partition by compteur_id order by debut,fin) as fin_precedente from segments)
  select 1 from suite group by compteur_id having min(debut)<>f.periode_debut or max(fin)<>f.periode_fin or bool_or(fin_precedente is not null and fin_precedente<>debut)) then raise exception 'Les segments doivent couvrir exactement la facture, sans chevauchement ni période manquante'; end if;
$avant$;
nouveau text := $apres$  if exists(with segments as (
    select distinct x.lot_id,x.compteur_id,coalesce(x.periode_debut,f.periode_debut) debut,coalesce(x.periode_fin,f.periode_fin) fin
    from jsonb_to_recordset(p_parts) as x(lot_id uuid,compteur_id uuid,periode_debut date,periode_fin date)
  ), suite as (
    select *,lag(fin) over w fin_precedente,lag(compteur_id) over w precedent from segments
    window w as (partition by lot_id order by debut,fin,compteur_id)
  ) select 1 from suite s group by lot_id having min(debut)<>f.periode_debut or max(fin)<>f.periode_fin
    or bool_or(fin_precedente is not null and fin_precedente<>debut)
    or bool_or(precedent is not null and precedent<>compteur_id and not exists(
      select 1 from public.remplacements_compteur r where r.ancien_id=s.precedent and r.nouveau_id=s.compteur_id and r.date_pose=s.debut))
    or bool_or(exists(select 1 from public.remplacements_compteur r where (r.ancien_id=s.compteur_id and s.fin>r.date_pose) or (r.nouveau_id=s.compteur_id and s.debut<r.date_pose)))
  ) then raise exception 'Les relevés doivent couvrir toute la période avec des remplacements de compteur enregistrés'; end if;
$apres$;
begin
 if strpos(definition,ancien)=0 then raise exception 'Version de calcul de départ inattendue'; end if;
 execute replace(definition,ancien,nouveau);
 definition := pg_get_functiondef('consommations_interne.verifier_compteurs_principaux()'::regprocedure);
 if strpos(definition,$debut$   select distinct (v->>'compteur_id')::uuid id from jsonb_array_elements(new.lignes) v
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=debut then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=debut
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=fin
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$debut$)=0 then raise exception 'Version du contrôle des compteurs principaux inattendue'; end if;
 execute replace(definition,$debut$   select distinct (v->>'compteur_id')::uuid id from jsonb_array_elements(new.lignes) v
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=debut then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=debut
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=fin
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$debut$,$fin$   select (v->>'compteur_id')::uuid id, min(coalesce((v->>'periode_debut')::date,debut)) premier, max(coalesce((v->>'periode_fin')::date,fin)) dernier from jsonb_array_elements(new.lignes) v group by 1
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=x.premier then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=x.premier
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=x.dernier
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$fin$);

end $migration$;

-- Un réglage ultérieur ne peut ni réactiver l'ancien compteur ni déplacer une frontière déjà documentée.
create function consommations_interne.garder_compteur_remplace()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.remplacements_compteur r where r.ancien_id=old.id or r.nouveau_id=old.id) and
    ((new.organization_id,new.bien_id,new.lot_id,new.type,new.unite,new.date_index_initial,new.index_initial,new.compteur_principal_id)
      is distinct from (old.organization_id,old.bien_id,old.lot_id,old.type,old.unite,old.date_index_initial,old.index_initial,old.compteur_principal_id)
      or (new.actif and not old.actif and exists(select 1 from public.remplacements_compteur where ancien_id=old.id))) then
    raise exception 'Ce compteur est lié à un remplacement enregistré. Son historique doit être conservé.';
  end if;
  return new;
end $$;
revoke all on function consommations_interne.garder_compteur_remplace() from public, anon, authenticated;
create trigger garder_compteur_remplace before update on public.compteurs_consommation for each row execute function consommations_interne.garder_compteur_remplace();
notify pgrst, 'reload schema';
