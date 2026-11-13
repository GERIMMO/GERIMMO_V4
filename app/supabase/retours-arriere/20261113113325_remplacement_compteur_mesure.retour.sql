-- Retour isolé. Dès le premier remplacement, conserver le schéma et corriger en avant.
do $retour$
declare definition text;
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
 if to_regclass('public.remplacements_compteur') is null then return; end if;
 definition := pg_get_functiondef('consommations_interne.preparer_repartition(uuid,jsonb,text,text,jsonb)'::regprocedure);
 lock table public.remplacements_compteur in access exclusive mode nowait;
 if exists(select from public.remplacements_compteur) then
   raise exception 'Un historique de remplacement existe. Conserver les relevés et corriger en avant.';
 end if;
 if strpos(definition,nouveau)=0 then raise exception 'Version du calcul inattendue. Correction en avant nécessaire.'; end if;
 execute replace(definition,nouveau,ancien);
 definition := pg_get_functiondef('consommations_interne.verifier_compteurs_principaux()'::regprocedure);
 if strpos(definition,$debut$   select (v->>'compteur_id')::uuid id, min(coalesce((v->>'periode_debut')::date,debut)) premier, max(coalesce((v->>'periode_fin')::date,fin)) dernier from jsonb_array_elements(new.lignes) v group by 1
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=x.premier then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=x.premier
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=x.dernier
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$debut$)=0 then raise exception 'Version du contrôle des compteurs principaux inattendue'; end if;
 execute replace(definition,$debut$   select (v->>'compteur_id')::uuid id, min(coalesce((v->>'periode_debut')::date,debut)) premier, max(coalesce((v->>'periode_fin')::date,fin)) dernier from jsonb_array_elements(new.lignes) v group by 1
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=x.premier then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=x.premier
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=x.dernier
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$debut$,$fin$   select distinct (v->>'compteur_id')::uuid id from jsonb_array_elements(new.lignes) v
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=debut then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=debut
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=fin
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
$fin$);

 drop trigger garder_compteur_remplace on public.compteurs_consommation;
 drop function consommations_interne.garder_compteur_remplace();
 drop function public.remplacer_compteur(uuid,uuid,date,numeric,numeric,text);
 drop function consommations_interne.remplacer_compteur(uuid,uuid,date,numeric,numeric,text);
 drop table public.remplacements_compteur;
 delete from supabase_migrations.schema_migrations where version='20261113113325';
end $retour$;
notify pgrst, 'reload schema';
