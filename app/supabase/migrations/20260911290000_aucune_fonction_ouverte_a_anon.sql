-- Refaire une fonction lui rend les droits qu'on lui avait retirés.
--
-- CE QUE L'AUDIT A TROUVÉ, APRÈS LA MISE EN PRODUCTION DU MODULE 8. Le
-- contrôleur de Supabase signale `public.mon_agenda_artisan` comme appelable
-- SANS ÊTRE CONNECTÉ, en SECURITY DEFINER, par `/rest/v1/rpc/…`. Elle avait
-- pourtant été fermée le jour de sa création
-- (`20260911180000_module8_artisans_socle.sql`, ligne 1843).
--
-- LA CAUSE, ET ELLE SE REPRODUIRA. La migration du même jour
-- (`…230000_agenda_dit_ou_en_est_le_rendez_vous.sql`) lui ajoute une colonne de
-- retour. Changer le type de retour d'une fonction impose `DROP` puis `CREATE` :
-- PostgreSQL ne sait pas le faire autrement. Or DROP emporte les droits AVEC la
-- fonction, et le CREATE qui suit repart des droits par défaut — que Supabase
-- accorde à `anon`, `authenticated` et `service_role` sur tout le schéma
-- `public`. La fonction renaît ouverte. Rien ne le signale : la migration passe,
-- les tests passent, l'écran fonctionne.
--
-- CE QUE ÇA VALAIT, ICI. Rien de lisible : le corps filtre sur
-- `mon_artisan_id()` et exige qu'il soit non nul — un appel anonyme rend zéro
-- ligne. Mais ce n'est pas de la sécurité, c'est de la chance : la garde tient
-- parce que CETTE fonction-là se trouve être écrite ainsi. Le droit, lui, ne
-- devait pas exister. Une prochaine fonction refaite pour la même raison
-- technique n'aura pas forcément cette prudence dans son corps.
--
-- DEUX SÉQUELLES, PAS UNE. Le même DROP/CREATE avait déjà rouvert
-- `comparatif_edl` le 01/08 — passée inaperçue treize jours, parce qu'elle est
-- SECURITY INVOKER : le contrôleur ne la signale pas (RLS s'applique encore) et
-- personne ne la regarde. Trois autres fonctions n'avaient simplement jamais
-- été fermées : `alerte_origine`, `dossier_personne`,
-- `restitution_date_limite`.
--
-- LA RÉPARATION DURABLE. Fermer ces cinq-là ne vaut que jusqu'au prochain
-- changement de type de retour. On pose donc la même mécanique que pour les
-- gardes d'abonnement : une fonction REJOUABLE qui énumère le catalogue au
-- moment où elle s'exécute, et un test qui échoue si une seule fonction du
-- schéma `public` reste ouverte à `anon`. La fonction, on peut oublier de
-- l'appeler ; le test, lui, échoue.

-- ── La fermeture, rejouable ────────────────────────────────────────────────
create or replace function public.fermer_fonctions_a_anon()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f record;
  -- Aucune fonction du produit n'a besoin d'être appelée sans être connecté :
  -- le seul geste public du site — la demande de devis — écrit dans une table,
  -- sous politique RLS, pas par RPC. Si un jour il en faut une (un webhook
  -- signé, par exemple), elle s'ajoute ICI, avec la raison en commentaire —
  -- et le test cesse alors de la compter.
  v_publiques text[] := array[]::text[];
  v_auth boolean;
  v_svc boolean;
  v_n integer := 0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by p.proname
  loop
    if f.proname = any(v_publiques) then continue; end if;

    -- CE QUI SE PASSE AVANT DE RETIRER, ET POURQUOI. Le droit de `anon` peut
    -- venir de deux endroits : une mention explicite, ou le droit de PUBLIC —
    -- celui que PostgreSQL accorde d'office et qui revient après un DROP. Il
    -- faut retirer les deux, sinon on ne ferme rien. Mais PUBLIC couvre AUSSI
    -- `authenticated` et `service_role` : sur une fonction dont c'est la seule
    -- source de droit, le retirer les mettrait dehors avec `anon`, et la moitié
    -- du produit tomberait. On note donc ce qu'ils peuvent AVANT, et on le leur
    -- rend nommément APRÈS. Le droit ne change pour personne sauf `anon`.
    v_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    v_svc := has_function_privilege('service_role', f.oid, 'EXECUTE');

    execute format('revoke execute on function public.%I(%s) from public, anon',
                   f.proname, f.args);
    if v_auth then
      execute format('grant execute on function public.%I(%s) to authenticated',
                     f.proname, f.args);
    end if;
    if v_svc then
      execute format('grant execute on function public.%I(%s) to service_role',
                     f.proname, f.args);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function public.fermer_fonctions_a_anon() is
  'Retire à anon et à PUBLIC le droit d''exécuter toute fonction du schéma public. À APPELER EN FIN DE TOUTE MIGRATION qui crée ou REFAIT (drop/create) une fonction : un DROP rend les droits par défaut, et la fonction renaît ouverte.';
revoke execute on function public.fermer_fonctions_a_anon() from public, anon, authenticated;

-- Rattrapage immédiat : les cinq fonctions constatées ouvertes le 11/09.
select public.fermer_fonctions_a_anon();
