-- RETOUR ARRIÈRE de 20261122120000 (interrupteur « IA activée / désactivée »).
--
-- Remettre d'abord le code précédent : le code nouveau lit `ia_disponible()` et comprend la réponse « desactive ».
-- Rend aux deux gardes leur forme d'avant (remplacement exact inverse), retire `regler_ia_active`, `ia_disponible`,
-- puis la colonne `ia_active`.
--
-- ATTENTION : après ce retour, l'IA n'a plus d'interrupteur. Si elle était désactivée, elle redevient disponible
-- (sous la limite quotidienne et les arrêts d'urgence). Pour la garder coupée, régler d'abord la limite à 0.
--
-- Atomique et rejouable : une définition déjà rétablie est laissée ; une forme inattendue arrête tout sans rien changer.
do $retour$
declare
  v_def text;
  v_apres text;
  v_avant text;
  n_apres integer;
  n_avant integer;
begin
  -- reserver_appel_ia
  v_def := pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure);
  v_apres := $sql$
  -- Interrupteur IA (22/11/2026) : IA désactivée par le superviseur, aucun appel ne part et rien n'est compté.
  if (select not r.ia_active from public.ia_plafond_reglage r where r.singleton) then
    return 'desactive';
  end if;
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
$sql$;
  v_avant := $sql$
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  if n_apres = 1 then
    execute replace(v_def, v_apres, v_avant);
  elsif position('ia_active' in v_def) > 0 then
    raise exception 'Retour refusé : reserver_appel_ia a une forme inattendue.';
  end if;

  -- reserver_appel_ia_prive
  v_def := pg_get_functiondef('public.reserver_appel_ia_prive(uuid,text)'::regprocedure);
  v_apres := $sql$
 -- Interrupteur IA (22/11/2026) : IA désactivée par le superviseur, aucun appel ne part et rien n'est compté.
 if (select not r.ia_active from public.ia_plafond_reglage r where r.singleton) then return 'desactive'; end if;
 if exists(select 1 from public.supervision_arrets where arrete and cle='global') then return 'arret'; end if;
$sql$;
  v_avant := $sql$
 if exists(select 1 from public.supervision_arrets where arrete and cle='global') then return 'arret'; end if;
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  if n_apres = 1 then
    execute replace(v_def, v_apres, v_avant);
  elsif position('ia_active' in v_def) > 0 then
    raise exception 'Retour refusé : reserver_appel_ia_prive a une forme inattendue.';
  end if;

  revoke all on function public.reserver_appel_ia(text) from public, anon;
  grant execute on function public.reserver_appel_ia(text) to authenticated, service_role;
  revoke all on function public.reserver_appel_ia_prive(uuid, text) from public, anon;
  grant execute on function public.reserver_appel_ia_prive(uuid, text) to authenticated;

  drop function if exists public.regler_ia_active(boolean);
  drop function if exists public.ia_disponible();
  alter table public.ia_plafond_reglage drop column if exists ia_active;

  delete from supabase_migrations.schema_migrations where version = '20261122120000';
end $retour$;
notify pgrst, 'reload schema';
