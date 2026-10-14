-- RETOUR ARRIÈRE de 20261013120000_correctifs_audit_13_octobre.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261013120000_correctifs_audit_13_octobre.retour.sql
--
-- RÉINTRODUIT les défauts corrigés (AUD-A-01 agent restreint sur les équipements d'un lot, AUD-A-02 et AUD-A-04
-- sans trace d'audit, AUD-A-03 sans événement d'incident à l'annulation d'une mission, SUP-02 arrêt d'urgence
-- bloqué pendant un diagnostic, SUP-08 alerte escaladée requalifiée, REP-01 second envoi de créneaux refusé,
-- ARC-10 « aujourd'hui » au fuseau de la session). NE DÉFAIT PAS les lignes déjà écrites : audit_log
-- (contre_ecriture, detention_supprimee), incident_evenements (mission_annulee), créneaux « caduc ».

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

-- Pré-contrôle en lecture seule, avant tout travail : une ligne mission_annulee interdit le retour de la contrainte.
do $retour_arriere$
declare v_lignes bigint;
begin
  select count(*) into v_lignes from public.incident_evenements where type = 'mission_annulee';
  if v_lignes > 0 and coalesce(current_setting('gerimmo.retour_arriere_conserver_mission_annulee', true), '') <> 'oui' then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : % ligne(s) de public.incident_evenements portent type = mission_annulee, valeur que la contrainte antérieure interdit. Voir LISEZ-MOI.md (« Lignes mission_annulee »). Pour rétablir tout le reste en gardant ces lignes (contrainte posée NOT VALID), relancer après : set gerimmo.retour_arriere_conserver_mission_annulee = ''oui'';', v_lignes;
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
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

-- ARC-10 (2/2)
select pg_temp.restaurer_fonction('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)',
  $marque$Audit du 13/10 (ARC-10)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=public.exiger_artisan_reel(); c public.artisan_clients; h public.artisan_chantiers; d public.artisan_devis_externes; old public.artisan_evenements_prives; r uuid; calcul record; debut timestamptz; fin timestamptz; conflit boolean; empreinte text; piece uuid;
begin
 if (select auth.uid()) is null or a is null or not public.artisan_module_actif('clients') then raise exception 'Clients externes : saisie désactivée'; end if;
 if p_cle is null or p_donnees is null or jsonb_typeof(p_donnees)<>'object' or octet_length(p_donnees::text)>100000 then raise exception 'Demande invalide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 empreinte:=md5(jsonb_build_array(p_action,p_id,p_revision,p_donnees)::text);
 select * into old from public.artisan_evenements_prives where artisan_id=a and cle=p_cle;
 if found then if old.empreinte_requete<>empreinte then raise exception 'Cette clé a déjà servi pour une autre demande'; end if; return old.objet_id; end if;
 if p_action in ('client','modifier_client','archiver_client') then
  if p_action<>'client' then
   select * into c from public.artisan_clients where id=p_id and artisan_id=a for update;
   if not found then raise exception 'Accès refusé'; end if;
   if c.revision is distinct from p_revision then raise exception 'La fiche a changé : rechargez avant de continuer'; end if;
  end if;
  if p_action='client' then
   insert into public.artisan_clients(artisan_id,nom,type,email,telephone,adresse) values(a,btrim(p_donnees->>'nom'),p_donnees->>'type',lower(btrim(coalesce(p_donnees->>'email',''))),btrim(coalesce(p_donnees->>'telephone','')),btrim(p_donnees->>'adresse')) returning id into r;
  elsif p_action='modifier_client' then
   if c.archive_le is not null then raise exception 'Réactivez ce client avant modification'; end if;
   update public.artisan_clients set nom=btrim(p_donnees->>'nom'),type=p_donnees->>'type',email=lower(btrim(coalesce(p_donnees->>'email',''))),telephone=btrim(coalesce(p_donnees->>'telephone','')),adresse=btrim(p_donnees->>'adresse'),revision=revision+1 where id=c.id; r:=c.id;
  else update public.artisan_clients set archive_le=case when coalesce((p_donnees->>'archive')::boolean,true) then now() else null end,revision=revision+1 where id=c.id; r:=c.id;
  end if;
 elsif p_action='chantier' then
  select * into c from public.artisan_clients where id=p_id and artisan_id=a;
  if not found then raise exception 'Accès refusé'; end if;
  if c.archive_le is not null then raise exception 'Ce client est archivé'; end if;
  insert into public.artisan_chantiers(artisan_id,client_id,titre,adresse,description) values(a,c.id,btrim(p_donnees->>'titre'),btrim(p_donnees->>'adresse'),btrim(p_donnees->>'description')) returning id into r;
 else
  select * into h from public.artisan_chantiers where id=p_id and artisan_id=a for update;
  if not found then raise exception 'Accès refusé'; end if;
  if h.revision is distinct from p_revision then raise exception 'Le chantier a changé : rechargez avant de continuer'; end if;
  if h.statut in ('annule','termine') and not(p_action='facture' and h.statut='termine') then raise exception 'Ce chantier est terminé ou annulé'; end if;
  r:=h.id;
  select * into c from public.artisan_clients where id=h.client_id and artisan_id=a;
  if p_action='devis' then
   if h.statut not in ('brouillon','accepte','planifie') then raise exception 'Le devis ne peut plus être révisé après le début des travaux'; end if;
   if c.archive_le is not null then raise exception 'Ce client est archivé'; end if;
   if (p_donnees->>'valide_jusqu_au')::date<current_date or (p_donnees->>'valide_jusqu_au')::date>current_date+365 then raise exception 'Vérifiez la date de validité'; end if;
   select * into calcul from public.calculer_devis_lignes(p_donnees->'lignes');
   update public.artisan_devis_externes set statut='remplace' where chantier_id=h.id and statut in ('brouillon','valide','accepte');
   update public.artisan_rendez_vous set statut='annule',motif='Révision du devis : nouvelle acceptation requise' where chantier_id=h.id and statut='retenu';
   insert into public.artisan_devis_externes(artisan_id,chantier_id,version,description,lignes,montant_ht_cents,montant_tva_cents,montant_ttc_cents,entreprise,client,valide_jusqu_au)
    select a,h.id,coalesce((select max(version) from public.artisan_devis_externes where chantier_id=h.id),0)+1,p_donnees->>'description',calcul.lignes_normalisees,calcul.montant_ht_cents,calcul.montant_tva_cents,calcul.montant_ttc_cents,
      jsonb_build_object('nom',ar.raison_sociale,'siret',ar.siret,'telephone',ar.telephone,'email',ar.email,'adresse',pr.adresse,'mentions',pr.mentions),to_jsonb(c),(p_donnees->>'valide_jusqu_au')::date
    from public.artisans ar left join public.artisan_profils_documents pr on pr.artisan_id=ar.id where ar.id=a;
   update public.artisan_chantiers set statut='brouillon' where id=h.id;
  elsif p_action in ('valider_devis','decision') then
   select * into d from public.artisan_devis_externes where chantier_id=h.id and artisan_id=a order by version desc limit 1 for update;
   if not found or d.id is distinct from (p_donnees->>'devis_id')::uuid then raise exception 'Relisez la dernière version du devis'; end if;
   if p_action='valider_devis' then
    piece:=(p_donnees->>'piece_id')::uuid;
    if d.statut<>'brouillon' or d.valide_jusqu_au<current_date or coalesce(d.entreprise->>'adresse','')='' then raise exception 'Complétez la fiche entreprise et relisez un devis valable'; end if;
    if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a and mime='application/pdf') then raise exception 'PDF du devis absent'; end if;
    update public.artisan_devis_externes set statut='valide',pdf_id=piece where id=d.id;
   else
    if d.statut<>'valide' or d.valide_jusqu_au<current_date then raise exception 'Validez un devis encore valable avant la décision'; end if;
    if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Précisez la décision du client'; end if;
    if p_donnees->>'decision'='accepte' then
     piece:=(p_donnees->>'piece_id')::uuid;
     if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a) then raise exception 'Joignez la preuve de l’accord'; end if;
     if (p_donnees->>'date')::date is null or (p_donnees->>'date')::date>current_date or (p_donnees->>'date')::date<d.created_at::date then raise exception 'Date de décision invalide'; end if;
     update public.artisan_devis_externes set statut='accepte',preuve_acceptation_id=piece,accepte_le=(p_donnees->>'date')::date,motif_decision=p_donnees->>'motif' where id=d.id;
     update public.artisan_chantiers set statut='accepte' where id=h.id;
    elsif p_donnees->>'decision'='refuse' then update public.artisan_devis_externes set statut='refuse',motif_decision=p_donnees->>'motif' where id=d.id;
    else raise exception 'Décision invalide'; end if;
   end if;
  elsif p_action='planning' then
   if h.statut not in ('accepte','planifie') then raise exception 'L’accord du client est requis avant le rendez-vous'; end if;
   debut:=(p_donnees->>'debut')::timestamptz; fin:=(p_donnees->>'fin')::timestamptz;
   if debut is null or fin is null or not isfinite(debut) or not isfinite(fin) or debut<=now() or fin<=debut then raise exception 'Choisissez des dates futures et une fin après le début'; end if;
   if h.statut='planifie' and length(btrim(coalesce(p_donnees->>'motif','')))<3 then raise exception 'Expliquez le report'; end if;
   -- Variables qualifiées plus bas évitent toute ambiguïté avec les colonnes du rendez-vous.
   conflit:=public.conflit_planning_artisan(a,debut,fin,null,h.id);
   if conflit and length(btrim(coalesce(p_donnees->>'conflit_motif',''))) not between 10 and 1000 then raise exception 'Un autre chantier occupe ce créneau. Expliquez explicitement le maintien (équipe distincte, par exemple)'; end if;
   update public.artisan_rendez_vous set statut='reporte' where chantier_id=h.id and statut='retenu';
   insert into public.artisan_rendez_vous(artisan_id,chantier_id,debut,fin,motif,conflit_motif) values(a,h.id,debut,fin,coalesce(p_donnees->>'motif',''),case when conflit then p_donnees->>'conflit_motif' else null end);
   update public.artisan_chantiers set statut='planifie' where id=h.id;
  elsif p_action='demarrer' then
   if h.statut<>'planifie' then raise exception 'Planifiez d’abord le chantier'; end if;
   update public.artisan_chantiers set statut='en_cours' where id=h.id;
  elsif p_action='bilan' then
   piece:=(p_donnees->>'piece_id')::uuid;
   if h.statut<>'en_cours' then raise exception 'Démarrez d’abord le chantier'; end if;
   if length(btrim(coalesce(p_donnees->>'bilan',''))) not between 10 and 8000 then raise exception 'Décrivez les travaux réalisés'; end if;
   if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a and mime in ('image/jpeg','image/png')) then raise exception 'Joignez une photo du travail'; end if;
   update public.artisan_chantiers set statut='termine',bilan=p_donnees->>'bilan',photo_id=piece where id=h.id;
  elsif p_action='annuler' then
   if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Expliquez l’annulation'; end if;
   update public.artisan_chantiers set statut='annule' where id=h.id;
   update public.artisan_rendez_vous set statut='annule',motif=p_donnees->>'motif' where chantier_id=h.id and statut='retenu';
  elsif p_action='facture' then
   if h.statut<>'termine' or h.photo_id is null or h.bilan is null then raise exception 'Terminez le bilan et la photo avant la facture'; end if;
   select * into d from public.artisan_devis_externes where chantier_id=h.id and statut='accepte';
   if not found then raise exception 'Devis accepté absent'; end if;
   if (p_donnees->>'montant_ttc_cents')::bigint<>d.montant_ttc_cents and length(btrim(coalesce(p_donnees->>'justification','')))<10 then raise exception 'Expliquez l’écart avec le devis accepté'; end if;
   insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,justification,piece_id) values(a,h.id,d.id,btrim(p_donnees->>'numero'),(p_donnees->>'montant_ttc_cents')::bigint,p_donnees->>'justification',(p_donnees->>'piece_id')::uuid);
  else raise exception 'Action inconnue'; end if;
  update public.artisan_chantiers set revision=revision+1 where id=h.id;
 end if;
 insert into public.artisan_evenements_prives(artisan_id,objet_id,action,details,cle,empreinte_requete,auteur) values(a,r,p_action,p_donnees,p_cle,empreinte,(select auth.uid()));
 return r;
exception when unique_violation then raise exception 'Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer';
end $function$
$definition_anterieure$);

-- ARC-10 (1/2)
select pg_temp.restaurer_fonction('public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)',
  $marque$Audit du 13/10 (ARC-10)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.artisan_reglement_ecrire(p_action text, p_origine text, p_facture uuid, p_donnees jsonb, p_cle uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=public.exiger_artisan_reel(); total bigint; verse bigint; old public.artisan_evenements_prives; r public.artisan_reglements; ident uuid; empreinte text;
begin
 if (select auth.uid()) is null or a is null or not public.artisan_module_actif('reglements') then raise exception 'Règlements manuels : saisie désactivée'; end if;
 if p_cle is null or p_donnees is null or jsonb_typeof(p_donnees)<>'object' or octet_length(p_donnees::text)>10000 then raise exception 'Demande invalide'; end if;
 -- Sérialisation de tous les règlements et annulations de cet artisan, y compris deux fenêtres.
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 empreinte:=md5(jsonb_build_array(p_action,p_origine,p_facture,p_donnees)::text);
 select * into old from public.artisan_evenements_prives where artisan_id=a and cle=p_cle;
 if found then if old.empreinte_requete<>empreinte then raise exception 'Cette clé a déjà servi pour une autre demande'; end if; return old.objet_id; end if;
 if p_origine='gerimmo' then select montant_ttc_cents into total from public.intervention_factures where id=p_facture and artisan_id=a for update;
 elsif p_origine='externe' then select montant_ttc_cents into total from public.artisan_factures_externes where id=p_facture and artisan_id=a for update;
 else raise exception 'Origine inconnue'; end if;
 if total is null then raise exception 'Accès refusé'; end if;
 if p_action='reglement' then
  select coalesce(sum(montant_cents),0) into verse from public.artisan_reglements where artisan_id=a and annule_le is null and (facture_gerimmo_id=p_facture or facture_externe_id=p_facture);
  if (p_donnees->>'montant_cents')::bigint is null or (p_donnees->>'montant_cents')::bigint<=0 or (p_donnees->>'montant_cents')::bigint>total-verse then raise exception 'Le montant doit être positif et ne pas dépasser le solde'; end if;
  if (p_donnees->>'date')::date is null or (p_donnees->>'date')::date>current_date then raise exception 'Indiquez la date réelle du règlement, sans date future'; end if;
  insert into public.artisan_reglements(artisan_id,facture_gerimmo_id,facture_externe_id,montant_cents,date_reglement,moyen,reference,preuve_id,auteur)
   values(a,case when p_origine='gerimmo' then p_facture end,case when p_origine='externe' then p_facture end,(p_donnees->>'montant_cents')::bigint,(p_donnees->>'date')::date,p_donnees->>'moyen',btrim(p_donnees->>'reference'),(p_donnees->>'piece_id')::uuid,(select auth.uid())) returning id into ident;
 elsif p_action='annuler_reglement' then
  select * into r from public.artisan_reglements where id=(p_donnees->>'reglement_id')::uuid and artisan_id=a and (facture_gerimmo_id=p_facture or facture_externe_id=p_facture) for update;
  if not found then raise exception 'Accès refusé'; end if;
  if r.annule_le is not null then raise exception 'Ce règlement est déjà annulé'; end if;
  if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Expliquez l’annulation'; end if;
  if (p_donnees->>'piece_id')::uuid is null then raise exception 'Joignez le justificatif de correction'; end if;
  update public.artisan_reglements set annule_le=clock_timestamp(),annule_par=(select auth.uid()),annulation_motif=p_donnees->>'motif',annulation_preuve_id=(p_donnees->>'piece_id')::uuid where id=r.id;
  ident:=r.id;
 else raise exception 'Action inconnue'; end if;
 insert into public.artisan_evenements_prives(artisan_id,objet_id,action,details,cle,empreinte_requete,auteur) values(a,ident,p_action,p_donnees||jsonb_build_object('facture_id',p_facture,'origine',p_origine),p_cle,empreinte,(select auth.uid()));
 return ident;
end $function$
$definition_anterieure$);

-- REP-01
select pg_temp.restaurer_fonction('public.contre_proposer_creneaux(uuid,uuid,jsonb)',
  $marque$Audit du 13/10 (REP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.contre_proposer_creneaux(p_org uuid, p_intervention uuid, p_creneaux jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb; v_debut timestamptz; v_fin timestamptz; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;

  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;
  if v.statut <> 'acceptee' then
    raise exception 'Cette mission n''attend pas de contre-proposition (état : %)', v.statut;
  end if;

  if jsonb_typeof(p_creneaux) is distinct from 'array' then
    raise exception 'Les créneaux doivent être une liste de propositions';
  end if;
  v_nb := jsonb_array_length(p_creneaux);
  if v_nb < 3 then
    raise exception 'Si aucun créneau ne convient, proposez-en trois à votre tour (RM-10.2.2) — vous en avez proposé %', v_nb;
  end if;

  -- Valider tout le lot avant de rendre un ancien créneau caduc/refusé.
  -- Comparer les instants, pas leur écriture : +02:00 et Z peuvent désigner
  -- exactement la même proposition.
  for c in select jsonb_array_elements(p_creneaux) loop
    if jsonb_typeof(c) is distinct from 'object'
       or jsonb_typeof(c->'debut') is distinct from 'string'
       or jsonb_typeof(c->'fin') is distinct from 'string' then
      raise exception 'Chaque créneau doit contenir une date de début et une date de fin';
    end if;
    begin
      v_debut := (c->>'debut')::timestamptz;
      v_fin := (c->>'fin')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Les dates du créneau sont invalides';
    end;
    if not isfinite(v_debut) or not isfinite(v_fin) then
      raise exception 'Les dates du créneau doivent être finies';
    end if;
    if v_fin <= v_debut then
      raise exception 'Chaque créneau doit se terminer après avoir commencé';
    end if;
    if v_debut <= now() then
      raise exception 'Un créneau doit commencer dans le futur';
    end if;
  end loop;
  if (select count(*) from (
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz
        from jsonb_array_elements(p_creneaux) x
        group by 1, 2
      ) distincts) <> v_nb then
    raise exception 'Vos propositions de créneaux doivent être différentes';
  end if;

  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';

  select count(*) into v_refuses from public.intervention_creneaux
  where intervention_id = p_intervention and statut = 'refuse';
  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;

  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by)
    values (p_org, p_intervention, 'locataire', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()));
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneaux_proposes', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'locataire',
                             'tour', v_tour, 'nombre', v_nb, 'refuses_cumules', v_refuses));

  -- RM-10.4.1 : au sixième refus, le gérant reprend la main. Les créneaux
  -- refusés restent en base — RM-10.4.4, le refus persistant est opposable.
  if v_refuses >= 6 then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (p_org, 'creneaux_arbitrage', 'critique',
            'Rendez-vous à arbitrer — ' ||
              (select numero from public.incidents where id = v.incident_id),
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'libelle', v_refuses || ' créneaux refusés : réglez le rendez-vous par téléphone (RM-10.4.1)'),
            'intervention', p_intervention);
  end if;
  return v_nb;
end;
$function$
$definition_anterieure$);

-- SUP-08
select pg_temp.restaurer_fonction('public.traiter_vacances()',
  $marque$Audit du 13/10 (SUP-08)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.traiter_vacances()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.supervision_vacances; t record; passage record; nombre integer:=0;
begin
 if auth.role() is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès refusé'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supervision_vacances',0));
 for p in select * from public.supervision_vacances where etat in ('programme','actif') order by debut for update loop
  if p.fin<=now() then
   update public.supervision_vacances set etat='termine' where id=p.id;
   insert into public.supervision_operations(objet,action,auteur) values(p.id,'vacances_terminees',auth.uid());continue;
  end if;
  if p.debut>now() then continue; end if;
  if p.etat='programme' then
   update public.supervision_vacances set etat='actif' where id=p.id;
   insert into public.supervision_operations(objet,action,auteur) values(p.id,'vacances_actives',auth.uid());
  end if;
  if not public.responsable_supervision_habilite(p.responsable) then
   perform public.signaler_urgence_vacances(p.id,'responsable_non_habilite','Le responsable a perdu son habilitation. Aucune tâche du plan ne peut démarrer.');
   update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade');continue;
  end if;
  for passage in select id from public.agent_passages where etat in ('a_reprendre','interrompu') and debut>=p.debut loop
   perform public.signaler_urgence_vacances(p.id,'passage:'||passage.id::text,'Un passage demande une vérification dans le suivi des équipes.');
  end loop;
  if public.verifier_arret_supervision('consignes',p.id) then
   for t in select id from public.supervision_consignes_taches where version_id=p.consigne_version and etat='approuvee' order by type loop
    begin perform public.executer_tache_consigne(t.id,p.id);nombre:=nombre+1;
    exception when others then perform public.signaler_urgence_vacances(p.id,'tache:'||t.id::text,'Une lecture autorisée est bloquée. Vérifiez sa version, sa période et son budget.'); end;
   end loop;
  end if;
 end loop;
 -- Une alerte non acquittée demeure visible après la fin des vacances.
 for t in update public.supervision_alertes_internes a set statut=case when public.responsable_supervision_habilite(source_plan.cree_par) then 'escalade' else 'non_acheminee' end,escalade_le=now(),destinataire=source_plan.cree_par
 from public.supervision_vacances source_plan where source_plan.id=a.plan_id and a.statut='ouverte' and a.echeance<=now() returning a.id,a.statut loop
  insert into public.supervision_operations(objet,action,auteur,details) values(t.id,'alerte_escalade',auth.uid(),jsonb_build_object('statut',t.statut));
 end loop;
 return jsonb_build_object('lectures_executees',nombre,'canal','interne','observe_le',now());
end $function$
$definition_anterieure$);

-- SUP-02
select pg_temp.restaurer_fonction('public.poser_gardes_diagnostic_artisan()',
  $marque$'supervision_arrets','supervision_operations','supervision_vacances'$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.poser_gardes_diagnostic_artisan()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare t record; begin
 for t in select schemaname,tablename from pg_tables
  where (schemaname='public' and tablename not in ('supervision_sessions_artisan','audit_log'))
     or (schemaname='storage' and tablename='objects') loop
  execute format('drop trigger if exists diagnostic_artisan_lecture on %I.%I',t.schemaname,t.tablename);
  execute format('create trigger diagnostic_artisan_lecture before insert or update or delete on %I.%I for each row execute function public.refuser_mutation_diagnostic_artisan()',t.schemaname,t.tablename);
 end loop;
end $function$
$definition_anterieure$);

-- SUP-02 (suite) : la migration avait retiré les gardes de lecture seule des trois tables de l'arrêt d'urgence.
-- On ne repose QUE ces trois déclencheurs (même définition que poser_gardes_diagnostic_artisan() d'origine),
-- au lieu de rejouer cette fonction sur toutes les tables du schéma.
drop trigger if exists diagnostic_artisan_lecture on public.supervision_arrets;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.supervision_arrets
  for each row execute function public.refuser_mutation_diagnostic_artisan();
drop trigger if exists diagnostic_artisan_lecture on public.supervision_operations;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.supervision_operations
  for each row execute function public.refuser_mutation_diagnostic_artisan();
drop trigger if exists diagnostic_artisan_lecture on public.supervision_vacances;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.supervision_vacances
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- AUD-A-04
select pg_temp.restaurer_fonction('public.supprimer_detention(uuid)',
  $marque$Audit du 13/10 (AUD-A-04)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.supprimer_detention(p_detention uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_lot uuid;
begin
  select organization_id, lot_id into v_org, v_lot
  from public.detentions where id = p_detention;
  if v_org is null then raise exception 'Détention introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if exists (select 1 from public.baux where lot_id = v_lot) then
    raise exception 'Ce lot a un bail : la détention a une valeur historique — clôturez-la (date de fin) au lieu de la supprimer (RM-0.2.4)';
  end if;
  delete from public.detentions where id = p_detention;
end;
$function$
$definition_anterieure$);

-- AUD-A-03 (2/2)
select pg_temp.restaurer_fonction('public.annuler_mission(uuid,uuid,text)',
  $marque$Audit du 13/10 (AUD-A-03)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.annuler_mission(p_org uuid, p_intervention uuid, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif d''annulation est obligatoire (RM-10.5)';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut in ('terminee', 'annulee', 'refusee') then
    raise exception 'Cette mission est déjà close (état : %)', v.statut;
  end if;

  update public.incident_interventions
  set statut = 'annulee', annulee_le = now(), annulation_motif = trim(p_motif)
  where id = p_intervention;
  -- Le devis retenu tombe avec la mission annulée : il ne désigne plus
  -- personne, et tant qu'il reste « retenu » aucun autre ne peut l'être.
  update public.incident_devis set statut = 'annule'
  where id = v.devis_id and statut = 'retenu';
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut in ('propose', 'retenu');
  update public.incidents set etat = 'qualifie'
  where id = v.incident_id and etat in ('affecte', 'en_cours');
end;
$function$
$definition_anterieure$);

-- AUD-A-02
select pg_temp.restaurer_fonction('public.contre_ecriture(uuid,text)',
  $marque$Audit du 13/10 (AUD-A-02)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.contre_ecriture(p_ecriture uuid, p_motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_new uuid; v_refus text;
begin
  select * into v from public.ecritures where id = p_ecriture;
  if v.id is null then raise exception 'Écriture introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  -- Audit agence 27/09 : une écriture née d'un geste de gestion s'annule par
  -- le geste inverse, jamais seule depuis le journal.
  v_refus := public.ecriture_annulable_depuis_le_journal(p_ecriture);
  if v_refus is not null then raise exception '%', v_refus; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif de contre-écriture obligatoire'; end if;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
     date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
  values (v.organization_id, v.bail_id, v.lot_id, v.mandat_id, v.categorie,
     case when v.sens = 'recette' then 'depense' else 'recette' end, v.montant,
     v.date_piece, current_date, 'Contre-écriture : ' || p_motif, v.systeme, v.id,
     btrim(p_motif))
  returning id into v_new;
  return v_new;
end; $function$
$definition_anterieure$);

-- AUD-A-01
select pg_temp.restaurer_fonction('public.definir_equipements_lot(uuid,uuid[])',
  $marque$Audit du 13/10 (AUD-A-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.definir_equipements_lot(p_lot uuid, p_equipements uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.lots where id = p_lot;
  if v_org is null then raise exception 'Lot introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_equipements, '{}'::uuid[])) as e(id)
    where not exists (select 1 from public.equipements_catalogue c
                      where c.id = e.id and c.organization_id = v_org)
  ) then
    raise exception 'Équipement inconnu du catalogue de l''agence';
  end if;

  delete from public.lot_equipements where lot_id = p_lot;
  insert into public.lot_equipements (lot_id, equipement_id)
  select p_lot, e.id from unnest(coalesce(p_equipements, '{}'::uuid[])) as e(id);
end $function$
$definition_anterieure$);

-- AUD-A-03 (1/2) : la contrainte revient à la liste d'origine (migration 20260930220000), sans 'mission_annulee'.
-- Une ligne qui porte déjà cette valeur interdit le retour (la contrainte antérieure la refuserait) :
-- le script s'arrête AVANT de rien changer. Voir LISEZ-MOI.md, section « Lignes mission_annulee ».
do $retour_arriere$
declare
  v_def text; v_lignes bigint;
  v_conserver boolean := coalesce(current_setting('gerimmo.retour_arriere_conserver_mission_annulee', true), '') = 'oui';
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.incident_evenements'::regclass and conname = 'incident_evenements_type_check';
  if v_def is null then
    raise exception 'Retour arrière : la contrainte incident_evenements_type_check n''existe pas (base inattendue)';
  end if;
  if v_def not like '%mission_annulee%' then
    raise notice 'incident_evenements_type_check : déjà dans l''état antérieur, rien à faire';
    return;
  end if;
  select count(*) into v_lignes from public.incident_evenements where type = 'mission_annulee';
  if v_lignes > 0 and not v_conserver then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : % ligne(s) de public.incident_evenements portent type = mission_annulee, valeur que la contrainte antérieure interdit. Voir LISEZ-MOI.md (« Lignes mission_annulee »). Pour retirer la valeur pour les écritures futures en gardant ces lignes, relancer après : set gerimmo.retour_arriere_conserver_mission_annulee = ''oui'';', v_lignes;
  end if;
  alter table public.incident_evenements
    drop constraint incident_evenements_type_check,
    add constraint incident_evenements_type_check
    check (type = any (array[
      'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
      'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
      'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
      'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
      'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
      'creneaux_refuses', 'facture_deposee', 'facture_validee'
    ]::text[])) not valid;
  if v_lignes = 0 then
    alter table public.incident_evenements validate constraint incident_evenements_type_check;
  else
    raise warning '% ligne(s) mission_annulee conservée(s) : la contrainte est posée NOT VALID (elle refuse toute nouvelle valeur, mais elle ne peut pas être validée tant que ces lignes existent)', v_lignes;
  end if;
end $retour_arriere$;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261013120000';
  end if;
end $retour_arriere$;

commit;
