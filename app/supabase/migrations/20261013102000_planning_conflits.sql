-- ART004 : seuls les rendez-vous confirmés occupent le planning.
-- Une frontière commune (fin = début) reste libre ; les propositions restent alternatives.
-- Le verrou est le même que celui du domaine privé, conservé jusqu'à la fin
-- de la transaction. Les fonctions de confirmation prennent ce verrou AVANT
-- les lignes de mission/créneau ; aucun détail d'un autre dossier ne sort.
create or replace function public.conflit_planning_artisan(
 p_artisan uuid, p_debut timestamptz, p_fin timestamptz,
 p_intervention uuid default null, p_chantier uuid default null)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_artisan is null or p_debut is null or p_fin is null
    or not isfinite(p_debut) or not isfinite(p_fin) or p_fin<=p_debut then
  raise exception 'Le rendez-vous doit avoir un début et une fin valides';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_artisan::text,0));
 return exists(select 1 from public.incident_interventions i
  where i.artisan_id=p_artisan and i.id is distinct from p_intervention
    and i.statut in ('planifiee','en_cours') and i.debut_prevu<p_fin and i.fin_prevue>p_debut)
 or exists(select 1 from public.artisan_rendez_vous r
  join public.artisan_chantiers h on h.id=r.chantier_id and h.artisan_id=r.artisan_id
  where r.artisan_id=p_artisan and r.chantier_id is distinct from p_chantier
    and r.statut='retenu' and h.statut in ('planifie','en_cours') and r.debut<p_fin and r.fin>p_debut);
end $$;
-- Outil interne exclusivement : ni l'identité ni l'agenda d'un tiers ne sont sondables.
revoke all on function public.conflit_planning_artisan(uuid,timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated;
create index if not exists artisan_rendez_vous_planning_idx on public.artisan_rendez_vous(artisan_id,debut,fin) where statut='retenu';

CREATE OR REPLACE FUNCTION public.choisir_creneau(p_org uuid, p_creneau uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
  into v from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  where cr.id = p_creneau and cr.organization_id = p_org;
  if not found then raise exception 'Créneau introuvable'; end if;
  -- Le créneau doit porter sur SON incident : la garde d'appartenance.
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

  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  -- Même mission : sérialiser également les deux choix de dates différents.
  perform 1 from public.incident_interventions where id=v.intervention_id for update;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
    into v from public.intervention_creneaux cr
    join public.incident_interventions iv on iv.id=cr.intervention_id
    where cr.id=p_creneau and cr.organization_id=p_org for update of cr;
  if v.statut_intervention not in ('acceptee','planifiee') then
    raise exception 'Cette mission n’attend pas de rendez-vous';
  end if;
  if v.statut <> 'propose' then
    raise exception 'Ce créneau n''est plus proposé';
  end if;
  -- La garde manquante : on ne retient pas sa propre proposition.
  if v.propose_par = 'locataire' then
    raise exception 'Cette date est celle que vous avez proposée : elle attend l''accord de l''artisan, vous ne pouvez pas la retenir vous-même';
  end if;
  -- Un rendez-vous ne se fixe pas dans le passé (27/09).
  if v.debut <= now() then
    raise exception 'Ce créneau est passé : proposez vos disponibilités';
  end if;


  if public.conflit_planning_artisan(v.artisan_id,v.debut,v.fin,v.intervention_id,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Choisissez une autre date ou contactez votre interlocuteur pour un arbitrage';
  end if;


  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'locataire'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accepter_creneau_locataire(p_creneau uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  select c.*, i.incident_id, i.statut as statut_intervention, i.artisan_id
    into v
  from public.intervention_creneaux c
  join public.incident_interventions i on i.id = c.intervention_id
  where c.id = p_creneau
    and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
;
  if not found then raise exception 'Accès refusé'; end if;
  perform public.exiger_artisan_reel();
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  perform 1 from public.incident_interventions where id=v.intervention_id for update;
  select c.*, i.incident_id, i.statut as statut_intervention, i.artisan_id
    into v from public.intervention_creneaux c
    join public.incident_interventions i on i.id=c.intervention_id
    where c.id=p_creneau and i.artisan_id=public.mon_artisan_id() for update of c;
  if v.propose_par <> 'locataire' then
    raise exception 'Cette date n''est pas une proposition du locataire';
  end if;
  if v.statut <> 'propose' then
    raise exception 'Cette date n''est plus proposée';
  end if;
  if v.statut_intervention not in ('acceptee', 'planifiee') then
    raise exception 'Cette mission n''attend pas de rendez-vous (état : %)', v.statut_intervention;
  end if;
  if v.debut <= now() then
    raise exception 'Cette date est passée : proposez vos propres créneaux, ou refusez celles du locataire pour que le gérant arbitre';
  end if;

  if public.conflit_planning_artisan(v.artisan_id,v.debut,v.fin,v.intervention_id,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé. Retenez une autre date ou demandez un arbitrage motivé à votre interlocuteur';
  end if;
  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'artisan'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fixer_creneau_arbitrage(p_org uuid, p_intervention uuid, p_debut timestamp with time zone, p_fin timestamp with time zone, p_motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_creneau uuid; v_tour integer;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  select * into v from public.incident_interventions
    where id=p_intervention and organization_id=p_org for update;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Un rendez-vous ne se fixe que sur une mission acceptée (état : %)', v.statut;
  end if;
  if p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin)
     or p_debut<=now() or p_fin<=p_debut then
    raise exception 'Choisissez des dates futures et une fin après le début';
  end if;
  if public.conflit_planning_artisan(v.artisan_id,p_debut,p_fin,p_intervention,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Choisissez une autre date ou confirmez explicitement un maintien motivé';
  end if;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux
  set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');

  insert into public.intervention_creneaux
    (organization_id, intervention_id, propose_par, tour, debut, fin, statut, created_by)
  values (p_org, p_intervention, 'agence', v_tour, p_debut, p_fin, 'retenu', (select auth.uid()))
  returning id into v_creneau;

  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = p_debut, fin_prevue = p_fin
  where id = p_intervention;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte' and type = 'creneaux_arbitrage'
    and details->>'intervention_id' = p_intervention::text;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'arbitrage_creneau', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'debut', p_debut,
                             'fin', p_fin, 'motif', nullif(trim(coalesce(p_motif, '')), '')));
  return v_creneau;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fixer_creneau_arbitrage_motive(p_org uuid, p_intervention uuid, p_debut timestamp with time zone, p_fin timestamp with time zone, p_motif text, p_conflit_motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_creneau uuid; v_tour integer; v_conflit boolean;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  select * into v from public.incident_interventions
    where id=p_intervention and organization_id=p_org for update;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Un rendez-vous ne se fixe que sur une mission acceptée (état : %)', v.statut;
  end if;
  if p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin)
     or p_debut<=now() or p_fin<=p_debut then
    raise exception 'Choisissez des dates futures et une fin après le début';
  end if;
  v_conflit:=public.conflit_planning_artisan(v.artisan_id,p_debut,p_fin,p_intervention,null);
  if v_conflit and length(btrim(coalesce(p_conflit_motif,''))) not between 10 and 1000 then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Cochez le maintien et justifiez l’accord vérifié avec l’artisan (10 à 1000 caractères), ou choisissez une autre date';
  end if;


  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux
  set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');

  insert into public.intervention_creneaux
    (organization_id, intervention_id, propose_par, tour, debut, fin, statut, created_by)
  values (p_org, p_intervention, 'agence', v_tour, p_debut, p_fin, 'retenu', (select auth.uid()))
  returning id into v_creneau;

  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = p_debut, fin_prevue = p_fin
  where id = p_intervention;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte' and type = 'creneaux_arbitrage'
    and details->>'intervention_id' = p_intervention::text;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'arbitrage_creneau', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'debut', p_debut,
                             'fin', p_fin, 'motif', nullif(trim(coalesce(p_motif, '')), ''),
                             'conflit_confirme', v_conflit,
                             'conflit_motif', case when v_conflit then btrim(p_conflit_motif) else null end));
  return v_creneau;
end;
$function$
;

revoke all on function public.fixer_creneau_arbitrage_motive(uuid,uuid,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.fixer_creneau_arbitrage_motive(uuid,uuid,timestamptz,timestamptz,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
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
;
