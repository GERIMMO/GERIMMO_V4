-- Retour de 20261026232941_pieces_attendues_bail.sql (PR #264, assurances identifiées dans le bail). Écrit le 28/10 par
-- l'audit final (COD-02) : la migration est appliquée en production depuis le 27/10 sans script de retour.
-- Remettre le code précédent avant ce retour : l'étape « Assurances » du bail appelle `affecter_piece_attendue_bail` et lit
-- `pieces_attendues_bail`. Jouer d'abord `20261027100300_bail_assurance_activation_et_libelle_colocation.retour.sql` : son
-- déclencheur `baux_assurance_locataire_activation` lit cette table à l'activation d'un bail ; tant qu'il existe, ce retour
-- refuse, rien n'est modifié. Refuse aussi tant qu'une pièce est classée (le classement serait perdu ; les documents et leurs
-- liens GED, posés par `affecter_piece_attendue_bail`, ne sont jamais touchés : ils restent dans la bibliothèque).
-- Retire les politiques, le déclencheur de contrôle et celui de la garde d'abonnement (avec la table), les deux fonctions, la
-- contrainte `baux_id_lot_org_pieces_unique` ajoutée sur les baux, et la ligne d'historique de la migration.
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe, qu'elle
-- ne valide jamais. Se rejoue sans effet.
do $retour_atomique$
declare
  v_classees boolean;
begin
  perform set_config('lock_timeout', '10s', true);

  if exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'baux' and t.tgname = 'baux_assurance_locataire_activation') then
    raise exception 'Retour refusé : le déclencheur baux_assurance_locataire_activation (migration 20261027100300) lit encore pieces_attendues_bail. Jouer d''abord son retour.';
  end if;
  -- Lecture dynamique : la table peut déjà être absente (rejeu), et une requête directe serait refusée à l'analyse.
  if to_regclass('public.pieces_attendues_bail') is not null then
    execute 'select exists (select 1 from public.pieces_attendues_bail)' into v_classees;
    if v_classees then
      raise exception 'Retour refusé : des assurances sont classées dans pieces_attendues_bail. Les conserver ou décider de leur archivage.';
    end if;
  end if;

  drop policy if exists pieces_attendues_bail_lecture on public.pieces_attendues_bail;
  drop policy if exists pieces_attendues_bail_ajout on public.pieces_attendues_bail;
  drop policy if exists pieces_attendues_bail_modification on public.pieces_attendues_bail;
  drop trigger if exists pieces_attendues_bail_controle on public.pieces_attendues_bail;
  -- Les index et la garde d'abonnement (`abonnement_pieces_attendues_bail`) partent avec la table.
  drop table if exists public.pieces_attendues_bail;
  drop function if exists public.controler_piece_attendue_bail();
  drop function if exists public.affecter_piece_attendue_bail(uuid, uuid, text, uuid, uuid);
  alter table public.baux drop constraint if exists baux_id_lot_org_pieces_unique;

  perform pg_notify('pgrst', 'reload schema');
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261026232941';
  end if;
end;
$retour_atomique$;
