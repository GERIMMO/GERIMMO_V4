-- Un bail ne devient actif qu'avec ses MENTIONS OBLIGATOIRES — audit du 2026-09-11.
--
-- LA RÈGLE. La date de prise d'effet et le loyer hors charges sont des mentions
-- obligatoires du contrat de location. Wiki « Mentions obligatoires du bail »
-- (modèle-type du décret n° 2015-587, loi ALUR) :
--   · rubrique 1, désignation des parties — « Date de prise d'effet distincte
--     de la signature » ;
--   · rubrique 4, durée — « durée initiale, reconduction tacite, date d'effet » ;
--   · rubrique 5, loyer et charges — « montant HC, révision IRL, provision ou
--     forfait de charges ».
-- Wiki « Bail » les redit côté socle : « mentions obligatoires alimentées par le
-- socle : parties (0b), désignation du logement (lot), loyer + IRL de référence,
-- charges (provision ou forfait), dépôt de garantie… ».
--
-- QUAND. À l'ACTIVATION, pas à la création. Un brouillon incomplet est le geste
-- normal : c'est le bail qu'on prépare. Le produit active le bail au dépôt du
-- PDF signé (wiki « Bail », callout du 2026-08-30) et fait passer tous les
-- contrôles AVANT le dépôt, dans `controler_mise_en_location` — « un PDF refusé
-- ne laisse rien derrière lui ». Les mentions rejoignent donc ces contrôles-là,
-- au même endroit, plutôt qu'à un second point de contrôle.
--
-- CE QUI ÉTAIT POSSIBLE. Rejoué le 2026-09-11 sur la base locale, sous l'identité
-- d'un admin d'agence : un bail sans loyer et sans date d'entrée passait
-- `controler_mise_en_location` sans un mot, puis `activer_bail` — bail « actif »,
-- lot « loué ». `activer_bail` posait lui-même `date_debut = current_date` : la
-- date d'effet du contrat devenait le jour du clic. Et `generer_appels_loyer`
-- lit `coalesce(loyer_hc, 0)` : le premier appel de loyer sortait à 0,00 € —
-- quittancé, comptabilisé, envoyé au locataire. Tout ce qui découle du loyer
-- suivait : prorata d'entrée, révision IRL (`reviser_loyer_irl` refuse alors
-- « Le loyer n'est pas fixé »), plafond du dépôt de garantie (comparé à un
-- loyer nul, donc jamais opposable).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : toucher aux baux DÉJÀ actifs. La garde
-- ne vise que la TRANSITION « brouillon → actif ». Un bail activé avant cette
-- règle poursuit son cours, se met en préavis, se clôture ; un congé annulé le
-- ramène de « préavis » à « actif » sans rejouer la conclusion du contrat. Le
-- compte des baux déjà atteints est affiché en fin de migration, sans écriture.
-- Requête nominative pour le pilote (à lancer à part, la migration ne donne que
-- le compte) :
--
--   select o.name as agence, l.nom as lot, b.id as bail_id, b.etat,
--          b.date_debut, b.loyer_hc, b.created_at
--     from public.baux b
--     join public.lots l on l.id = b.lot_id
--     join public.organizations o on o.id = b.organization_id
--    where b.etat in ('actif','preavis')
--      and (b.loyer_hc is null or b.date_debut is null)
--    order by o.name, b.created_at;

-- ---------------------------------------------------------------------------
-- 1. La liste des mentions manquantes — un seul énoncé, trois lecteurs.
-- ---------------------------------------------------------------------------
-- Même forme que `lot_blocages_location` : un tableau de libellés lisibles.
-- Deux versions du même énoncé : sur des valeurs (le contrôle de mise en
-- location et le déclencheur, qui ne voit que NEW) et sur un bail (requête du
-- pilote, et l'épingle du test).
--
-- La fiche bail, elle, dérive la MÊME liste du bail qu'elle a déjà chargé
-- (`mentionsObligatoiresManquantes`, src/lib/baux.ts) : annoncer ce qui manque
-- ne vaut pas un aller-retour, et l'écran ne doit pas dépendre du cache de
-- schéma de PostgREST pour dire une chose qu'il sait déjà. Les libellés sont
-- identiques mot pour mot ; tests/mentions-bail-actif.test.ts compare les deux
-- listes sur chaque combinaison et casse si elles divergent.

create or replace function public.bail_mentions_manquantes_valeurs(
  p_locataire uuid,
  p_date_debut date,
  p_loyer numeric
)
returns text[]
language sql
immutable
set search_path to ''
as $$
  select array_remove(array[
    case when p_locataire is null then 'Locataire principal non désigné' end,
    case when p_date_debut is null then 'Date de prise d''effet non renseignée' end,
    case when p_loyer is null then 'Loyer hors charges non fixé' end
  ], null);
$$;
revoke execute on function public.bail_mentions_manquantes_valeurs(uuid, date, numeric)
  from public, anon;

comment on function public.bail_mentions_manquantes_valeurs(uuid, date, numeric) is
  'Mentions obligatoires du contrat qui manquent, à partir des valeurs — exigibles à l''activation (wiki « Mentions obligatoires du bail », rubriques 1, 4 et 5).';

-- La forme requêtable : « quels baux manquent de quoi ? ». Sans SECURITY
-- DEFINER — la RLS de `baux` s'applique à l'appelant, un bail d'une autre
-- agence est simplement introuvable.
create or replace function public.bail_mentions_manquantes(p_bail uuid)
returns text[]
language sql
stable
set search_path to ''
as $$
  select public.bail_mentions_manquantes_valeurs(b.locataire_principal, b.date_debut, b.loyer_hc)
  from public.baux b
  where b.id = p_bail;
$$;
revoke execute on function public.bail_mentions_manquantes(uuid) from public, anon;

comment on function public.bail_mentions_manquantes(uuid) is
  'Mentions obligatoires manquantes d''un bail — vide = le bail peut être activé.';

-- ---------------------------------------------------------------------------
-- 2. Le contrôle de mise en location les exige.
-- ---------------------------------------------------------------------------
-- Delta par rapport à la version du 2026-08-30 : le contrôle du seul locataire
-- principal devient le contrôle des TROIS mentions, énoncées d'un coup — l'agent
-- corrige en une passe au lieu d'une par tentative. Le reste est inchangé.
create or replace function public.controler_mise_en_location(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_mentions text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;

  -- Mentions obligatoires du contrat : sans elles, le bail activé est un bail
  -- faux — appels de loyer à 0 €, prorata d'entrée arbitraire, dépôt sans plafond
  -- opposable (wiki « Mentions obligatoires du bail »).
  v_mentions := public.bail_mentions_manquantes_valeurs(v.locataire_principal, v.date_debut, v.loyer_hc);
  if array_length(v_mentions, 1) > 0 then
    raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
      array_to_string(v_mentions, ' ; ');
  end if;

  if v.depot_garantie is not null then
    v_plafond := (case when v.type = 'meuble' then 2 else 1 end) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        (case when v.type = 'meuble' then 2 else 1 end), v_plafond;
    end if;
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;
end;
$$;
revoke execute on function public.controler_mise_en_location(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. L'activation n'invente plus la date d'effet.
-- ---------------------------------------------------------------------------
-- Delta par rapport à la version du 2026-08-30 : `date_debut = coalesce(
-- date_debut, current_date)` disparaît. Ce repli datait du 2026-08-02, quand le
-- formulaire n'avait aucun champ de date (« à défaut, l'activation fait foi ») ;
-- le champ existe depuis le 2026-08-21 et la date d'effet est une mention du
-- contrat, pas une conséquence du clic. Le contrôle ci-dessus la garantit
-- désormais renseignée : l'échéance de l'alerte d'état des lieux la lit
-- directement, sans repli.
create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_locataire text;
begin
  perform public.controler_mise_en_location(p_bail);
  select * into v from public.baux where id = p_bail;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) : c''est lui qui active le bail (V0 : signature hors plateforme)';
  end if;

  update public.baux
     set etat = 'actif',
         updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;

  if not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
    select * into v_lot from public.lots where id = v.lot_id;
    select trim(coalesce(prenom, '') || ' ' || nom) into v_locataire
    from public.persons where id = v.locataire_principal;
    -- Échéance : l'état des lieux se fait à la remise des clés, donc à la prise d'effet
    insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
    values (v.organization_id, 'edl_entree', 'normale',
            format('État des lieux d''entrée — %s · %s',
                   v_lot.nom, coalesce(nullif(v_locataire, ''), 'locataire')),
            jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id,
                               'person_id', v.locataire_principal,
                               'libelle', format('%s · %s', v_lot.nom,
                                                 coalesce(nullif(v_locataire, ''), 'locataire'))),
            v.date_debut);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La garde vit dans la base, pas seulement dans la fonction.
-- ---------------------------------------------------------------------------
-- La policy `baux_update` autorise l'écriture directe de la table : un
-- `update public.baux set etat = 'actif'` contournait `activer_bail` et donc
-- tous ses contrôles. La règle ne doit pas dépendre du chemin d'écriture.
--
-- Le déclencheur ne regarde QUE « brouillon → actif », la conclusion du contrat :
--   · un bail déjà actif n'est pas revisité (rien de rétroactif) ;
--   · « préavis → actif » (`annuler_conge`, le locataire se rétracte) n'est pas
--     une conclusion de contrat : un bail ancien et incomplet garde ce recours ;
--   · une insertion directement en « actif » est une reprise d'historique par le
--     service, pas le geste d'activation — elle reste possible.
create or replace function public.controler_mentions_a_l_activation()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_manquantes text[];
begin
  if old.etat = 'brouillon' and new.etat = 'actif' then
    v_manquantes := public.bail_mentions_manquantes_valeurs(
      new.locataire_principal, new.date_debut, new.loyer_hc);
    if array_length(v_manquantes, 1) > 0 then
      raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
        array_to_string(v_manquantes, ' ; ');
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.controler_mentions_a_l_activation() from public, anon, authenticated;

drop trigger if exists baux_mentions_a_l_activation on public.baux;
create trigger baux_mentions_a_l_activation
  before update of etat on public.baux
  for each row execute function public.controler_mentions_a_l_activation();

-- ---------------------------------------------------------------------------
-- 5. Mesure des baux déjà atteints — aucune écriture.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sans_loyer int;
  v_sans_date int;
begin
  select count(*) filter (where loyer_hc is null),
         count(*) filter (where date_debut is null)
    into v_sans_loyer, v_sans_date
    from public.baux
   where etat in ('actif', 'preavis');
  if v_sans_loyer > 0 or v_sans_date > 0 then
    raise notice 'Baux vivants sans loyer : % — sans date d''effet : %. Ils gardent leur cours (la garde ne vise que « brouillon → actif ») ; leurs appels de loyer sortent à 0,00 € tant que le loyer n''est pas fixé.',
      v_sans_loyer, v_sans_date;
  else
    raise notice 'Aucun bail vivant sans loyer ni sans date d''effet.';
  end if;
end;
$$;
