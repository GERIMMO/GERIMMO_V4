-- Audit du 19/10/2026, lot B5 : le SORT d'un devis signé reste décidable, son CONTENU reste figé ; la validité des devis
-- se juge au jour de Paris.
--
-- LE DÉFAUT (constat vérifié en production le 19/10, lecture seule ; définitions identiques à celles du dépôt). Depuis
-- 20261018193308 :
--  (1) le déclencheur devis_signature_verrou (garder_devis_en_signature) refusait TOUT changement d'un devis engagé ou signé,
--      sauf depose→retenu. Un devis signé ne pouvait plus expirer : la tâche de nuit maintenance-artisans (une seule
--      instruction pour tous les devis, sans gestionnaire d'exception) aurait échoué en entier dès le premier devis signé
--      périmé ; aucun devis n'aurait expiré, aucune sollicitation n'aurait été libérée. Un devis signé puis retenu ne
--      pouvait plus être annulé : refuser_mission, annuler_mission, la liste noire locale ou globale de l'artisan
--      échouaient dès qu'un devis signé était concerné ;
--  (2) l'index unique signature_devis_une_offre retenait les circuits 'termine' : un seul devis signé par dossier, pour
--      toujours, même après désistement de l'artisan ou expiration de l'offre ;
--  (3) retenir_devis et deposer_devis jugeaient la validité d'un devis au jour de la SESSION (current_date, UTC chez
--      Supabase) : entre minuit et 1 h (hiver) ou 2 h (été) à Paris, un devis « valable jusqu'au » J pouvait encore être
--      retenu le J+1, et un devis déposé à 0 h 30 recevait une validité par défaut comptée depuis la veille.
--
-- CE QUE FAIT CETTE MIGRATION (aucune donnée réécrite ; la tâche de nuit maintenance_artisans_interne n'est pas modifiée) :
--  (a) garder_devis_en_signature : le contenu (texte, lignes, montants, PDF, validité, version) d'un devis engagé ou signé
--      est figé ; seules les transitions « statut seul » passent : depose→retenu (règle existante, circuit 'termine'
--      seulement), depose→expire (caducité), depose→annule (artisan écarté), retenu→annule (mission annulée ou refusée).
--      depose→refuse, depose→revise et depose→non_retenu restent refusés avec le message actuel ; DELETE toujours refusé ;
--  (b) l'index signature_devis_une_offre ne retient plus que les circuits actifs ('pret','preparation','en_cours',
--      'a_verifier') ; aucune ligne à réécrire (le prédicat se resserre) ;
--  (c) la règle « une seule offre signée VIVANTE par dossier » passe dans reserver_envoi_signature_bail (branche
--      devis_artisan, dossier déjà verrouillé for update) et dans lire_signature_devis (message au propriétaire avant toute
--      préparation) : refus tant qu'un circuit 'termine' du dossier porte un devis encore 'depose' ou 'retenu' ;
--  (d) retenir_devis (1 occurrence) et deposer_devis (2 occurrences ; 1 citation du jour de Paris déjà présente depuis
--      20261014601000) lisent le jour de Paris, public.aujourdhui_paris() (migration 20261014500000) : remplacement à
--      compte exact d'occurrences, forme déjà convertie acceptée (rejeu sans effet), toute autre forme arrête la migration
--      en nommant la fonction, sans rien modifier.
-- Ce qu'elle NE fait PAS : aucune annulation automatique chez le prestataire de signature, aucun nouveau type d'événement
-- d'incident, les circuits d'essai comptent comme aujourd'hui.
-- Rejouable ; droits inchangés (create or replace et revoke identique) ; fermeture à anon rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261019124000_devis_signes_sort_et_jour_de_paris.retour.sql

-- (a) Le sort d'un devis engagé ou signé reste décidable ; son contenu reste figé. Le déclencheur devis_signature_verrou
-- (before update or delete) existe déjà et n'est pas recréé.
create or replace function public.garder_devis_en_signature() returns trigger language plpgsql security definer set search_path='' as $$
-- B5 (19/10/2026) : le contenu d'une offre engagée ou signée est figé ; son sort (retenu, expiré, annulé) reste décidable, l'archive signée est conservée.
declare v_actif boolean; v_signe boolean;
begin
 select coalesce(bool_or(c.etat in ('preparation','en_cours','a_verifier')),false), coalesce(bool_or(c.etat='termine'),false) into v_actif, v_signe
   from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=old.id;
 if v_actif or v_signe then
   if tg_op='DELETE' then raise exception 'Ce devis est engagé dans un circuit de signature'; end if;
   -- Confier la mission après signature (inchangé) : statut, retenu_le, retenu_par seuls.
   if v_signe and old.statut='depose' and new.statut='retenu'
      and (to_jsonb(new)-'statut'-'retenu_le'-'retenu_par')=(to_jsonb(old)-'statut'-'retenu_le'-'retenu_par') then return new; end if;
   -- Caducité (tâche de nuit), artisan écarté, mission annulée ou refusée par l'artisan : le statut seul change.
   if (to_jsonb(new)-'statut')=(to_jsonb(old)-'statut')
      and ((old.statut='depose' and new.statut in ('expire','annule')) or (old.statut='retenu' and new.statut='annule')) then return new; end if;
   raise exception 'Annulez le circuit en cours avant de modifier le devis. Une offre déjà signée doit être conservée.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.garder_devis_en_signature() from public,anon,authenticated;

-- (b) Une seule offre en circuit ACTIF par dossier ; les circuits terminés ne comptent plus dans l'index.
do $index$
declare v_verrou text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout','10s',true);
  if exists(select 1 from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre' and indexdef like '%termine%') then
    drop index public.signature_devis_une_offre;
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre') then
    create unique index signature_devis_une_offre on public.bail_signature_circuits(incident_id)
      where modele='devis_artisan' and etat in ('pret','preparation','en_cours','a_verifier');
  end if;
  perform set_config('lock_timeout',v_verrou,true);
end $index$;

-- (c) Une seule offre signée VIVANTE par dossier, à la réservation (dossier verrouillé for update juste avant : deux
-- réservations concurrentes sur le même dossier se sérialisent). Ancre relue dans la définition en vigueur, compte exact.
do $reserver$
declare f text;
 ancre constant text := $a$if not v.essai and not (select devis_actif from public.signature_budget where singleton) then raise exception 'La signature des devis est encore en préparation'; end if;$a$;
 bloc constant text := $b$-- B5 (19/10/2026) : une seule offre signée vivante par dossier (l'index ne retient plus les circuits terminés).
   if exists(select 1 from public.bail_signature_circuits c join public.incident_devis x on x.id=c.cible_id and x.organization_id=c.organization_id
             where c.modele='devis_artisan' and c.incident_id=v.incident_id and c.etat='termine' and x.statut in ('depose','retenu')) then
     raise exception 'Une offre déjà signée est encore valable sur ce dossier. Attendez son expiration ou son annulation avant d’en signer une autre.';
   end if;
   $b$;
begin
 select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
 if strpos(f,'B5 (19/10/2026)')>0 then return; end if;
 if (length(f)-length(replace(f,ancre,'')))/length(ancre)<>1 then
   raise exception 'B5 : reserver_envoi_signature_bail(uuid,uuid) — ancre absente ou répétée : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.';
 end if;
 execute replace(f,ancre,bloc||ancre);
end $reserver$;

-- (c) Même règle à la lecture par le propriétaire, avant toute préparation (message en clair).
do $lire$
declare f text;
 ancre constant text := $a$if i.etat is distinct from 'qualifie' then raise exception 'Ce dossier n’est plus en attente d’affectation'; end if;$a$;
 bloc constant text := $b$
 -- B5 (19/10/2026) : une seule offre signée vivante par dossier.
 if exists(select 1 from public.bail_signature_circuits c join public.incident_devis x on x.id=c.cible_id and x.organization_id=c.organization_id
           where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat='termine' and x.statut in ('depose','retenu')) then raise exception 'Une offre déjà signée est encore valable sur ce dossier. Attendez son expiration ou son annulation avant d’en signer une autre.'; end if;$b$;
begin
 select pg_get_functiondef('public.lire_signature_devis(uuid,uuid)'::regprocedure) into f;
 if strpos(f,'B5 (19/10/2026)')>0 then return; end if;
 if (length(f)-length(replace(f,ancre,'')))/length(ancre)<>1 then
   raise exception 'B5 : lire_signature_devis(uuid,uuid) — ancre absente ou répétée : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.';
 end if;
 execute replace(f,ancre,ancre||bloc);
end $lire$;

-- (d) La validité d'un devis se juge au jour de Paris. Même méthode que 20261014851000 : la définition EN VIGUEUR est relue
-- (jamais recopiée), le seul mot `current_date` est remplacé, le nombre exact d'occurrences est exigé. Une fonction déjà au
-- jour de Paris est laissée telle quelle ; toute autre forme arrête la migration en nommant la fonction.
do $jour_de_paris$
declare
  -- signature ; nombre exact de `current_date` à remplacer ; citations du jour de Paris déjà présentes avant ce lot.
  v_cibles constant text[][] := array[
    ['public.retenir_devis(uuid,uuid)', '1', '0'],
    ['public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)', '2', '1']
  ];
  c_paris constant text := '\m(public\.)?aujourdhui_paris\(\)';
  v_i integer; v_signature text; v_attendu integer; v_deja integer; v_oid regprocedure; v_def text; v_session integer; v_paris integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'B5 : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1]; v_attendu := v_cibles[v_i][2]::integer; v_deja := v_cibles[v_i][3]::integer;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'B5 : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_session from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
    select count(*) into v_paris from regexp_matches(v_def, c_paris, 'gi');
    if v_session = v_attendu and v_paris = v_deja then
      execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
    elsif v_session = 0 and v_paris = v_attendu + v_deja then
      raise notice 'B5 : % est déjà au jour de Paris, rien à faire.', v_signature;
    else
      raise exception 'B5 : % contient % occurrence(s) de current_date et % du jour de Paris, au lieu de % et % : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_session, v_paris, v_attendu, v_deja;
    end if;
  end loop;
end $jour_de_paris$;

select public.fermer_fonctions_a_anon();
