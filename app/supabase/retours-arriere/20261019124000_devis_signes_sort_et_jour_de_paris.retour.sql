-- RETOUR ARRIÈRE de 20261019124000_devis_signes_sort_et_jour_de_paris.sql (audit du 19/10/2026, lot B5).
-- Transaction EXTERNE (psql --single-transaction -v ON_ERROR_STOP=1 -f <ce fichier>) : aucun begin;/commit; ici, comme
-- 20261018231827_abonnement_jour_paris.retour.sql, pour se jouer aussi dans la chaîne « Ordre complet » du LISEZ-MOI.
-- Rejouable : chaque étape relit l'état en vigueur et ne fait rien quand il est déjà celui d'avant.
--
-- Ce qu'il rétablit, sans toucher aux données :
--  (c) garder_devis_en_signature : texte EXACT de 20261018193308 (le sort d'un devis signé redevient figé : plus
--      d'expiration, d'annulation ni de refus de mission possible sur un devis signé) ; refus si la fonction a été réécrite
--      autrement (ni marqueur B5 ni texte d'origine) ;
--  (d) reserver_envoi_signature_bail et lire_signature_devis : le bloc « une seule offre signée vivante » est retiré par
--      texte exact (une occurrence ; zéro = rien à faire) ;
--  (e) retenir_devis et deposer_devis : la validité se juge de nouveau au jour de la session (current_date), par ancres exactes
--      sur les trois lignes converties ; la citation du jour de Paris posée par 20261014601000 dans deposer_devis reste ;
--  (f) l'index signature_devis_une_offre reprend les circuits 'termine' ; REFUS (sans rien modifier) si deux circuits
--      'termine' partagent déjà un dossier, ce que la correction permet : les dossiers sont nommés ;
--  (g) la ligne d'historique 20261019124000 est retirée (le chantier pourra rejouer la migration).
-- Réintroduit les trois défauts B5 : la tâche maintenance-artisans échoue dès qu'un devis signé est périmé ; mission ni
-- annulable ni refusable sur devis signé ; un seul devis signé par dossier pour toujours.

do $garde$
declare v_dossiers text;
begin
  perform set_config('lock_timeout','10s',true);
  select string_agg(incident_id::text, ', ' order by incident_id) into v_dossiers
  from (select incident_id from public.bail_signature_circuits where modele='devis_artisan' and etat='termine' group by incident_id having count(*)>1) d;
  if v_dossiers is not null then
    raise exception 'Retour arrière refusé : l''ancien index signature_devis_une_offre (un seul circuit terminé par dossier) ne peut pas être reposé, ces dossiers portent plusieurs circuits de signature terminés : %. Rien n''est modifié.', v_dossiers;
  end if;
end $garde$;

-- (c) Le déclencheur d'origine, texte exact de 20261018193308 (l. 60-70).
do $declencheur$
declare f text;
begin
  select pg_get_functiondef('public.garder_devis_en_signature()'::regprocedure) into f;
  if strpos(f,'B5 (19/10/2026)')>0 then
    execute $origine$create or replace function public.garder_devis_en_signature() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=old.id and c.etat in ('preparation','en_cours','a_verifier','termine')) then
   if tg_op='DELETE' then raise exception 'Ce devis est engagé dans un circuit de signature'; end if;
   if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=old.id and c.etat='termine')
      and new.statut='retenu' and old.statut='depose'
      and (to_jsonb(new)-'statut'-'retenu_le'-'retenu_par')=(to_jsonb(old)-'statut'-'retenu_le'-'retenu_par') then return new; end if;
   raise exception 'Annulez le circuit en cours avant de modifier le devis. Une offre déjà signée doit être conservée.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$$origine$;
    revoke all on function public.garder_devis_en_signature() from public,anon,authenticated;
  elsif strpos(f,'Une offre déjà signée doit être conservée.')>0 then
    raise notice 'garder_devis_en_signature() : déjà la définition d''avant B5, rien à faire.';
  else
    raise exception 'Retour arrière refusé : garder_devis_en_signature() a une définition inattendue (ni marqueur B5, ni texte de 20261018193308). Rien n''est modifié.';
  end if;
end $declencheur$;

-- (d) Les deux blocs « une seule offre signée vivante », retirés par texte exact.
do $blocs$
declare f text; n integer;
 bloc_reserver constant text := $b$-- B5 (19/10/2026) : une seule offre signée vivante par dossier (l'index ne retient plus les circuits terminés).
   if exists(select 1 from public.bail_signature_circuits c join public.incident_devis x on x.id=c.cible_id and x.organization_id=c.organization_id
             where c.modele='devis_artisan' and c.incident_id=v.incident_id and c.etat='termine' and x.statut in ('depose','retenu')) then
     raise exception 'Une offre déjà signée est encore valable sur ce dossier. Attendez son expiration ou son annulation avant d’en signer une autre.';
   end if;
   $b$;
 bloc_lire constant text := $b$
 -- B5 (19/10/2026) : une seule offre signée vivante par dossier.
 if exists(select 1 from public.bail_signature_circuits c join public.incident_devis x on x.id=c.cible_id and x.organization_id=c.organization_id
           where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat='termine' and x.statut in ('depose','retenu')) then raise exception 'Une offre déjà signée est encore valable sur ce dossier. Attendez son expiration ou son annulation avant d’en signer une autre.'; end if;$b$;
begin
  select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
  n := (length(f)-length(replace(f,bloc_reserver,'')))/length(bloc_reserver);
  if n=1 then execute replace(f,bloc_reserver,'');
  elsif n=0 and strpos(f,'B5 (19/10/2026)')>0 then raise exception 'Retour arrière refusé : reserver_envoi_signature_bail(uuid,uuid) porte le marqueur B5 sous une autre forme. Rien n''est modifié.';
  elsif n>1 then raise exception 'Retour arrière refusé : reserver_envoi_signature_bail(uuid,uuid) porte % fois le bloc B5. Rien n''est modifié.', n;
  end if;
  select pg_get_functiondef('public.lire_signature_devis(uuid,uuid)'::regprocedure) into f;
  n := (length(f)-length(replace(f,bloc_lire,'')))/length(bloc_lire);
  if n=1 then execute replace(f,bloc_lire,'');
  elsif n=0 and strpos(f,'B5 (19/10/2026)')>0 then raise exception 'Retour arrière refusé : lire_signature_devis(uuid,uuid) porte le marqueur B5 sous une autre forme. Rien n''est modifié.';
  elsif n>1 then raise exception 'Retour arrière refusé : lire_signature_devis(uuid,uuid) porte % fois le bloc B5. Rien n''est modifié.', n;
  end if;
end $blocs$;

-- (e) Retour au jour de la session dans les trois lignes converties (ancres exactes, une occurrence chacune).
do $jour$
declare
  v_ancres constant text[][] := array[
    ['public.retenir_devis(uuid,uuid)', 'if d.valide_jusqu_au < public.aujourdhui_paris() then', 'if d.valide_jusqu_au < current_date then'],
    ['public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)', '(public.aujourdhui_paris() + c.validite_jours)::date', '(current_date + c.validite_jours)::date'],
    ['public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)', 'if v_echeance <= public.aujourdhui_paris() then', 'if v_echeance <= current_date then']
  ];
  v_i integer; v_oid regprocedure; f text; n_paris integer; n_session integer;
begin
  for v_i in 1 .. array_length(v_ancres, 1) loop
    v_oid := to_regprocedure(v_ancres[v_i][1]);
    if v_oid is null then raise exception 'Retour arrière refusé : la fonction % est absente. Rien n''est modifié.', v_ancres[v_i][1]; end if;
    f := pg_get_functiondef(v_oid);
    n_paris := (length(f)-length(replace(f,v_ancres[v_i][2],'')))/length(v_ancres[v_i][2]);
    n_session := (length(f)-length(replace(f,v_ancres[v_i][3],'')))/length(v_ancres[v_i][3]);
    if n_paris=1 and n_session=0 then execute replace(f,v_ancres[v_i][2],v_ancres[v_i][3]);
    elsif n_paris=0 and n_session=1 then raise notice '% : déjà au jour de la session (« % »), rien à faire.', v_ancres[v_i][1], v_ancres[v_i][3];
    else raise exception 'Retour arrière refusé : % contient % fois « % » et % fois « % » : définition inattendue. Rien n''est modifié.', v_ancres[v_i][1], n_paris, v_ancres[v_i][2], n_session, v_ancres[v_i][3];
    end if;
  end loop;
end $jour$;

-- (f) L'index d'origine (20261018193308, l. 9-10), circuits terminés compris.
do $index$
begin
  if exists(select 1 from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre' and indexdef not like '%termine%') then
    drop index public.signature_devis_une_offre;
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre') then
    create unique index signature_devis_une_offre on public.bail_signature_circuits(incident_id)
      where modele='devis_artisan' and etat in ('pret','preparation','en_cours','a_verifier','termine');
  end if;
end $index$;

-- (g) Même transaction externe que le retour ; permettre une réapplication tracée par le chantier.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261019124000';
  end if;
end $historique$;
