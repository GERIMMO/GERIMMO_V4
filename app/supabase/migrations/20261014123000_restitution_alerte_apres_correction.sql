-- Relecture du lot « bail-sortie » (14 octobre 2026), constat d'exactitude sur D35 (1) :
-- l'alerte du délai légal de restitution suit la correction de la remise des clés.
--
-- Constat : une restitution démarrée avec une limite au 19/10/2026 reçoit l'alerte
-- « à rendre avant le 19/10/2026 » (J-7). Quand l'agent corrige ensuite la remise des clés
-- (limite réelle : 16/10/2026, toujours dans la fenêtre J-7), l'alerte ouverte garde son
-- titre et son échéance : poser_alerte_seuil ne met l'alerte à jour que si le seuil ou la
-- criticité change, et demarrer_restitution ne touchait pas aux alertes. L'alerte pouvait
-- afficher une date POSTÉRIEURE au vrai délai légal, alors que ce délai est sanctionné
-- (intérêts de retard). Depuis D35 (1), l'écran rouvre la correction : le cas devient courant.
--
-- Correction (une seule mécanique, limitée à la restitution ; poser_alerte_seuil, partagée avec
-- d'autres alertes, n'est pas touchée) :
--   1. Une fonction interne rafraichir_alerte_restitution(restitution) relit la limite légale
--      de la restitution « en cours » et met en phase son alerte « restitution_echeance »
--      OUVERTE, comme le fait le cron :
--        - limite dépassée            : alerte critique, « délai légal dépassé depuis le … » ;
--        - limite dans les 7 jours    : alerte normale, « à rendre avant le … » ;
--        - limite au-delà de 7 jours  : l'alerte n'a plus lieu d'être, elle est FERMÉE avec
--          la mention « Délai légal corrigé : à rendre avant le … ». Son seuil est noté
--          « corrige » pour que le cron, quand la limite se rapprochera, pose une alerte
--          neuve à J-7 (sans cela, une alerte fermée au même seuil bloquerait la suivante).
--      Une alerte déjà fermée n'est jamais rouverte ; sans alerte ouverte, rien n'est posé
--      (le cron reste seul à les poser).
--   2. demarrer_restitution l'appelle après l'enregistrement de la restitution (premier envoi
--      comme correction). Aucun montant n'est touché, aucune donnée financière réécrite.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (comme 20261013120000 et
-- 20261014122000) ; si elle n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet.
-- Retour arrière : supabase/retours-arriere/20261014123000_restitution_alerte_apres_correction.retour.sql

create or replace function public.rafraichir_alerte_restitution(p_restitution uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_r record;
  v_alerte uuid;
  v_limite date;
  v_seuil text;
  v_criticite public.alerte_criticite;
begin
  select r.id, r.statut, r.date_remise_cles, r.delai_mois,
         l.nom as lot_nom,
         trim(coalesce(p.prenom, '') || ' ' || p.nom) as locataire
    into v_r
    from public.restitutions r
    join public.baux b on b.id = r.bail_id
    join public.lots l on l.id = b.lot_id
    left join public.persons p on p.id = b.locataire_principal
   where r.id = p_restitution;
  if v_r.id is null or v_r.statut <> 'en_cours' then return; end if;

  select a.id into v_alerte
    from public.alerts a
   where a.type = 'restitution_echeance' and a.statut = 'ouverte'
     and a.details ->> 'restitution_id' = p_restitution::text
   order by a.created_at desc
   limit 1;
  if v_alerte is null then return; end if;

  v_limite := public.restitution_date_limite(v_r.date_remise_cles, v_r.delai_mois);

  if v_limite > current_date + 7 then
    update public.alerts
       set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
           closed_action = format('Délai légal corrigé : à rendre avant le %s', to_char(v_limite, 'DD/MM/YYYY')),
           details = details || jsonb_build_object('seuil', 'corrige')
     where id = v_alerte;
    return;
  end if;

  v_seuil := case when v_limite <= current_date then 'J+0' else 'J-7' end;
  v_criticite := case v_seuil when 'J+0' then 'critique'::public.alerte_criticite
                              else 'normale'::public.alerte_criticite end;
  update public.alerts
     set criticite = v_criticite,
         titre = format('Restitution du dépôt — %s · %s : %s',
           v_r.lot_nom, coalesce(nullif(v_r.locataire, ''), 'locataire'),
           case when v_seuil = 'J+0'
             then format('délai légal dépassé depuis le %s (intérêts de retard dus)', to_char(v_limite, 'DD/MM/YYYY'))
             else format('à rendre avant le %s', to_char(v_limite, 'DD/MM/YYYY')) end),
         echeance = v_limite,
         details = details || jsonb_build_object('seuil', v_seuil)
   where id = v_alerte;
end;
$fn$;

-- Fonction INTERNE : elle ne contrôle aucune appartenance (seul demarrer_restitution, qui la
-- contrôle, l'appelle) ; elle reste fermée aux comptes, comme generer_appels_loyer_interne.
revoke all on function public.rafraichir_alerte_restitution(uuid) from public, anon, authenticated;
grant execute on function public.rafraichir_alerte_restitution(uuid) to service_role;

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.demarrer_restitution(uuid,date,boolean)'::regprocedure) into v_def;
  if position('Relecture du 14/10 (alerte du délai légal)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif alerte de restitution : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $nouveau$  -- Relecture du 14/10 (alerte du délai légal) : la date de remise des clés ou le délai viennent
  -- peut-être de changer ; l'alerte « à rendre avant le … » déjà ouverte est remise à la bonne date.
  perform public.rafraichir_alerte_restitution(v_id);
$nouveau$);
  execute v_def;
end $correctif$;

-- Droits : inchangés.
revoke all on function public.demarrer_restitution(uuid, date, boolean) from public, anon;
grant execute on function public.demarrer_restitution(uuid, date, boolean) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
