-- PROPRIÉTAIRE : POINTER UN LOYER À PARTIR D'UNE LIGNE DE RELEVÉ DE BANQUE (audit palier 1 du 22/11/2026, P2-05).
--
-- L'ÉCART. Un propriétaire qui reçoit ses loyers par virement les confirmait un par un, sur le tableau de bord ou sur
-- le bail, en recopiant la date et le montant lus sur son relevé. Les plateformes de référence proposent de partir du
-- relevé exporté par la banque.
--
-- CE QUE FAIT CETTE MIGRATION.
--   Une seule fonction, `pointer_loyer_releve`. Elle porte sa propre garde d'accès (propriétaire bailleur de l'espace)
--   et n'ajoute AUCUNE règle d'encaissement : elle appelle
--   `declarer_reception_loyer`, qui porte déjà toutes les garanties (propriétaire de l'espace seulement, espace ouvert
--   en écriture, échéance arrivée, le loyer le plus ancien d'abord, le reste dû relu au moment d'écrire, une demande ne
--   compte qu'une fois), puis remplace la note du règlement créé (« Réception déclarée depuis le tableau de bord », qui
--   serait fausse ici) par « Pointé sur un relevé de banque : <libellé de la ligne> ».
--   La réponse (« reçu » ou « partiel ») se déduit du montant : égal au reste dû, le loyer est soldé ; inférieur, c'est
--   un règlement partiel ; supérieur, la fonction appelée refuse.
--
--   L'écran lit le relevé sur l'appareil du propriétaire : le fichier n'est ni envoyé ni conservé. Seuls arrivent ici,
--   pour une ligne que le propriétaire a confirmée, sa date, son montant et son libellé.
--
-- Aucune table, aucune colonne, aucune donnée existante n'est modifiée.
--
-- Retour arrière : supabase/retours-arriere/20261122235950_pointage_loyer_releve.retour.sql.

create or replace function public.pointer_loyer_releve(
  p_org uuid,
  p_appel uuid,
  p_montant numeric,
  p_date date,
  p_mode text,
  p_cle uuid,
  p_reste_attendu numeric,
  p_libelle text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_libelle text;
  r jsonb;
begin
  -- Garde propre à cette fonction : elle écrit sous ses propres droits, elle ne s'en remet donc pas à la seule
  -- vérification de la fonction qu'elle appelle. Seul un propriétaire bailleur de CET espace passe.
  if auth.uid() is null or p_org is null
     or p_org not in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[])) then
    raise exception 'Accès refusé.';
  end if;

  -- Le libellé du relevé tient sur une ligne : ni retour, ni tabulation, ni caractère de contrôle ; 200 caractères au plus.
  v_libelle := left(btrim(regexp_replace(coalesce(p_libelle, ''), '[[:cntrl:][:space:]]+', ' ', 'g'), ' '), 200);

  -- Les autres vérifications (espace ouvert en écriture, échéance, loyer le plus ancien, reste dû, montant, date,
  -- mode, rejeu) sont celles de la réception déclarée, qui revérifie aussi les droits : elles ne sont pas recopiées ici.
  r := public.declarer_reception_loyer(
    p_org, p_appel,
    case when p_montant is not distinct from p_reste_attendu then 'recu' else 'partiel' end,
    p_montant, p_date, p_mode, p_cle, p_reste_attendu
  );

  -- Seul un règlement créé PAR CET APPEL reçoit la note : un rejeu (« déjà enregistré ») ne réécrit rien.
  if r ->> 'statut' = 'enregistre' then
    update public.encaissements
       set note = case when v_libelle = '' then 'Pointé sur un relevé de banque'
                       else 'Pointé sur un relevé de banque : ' || v_libelle end
     where organization_id = p_org
       and cle_envoi = p_cle;
  end if;
  return r;
end;
$$;

revoke all on function public.pointer_loyer_releve(uuid, uuid, numeric, date, text, uuid, numeric, text) from public, anon;
grant execute on function public.pointer_loyer_releve(uuid, uuid, numeric, date, text, uuid, numeric, text) to authenticated;

comment on function public.pointer_loyer_releve(uuid, uuid, numeric, date, text, uuid, numeric, text) is
  'P2-05 (22/11/2026) : enregistre un loyer reçu à partir d''une ligne de relevé de banque confirmée par le propriétaire. S''appuie sur declarer_reception_loyer (mêmes garanties) et garde le libellé de la ligne dans la note du règlement.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
