-- Décision D35 (1) du 14 octobre 2026 (fiche SOR-02), option A : la remise des clés
-- ne peut pas être datée après aujourd'hui, et sa correction reste possible tant que
-- la restitution est « en cours ».
--
-- Constat : demarrer_restitution acceptait une remise des clés au 01/03/2027 et calculait
-- le délai légal de restitution (un ou deux mois) sur un événement qui n'avait pas eu
-- lieu ; l'écran masquait ensuite le formulaire, alors que la fonction accepte déjà un
-- nouvel envoi tant que la restitution n'est pas finalisée (clause « on conflict »).
--
--   1. Une date postérieure à aujourd'hui (jour de Paris) est refusée, au premier envoi
--      comme à la correction.
--   2. Une correction (nouvel envoi tant que la restitution est en cours) ne change que
--      ce qui se corrige : la date de remise des clés, le délai (une case « sortie
--      conforme ») et l'indicateur « sans état des lieux d'entrée ». Le dépôt, les
--      impayés, le trop-perçu et leur date d'arrêté restent ceux du démarrage : ils ont
--      leur propre geste (« Réarrêter les montants », rafraichir_montants_restitution).
--      Avant, un nouvel envoi les relisait en silence — corriger une date aurait pu
--      changer un montant.
--
-- Le délai légal et les règles de restitution déjà codées (un mois si la sortie est
-- conforme, deux sinon ; refus d'une sortie dite conforme alors que le comparatif relève
-- des écarts) ne changent pas. La restitution finalisée reste fermée à toute correction.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (comme 20261013120000) ;
-- si elle n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet.
-- Retour arrière : supabase/retours-arriere/20261014122000_restitution_remise_cles.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.demarrer_restitution(uuid,date,boolean)'::regprocedure) into v_def;
  if position('Décision D35 (1) du 14/10 (SOR-02)' in v_def) > 0 then return; end if;

  -- 1. Pas de remise des clés datée du futur
  v_ancre := $ancre$  v_sans_edl := not exists ($ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D35 (1) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Décision D35 (1) du 14/10 (SOR-02), option A : le délai légal court à compter de la
  -- remise RÉELLE des clés ; une date postérieure à aujourd'hui (jour de Paris) n'est pas
  -- un fait. Même règle pour la date d'envoi du décompte (marquer_decompte_envoye).
  if p_date_remise > (now() at time zone 'Europe/Paris')::date then
    raise exception 'La remise des clés ne peut pas être datée après aujourd''hui (%) : le délai légal de restitution court à partir de la remise réelle des clés',
      to_char((now() at time zone 'Europe/Paris')::date, 'DD/MM/YYYY');
  end if;

  v_sans_edl := not exists ($nouveau$);

  -- 2. Une correction ne réarrête aucun montant
  v_ancre := $ancre$    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        depot = excluded.depot, impayes = excluded.impayes, trop_percu = excluded.trop_percu,
        sans_edl_entree = excluded.sans_edl_entree,
        montants_arretes_le = excluded.montants_arretes_le
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D35 (1) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$    -- Décision D35 (1) du 14/10 : une correction (nouvel envoi tant que la restitution est
    -- en cours) ne touche ni le dépôt, ni les impayés, ni le trop-perçu, ni leur date d'arrêté.
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        sans_edl_entree = excluded.sans_edl_entree
$nouveau$);
  execute v_def;
end $correctif$;

-- Droits : inchangés.
revoke all on function public.demarrer_restitution(uuid, date, boolean) from public, anon;
grant execute on function public.demarrer_restitution(uuid, date, boolean) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
