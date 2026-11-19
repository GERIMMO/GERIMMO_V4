-- SCI-3 (audit après publication de la PR #347, 19/11/2026) : la quittance d'une société bailleresse nomme la personne
-- physique qui signe pour elle.
--
-- LE DÉFAUT. La quittance (ou le reçu) d'un bail dont le bailleur est une SCI lisait « Je soussigné(e) SCI du Tilleul,
-- bailleur du logement… » et se signait « SCI du Tilleul », sans nommer la personne qui signe. Le pouvoir existe pourtant
-- au bail (`representations_bail`, migration 20261113141000, lu par `representants_actifs_bail`).
--
-- LA CORRECTION. `quittance_document` — que le LOCATAIRE appelle aussi (page /quittance/[id], « Mes documents ») et que la
-- RLS tient à l'écart de `representations_bail` — rend, pour chaque bailleur qui est une société dotée d'un représentant
-- actif au bail, la clé `representant` : son nom et son prénom, rien d'autre (ni e-mail, ni téléphone, ni justificatif).
-- Le pouvoir est celui que `representants_actifs_bail` tient pour actif (même règle que l'envoi en signature) ; la lecture
-- se fait sous les droits du propriétaire de la fonction, après les contrôles d'accès de `quittance_document`, inchangés.
-- Sans représentant, l'objet du bailleur est IDENTIQUE à avant (la clé est absente, pas nulle) : les empreintes des
-- courriels de quittance (`empreinte_metier_courriel`) ne changent que pour un bail de société doté d'un pouvoir actif.
-- La formulation du document (src/lib/documents/modeles/quittance.ts) est à valider juridiquement.
--
-- Rejouable : remplacement à compte exact (une occurrence) dans la définition en vigueur ; la forme déjà convertie est
-- acceptée ; toute autre forme arrête la migration sans rien modifier.
do $migration$
declare
  definition text := pg_get_functiondef('public.quittance_document(uuid)'::regprocedure);
  avant text := $sql$jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom) order by p.nom, p.prenom)$sql$;
  apres text := $sql$jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom)
        -- SCI-3 : la personne physique qui signe pour la société (pouvoir actif au bail) — nom et prénom seuls.
        || coalesce((select jsonb_build_object('representant', jsonb_build_object('nom', r.nom, 'prenom', r.prenom))
                     from public.representants_actifs_bail(b.id) r
                     where r.societe_id = p.id
                     limit 1), '{}'::jsonb)
        order by p.nom, p.prenom)$sql$;
  n_avant integer;
  n_apres integer;
begin
  if to_regprocedure('public.representants_actifs_bail(uuid)') is null then
    raise exception 'quittance_document : representants_actifs_bail(uuid) absente — appliquer 20261113141000 d''abord';
  end if;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_avant = 0 and n_apres = 1 then
    return; -- déjà convertie
  end if;
  if n_avant <> 1 or n_apres <> 0 then
    raise exception 'quittance_document : liste des bailleurs inattendue (% ancienne(s), % nouvelle(s)) — vérifier la migration avant application', n_avant, n_apres;
  end if;
  execute replace(definition, avant, apres);
end;
$migration$;

-- `create or replace` (par `execute`) garde les droits : on les repose tels quels, par prudence.
revoke execute on function public.quittance_document(uuid) from public, anon;
grant execute on function public.quittance_document(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
