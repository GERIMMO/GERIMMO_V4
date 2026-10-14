-- Clé d'envoi du dépôt de garantie (D05, fiche PR178-B-06), 2/3. Même patron que l'encaissement de loyer
-- (20261014100000) : colonne facultative `cle_envoi` + index unique partiel, par organisation.
--
-- `encaisser_depot` gagne un septième paramètre FACULTATIF, `p_cle_envoi`. Avec une clé déjà utilisée pour cette
-- organisation, la fonction ne fait rien et lève « Cet encaissement est déjà enregistré. » (code 23505, détail
-- « cle_envoi déjà utilisée »), le même code que l'index unique : l'application reconnaît les deux de la même façon
-- (lib/cle-envoi.ts) et dit « déjà enregistré ». Le contrôle vient AVANT les autres : un dépôt déjà soldé ne répond
-- pas « dépasse le dépôt dû restant » à un rejeu. L'index reste le garde-fou final quand deux envois de la même clé se
-- croisent. Sans clé, la fonction se comporte exactement comme avant (les appels à six arguments fonctionnent encore).
--
-- La fonction est réécrite EN RELISANT sa définition en vigueur (pg_get_functiondef), comme le fait
-- 20261013120000 : une réécriture à la main écraserait les gardes injectées par les migrations successives. Si la
-- définition n'est pas celle attendue, la migration s'arrête (dans la transaction de `migrations.yml`, rien ne subsiste).
-- Changer la liste des paramètres crée une SURCHARGE : l'ancienne signature est retirée (deux fonctions de même nom
-- rendraient l'appel PostgREST ambigu), ses droits sont repris à l'identique sur la nouvelle.
--
-- Rien n'est réécrit dans les données : les dépôts existants gardent NULL. Rejouable sans effet : la présence de la
-- signature à sept paramètres vaut marque. Retour arrière :
-- supabase/retours-arriere/20261014101000_cle_envoi_depot_garantie.retour.sql.

alter table public.depot_encaissements add column if not exists cle_envoi uuid;

create unique index if not exists depot_encaissements_cle_envoi_unique
  on public.depot_encaissements (organization_id, cle_envoi)
  where cle_envoi is not null;

comment on column public.depot_encaissements.cle_envoi is
  'Clé d''envoi du formulaire (UUID, D05) : un même envoi n''encaisse qu''une fois. NULL pour les dépôts saisis sans clé.';

do $correctif$
declare v_def text; v_ancre text;
begin
  -- Rejeu : la signature à sept paramètres existe déjà, il n'y a rien à refaire (et plus d'ancienne surcharge).
  if to_regprocedure('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)') is not null then
    drop function if exists public.encaisser_depot(uuid, numeric, date, text, uuid, text);
    return;
  end if;

  select pg_get_functiondef('public.encaisser_depot(uuid,numeric,date,text,uuid,text)'::regprocedure) into v_def;

  -- 1. La liste des paramètres.
  v_ancre := $ancre$p_versant_libelle text DEFAULT NULL::text)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D05 (dépôt) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$p_versant_libelle text DEFAULT NULL::text, p_cle_envoi uuid DEFAULT NULL::uuid)$nouveau$);

  -- 2. Le rejeu, reconnu avant les autres contrôles (juste après les contrôles d'accès).
  v_ancre := $ancre$  -- Le dépôt s'encaisse à l'entrée, il se restitue à la sortie (RM-2.1.3)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D05 (dépôt) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- D05 (PR178-B-06) : un même envoi (une clé par formulaire) n'encaisse qu'une fois. Reconnu AVANT
  -- les autres contrôles : un dépôt déjà soldé répond « déjà enregistré », pas « dépasse le dépôt dû restant ».
  -- Même code que l'index unique (23505) : l'application reconnaît les deux de la même façon.
  if p_cle_envoi is not null and exists (
       select 1 from public.depot_encaissements d
        where d.organization_id = v.organization_id and d.cle_envoi = p_cle_envoi) then
    raise exception 'Cet encaissement est déjà enregistré.'
      using errcode = '23505', detail = 'cle_envoi déjà utilisée';
  end if;

  -- Le dépôt s'encaisse à l'entrée, il se restitue à la sortie (RM-2.1.3)$nouveau$);

  -- 3. L'écriture de la clé avec l'encaissement.
  v_ancre := $ancre$    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D05 (dépôt) : définition inattendue (ancre 3 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle, cle_envoi)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle, p_cle_envoi)$nouveau$);

  execute v_def;
  drop function public.encaisser_depot(uuid, numeric, date, text, uuid, text);
end $correctif$;

-- Droits de la nouvelle signature : ceux de l'ancienne (compte connecté et service, jamais public ni anon).
revoke all on function public.encaisser_depot(uuid, numeric, date, text, uuid, text, uuid) from public, anon;
grant execute on function public.encaisser_depot(uuid, numeric, date, text, uuid, text, uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
