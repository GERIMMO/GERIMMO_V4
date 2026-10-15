-- Un devis reçu laisse une alerte dans l'application (audit du 13 octobre 2026, PRO2-13, décision D19,
-- option A).
--
-- Constat : à la réception d'un devis, seul un e-mail partait (échec seulement tracé dans tech_log). Si
-- l'e-mail était perdu, le dossier dormait : aucune alerte, et l'incident n'était pas compté « À traiter »
-- alors qu'il attendait la décision du propriétaire.
--
-- Correction, sur le patron de l'avenant de devis (`avenant_devis_a_decider`, 20260922120000) :
--   · deposer_devis crée, DANS LA MÊME TRANSACTION que le dépôt, une alerte `devis_a_decider`
--     (criticité normale, adressée à tous les gérants de l'organisation, portée par le dossier et le lot
--     pour que le portefeuille d'un agent restreint la filtre comme les autres alertes d'incident). Les deux
--     chemins de dépôt (deposer_devis directement, ou deposer_devis_structure / envoyer_mon_devis_prepare, qui
--     passent par lui) la créent une seule fois. Si le dépôt échoue, l'alerte n'existe pas.
--   · elle se ferme quand le devis cesse d'attendre une décision : retenu (retenir_devis), écarté parce qu'un
--     autre a été retenu, annulé (artisan écarté du réseau ou de l'agence) ou expiré. Un déclencheur sur le
--     statut du devis le fait, plutôt que quatre fonctions réécrites une à une ; clôturer l'incident ferme déjà
--     toutes les alertes du dossier (cloturer_incident).
--   · le compte de l'incident dans « À traiter » se calcule à l'écran à partir des devis en attente (voir
--     src/app/agence/[orgId]/incidents/page.tsx) : aucune colonne ni vue nouvelle.
--
-- Aucune ligne existante n'est modifiée ni ajoutée : les devis déjà déposés avant cette migration n'ont pas
-- d'alerte (la décision dit « à la réception d'un devis »), mais ils comptent dans « À traiter » à l'écran.
--
-- deposer_devis est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 :
-- une fonction réécrite à la main écraserait les gardes injectées par les migrations suivantes. Si la définition
-- en vigueur n'est pas celle attendue, la migration s'arrête (dans la transaction du chantier `migrations.yml`,
-- rien ne subsiste). Elle se rejoue sans effet : le bloc cherche la marque de son correctif et, si elle y est, ne
-- fait rien ; la fonction et le déclencheur sont recréés à l'identique.
--
-- Retour arrière : app/supabase/retours-arriere/20261014300000_devis_a_decider_alerte.retour.sql

-- PRO2-13 (1/2) : le dépôt d'un devis crée l'alerte.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)'::regprocedure) into v_def;
  if position('Audit du 13/10 (PRO2-13)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$  return v_devis;
exception when unique_violation then
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif PRO2-13 (deposer_devis) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Audit du 13/10 (PRO2-13) : le devis reçu attend une décision du gérant ou du propriétaire.
  -- L'alerte naît dans la transaction du dépôt (patron de l'avenant) et se ferme quand le devis cesse
  -- d'attendre (déclencheur fermer_alerte_devis_a_decider). Elle ne porte que des identifiants et des montants.
  insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
  values (v.organization_id, 'devis_a_decider', 'normale',
          'Devis reçu, à décider — ' || (select i.numero from public.incidents i where i.id = v.incident_id),
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2 where i2.id = v.incident_id),
                             'consultation_id', v.consultation_id,
                             'sollicitation_id', p_sollicitation,
                             'devis_id', v_devis,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'valide_jusqu_au', v_echeance,
                             'libelle', 'Un devis est arrivé : consultez-le et décidez de le retenir.'),
          'devis', v_devis);
  return v_devis;
exception when unique_violation then
$nouveau$);
  execute v_def;
end $correctif$;

-- PRO2-13 (2/2) : l'alerte se ferme quand le devis cesse d'attendre une décision.
create or replace function public.fermer_alerte_devis_a_decider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Seules les alertes encore ouvertes de CE devis : une alerte déjà fermée à la main (ou par la clôture de
  -- l'incident) garde sa raison. La raison dit ce qui est arrivé au devis.
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = case new.statut
        when 'retenu' then 'Devis retenu'
        when 'non_retenu' then 'Un autre devis a été retenu'
        when 'expire' then 'Devis expiré'
        else 'Devis annulé' end
  where organization_id = new.organization_id
    and type = 'devis_a_decider'
    and statut = 'ouverte'
    and details->>'devis_id' = new.id::text;
  return null;
end $$;

-- Fonction de déclencheur : personne ne l'appelle, ni anonyme ni connecté.
revoke all on function public.fermer_alerte_devis_a_decider() from public, anon, authenticated;
grant execute on function public.fermer_alerte_devis_a_decider() to service_role;

drop trigger if exists fermer_alerte_devis_a_decider on public.incident_devis;
create trigger fermer_alerte_devis_a_decider
  after update of statut on public.incident_devis
  for each row
  when (old.statut = 'depose' and new.statut is distinct from 'depose')
  execute function public.fermer_alerte_devis_a_decider();

select public.fermer_fonctions_a_anon();
