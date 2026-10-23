-- Retour de 20261023180000 (décision du dirigeant du 23/10/2026 : le réseau d'artisans suit la zone et les métiers
-- choisis par l'artisan). Rend au réseau l'ouverture explicite commune × métier par le super-administrateur : les huit
-- fonctions retrouvent leur texte exact d'avant (celui de 20260928081000), la fonction des métiers et de la zone perd
-- ses trois morceaux marqués RESEAU_ZONE_ARTISAN_20261023 (la ligne de 20261014841000 reste), l'aide
-- `zones_couvrant_code_postal`, l'index `artisan_zones_code_postal_idx`, les quatre déclencheurs de journal des zones et
-- des métiers et leur fonction `journaliser_metiers_zones_artisan` sont retirés, les commentaires d'origine reviennent,
-- la version est retirée de l'historique. Les lignes déjà écrites au journal d'audit restent (historique).
--
-- REMETTRE D'ABORD LE CODE PRÉCÉDENT : l'écran de supervision de la livraison ne propose plus d'ouvrir ni de rattacher.
-- Aucune donnée touchée : zones et métiers des artisans, intérêts, demandes et leur origine restent. Les tables
-- reseau_ouvertures et reseau_artisan_communes n'ont jamais été vidées ni écrites par la migration : ce qu'elles
-- contenaient avant redevient actif tel quel (0 ligne en production au 23/10/2026).
-- RÉINTRODUIT : un artisan validé et public n'est plus proposé tant que le super-administrateur ne l'a pas rattaché
-- à une commune et n'a pas ouvert le métier ; une agence peut de nouveau réécrire les métiers et la zone d'un artisan
-- qui a son compte (même par une relation désactivée) ; l'e-mail des artisans du réseau redevient lisible avant toute
-- relation ; le téléphone aussi ; les changements de zone et de métiers ne sont plus journalisés.
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouable : une fonction déjà rendue ne change pas ; sans la marque, la fonction des
-- métiers et de la zone est laissée telle quelle. Une définition inattendue (morceau marqué absent ou répété) arrête
-- tout, en nommant la fonction.
do $retour_atomique$
declare
  v_def text;
  c_marque constant text := 'RESEAU_ZONE_ARTISAN_20261023';
  c_ancre_role constant text := $ancre$                 and m.status = 'active'
$ancre$;
  c_nouveau_role constant text := $nouveau$                 and m.status = 'active'
                 -- RESEAU_ZONE_ARTISAN_20261023 : carnet actif, et seulement la fiche d'un artisan sans compte.
                 and aa.statut = 'actif' and aa.blacklist_le is null
                 and not exists (select 1 from public.artisans x where x.id = p_artisan and x.account_id is not null)
$nouveau$;
  c_ancre_refus constant text := $ancre$  ) then
    raise exception 'Accès refusé';
  end if;
$ancre$;
  c_nouveau_refus constant text := $nouveau$  ) then
    -- RESEAU_ZONE_ARTISAN_20261023 : à une agence, dire pourquoi la fiche d'un artisan qui a son compte lui échappe.
    if exists (select 1 from public.artisans x
               join public.artisan_agences aa on aa.artisan_id = x.id
               join public.memberships m on m.organization_id = aa.organization_id
               where x.id = p_artisan and x.account_id is not null and m.account_id = (select auth.uid())
                 and m.status = 'active' and m.role in ('admin_agence', 'agent')) then
      raise exception 'Les métiers et la zone de cet artisan lui appartiennent : il les met à jour depuis son espace Gerimmo.';
    end if;
    raise exception 'Accès refusé';
  end if;
$nouveau$;
  c_ancre_verrou constant text := $ancre$    raise exception 'Choisissez au moins un métier';
  end if;
$ancre$;
  c_nouveau_verrou constant text := $nouveau$    raise exception 'Choisissez au moins un métier';
  end if;
  -- RESEAU_ZONE_ARTISAN_20261023 : une sollicitation du réseau en cours (for share sur la fiche) se termine avant ce
  -- changement, ou le voit.
  perform 1 from public.artisans where id = p_artisan for no key update;
  if not public.is_super_admin() and exists (select 1 from public.artisans x where x.id = p_artisan
       and x.account_id is not null and x.account_id is distinct from (select auth.uid())) then
    raise exception 'Les métiers et la zone de cet artisan lui appartiennent : il les met à jour depuis son espace Gerimmo.';
  end if;
$nouveau$;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 1. Métiers et zone : retirer les trois morceaux marqués, à compte exact.
  select pg_get_functiondef('public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])'::regprocedure) into v_def;
  if position(c_marque in v_def) > 0 then
    if (length(v_def) - length(replace(v_def, c_nouveau_role, ''))) <> length(c_nouveau_role)
       or (length(v_def) - length(replace(v_def, c_nouveau_refus, ''))) <> length(c_nouveau_refus)
       or (length(v_def) - length(replace(v_def, c_nouveau_verrou, ''))) <> length(c_nouveau_verrou) then
      raise exception 'Retour 20261023180000 : définition inattendue de artisan_definir_metiers_zones (morceau marqué absent ou répété)';
    end if;
    execute replace(replace(replace(v_def, c_nouveau_verrou, c_ancre_verrou), c_nouveau_refus, c_ancre_refus), c_nouveau_role, c_ancre_role);
  end if;

  -- 2. Les huit fonctions du réseau, au texte exact d'avant (corps de 20260928081000). Droits inchangés par la
  -- migration : create or replace les conserve.
  create or replace function public.reseau_artisan_eligible(p_artisan uuid, p_commune text, p_metier public.artisan_metier)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.artisans a join public.reseau_artisan_communes z on z.artisan_id=a.id
  where a.id=p_artisan and z.commune_code=p_commune and z.metier=p_metier
   and a.statut_plateforme='valide' and a.siret_etat='verifie' and a.visibilite='publique'
   and a.blacklist_globale_le is null and a.account_id is not null);
$function$;

  create or replace function public.reseau_disponibilite(p_org uuid, p_bien uuid, p_metier public.artisan_metier, p_nature public.nature_travaux DEFAULT 'entretien_courant'::public.nature_travaux)
 RETURNS TABLE(etat text, commune_code text, commune_nom text, nb_artisans bigint, nb_contacts bigint, interet_enregistre boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b record; ouverte boolean; n bigint; contacts bigint;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 if p_metier is null or p_nature is null then raise exception 'Choisissez un métier et la nature des travaux.'; end if;
 select bi.*,c.nom as commune_nom,c.codes_postaux into b from public.biens bi left join public.reseau_communes c on c.code=bi.commune_insee where bi.id=p_bien;
 select count(*) into contacts from public.artisans a where public.reseau_contact_personnel(p_org,a.id)
  and public.artisan_affectable(a.id,p_org,p_metier,p_nature,b.postal_code);
 if b.commune_insee is null or b.postal_code is null or not(b.postal_code=any(b.codes_postaux))
  or length(trim(coalesce(b.address_line1,'')))=0 or length(trim(coalesce(b.city,'')))=0 then
  return query select 'adresse_incomplete'::text,null::text,null::text,0::bigint,contacts,false; return;
 end if;
 select o.ouverte into ouverte from public.reseau_ouvertures o where o.commune_code=b.commune_insee and o.metier=p_metier;
 select count(*) into n from public.artisans a where public.reseau_artisan_eligible(a.id,b.commune_insee,p_metier)
  and public.artisan_affectable(a.id,p_org,p_metier,p_nature,null);
 return query select case when not coalesce(ouverte,false) then 'fermee' when n=0 then 'sans_artisan' else 'ouverte' end,
  b.commune_insee,b.commune_nom,case when coalesce(ouverte,false) then n else 0::bigint end,contacts,
  exists(select 1 from public.reseau_interets ri where ri.account_id=auth.uid() and ri.bien_id=p_bien and ri.commune_code=b.commune_insee and ri.metier=p_metier);
end $function$;

  create or replace function public.artisans_disponibles_bien(p_org uuid, p_bien uuid, p_metier public.artisan_metier, p_nature public.nature_travaux)
 RETURNS TABLE(artisan_id uuid, raison_sociale text, telephone text, email text, rattache boolean, note_publiee numeric, nb_evaluations integer, publiable boolean, decennale_valide boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; cp text;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 select * into d from public.reseau_disponibilite(p_org,p_bien,p_metier,p_nature);
 select postal_code into cp from public.biens where id=p_bien;
 return query select a.id,a.raison_sociale,a.telephone,a.email,public.reseau_contact_dans_zone(p_org,a.id,cp),n.note_publiee,n.nb_evaluations,n.publiable,public.artisan_decennale_valide(a.id)
 from public.artisans a cross join lateral public.artisan_note(a.id) n
 where (public.reseau_contact_personnel(p_org,a.id) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,cp))
  or (d.etat='ouverte' and public.reseau_artisan_eligible(a.id,d.commune_code,p_metier) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,null))
 order by n.note_publiee desc nulls last,a.raison_sociale,a.id;
end $function$;

  create or replace function public.solliciter_artisan(p_org uuid, p_consultation uuid, p_artisan uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; b record; autorisee boolean; contact boolean; v uuid; code_commune text;
begin
 if public.consultation_hors_portefeuille(p_org,p_consultation) then raise exception 'Ce dossier est hors de votre portefeuille' using errcode='42501'; end if;
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 select * into c from public.incident_consultations where id=p_consultation and organization_id=p_org for update;
 if not found then raise exception 'Mise en concurrence introuvable.'; end if;
 select bi.* into b from public.incidents i join public.lots l on l.id=i.lot_id join public.biens bi on bi.id=l.bien_id where i.id=c.incident_id for share of bi;
 contact:=public.reseau_contact_dans_zone(p_org,p_artisan,b.postal_code);
 if not contact then
  if b.commune_insee is null then raise exception 'Complétez l’adresse du bien et confirmez sa commune.'; end if;
  select ouverte into autorisee from public.reseau_ouvertures where commune_code=b.commune_insee and metier=c.metier for share;
  if not coalesce(autorisee,false) then raise exception 'Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.'; end if;
  perform 1 from public.artisans where id=p_artisan for share;
  perform 1 from public.reseau_artisan_communes where artisan_id=p_artisan and commune_code=b.commune_insee and metier=c.metier for share;
  if not public.reseau_artisan_eligible(p_artisan,b.commune_insee,c.metier) then raise exception 'Cet artisan du réseau n’est plus disponible pour ce métier dans cette commune. Aucun professionnel n’a été sollicité.'; end if;
  code_commune:=b.commune_insee;
 end if;
 v:=public.solliciter_artisan_interne(p_org,p_consultation,p_artisan);
 update public.incident_sollicitations set origine_reseau=case when contact then 'carnet' else 'reseau' end,
  commune_reseau=code_commune where id=v;
 return v;
end $function$;

  create or replace function public.ouvrir_consultation(p_org uuid, p_incident uuid, p_metier public.artisan_metier, p_nature public.nature_travaux, p_devis_unique_assume boolean DEFAULT false, p_validite_jours integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid; b uuid; d record;
begin
 if auth.uid() is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
 v:=public.ouvrir_consultation_interne(p_org,p_incident,p_metier,p_nature,p_devis_unique_assume,p_validite_jours);
 select l.bien_id into b from public.incidents i join public.lots l on l.id=i.lot_id where i.id=p_incident and i.organization_id=p_org;
 select * into d from public.reseau_disponibilite(p_org,b,p_metier,p_nature);
 if d.nb_contacts=0 and d.etat<>'ouverte' then
  if d.etat='adresse_incomplete' then raise exception 'Complétez l’adresse du bien et confirmez sa commune avant de rechercher un artisan du réseau.'; end if;
  if d.etat='sans_artisan' then raise exception 'Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone.'; end if;
  raise exception 'Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.';
 end if;
 return v;
end $function$;

  create or replace function public.reseau_regler_ouverture(p_communes text[], p_metier public.artisan_metier, p_ouverte boolean, p_confirmation boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c text; avant boolean;
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 if p_metier is null or p_ouverte is null or coalesce(cardinality(p_communes),0) not between 1 and 1000 then raise exception 'Choisissez un métier et au moins une commune (1 000 maximum).'; end if;
 if p_ouverte and p_confirmation is distinct from true then raise exception 'Confirmez explicitement l’ouverture de ce métier dans les communes choisies.'; end if;
 -- Ordre stable pour les décisions groupées concurrentes.
 for c in select distinct unnest(p_communes) order by 1 loop
  if c is null or not exists(select 1 from public.reseau_communes where code=c) then raise exception 'Commune inconnue.'; end if;
  insert into public.reseau_ouvertures(commune_code,metier) values(c,p_metier) on conflict do nothing;
  select ouverte into avant from public.reseau_ouvertures where commune_code=c and metier=p_metier for update;
  if p_ouverte then
   perform 1 from public.artisans a join public.reseau_artisan_communes z on z.artisan_id=a.id
    where z.commune_code=c and z.metier=p_metier and public.reseau_artisan_eligible(a.id,c,p_metier)
    order by a.id for share of a,z;
   if not found then
    raise exception 'Ouverture impossible pour la commune % : aucun artisan validé, public et disposant d’un compte n’y est rattaché pour ce métier.',c;
   end if;
  end if;
  update public.reseau_ouvertures set ouverte=p_ouverte,decide_par=auth.uid(),decide_le=clock_timestamp() where commune_code=c and metier=p_metier;
  insert into public.audit_log(account_id,action,details) values(auth.uid(),'reseau_ouverture',jsonb_build_object('commune',c,'metier',p_metier,'avant',avant,'ouverte',p_ouverte));
 end loop;
end $function$;

  create or replace function public.reseau_rattacher_artisan(p_artisan uuid, p_communes text[], p_metier public.artisan_metier, p_rattacher boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c text;
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 if p_metier is null or p_rattacher is null or coalesce(cardinality(p_communes),0) not between 1 and 1000 then raise exception 'Choisissez un métier et au moins une commune (1 000 maximum).'; end if;
 if not exists(select 1 from public.artisan_metiers where artisan_id=p_artisan and metier=p_metier) then raise exception 'Ce métier ne figure pas sur la fiche de l’artisan.'; end if;
 foreach c in array p_communes loop
  if c is null or not exists(select 1 from public.reseau_communes where code=c) then raise exception 'Commune inconnue.'; end if;
  if p_rattacher then
   insert into public.reseau_artisan_communes(artisan_id,metier,commune_code,rattache_par) values(p_artisan,p_metier,c,auth.uid()) on conflict do nothing;
  else delete from public.reseau_artisan_communes where artisan_id=p_artisan and metier=p_metier and commune_code=c;
  end if;
 end loop;
 insert into public.audit_log(account_id,action,details) values(auth.uid(),'reseau_artisan_zones',jsonb_build_object('artisan',p_artisan,'communes',p_communes,'metier',p_metier,'rattache',p_rattacher));
end $function$;

  create or replace function public.reseau_pilotage(p_departement text, p_metier public.artisan_metier)
 RETURNS TABLE(commune_code text, nom text, ouverte boolean, preparee boolean, artisans bigint, eligibles bigint, interets bigint, biens_interesses bigint, demandes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 return query select c.code,c.nom,coalesce(o.ouverte,false),o.commune_code is not null,
  (select count(*) from public.reseau_artisan_communes z where z.commune_code=c.code and z.metier=p_metier),
  (select count(*) from public.reseau_artisan_communes z where z.commune_code=c.code and z.metier=p_metier and public.reseau_artisan_eligible(z.artisan_id,c.code,p_metier)),
  (select count(*) from public.reseau_interets i where i.commune_code=c.code and i.metier=p_metier),
  (select count(distinct i.bien_id) from public.reseau_interets i where i.commune_code=c.code and i.metier=p_metier),
  (select count(*) from public.incident_sollicitations s join public.incident_consultations cc on cc.id=s.consultation_id where s.origine_reseau='reseau' and s.commune_reseau=c.code and cc.metier=p_metier)
 from public.reseau_communes c left join public.reseau_ouvertures o on o.commune_code=c.code and o.metier=p_metier
 where c.departement=p_departement order by c.nom,c.code;
end $function$;

  -- 3. L'aide de pré-filtre et l'index de la migration (plus aucune fonction ne les cite), les déclencheurs du journal
  -- des zones et des métiers, puis leur fonction.
  drop function if exists public.zones_couvrant_code_postal(text);
  drop index if exists public.artisan_zones_code_postal_idx;
  drop trigger if exists artisan_zones_journal_ajout on public.artisan_zones;
  drop trigger if exists artisan_zones_journal_retrait on public.artisan_zones;
  drop trigger if exists artisan_metiers_journal_ajout on public.artisan_metiers;
  drop trigger if exists artisan_metiers_journal_retrait on public.artisan_metiers;
  drop function if exists public.journaliser_metiers_zones_artisan();

  -- 4. Commentaires d'origine.
  comment on table public.reseau_ouvertures is 'Décisions explicites du super administrateur. Aucune ouverture créée par l’inscription ou la validation d’un artisan.';
  comment on table public.reseau_artisan_communes is null;
  comment on function public.reseau_pilotage(text,public.artisan_metier) is null;

  perform public.fermer_fonctions_a_anon();

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261023180000';
  end if;
end;
$retour_atomique$;
