-- PROP-HYP-02 : une demande complète crée tout ou rien. Les anciennes fiches
-- restent intactes ; aucune déduplication ni reprise de données par supposition.
alter table public.biens add column creation_cle uuid;
alter table public.biens add column creation_requete jsonb;
create unique index biens_creation_cle_unique
 on public.biens(organization_id,created_by,creation_cle) where creation_cle is not null;

create function public.preserve_creation_bien() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.creation_cle is not null and
   (new.creation_cle is distinct from old.creation_cle or new.creation_requete is distinct from old.creation_requete
    or new.created_by is distinct from old.created_by or new.organization_id is distinct from old.organization_id) then
  raise exception 'La référence de création du bien est conservée.';
 end if;
 return new;
end $$;
revoke all on function public.preserve_creation_bien() from public,anon,authenticated;
create trigger preserve_creation_bien before update on public.biens
 for each row execute function public.preserve_creation_bien();

create function public.creer_bien_complet(p_org uuid,p_creation uuid,p_saisie jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_bien uuid; v_lot uuid; v_person uuid; v_role public.membership_role;
 v_org public.organizations; v_requete jsonb; v_lots jsonb; v_suivants jsonb;
 v_item jsonb; v_surface numeric; v_pieces numeric; v_nb integer; v_type public.bien_type;
begin
 if auth.uid() is null or not exists(select 1 from public.org_ids_avec_roles(
   array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o where o=p_org) then
  raise exception 'Accès refusé.' using errcode='42501';
 end if;
 if p_creation is null or p_saisie is null or jsonb_typeof(p_saisie)<>'object' then
  raise exception 'Demande de création invalide.';
 end if;
 -- Même verrou que la garde de capacité existante ; protège aussi la création
 -- éventuelle d'une fiche propriétaire quand deux biens sont saisis ensemble.
 perform pg_advisory_xact_lock(hashtext(p_org::text));
 select id,creation_requete into v_bien,v_requete from public.biens
 where organization_id=p_org and created_by=auth.uid() and creation_cle=p_creation;
 if found then
  select count(*),min(id::text)::uuid into v_nb,v_lot from public.lots where bien_id=v_bien and etat<>'archive';
  return jsonb_build_object('bien_id',v_bien,'lot_unique_id',case when v_nb=1 then v_lot end,
    'rejoue',true,'saisie_differente',v_requete is distinct from p_saisie);
 end if;

 if nullif(btrim(p_saisie->>'nom'),'') is null or nullif(btrim(p_saisie->>'address_line1'),'') is null
  or nullif(btrim(p_saisie->>'postal_code'),'') is null or nullif(btrim(p_saisie->>'city'),'') is null
  or nullif(btrim(p_saisie->>'parties_communes'),'') is null or nullif(btrim(p_saisie->>'acces_tic'),'') is null then
  raise exception 'Complétez les informations obligatoires du bien.';
 end if;
 if (p_saisie->>'annee_construction')::integer not between 1000 and 2100
   or p_saisie->>'annee_construction' is null then raise exception 'Année de construction invalide.'; end if;
 v_type:=(p_saisie->>'type')::public.bien_type;
 if v_type is null then raise exception 'Type de bien obligatoire.'; end if;
 v_lots:=p_saisie->'lots';
 if v_lots is null or jsonb_typeof(v_lots)<>'array' then raise exception 'Liste des lots illisible.'; end if;
 if jsonb_array_length(v_lots)=0 then raise exception 'Au moins un lot est obligatoire.'; end if;
 if v_type in ('appartement','parking') and jsonb_array_length(v_lots)>1 then
  raise exception 'Ce type de bien constitue une seule unité locative.';
 end if;
 for v_item in select value from jsonb_array_elements(v_lots) loop
  if jsonb_typeof(v_item)<>'object' then raise exception 'Lot invalide.'; end if;
  v_surface:=(v_item->>'surface_m2')::numeric; v_pieces:=(v_item->>'pieces')::numeric;
  if v_surface is null or v_surface::text in ('NaN','Infinity','-Infinity') or v_surface<=0
   or v_pieces is null or v_pieces::text in ('NaN','Infinity','-Infinity') or v_pieces<1 or v_pieces<>trunc(v_pieces) then
   raise exception 'Surface et nombre de pièces valides obligatoires pour chaque lot.';
  end if;
 end loop;
 select role into v_role from public.memberships where organization_id=p_org and account_id=auth.uid() and status='active';
 select * into v_org from public.organizations where id=p_org;
 if v_role is null and public.is_super_admin() then
  v_role:=case when v_org.type='proprietaire_direct' then 'proprietaire_direct'::public.membership_role else 'admin_agence'::public.membership_role end;
 end if;
 if v_role='proprietaire_direct' and (nullif(btrim(v_org.address_line1),'') is null
    or nullif(btrim(v_org.postal_code),'') is null or nullif(btrim(v_org.city),'') is null or nullif(btrim(v_org.email_contact),'') is null) then
  raise exception 'Complétez votre identité, adresse et email dans Mon profil.';
 end if;

 v_item:=v_lots->0;
 v_bien:=public.creer_bien_avec_lot(p_org,btrim(p_saisie->>'nom'),v_type,
  btrim(p_saisie->>'address_line1'),nullif(btrim(p_saisie->>'address_line2'),''),
  btrim(p_saisie->>'postal_code'),btrim(p_saisie->>'city'),(p_saisie->>'annee_construction')::integer,
  coalesce((p_saisie->>'copropriete')::boolean,false),(v_item->>'surface_m2')::numeric,(v_item->>'pieces')::integer);
 update public.biens set zone_tendue=(p_saisie->>'zone_tendue')::boolean,
  parties_communes=btrim(p_saisie->>'parties_communes'),acces_tic=btrim(p_saisie->>'acces_tic'),
  creation_cle=p_creation,creation_requete=p_saisie where id=v_bien;
 if not found then raise exception 'Informations complémentaires non enregistrées.'; end if;
 if nullif(p_saisie->>'commune_insee','') is not null then
  perform public.reseau_confirmer_commune(p_org,v_bien,p_saisie->>'commune_insee');
 end if;
 select id into strict v_lot from public.lots where bien_id=v_bien;
 if v_role='proprietaire_direct' then
  select count(*),min(id::text)::uuid into v_nb,v_person from public.persons
   where organization_id=p_org and account_id=auth.uid() and archived_at is null;
  if v_nb>1 then raise exception 'Plusieurs fiches propriétaire correspondent à votre compte : faites vérifier le dossier.'; end if;
  if v_person is null then
   insert into public.persons(organization_id,account_id,nom,email,address_line1,postal_code,city,qualite)
    values(p_org,auth.uid(),v_org.name,v_org.email_contact,v_org.address_line1,v_org.postal_code,v_org.city,'Personne morale') returning id into v_person;
  end if;
  insert into public.detentions(organization_id,lot_id,person_id,quote_part) values(p_org,v_lot,v_person,100);
 end if;
 if nullif(btrim(v_item->>'nom'),'') is not null then
  update public.lots set nom=btrim(v_item->>'nom') where id=v_lot;
  if not found then raise exception 'Nom du lot non enregistré.'; end if;
 end if;
 if jsonb_array_length(v_lots)>1 then
  select jsonb_agg(jsonb_build_object('nom',coalesce(nullif(btrim(value->>'nom'),''),'Lot '||ordinality),
   'surface_m2',value->'surface_m2','pieces',value->'pieces') order by ordinality)
  into v_suivants from jsonb_array_elements(v_lots) with ordinality where ordinality>1;
  perform public.decouper_bien(v_bien,v_suivants);
 end if;
 return jsonb_build_object('bien_id',v_bien,'lot_unique_id',case when jsonb_array_length(v_lots)=1 then v_lot end,
   'rejoue',false,'saisie_differente',false);
end $$;
revoke all on function public.creer_bien_complet(uuid,uuid,jsonb) from public,anon;
grant execute on function public.creer_bien_complet(uuid,uuid,jsonb) to authenticated;
