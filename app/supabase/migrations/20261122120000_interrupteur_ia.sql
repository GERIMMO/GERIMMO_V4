-- L'INTERRUPTEUR « IA ACTIVÉE / DÉSACTIVÉE » (mission palier 1, 22/11/2026).
--
-- LE BESOIN. Le dirigeant veut couper toute l'IA d'un geste, le reste de Gerimmo continuant de fonctionner. Aucun réglage
-- ne le permettait proprement (audit du 22/11, volet d) : la limite quotidienne à 0 affiche « limite atteinte, réessayez
-- demain » ; l'arrêt d'urgence « global » arrête aussi avis d'échéance, quittances et relances ; retirer la clé du
-- fournisseur demande un redéploiement et fait croire à une panne.
--
-- LA RÈGLE. Un état de plus, à côté de la limite quotidienne : `ia_plafond_reglage.ia_active`. Quand il est faux, les
-- deux gardes par lesquelles passe CHAQUE appel payant à l'IA (`reserver_appel_ia`, `reserver_appel_ia_prive`) rendent
-- « desactive » AVANT tout le reste : rien n'est compté, aucun appel ne part. L'application en fait un état neutre —
-- ni panne, ni échec de tâche — et montre l'équivalent manuel de chaque fonction.
--
-- CINQ GESTES, rejouables :
--   1. la colonne `ia_active` (vraie par défaut : la livraison ne change rien) ;
--   2. `reserver_appel_ia` : « desactive » en premier ;
--   3. `reserver_appel_ia_prive` : « desactive » en premier ;
--   4. `regler_ia_active(boolean)` : le geste du superviseur permanent, journalisé ;
--   5. `ia_disponible()` : la lecture, pour que les écrans du propriétaire, du locataire et de l'artisan sachent quoi
--      afficher (la table elle-même n'est lisible que par le superviseur permanent).
--
-- Les deux gardes sont modifiées EN RELISANT leur définition en vigueur (ancre exacte, marque d'idempotence) : une
-- définition inattendue arrête la migration sans rien changer. Aucune donnée lue ni réécrite, hors la valeur par défaut
-- de la nouvelle colonne.
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261122120000_interrupteur_ia.retour.sql

-- 1. L'état. Vrai par défaut : l'IA reste disponible tant que le superviseur ne la coupe pas.
alter table public.ia_plafond_reglage add column if not exists ia_active boolean not null default true;
comment on column public.ia_plafond_reglage.ia_active is
  'Interrupteur IA (22/11/2026) : faux = aucun appel payant à l''IA ne part, les gardes rendent « desactive » sans rien compter ; le reste de l''application fonctionne, avec ses équivalents manuels.';

-- 2 et 3. Les deux gardes rendent « desactive » avant l'arrêt d'urgence et avant tout comptage.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  -- reserver_appel_ia : tâches planifiées, console, devis de l'artisan.
  select pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure) into v_def;
  if position('Interrupteur IA (22/11/2026)' in v_def) = 0 then
    v_ancre := $ancre$
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
$ancre$;
    if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
      raise exception 'Interrupteur IA : définition inattendue de reserver_appel_ia (ancre absente ou répétée)';
    end if;
    execute replace(v_def, v_ancre, $nouveau$
  -- Interrupteur IA (22/11/2026) : IA désactivée par le superviseur, aucun appel ne part et rien n'est compté.
  if (select not r.ia_active from public.ia_plafond_reglage r where r.singleton) then
    return 'desactive';
  end if;
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
$nouveau$);
  end if;

  -- reserver_appel_ia_prive : assistant et lecture assistée, pour un compte connecté.
  select pg_get_functiondef('public.reserver_appel_ia_prive(uuid,text)'::regprocedure) into v_def;
  if position('Interrupteur IA (22/11/2026)' in v_def) = 0 then
    v_ancre := $ancre$
 if exists(select 1 from public.supervision_arrets where arrete and cle='global') then return 'arret'; end if;
$ancre$;
    if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
      raise exception 'Interrupteur IA : définition inattendue de reserver_appel_ia_prive (ancre absente ou répétée)';
    end if;
    execute replace(v_def, v_ancre, $nouveau$
 -- Interrupteur IA (22/11/2026) : IA désactivée par le superviseur, aucun appel ne part et rien n'est compté.
 if (select not r.ia_active from public.ia_plafond_reglage r where r.singleton) then return 'desactive'; end if;
 if exists(select 1 from public.supervision_arrets where arrete and cle='global') then return 'arret'; end if;
$nouveau$);
  end if;
end $correctif$;

-- Droits des deux gardes : inchangés, redits pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.reserver_appel_ia(text) from public, anon;
grant execute on function public.reserver_appel_ia(text) to authenticated, service_role;
revoke all on function public.reserver_appel_ia_prive(uuid, text) from public, anon;
grant execute on function public.reserver_appel_ia_prive(uuid, text) to authenticated;

-- 4. Le geste : réservé au superviseur permanent en double vérification, comme la limite quotidienne ; journalisé.
create or replace function public.regler_ia_active(p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precedent boolean;
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_active is null then
    raise exception 'Indiquez si l''IA est activée ou désactivée';
  end if;
  select r.ia_active into v_precedent from public.ia_plafond_reglage r where r.singleton for update;
  if not found then
    -- Réglage absent : on le pose avec la limite par défaut de la table, sans rien inventer d'autre.
    insert into public.ia_plafond_reglage (singleton, ia_active, modifie_par, modifie_le)
    values (true, p_active, auth.uid(), now());
  else
    update public.ia_plafond_reglage
       set ia_active = p_active, modifie_par = auth.uid(), modifie_le = now()
     where singleton;
  end if;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'ia_active', auth.uid(), jsonb_build_object('active', p_active, 'precedent', v_precedent));
end;
$$;
comment on function public.regler_ia_active(boolean) is
  'Interrupteur IA (22/11/2026) : le superviseur permanent active ou désactive tous les appels payants à l''IA ; geste journalisé (supervision_operations, action « ia_active »).';
revoke all on function public.regler_ia_active(boolean) from public, anon, service_role;
grant execute on function public.regler_ia_active(boolean) to authenticated;

-- 5. La lecture. Un booléen, sans aucune autre information : la table reste fermée aux comptes ordinaires.
--    Réglage absent = faux : sans réglage lisible, aucun écran ne propose une fonction que la garde refuserait.
create or replace function public.ia_disponible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.ia_active from public.ia_plafond_reglage r where r.singleton), false)
$$;
comment on function public.ia_disponible() is
  'Interrupteur IA (22/11/2026) : vrai si le superviseur laisse l''IA activée. Lecture ouverte aux comptes connectés et au traitement ; ne dit rien de la limite ni de la connexion au fournisseur.';
revoke all on function public.ia_disponible() from public, anon;
grant execute on function public.ia_disponible() to authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
