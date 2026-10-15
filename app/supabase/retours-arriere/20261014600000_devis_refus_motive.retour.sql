-- RETOUR ARRIÈRE de 20261014600000_devis_refus_motive.sql (décision D18 du 14/10/2026, livraison 1 : refus motivé)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici — aucune n'est écrite à la main.
-- Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014600000_devis_refus_motive.retour.sql
--
-- RÉINTRODUIT le défaut PRO2-12 (partie refus) : un devis reçu ne peut de nouveau qu'être retenu ; l'écran du
-- gérant qui appelle `refuser_devis` échouera tant que le code de l'application n'est pas revenu lui aussi.
-- NE DÉFAIT PAS : les colonnes `decision`, `decide_par`, `decide_le`, `decision_motif`, `decision_cle` de
-- `incident_devis` (données de gestion : elles restent, sans effet une fois les fonctions revenues), les valeurs
-- d'énumération `refuse` et `refusee` (une valeur ajoutée ne se retire pas : elles restent, inoffensives), le type
-- d'événement `devis_refuse` dans la liste fermée (des lignes du fil peuvent le porter), ni les devis déjà refusés
-- (ils restent « refusé », lisibles, et leur sollicitation « refusée »). Aucune donnée n'est modifiée par ce script.
-- À jouer AVANT le retour de la seconde livraison ? NON : jouer d'abord le retour de 20261014601000 (versions), qui
-- s'appuie sur les objets de celle-ci, puis ce script.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Refus si la seconde livraison est encore en place : son retour se joue d'abord.
do $retour_arriere$
begin
  if to_regprocedure('public.demander_revision_devis(uuid,uuid,text,uuid)') is not null then
    raise exception 'Retour arrière refusé : la migration 20261014601000 (révision et versions) est encore appliquée. Jouez d''abord son retour.';
  end if;
end $retour_arriere$;

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public). « or replace » :
-- un autre retour de la même session (celui de 20261014601000, joué juste avant) peut l'avoir déjà posé.
create or replace function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- 4. La fonction nouvelle disparaît.
drop function if exists public.refuser_devis(uuid, uuid, text, uuid);

-- 6. retenir_devis
select pg_temp.restaurer_fonction('public.retenir_devis(uuid,uuid)',
  $marque$Décision D18 du 14/10 (livraison 1)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.retenir_devis(p_org uuid, p_devis uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; i record; v_intervention uuid;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.devis_hors_portefeuille(p_org, p_devis) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la sélection d''un devis appartient à l''agence ou au propriétaire';
  end if;
  select * into d from public.incident_devis
  where id = p_devis and organization_id = p_org for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if d.statut <> 'depose' then
    raise exception 'Ce devis n''est plus sélectionnable (état : %)', d.statut;
  end if;
  if d.valide_jusqu_au < current_date then
    raise exception 'Ce devis a expiré le % — il est caduc (RM-9.2.3)', to_char(d.valide_jusqu_au, 'DD/MM/YYYY');
  end if;

  select * into i from public.incidents
  where id = d.incident_id and organization_id = p_org for update;
  if i.etat <> 'qualifie' then
    raise exception 'Cet incident n''est pas en attente d''affectation (état actuel : %)', i.etat;
  end if;
  -- La décennale est revérifiée À LA SÉLECTION : elle a pu expirer entre la
  -- sollicitation et le choix (seuils J-60/J-30/J-7/J+0, RM-8.2.5).
  if not public.artisan_affectable(
       d.artisan_id, p_org,
       (select c.metier from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id),
       (select c.nature_travaux from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id)) then
    raise exception 'Cet artisan n''est plus affectable aujourd''hui (décennale, liste noire ou validation plateforme) — choisissez l''autre devis ou relancez une consultation';
  end if;

  update public.incident_devis
  set statut = 'retenu', retenu_le = now(), retenu_par = (select auth.uid())
  where id = p_devis;
  update public.incident_sollicitations set statut = 'retenue' where id = d.sollicitation_id;

  -- Les non-retenus sont notifiés automatiquement (module 9) : ici, leur
  -- statut bascule — c'est ce que leur écran lit.
  update public.incident_devis set statut = 'non_retenu'
  where sollicitation_id in (select s.id from public.incident_sollicitations s
                             where s.consultation_id = (select s2.consultation_id
                               from public.incident_sollicitations s2 where s2.id = d.sollicitation_id))
    and id <> p_devis and statut = 'depose';
  update public.incident_sollicitations set statut = 'non_retenue'
  where consultation_id = (select s2.consultation_id from public.incident_sollicitations s2
                           where s2.id = d.sollicitation_id)
    and id <> d.sollicitation_id and statut in ('envoyee', 'devis_depose');
  update public.incident_consultations set statut = 'close', closed_at = now()
  where id = (select s2.consultation_id from public.incident_sollicitations s2
              where s2.id = d.sollicitation_id);

  insert into public.incident_interventions
    (organization_id, incident_id, artisan_id, devis_id, nature_travaux, created_by)
  values (p_org, d.incident_id, d.artisan_id, p_devis,
          (select c.nature_travaux from public.incident_consultations c
           join public.incident_sollicitations s on s.consultation_id = c.id
           where s.id = d.sollicitation_id),
          (select auth.uid()))
  returning id into v_intervention;

  update public.incidents set etat = 'affecte' where id = d.incident_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, d.incident_id, 'selection_devis', (select auth.uid()),
          jsonb_build_object('devis_id', p_devis, 'artisan_id', d.artisan_id,
                             'montant_ttc_cents', d.montant_ttc_cents,
                             'intervention_id', v_intervention)),
         (p_org, d.incident_id, 'mission_confiee', (select auth.uid()),
          jsonb_build_object('intervention_id', v_intervention, 'artisan_id', d.artisan_id));
  return v_intervention;
end;
$function$
$definition_anterieure$);

-- 5. fermer_alerte_devis_a_decider (définition de 20261014300000)
select pg_temp.restaurer_fonction('public.fermer_alerte_devis_a_decider()',
  $marque$Décision D18 du 14/10 (livraison 1)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.fermer_alerte_devis_a_decider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Seules les alertes encore ouvertes de CE devis : une alerte déjà fermée à la main (ou par la clôture de
  -- l'incident) garde sa raison. La raison dit ce qui est arrivé au devis.
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = case new.statut
        when 'retenu' then 'Devis retenu'
        when 'non_retenu' then 'Un autre devis a été retenu'
        when 'expire' then 'Devis expiré'
        else 'Devis annulé' end
  where organization_id = new.organization_id
    and type = 'devis_a_decider'
    and statut = 'ouverte'
    and details->>'devis_id' = new.id::text;
  return null;
end $function$
$definition_anterieure$);

-- 7. mes_sollicitations : le type de retour change, donc drop puis create (seulement si la marque y est).
do $retour_arriere$
declare v_courante text;
begin
  v_courante := pg_get_functiondef('public.mes_sollicitations()'::regprocedure);
  if position('Décision D18 du 14/10 (livraison 1)' in v_courante) = 0 then
    raise notice 'public.mes_sollicitations() : marque du correctif absente, rien à faire';
    return;
  end if;
  drop function public.mes_sollicitations();
  create function public.mes_sollicitations()
  returns table (
    sollicitation_id uuid, organization_id uuid, agence_nom text,
    incident_numero text, categorie text, description text,
    urgence public.incident_urgence, metier public.artisan_metier,
    nature_travaux public.nature_travaux, decennale_requise boolean,
    code_postal text, ville text, envoyee_le timestamptz,
    statut public.sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint)
  language sql stable security definer set search_path = '' as $definition_anterieure$
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join public.incident_devis d on d.sollicitation_id = s.id
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by (s.statut = 'envoyee') desc, s.envoyee_le desc;
$definition_anterieure$;
  revoke all on function public.mes_sollicitations() from public, anon;
  grant execute on function public.mes_sollicitations() to authenticated, service_role;
  raise notice 'public.mes_sollicitations() : définition antérieure rétablie';
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- Ce que le retour laisse en place, dit en clair.
do $retour_arriere$
declare v_n integer;
begin
  select count(*) into v_n from public.incident_devis where statut = 'refuse';
  raise notice 'Devis déjà refusés, conservés tels quels : %', v_n;
end $retour_arriere$;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014600000';
  end if;
end $retour_arriere$;

commit;
