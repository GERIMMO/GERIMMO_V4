-- Décision du dirigeant du 15 octobre 2026, point 1 de la suite du jour de Paris (« dépôt de garantie et journal comptable
-- général au jour de Paris »), complétée le 16/10/2026 (tour final de vérification) : la RESTITUTION du dépôt de garantie date
-- « aujourd'hui » du jour de Paris, comme son encaissement et le journal depuis 20261014820000 (lot « fuseau-suite »).
--
-- LE DÉFAUT. Ces deux fonctions prenaient `current_date`, le jour du fuseau de la SESSION (UTC chez Supabase). Entre minuit et 1 h
-- (hiver) ou 2 h (été) à Paris, la base était encore la veille : un décompte de restitution finalisé le 1er janvier à 0 h 30 était
-- daté du 31 décembre, ainsi que ses écritures « Restitution du dépôt de garantie » et « Restitution d'un trop-perçu au
-- locataire » (date de pièce et d'imputation : l'année précédente du journal) ; l'envoi du décompte daté du jour même était
-- refusé (« Date d'envoi invalide »), et sans date il prenait la veille.
-- Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant, aucune colonne, aucune signature, aucun
-- droit ne change ; seul le JOUR de référence change. Aucune ligne existante n'est réécrite : les restitutions, décomptes envoyés
-- et écritures déjà datés gardent leur date.
--
-- INVENTAIRE (base de banc construite depuis ordre-migrations.txt, 16/10/2026) : parmi les 43 fonctions de `public` qui lisent
-- encore `current_date`, seules ces deux écrivent une date du jour sur la restitution du dépôt ou dans le journal comptable
-- général (insertion ou mise à jour de restitutions, retenues, ecritures, depot_encaissements, mouvements_mandants,
-- clotures_comptables). Aucune valeur par défaut de colonne de ces tables ne lit plus `current_date`.
-- Objets réécrits (nombre exact de `current_date` attendu dans la définition en vigueur, tous remplacés) :
--   finaliser_decompte(uuid)              5   date d'émission du décompte ; date de pièce et d'imputation des deux écritures
--   marquer_decompte_envoye(uuid,date)    2   valeur par défaut de la date d'envoi ; refus d'une date d'envoi postérieure
-- HORS de cette migration, volontairement (elles n'écrivent aucune date du jour) : generer_alertes_restitution et
-- rafraichir_alerte_restitution (seuil J-7 / J+0 de l'alerte du délai légal), actualiser_orchestration_socle (priorité d'un
-- dossier de pilotage). Hors de la décision (question au dirigeant) : honoraires, appels de copropriété, clés de répartition,
-- assurance, org_ecriture_ouverte.
--
-- COMMENT. Même méthode que 20261014820000 : chaque fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais
-- recopiée à la main. Aucune ancre de plusieurs lignes (la mise en forme en production peut différer de celle du banc) : on
-- remplace le seul mot `current_date` et on exige le NOMBRE EXACT d'occurrences ci-dessus. Une fonction DÉJÀ au jour de Paris (ce
-- nombre exact de `public.aujourdhui_paris()` ou de `(now() at time zone 'Europe/Paris')::date`, et plus aucun `current_date`)
-- est laissée telle quelle : rejeu sans effet. Toute autre forme (autre nombre, mélange des deux, ni l'un ni l'autre, fonction
-- absente) arrête la migration avec un message qui nomme la fonction, sans rien modifier (dans la transaction du chantier
-- `migrations.yml`, rien ne subsiste).
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014851000_jour_de_paris_restitution_depot.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.finaliser_decompte(uuid)', '5'],
    ['public.marquer_decompte_envoye(uuid,date)', '2']
  ];
  -- Le jour de Paris sous ses deux écritures admises : la fonction du lot (l'en-tête relu par pg_get_functiondef ne qualifie pas ce
  -- qui est dans le chemin de recherche, d'où `public.` facultatif) ou l'expression explicite (rendue `((now() AT TIME ZONE
  -- 'Europe/Paris'::text))::date` dans un en-tête).
  c_paris constant text := '(\mpublic\.)?\maujourdhui_paris\(\)|\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)\)?\s*::\s*date';
  v_i integer;
  v_signature text;
  v_attendu integer;
  v_oid regprocedure;
  v_def text;
  v_session integer;
  v_paris integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Jour de Paris : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1];
    v_attendu := v_cibles[v_i][2]::integer;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Jour de Paris : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_session from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
    select count(*) into v_paris from regexp_matches(v_def, c_paris, 'gi');
    if v_session = v_attendu and v_paris = 0 then
      execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
    elsif v_session = 0 and v_paris = v_attendu then
      raise notice 'Jour de Paris : % est déjà au jour de Paris, rien à faire.', v_signature;
    elsif v_session = 0 and v_paris = 0 then
      raise exception 'Jour de Paris : % ne lit ni current_date ni le jour de Paris : définition inattendue, rien n''est modifié.', v_signature;
    else
      raise exception 'Jour de Paris : % contient % occurrence(s) de current_date et % du jour de Paris, au lieu de % de l''une ou de l''autre seule : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_session, v_paris, v_attendu;
    end if;
  end loop;
end $jour_de_paris$;

select public.fermer_fonctions_a_anon();
