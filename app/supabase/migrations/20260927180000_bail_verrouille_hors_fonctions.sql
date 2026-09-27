-- Audit agence du 27/09 — la machine à états du bail verrouillée EN BASE.
--
-- CONSTAT (rejoué sous l'identité JWT d'un agent puis d'un admin d'agence,
-- transaction annulée) : la policy `baux_update` laisse une requête directe à
-- l'API (clé publique + jeton de l'utilisateur) :
--   1. passer un brouillon en « actif » SANS bail signé et sans
--      `controler_mise_en_location` — le lot restait « brouillon » ;
--   2. changer le loyer d'un bail actif qui a déjà des appels et des
--      encaissements (650 → 900 €) ;
--   3. ramener un bail actif en brouillon puis le réactiver, en contournant
--      `devalider_bail` (qui refuse dès qu'un loyer a été appelé).
-- Les triggers existants ne bloquent que « terminé → * », « brouillon →
-- préavis », le retrait d'une mention obligatoire et les mentions du contrat
-- ajoutées le 14/09.
--
-- RÈGLE (wiki « Machines à états et événements ») :
--   · « brouillon → actif (signature obligatoire, RM-1.7.1) » : c'est le dépôt
--     du bail signé qui active le bail (`activer_bail`, qui passe les contrôles
--     de mise en location et exige `document_signe`) ;
--   · RM-A5.1 : toute transition non listée est interdite ;
--   · wiki « Bail » : seul un brouillon se corrige ; un bail signé évolue par
--     avenant, et le loyer par la révision annuelle (`reviser_loyer`).
--
-- CORRECTION. Toutes les transitions d'état du bail sont portées par des
-- fonctions SECURITY DEFINER (activer_bail, devalider_bail, enregistrer_conge,
-- annuler_conge, terminer_bail…), qui s'exécutent sous le PROPRIÉTAIRE de la
-- table ; une requête directe de l'API arrive, elle, sous `authenticated` (ou
-- `anon`). Même critère que `contre_ecriture_exige_son_motif` (20260910177000) :
-- on distingue l'appelant par `current_user`. Pour un CLIENT de l'API :
--   a. un bail naît en brouillon (sinon l'insertion directe d'un bail « actif »
--      rouvrait la même porte) ;
--   b. l'état ne change jamais par écriture directe : il passe par le geste
--      du bail qui porte ses contrôles ;
--   c. hors brouillon, le contenu du bail est figé : loyer, charges, dépôt,
--      dates, locataire, lot, IRL, clauses… Seules restent modifiables les
--      colonnes de suivi qu'écrit l'application sur un bail signé : le
--      règlement de copropriété (pièce jointe facultative) et la date d'envoi
--      du bail signé au locataire. Une mention obligatoire ABSENTE d'un bail
--      ancien (locataire, date d'effet, loyer) peut encore être complétée,
--      comme le décidait déjà 20260911130000 — jamais modifiée.
-- Les fonctions de la base (révision IRL, congé, activation, remplacement de
-- document…) ne sont pas concernées : elles portent leurs propres contrôles.
-- Le service (`service_role`, tâches planifiées) n'est pas concerné non plus.
--
-- Le trigger est nommé pour passer AVANT les autres triggers BEFORE de la
-- table (ordre alphabétique) : il compare la ligne demandée par le client,
-- pas celle que d'autres triggers complètent ensuite (zone tendue figée…).
--
-- Idempotent : create or replace, trigger recréé.

create or replace function public.verrouiller_bail_hors_fonctions()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  -- Colonnes qu'un client peut encore écrire sur un bail signé.
  v_libres constant text[] := array['reglement_copropriete', 'signe_envoye_le', 'updated_at'];
  v_modifiees text[];
begin
  -- Seuls les appels directs de l'API sont visés : les fonctions SECURITY
  -- DEFINER s'exécutent sous le propriétaire de la table, le service et les
  -- migrations sous leur propre rôle.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.etat is distinct from 'brouillon'::public.bail_etat then
      raise exception 'Un bail se crée en brouillon : il devient actif au dépôt du bail signé (RM-1.7.1)';
    end if;
    return new;
  end if;

  if new.etat is distinct from old.etat then
    raise exception 'Transition « % → % » refusée : l''état du bail ne change que par ses gestes — dépôt du bail signé, « Corriger », congé, clôture (RM-1.7.1, RM-A5.1)',
      old.etat, new.etat;
  end if;

  if old.etat <> 'brouillon'::public.bail_etat then
    select array_agg(n.key order by n.key) into v_modifiees
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key <> all (v_libres)
       -- Compléter une mention obligatoire ABSENTE d'un bail ancien reste
       -- permis (décision du 11/09, 20260911130000 : « on n'interdit que le
       -- retrait ») ; la modifier ou la retirer, non.
       and not (n.key in ('locataire_principal', 'date_debut', 'loyer_hc')
                and o.value = 'null'::jsonb);
    if v_modifiees is not null then
      raise exception 'Bail signé : son contenu est figé (%). Seul un brouillon se corrige ; le loyer évolue par la révision annuelle, le reste par avenant',
        array_to_string(v_modifiees, ', ');
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.verrouiller_bail_hors_fonctions() is
  'Audit agence 27/09 : un client de l''API crée un bail en brouillon, ne change jamais son état directement (RM-1.7.1, RM-A5.1) et ne modifie plus un bail signé, hors colonnes de suivi. Les fonctions de la base ne sont pas concernées.';

revoke execute on function public.verrouiller_bail_hors_fonctions() from public, anon, authenticated;

drop trigger if exists baux_a_verrou_hors_fonctions on public.baux;
create trigger baux_a_verrou_hors_fonctions
  before insert or update on public.baux
  for each row execute function public.verrouiller_bail_hors_fonctions();

-- Garde-fou de la migration : le déclencheur doit passer avant les autres
-- déclencheurs BEFORE de la table qui complètent la ligne.
do $$
declare v_premier text;
begin
  select t.tgname into v_premier
    from pg_catalog.pg_trigger t
   where t.tgrelid = 'public.baux'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 2            -- BEFORE
     and t.tgname like 'baux\_%'
   order by t.tgname
   limit 1;
  if v_premier is distinct from 'baux_a_verrou_hors_fonctions' then
    raise exception 'Le verrou du bail doit être le premier déclencheur BEFORE « baux_* » (trouvé : %)', v_premier;
  end if;
end $$;

select public.fermer_fonctions_a_anon();
