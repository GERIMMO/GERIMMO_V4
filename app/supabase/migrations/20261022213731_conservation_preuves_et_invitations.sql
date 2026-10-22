-- 22/10 : fin des purges hors catalogue ; aucune suppression pendant la migration.
-- Les nouvelles catégories restent désactivées jusqu'à la revue du bilan local.
-- Les durées sont une politique de service, pas une certification juridique.
insert into public.retention_rules(data_type,libelle,finalite,declencheur,duree_mois,sort,actif) values
 ('contact:devis','Demandes de devis du site','Suivi de la demande commerciale','Dernier traitement ou dépôt',24,'suppression',true),
 ('contact:attente','Liste d’attente propriétaires','Prévenir de l’ouverture','Inscription',36,'suppression',false),
 ('contact:attente_agences','Liste d’attente agences','Prévenir de l’ouverture','Dernier échange ou inscription',36,'suppression',false),
 ('invitation:locataire','Invitations locataires non acceptées','Suivi de l’invitation','Expiration ou refus/annulation',3,'suppression',false),
 ('invitation:artisan','Invitations artisans non acceptées','Suivi de l’invitation','Expiration ou refus/annulation',3,'suppression',false),
 ('contrat:intention_conge','Intentions de congé traitées','Suivi de la demande de congé','Traitement',24,'suppression',true)
on conflict(data_type) do nothing;

-- Toutes les pièces d'un même circuit restent solidaires : original, signé,
-- annexes et certificats. Aucun repli sur la date de dépôt d'un certificat « autre ».
-- Leur effacement exige une décision de dossier (fin effective, comptes clos,
-- contentieux, obligations comptables), jamais le seul âge de la demande.
create or replace function public.document_preuve_signature(p_document uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bail_signature_circuits c
   where c.document_id=p_document or c.document_signe=p_document
     or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(c.signataires)='array' then c.signataires else '[]'::jsonb end) s
       where s->>'preuveDocumentId'=p_document::text)
     or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(c.annexes)='array' then c.annexes else '[]'::jsonb end) a
       where a->>'id'=p_document::text))
 or exists(select 1 from public.demandes_signature s
   where s.document_id=p_document or s.document_retour_id=p_document or s.preuve_document_id=p_document);
$$;
revoke all on function public.document_preuve_signature(uuid) from public,anon,authenticated;
grant execute on function public.document_preuve_signature(uuid) to service_role;

-- La sélection et le nettoyage réutilisent exactement les mêmes conditions.
-- Le bilan reste possible pour les règles désactivées, sans les réactiver.
create or replace function public.cibles_conservation_contacts()
returns table(categorie text,id uuid) language sql stable security definer set search_path='' as $$
 select 'contact:devis', d.id from public.demandes_devis d
 where greatest(d.created_at,d.traitee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:devis' and sort='suppression'))
 union all
 select 'contact:attente', d.id from public.liste_attente d
 where d.created_at < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente' and sort='suppression'))
 union all
 select 'contact:attente_agences', d.id from public.liste_attente_agences d
 where greatest(d.created_at,d.contactee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente_agences' and sort='suppression'))
 union all
 select 'invitation:locataire', d.id from public.invitations_locataires d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and sort='suppression'))
 union all
 select 'invitation:artisan', d.id from public.invitations_artisans d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and sort='suppression'));
$$;
revoke all on function public.cibles_conservation_contacts() from public,anon,authenticated;
grant execute on function public.cibles_conservation_contacts() to service_role;

create or replace function public.purger_contacts_echus()
returns jsonb language plpgsql security definer set search_path='' as $$
declare n bigint; resultat jsonb:='{}';
begin
 if auth.uid() is not null and not public.is_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not public.tache_planifiee_autorisee('retention-quotidienne') then return '{}'::jsonb; end if;
 delete from public.demandes_devis where greatest(created_at,traitee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:devis' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:devis');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('demandes_devis',n);
 delete from public.liste_attente where id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente',n);
 delete from public.liste_attente_agences where greatest(created_at,contactee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente_agences' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente_agences');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente_agences',n);
 delete from public.invitations_locataires where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:locataire');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('invitations_locataires',n);
 delete from public.invitations_artisans where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:artisan');
 get diagnostics n=row_count; return resultat||jsonb_build_object('invitations_artisans',n);
end $$;
revoke all on function public.purger_contacts_echus() from public,anon,authenticated;
grant execute on function public.purger_contacts_echus() to service_role;

create or replace function public.simuler_conservation_contacts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 return jsonb_build_object('categories',(select coalesce(jsonb_agg(x order by x.categorie),'[]'::jsonb) from (
   select r.data_type categorie,r.libelle,r.duree_mois,r.actif,count(c.id) echus from public.retention_rules r
   left join public.cibles_conservation_contacts() c on c.categorie=r.data_type
   where r.data_type in ('contact:devis','contact:attente','contact:attente_agences','invitation:locataire','invitation:artisan')
   group by r.data_type,r.libelle,r.duree_mois,r.actif) x),
   'preuves_protegees',(select count(*) from public.documents d where d.purged_at is null and public.document_preuve_signature(d.id)),
   'suppressions',0);
end $$;
revoke all on function public.simuler_conservation_contacts() from public,anon;
grant execute on function public.simuler_conservation_contacts() to authenticated;

-- Remplacements bornés : préserver toutes les protections/relances ajoutées
-- aux migrations précédentes, s'arrêter sur une définition inconnue.
do $patch$
declare f text; ancien text; nouveau text;
begin
 select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into f;
 if strpos(f,'CONSERVATION_20261022')>0 then return; end if;
 ancien:=$a$delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);$a$;
 nouveau:=$n$-- CONSERVATION_20261022 : catégories explicites, désactivation respectée.
  v_journaux := v_journaux || public.purger_contacts_echus();$n$;
 if (length(f)-length(replace(f,ancien,'')))/length(ancien)<>1 then raise exception 'Conservation : bloc devis inattendu'; end if;
 f:=replace(f,ancien,nouveau);
 ancien:=$a$and traitee_le < now() - make_interval(months => 24);$a$;
 nouveau:=$n$and traitee_le < now() - make_interval(months => (select duree_mois from public.retention_rules where data_type='contrat:intention_conge' and actif and sort='suppression'));$n$;
 if (length(f)-length(replace(f,ancien,'')))/length(ancien)<>1 then raise exception 'Conservation : bloc congé inattendu'; end if;
 f:=replace(f,ancien,nouveau);
 ancien:=$a$delete from public.demandes_signature ds
    where exists (select 1 from public.documents d
                  where d.id = ds.document_id and d.purged_at is not null
                    and d.anonymise_le is null)
       or (ds.signee_le is not null
           and ds.signee_le < now() - make_interval(months => 24));
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', v_count);$a$;
 nouveau:=$n$-- Une preuve de signature suit le contrat ; aucun effacement automatique à 24 mois.
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', 0);$n$;
 if (length(f)-length(replace(f,ancien,'')))/length(ancien)<>1 then raise exception 'Conservation : bloc signature inattendu'; end if;
 f:=replace(f,ancien,nouveau);
 ancien:=$a$where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')$a$;
 nouveau:=$n$where d.purged_at is null
      and not public.document_preuve_signature(d.id)
      and r.sort in ('suppression', 'anonymisation')$n$;
 if (length(f)-length(replace(f,ancien,'')))/length(ancien)<>1 then raise exception 'Conservation : sélection documentaire inattendue'; end if;
 execute replace(f,ancien,nouveau);
end $patch$;
