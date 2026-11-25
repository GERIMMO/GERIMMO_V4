-- RETOUR ARRIÈRE de 20261125153000_bail_epoux_pacses_personnes_a_la_signature.sql (relecture de la fusion du 25/11/2026,
-- constat A-01 : case « mariés ou pacsés », la fin de solidarité vide ne vaut que pour les personnes présentes au bail à
-- sa signature).
--
-- Rend à `enregistrer_depart_colocataire` son texte de 20261125152000, à l'identique : sur un bail coché, le départ de
-- TOUTE personne s'enregistre de nouveau sans date de fin de solidarité, tiers entré après la signature compris (le
-- défaut A-01 revient). Retire les deux déclencheurs et leurs fonctions : un troisième locataire s'ajoute de nouveau à un
-- brouillon coché, et un bail coché s'active quel que soit le nombre de ses locataires.
-- LA COLONNE `bail_personnes.entree_apres_signature` EST GARDÉE, avec ses valeurs (elle n'est plus lue ni posée par la
-- base) ; elle se supprime à la main une fois le code revenu (`alter table public.bail_personnes drop column
-- entree_apres_signature`), si rien ne doit en être gardé.
-- À SAVOIR : les départs enregistrés entre-temps gardent leur date de fin (aucune donnée n'est modifiée).
-- ORDRE : à jouer AVANT le retour de 20261125152000 (qui s'arrête sur une fonction réécrite depuis). Droits inchangés.
-- S'arrête sans rien modifier si la fonction a été réécrite depuis cette migration. Rejouable.

do $retour_epoux_pacses_signature$
declare
  c_signature constant text := 'public.enregistrer_depart_colocataire(uuid,date,uuid)';
  c_ancien constant text := $a$  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false) then
    v_fin := null;
  end if;$a$;
  c_nouveau constant text := $n$  -- Relecture de la fusion du 25/11/2026 (A-01) : seulement pour une personne présente au bail à sa signature
  -- (article 8-1, I : « au moment de la conclusion initiale du contrat ») ; une personne entrée après, et son garant,
  -- gardent la règle de la colocation (six mois, ou la date du remplacement).
  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false)
     and not v.entree_apres_signature then
    v_fin := null;
  end if;$n$;
  definition text;
  corps text;
begin
  -- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
  -- dans ce bloc unique, qui passe ou s'arrête d'un tenant (un refus ou une erreur plus bas l'y laisse) ; sans quoi le
  -- chantier « Migrations Supabase » refuserait de rejouer la migration (« version déjà enregistrée »).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125153000';
  end if;
  if to_regclass('public.baux') is not null then
    drop trigger if exists baux_epoux_pacses_a_la_signature on public.baux;
  end if;
  drop function if exists public.controler_epoux_pacses_a_la_signature();
  if to_regclass('public.bail_personnes') is not null then
    drop trigger if exists bail_personnes_epoux_pacses on public.bail_personnes;
  end if;
  drop function if exists public.bail_personnes_epoux_pacses();

  select pg_get_functiondef(p.oid), p.prosrc into definition, corps
    from pg_proc p where p.oid = to_regprocedure(c_signature) and p.prosecdef;
  if corps is null then
    raise exception 'Retour des personnes à la signature : fonction % introuvable ou inattendue ; rien n''est modifié', c_signature;
  end if;
  -- Déjà revenue (rejeu), ou migration jamais appliquée : rien à faire.
  if position(c_nouveau in corps) = 0 then
    if position('entree_apres_signature' in corps) > 0 then
      raise exception 'Retour des personnes à la signature : % a été réécrite depuis la migration ; rien n''est modifié', c_signature;
    end if;
    return;
  end if;
  execute replace(definition, corps, replace(corps, c_nouveau, c_ancien));
end $retour_epoux_pacses_signature$;
