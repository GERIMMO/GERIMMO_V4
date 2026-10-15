-- Décision X13 du 14 octobre 2026 (fiche FIN-13), constat de relecture du 15/10 : la quittance est datée du même jour de Paris que le règlement.
--
-- Avant : « Encaisser » datait déjà le règlement et sa pièce comptable du jour de Paris (20261014410000), mais la quittance que le déclencheur
-- des encaissements en tire (resynchroniser_quittances) restait datée de CURRENT_DATE, le jour du fuseau de la session (UTC chez Supabase), et la
-- colonne quittances.date_emission avait le même défaut. Entre minuit et 2 h à Paris, le règlement portait le jour de Paris et la quittance la
-- veille : le PDF imprimait « Fait à … le <veille> » pour un versement daté du lendemain. Avant la décision, les trois portaient la veille ensemble
-- (cohérent, mais faux) : la décision déplaçait le défaut au lieu de le supprimer.
-- Maintenant : resynchroniser_quittances date l'émission, à l'insertion (défaut de la colonne) comme à la réémission (reçu devenu quittance,
-- montant corrigé), de (now() at time zone 'Europe/Paris')::date.
--
-- Cette migration NE TOUCHE AUCUNE QUITTANCE EXISTANTE : le défaut de la colonne ne vaut que pour les lignes à venir, la fonction ne date que
-- les émissions à venir. Les quittances déjà émises dans la fenêtre minuit-2 h à Paris avec la date de la veille ne sont pas redatées ; les
-- corriger, s'il y en a, relève d'une décision écrite du dirigeant (comme les règlements, voir 20261014410000).
-- Périmètre : seule resynchroniser_quittances écrit des quittances (vérifié dans le catalogue). Les autres usages de current_date dans la base
-- ne sont pas touchés. La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 et
-- 20261014120000 : une définition recopiée à la main écraserait ce que d'autres migrations y auraient ajouté. Si la définition n'est pas celle
-- attendue, la migration s'arrête. Elle se rejoue sans effet : la marque du correctif, présente dans la définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014416000_quittance_jour_de_paris.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.resynchroniser_quittances(uuid)'::regprocedure) into v_def;
  if position('Décision X13 du 15/10 (FIN-13)' in v_def) > 0 then return; end if;

  -- Deux occurrences exactement : la quittance (paiement complet) et le reçu (paiement partiel) réémis.
  v_ancre := $ancre$date_emission = current_date, email_envoye_at = null$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> 2 * length(v_ancre) then
    raise exception 'Correctif X13 (quittances) : définition inattendue (ancre absente ou en nombre inattendu)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$date_emission = (now() at time zone 'Europe/Paris')::date /* Décision X13 du 15/10 (FIN-13) : émission datée du jour de Paris, comme le règlement */, email_envoye_at = null$nouveau$);
  if position('current_date' in v_def) > 0 then
    raise exception 'Correctif X13 (quittances) : un jour de session subsiste dans la définition';
  end if;
  execute v_def;
end $correctif$;

-- Le défaut de la colonne (insertion d'une quittance ou d'un reçu) : même jour. Sans effet sur les lignes existantes. Rejoué, il ne reprend
-- aucun verrou de table : le défaut posé, il n'y a plus rien à faire.
do $correctif$
begin
  if exists (select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
             where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission'
               and pg_get_expr(d.adbin, d.adrelid) like '%Europe/Paris%') then
    return;
  end if;
  alter table public.quittances alter column date_emission set default ((now() at time zone 'Europe/Paris')::date);
end $correctif$;

-- Droits : inchangés (fonction interne : fermée aux comptes, ouverte à service_role). `create or replace` conserve les droits en vigueur ;
-- on les redit ici pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.resynchroniser_quittances(uuid) from public, anon, authenticated;
grant execute on function public.resynchroniser_quittances(uuid) to service_role;

select public.fermer_fonctions_a_anon();
