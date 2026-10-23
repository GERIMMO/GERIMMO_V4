-- Décision du dirigeant du 23/10/2026 (log.md) : « les communes et les métiers à ouvrir seront choisis par l'artisan
-- (même lors du test) ». Le réseau d'artisans Gerimmo ne s'ouvre plus commune × métier par le super-administrateur
-- (20260928081000, PR #132) : un artisan est proposé là où IL a dit intervenir, pour SES métiers, dès que Gerimmo a
-- validé son inscription (statut « valide », SIRET vérifié) et que son profil est public.
--
-- Ce que « choisir » veut dire ici : la zone d'intervention (codes postaux ou départements entiers) et les métiers que
-- l'artisan déclare déjà à l'inscription et dans « Mon entreprise » (`artisan_zones`, `artisan_metiers`). Le carnet s'en
-- sert depuis le 02/10 (`zone_artisan_couvre`) ; le réseau les lit désormais aussi. Une seule zone, une seule saisie :
-- aucune liste de communes à refaire, aucun plafond à inventer, et l'artisan du carnet et celui du réseau répondent à
-- la même règle (la fiche d'un incident ne peut plus dire « hors zone » d'un artisan que le réseau propose).
--
-- Restent inchangés : décennale selon la nature des travaux, listes noires globale et locale, relation désactivée,
-- compte artisan obligatoire, visibilité publique, adresse du bien complète et commune confirmée (état
-- « adresse_incomplete »), carnet personnel, intérêts, origine et commune enregistrées sur chaque demande.
--
-- Corollaire de sécurité (relectures du 23/10, constats D1 et B2) : puisque la zone et les métiers d'un artisan
-- décident de sa présence nationale, une agence ne peut plus les réécrire pour un artisan qui a son propre compte
-- (elle pouvait se rattacher à tout profil public par son SIRET, puis retirer ses métiers ou étendre sa zone). Elle garde
-- la main sur les fiches SANS compte de son carnet actif, qui ne sont jamais proposées au réseau.
-- Corollaire de confidentialité (constat D2) : l'e-mail d'un artisan du réseau n'est plus rendu avant toute relation ;
-- l'écran ne l'affichait pas. Le téléphone reste rendu (l'écran l'affiche) : point soumis au dirigeant.
--
-- Production au 23/10/2026 (relevé en lecture seule) : 0 ligne dans reseau_ouvertures et reseau_artisan_communes,
-- 0 artisan : aucune donnée à reprendre. Les deux tables sont CONSERVÉES (historique, retour arrière) mais ne sont plus
-- lues ni écrites ; les deux fonctions qui les écrivaient refusent désormais, avec un message qui dit pourquoi.
--
-- Rejouable : index « if not exists », « create or replace » à signature et retour inchangés, commentaires, droits.
-- Les définitions remplacées sont celles en vigueur (pg_get_functiondef) après 20261023162446 ; le retour arrière les
-- rend à l'identique : supabase/retours-arriere/20261023180000_reseau_zone_choisie_par_artisan.retour.sql.
-- À appliquer par « Migrations Supabase » (simulation d'abord), AVANT le code de l'application qui l'accompagne.

-- 1. Retrouver vite les artisans dont la zone couvre un code postal (le réseau ne parcourt plus tout l'annuaire).
create index if not exists artisan_zones_code_postal_idx on public.artisan_zones(code_postal);

-- Les codes de zone qui peuvent couvrir un code postal : lui-même, son département (métropole, « 20 » compris),
-- 2A ou 2B pour la Corse, 97x pour l'outre-mer. Sert de PRÉ-FILTRE indexé ; `zone_artisan_couvre` garde le dernier mot.
create or replace function public.zones_couvrant_code_postal(p_code_postal text) returns text[]
language sql immutable parallel safe set search_path='' as $$
 select case when p_code_postal is null then array[]::text[] else array_remove(array[
  p_code_postal,
  case when left(p_code_postal,2) ~ '^[0-9]{2}$' and left(p_code_postal,2)<>'97' then left(p_code_postal,2) end,
  case when p_code_postal ~ '^20[01]' then '2A' when p_code_postal ~ '^20[2-6]' then '2B' end,
  case when left(p_code_postal,3) ~ '^97[1-6]$' then left(p_code_postal,3) end
 ]::text[], null) end;
$$;
revoke all on function public.zones_couvrant_code_postal(text) from public,anon,authenticated;

-- 2. Éligibilité au réseau pour une commune : plus de rattachement par la supervision. L'artisan y intervient pour ce
-- métier quand le métier est sur sa fiche et que sa zone couvre au moins un code postal de la commune.
-- Pour un BIEN, les appelants exigent en plus que la zone couvre le code postal du bien (artisan_affectable).
create or replace function public.reseau_artisan_eligible(p_artisan uuid,p_commune text,p_metier public.artisan_metier) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artisans a join public.reseau_communes c on c.code=p_commune
  where a.id=p_artisan
   and a.statut_plateforme='valide' and a.siret_etat='verifie' and a.visibilite='publique'
   and a.blacklist_globale_le is null and a.account_id is not null
   and exists(select 1 from public.artisan_metiers am where am.artisan_id=a.id and am.metier=p_metier)
   and exists(select 1 from public.artisan_zones z cross join unnest(c.codes_postaux) cp
    where z.artisan_id=a.id and public.zone_artisan_couvre(z.code_postal,cp)));
$$;
revoke all on function public.reseau_artisan_eligible(uuid,text,public.artisan_metier) from public,anon,authenticated;

-- 3. Disponibilité : plus d'état « fermee » (aucune ouverture à attendre). Restent adresse_incomplete, sans_artisan,
-- ouverte. Le décompte part de l'index des zones, puis applique les mêmes filtres que la sollicitation.
create or replace function public.reseau_disponibilite(p_org uuid,p_bien uuid,p_metier public.artisan_metier,p_nature public.nature_travaux default 'entretien_courant')
returns table(etat text,commune_code text,commune_nom text,nb_artisans bigint,nb_contacts bigint,interet_enregistre boolean)
language plpgsql stable security definer set search_path='' as $$
declare b record; n bigint; contacts bigint;
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
 -- Réseau choisi par l'artisan (décision du 23/10/2026) : sa zone couvre le code postal du bien, pour ce métier.
 select count(*) into n from public.artisans a
  where a.id in(select z.artisan_id from public.artisan_zones z where z.code_postal=any(public.zones_couvrant_code_postal(b.postal_code)))
   and public.reseau_artisan_eligible(a.id,b.commune_insee,p_metier)
   and public.artisan_affectable(a.id,p_org,p_metier,p_nature,b.postal_code);
 return query select case when n=0 then 'sans_artisan' else 'ouverte' end,
  b.commune_insee,b.commune_nom,n,contacts,
  exists(select 1 from public.reseau_interets ri where ri.account_id=auth.uid() and ri.bien_id=p_bien and ri.commune_code=b.commune_insee and ri.metier=p_metier);
end $$;
revoke all on function public.reseau_disponibilite(uuid,uuid,public.artisan_metier,public.nature_travaux) from public,anon;
grant execute on function public.reseau_disponibilite(uuid,uuid,public.artisan_metier,public.nature_travaux) to authenticated;

-- 4. Artisans proposés pour un bien : le carnet (inchangé) et le réseau, retrouvé par sa zone.
-- L'e-mail n'est rendu que pour un contact du carnet (constat D2 du 23/10) : l'écran ne l'affiche pas, et le réseau
-- devient national ; rien ne justifie de le livrer avant toute relation. Signature inchangée.
create or replace function public.artisans_disponibles_bien(p_org uuid,p_bien uuid,p_metier public.artisan_metier,p_nature public.nature_travaux)
returns table(artisan_id uuid,raison_sociale text,telephone text,email text,rattache boolean,note_publiee numeric,nb_evaluations integer,publiable boolean,decennale_valide boolean)
language plpgsql stable security definer set search_path='' as $$
declare d record; cp text;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 select * into d from public.reseau_disponibilite(p_org,p_bien,p_metier,p_nature);
 select postal_code into cp from public.biens where id=p_bien;
 return query select a.id,a.raison_sociale,a.telephone,
  case when public.reseau_contact_personnel(p_org,a.id) then a.email end,
  public.reseau_contact_dans_zone(p_org,a.id,cp),n.note_publiee,n.nb_evaluations,n.publiable,public.artisan_decennale_valide(a.id)
 from public.artisans a cross join lateral public.artisan_note(a.id) n
 where a.id in(
   select aa.artisan_id from public.artisan_agences aa where aa.organization_id=p_org and aa.statut='actif' and aa.blacklist_le is null
   union
   select z.artisan_id from public.artisan_zones z where d.etat='ouverte' and z.code_postal=any(public.zones_couvrant_code_postal(cp)))
  and ((public.reseau_contact_personnel(p_org,a.id) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,cp))
   or (d.etat='ouverte' and public.reseau_artisan_eligible(a.id,d.commune_code,p_metier) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,cp)))
 order by n.note_publiee desc nulls last,a.raison_sociale,a.id;
end $$;
revoke all on function public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux) from public,anon;
grant execute on function public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux) to authenticated;

-- 5. Sollicitation : plus de contrôle d'ouverture. Pour le réseau, la base revérifie au moment de l'envoi l'éligibilité
-- ET la zone sur le code postal du bien (solliciter_artisan_interne ne la contrôle que pour le carnet). Le verrou de la
-- fiche (for share) attend une modification en cours de ses métiers ou de sa zone (artisan_definir_metiers_zones la
-- verrouille for no key update avant d'écrire).
create or replace function public.solliciter_artisan(p_org uuid,p_consultation uuid,p_artisan uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c record; b record; contact boolean; v uuid; code_commune text;
begin
 if public.consultation_hors_portefeuille(p_org,p_consultation) then raise exception 'Ce dossier est hors de votre portefeuille' using errcode='42501'; end if;
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 select * into c from public.incident_consultations where id=p_consultation and organization_id=p_org for update;
 if not found then raise exception 'Mise en concurrence introuvable.'; end if;
 select bi.* into b from public.incidents i join public.lots l on l.id=i.lot_id join public.biens bi on bi.id=l.bien_id where i.id=c.incident_id for share of bi;
 contact:=public.reseau_contact_dans_zone(p_org,p_artisan,b.postal_code);
 if not contact then
  if b.commune_insee is null then raise exception 'Complétez l’adresse du bien et confirmez sa commune.'; end if;
  perform 1 from public.artisans where id=p_artisan for share;
  if not public.reseau_artisan_eligible(p_artisan,b.commune_insee,c.metier)
   or not exists(select 1 from public.artisan_zones z where z.artisan_id=p_artisan and public.zone_artisan_couvre(z.code_postal,b.postal_code))
  then raise exception 'Cet artisan du réseau n’est plus disponible pour ce métier dans cette commune. Aucun professionnel n’a été sollicité.'; end if;
  code_commune:=b.commune_insee;
 end if;
 v:=public.solliciter_artisan_interne(p_org,p_consultation,p_artisan);
 update public.incident_sollicitations set origine_reseau=case when contact then 'carnet' else 'reseau' end,
  commune_reseau=code_commune where id=v;
 return v;
end $$;
revoke all on function public.solliciter_artisan(uuid,uuid,uuid) from public,anon;
grant execute on function public.solliciter_artisan(uuid,uuid,uuid) to authenticated;

-- 6. Ouverture d'une mise en concurrence : sans contact ni artisan du réseau, le seul refus est « aucun artisan ».
create or replace function public.ouvrir_consultation(p_org uuid,p_incident uuid,p_metier public.artisan_metier,p_nature public.nature_travaux,p_devis_unique_assume boolean default false,p_validite_jours integer default 30)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; b uuid; d record;
begin
 if auth.uid() is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
 v:=public.ouvrir_consultation_interne(p_org,p_incident,p_metier,p_nature,p_devis_unique_assume,p_validite_jours);
 select l.bien_id into b from public.incidents i join public.lots l on l.id=i.lot_id where i.id=p_incident and i.organization_id=p_org;
 select * into d from public.reseau_disponibilite(p_org,b,p_metier,p_nature);
 if d.nb_contacts=0 and d.etat<>'ouverte' then
  if d.etat='adresse_incomplete' then raise exception 'Complétez l’adresse du bien et confirmez sa commune avant de rechercher un artisan du réseau.'; end if;
  raise exception 'Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone.';
 end if;
 return v;
end $$;
revoke all on function public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) from public,anon;
grant execute on function public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) to authenticated;

-- 7. Les deux décisions de la supervision n'existent plus. Signatures et droits gardés : l'écran d'avant la mise à jour
-- du code reçoit un refus qui dit pourquoi, et le retour arrière n'a qu'à rendre les corps.
create or replace function public.reseau_regler_ouverture(p_communes text[],p_metier public.artisan_metier,p_ouverte boolean,p_confirmation boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 raise exception 'Le réseau d’artisans ne s’ouvre plus commune par commune : chaque artisan choisit sa zone et ses métiers, et il est proposé dès que Gerimmo a validé son inscription et que son profil est public (décision du 23/10/2026).';
end $$;
revoke all on function public.reseau_regler_ouverture(text[],public.artisan_metier,boolean,boolean) from public,anon;
grant execute on function public.reseau_regler_ouverture(text[],public.artisan_metier,boolean,boolean) to authenticated;

create or replace function public.reseau_rattacher_artisan(p_artisan uuid,p_communes text[],p_metier public.artisan_metier,p_rattacher boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 raise exception 'Les communes d’un artisan ne se rattachent plus depuis la supervision : il choisit lui-même sa zone et ses métiers dans son espace (décision du 23/10/2026). Pour l’écarter, suspendez son inscription ou inscrivez-le en liste noire.';
end $$;
revoke all on function public.reseau_rattacher_artisan(uuid,text[],public.artisan_metier,boolean) from public,anon;
grant execute on function public.reseau_rattacher_artisan(uuid,text[],public.artisan_metier,boolean) to authenticated;

-- 8. Pilotage par commune (même signature) : les colonnes changent de sens.
--   ouverte   : au moins un artisan PROPOSÉ (compte, validé, SIRET vérifié, public, sans liste noire globale, métier, zone) ;
--   preparee  : au moins un artisan avec compte a déclaré ce métier et une zone qui couvre la commune ;
--   artisans  : nombre de ces artisans déclarés, quel que soit leur statut ; eligibles : nombre d'artisans proposés.
-- La décennale dépend des travaux et la liste noire locale de l'organisation : elles se vérifient à chaque demande.
create or replace function public.reseau_pilotage(p_departement text,p_metier public.artisan_metier)
returns table(commune_code text,nom text,ouverte boolean,preparee boolean,artisans bigint,eligibles bigint,interets bigint,biens_interesses bigint,demandes bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 return query select x.code,x.nom,x.eligibles>0,x.declares>0,x.declares,x.eligibles,
  (select count(*) from public.reseau_interets i where i.commune_code=x.code and i.metier=p_metier),
  (select count(distinct i.bien_id) from public.reseau_interets i where i.commune_code=x.code and i.metier=p_metier),
  (select count(*) from public.incident_sollicitations s join public.incident_consultations cc on cc.id=s.consultation_id where s.origine_reseau='reseau' and s.commune_reseau=x.code and cc.metier=p_metier)
 from (
  select c.code,c.nom,
   (select count(distinct z.artisan_id) from public.artisan_zones z
     join public.artisans a on a.id=z.artisan_id and a.account_id is not null
     join public.artisan_metiers am on am.artisan_id=a.id and am.metier=p_metier
    where z.code_postal=any(cz.zones) and exists(select 1 from unnest(c.codes_postaux) cp where public.zone_artisan_couvre(z.code_postal,cp))) declares,
   (select count(distinct z.artisan_id) from public.artisan_zones z
    where z.code_postal=any(cz.zones) and public.reseau_artisan_eligible(z.artisan_id,c.code,p_metier)) eligibles
  from public.reseau_communes c
  cross join lateral (select coalesce(array_agg(distinct zc),array[]::text[]) zones from unnest(c.codes_postaux) cp cross join unnest(public.zones_couvrant_code_postal(cp)) zc) cz
  where c.departement=p_departement
 ) x order by x.nom,x.code;
end $$;
revoke all on function public.reseau_pilotage(text,public.artisan_metier) from public,anon;
grant execute on function public.reseau_pilotage(text,public.artisan_metier) to authenticated;

-- 9. Métiers et zone : l'artisan titulaire et la supervision, comme avant ; une agence, désormais seulement la fiche
-- SANS compte d'un artisan de son carnet ACTIF (relation active, hors liste noire locale). Relectures du 23/10 (D1, B2) :
-- la zone et les métiers d'un artisan qui a son compte décident de sa présence dans le réseau national ; personne
-- d'autre que lui (et la supervision) ne les réécrit. Une agence pouvait se rattacher à tout profil public par son seul
-- SIRET (RM-A1.9), puis lui retirer ses métiers ou étendre sa zone ; une relation désactivée ou en liste noire locale
-- gardait aussi la main.
-- Trois morceaux posés par ancre, à compte exact (modèle de 20261014841000, dont la ligne marquée reste intacte) :
-- rejouée, la migration trouve sa marque et ne fait rien ; une ancre absente ou répétée l'arrête en nommant la fonction.
do $correctif$
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
$nouveau$;
begin
  select pg_get_functiondef('public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])'::regprocedure) into v_def;
  if position(c_marque in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre_role, ''))) <> length(c_ancre_role)
     or (length(v_def) - length(replace(v_def, c_ancre_refus, ''))) <> length(c_ancre_refus)
     or (length(v_def) - length(replace(v_def, c_ancre_verrou, ''))) <> length(c_ancre_verrou) then
    raise exception 'Migration 20261023180000 : définition inattendue de artisan_definir_metiers_zones (ancre absente ou répétée)';
  end if;
  execute replace(replace(replace(v_def, c_ancre_role, c_nouveau_role), c_ancre_refus, c_nouveau_refus), c_ancre_verrou, c_nouveau_verrou);
end $correctif$;
revoke all on function public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[]) from public,anon;
grant execute on function public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[]) to authenticated;

-- 10. Les tables de l'ouverture explicite restent, vides en production, pour l'historique et le retour arrière.
comment on table public.reseau_ouvertures is 'Historique des ouvertures décidées par le super administrateur (20260928081000). Ni lue ni écrite depuis 20261023180000 : chaque artisan choisit sa zone et ses métiers (décision du dirigeant du 23/10/2026).';
comment on table public.reseau_artisan_communes is 'Historique des rattachements commune × métier par le super administrateur (20260928081000). Ni lue ni écrite depuis 20261023180000 : le réseau lit la zone et les métiers déclarés par l’artisan.';
comment on function public.reseau_pilotage(text,public.artisan_metier) is 'Couverture constatée par commune depuis le 23/10/2026 : ouverte = au moins un artisan proposé ; preparee = au moins un artisan avec compte déclaré pour ce métier et cette zone ; artisans = déclarés ; eligibles = proposés.';

select public.fermer_fonctions_a_anon();
