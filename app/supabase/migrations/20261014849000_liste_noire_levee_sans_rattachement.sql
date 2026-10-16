-- Liste noire locale : la levée ne fait jamais entrer un artisan dans un carnet (troisième relecture du 15/10/2026 du lot
-- « invitation-artisan », constat de sécurité).
--
-- Constat : depuis 20261014843000, `artisan_blacklist_locale` exige une relation préalable réelle ; une sollicitation, une
-- intervention ou un devis suffit. Sans ligne de carnet, la fonction CRÉE alors la ligne `artisan_agences` (statut
-- « désactivé », sur liste noire). `artisan_lever_blacklist_locale` passait ensuite CETTE ligne en « actif » : un
-- propriétaire direct qui avait sollicité un artisan du réseau (commune ouverte) le mettait sur liste noire, levait la
-- liste noire, et l'artisan se trouvait dans son carnet, sollicitable comme « carnet » jusque dans une commune fermée,
-- sans invitation ni geste de l'artisan. Contraire à la décision du 15/10/2026 (un artisan n'entre dans le carnet d'un
-- propriétaire qu'en acceptant son invitation) ; pour une agence, la levée contournait l'ajout par SIRET (profil public
-- exigé, RM-A1.9). `artisan_statut_local(…, true)` réactivait de même une telle ligne après la purge du motif (trois
-- ans, `maintenance_artisans`), qui la laisse « désactivée ».
--
-- Correctif :
--   1. Colonne `artisan_agences.creee_par_liste_noire` (faux par défaut) : la ligne n'existe que par la liste noire.
--      Rattrapage des lignes existantes encore sur liste noire depuis leur création (`blacklist_le = created_at` : la
--      liste noire les a créées dans la même instruction) ; le nombre est dit. Aucune autre ligne n'est touchée.
--   2. `artisan_blacklist_locale` marque la ligne qu'elle CRÉE ; une ligne existante garde sa marque.
--   3. `artisan_lever_blacklist_locale` SUPPRIME une ligne marquée (retour à l'état d'avant : aucune relation de carnet) ;
--      une ligne du carnet antérieure à la liste noire redevient active, comme avant.
--   4. `artisan_statut_local(…, true)` refuse une ligne marquée, avec la porte à prendre ; la désactivation reste permise.
--   5. `repondre_invitation_artisan` : l'acceptation par l'artisan (la porte prévue pour un propriétaire direct) qui
--      réactive une ligne marquée retire la marque. L'ajout par SIRET d'une agence (`artisan_creer_ou_rattacher`) n'est
--      pas modifié : sur une ligne existante il ne fait rien ; après la levée, la ligne n'existe plus et il la crée.
-- Rôles admis, motifs, droits : inchangés.
--
-- Modèle de rejeu à marques (20261013120000) : chaque définition en vigueur est RELUE (pg_get_functiondef) ; l'ancre est
-- remplacée par le morceau du correctif, qui porte la marque. Rejouée, la migration trouve ses marques et ne fait rien
-- (colonne : `if not exists` ; rattrapage : sans effet sur des lignes déjà marquées) ; si une ancre manque ou se répète,
-- elle s'arrête (dans la transaction de `migrations.yml`, rien ne subsiste).
-- ATTENTION, retour de 20261014601000 : il rétablit `artisan_blacklist_locale` EN ENTIER, ce qui effacerait aussi le
-- morceau 2 (et celui de 20261014843000). S'il doit être joué : jouer d'abord le retour de cette migration, puis celui
-- de 843000, puis celui de 601000 ; rejouer ensuite 843000 et cette migration.
-- Retour arrière : app/supabase/retours-arriere/20261014849000_liste_noire_levee_sans_rattachement.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

-- 1. La marque, et le rattrapage des lignes créées par la liste noire avant cette migration.
alter table public.artisan_agences add column if not exists creee_par_liste_noire boolean not null default false;
comment on column public.artisan_agences.creee_par_liste_noire is
  'Vrai : la ligne n''existe que par la liste noire locale (artisan_blacklist_locale l''a créée). La levée la supprime, la réactivation la refuse ; seule l''acceptation d''une invitation par l''artisan retire la marque. Voir 20261014849000.';

do $rattrapage$
declare
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_n integer;
begin
  -- Écriture de maintenance : la garde de l'abonnement (organisation suspendue) ne s'applique pas à ce rattrapage.
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);
  update public.artisan_agences set creee_par_liste_noire = true
   where not creee_par_liste_noire and blacklist_le is not null and blacklist_le = created_at;
  get diagnostics v_n = row_count;
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  raise notice 'Lignes de carnet créées par la liste noire, désormais marquées : %', v_n;
end $rattrapage$;

-- 2. La liste noire marque la ligne qu'elle crée.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$     blacklist_par, purge_motif_le, created_by)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()))$ancre$;
  c_nouveau constant text := $nouveau$     -- Relecture du 15/10 (liste noire sans rattachement, création) : la ligne créée ici le dit, voir 20261014849000.
     blacklist_par, purge_motif_le, created_by, creee_par_liste_noire)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()), true)$nouveau$;
begin
  select pg_get_functiondef('public.artisan_blacklist_locale(uuid,uuid,text)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (liste noire sans rattachement, création)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014849000 : définition inattendue de artisan_blacklist_locale (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- 3. La levée supprime une ligne qui n'existait que par la liste noire.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  update public.artisan_agences
  set statut = 'actif', blacklist_le = null, blacklist_motif = null,$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire sans rattachement, levée) : jamais d'entrée au carnet par la levée, voir 20261014849000.
  delete from public.artisan_agences
   where organization_id = p_org and artisan_id = p_artisan and creee_par_liste_noire;
  if found then return; end if;
  update public.artisan_agences
  set statut = 'actif', blacklist_le = null, blacklist_motif = null,$nouveau$;
begin
  select pg_get_functiondef('public.artisan_lever_blacklist_locale(uuid,uuid)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (liste noire sans rattachement, levée)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014849000 : définition inattendue de artisan_lever_blacklist_locale (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- 4. La réactivation refuse une ligne qui n'existe que par la liste noire.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  update public.artisan_agences
  set statut = case when p_actif then 'actif' else 'desactive' end::public.artisan_relation_statut$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire sans rattachement, réactivation) : la porte du carnet est ailleurs, voir 20261014849000.
  if p_actif and exists (select 1 from public.artisan_agences aa
                         where aa.organization_id = p_org and aa.artisan_id = p_artisan and aa.creee_par_liste_noire) then
    if exists (select 1 from public.organizations o where o.id = p_org and o.type = 'proprietaire_direct') then
      raise exception 'Cet artisan n’est entré dans votre carnet que par votre liste noire : il ne peut pas y être réactivé. Levez la liste noire, puis invitez-le : il rejoindra votre carnet s’il accepte.';
    end if;
    raise exception 'Cet artisan n’est entré dans votre carnet que par votre liste noire : il ne peut pas y être réactivé. Levez la liste noire, puis ajoutez-le à votre carnet par son SIRET.';
  end if;
  update public.artisan_agences
  set statut = case when p_actif then 'actif' else 'desactive' end::public.artisan_relation_statut$nouveau$;
begin
  select pg_get_functiondef('public.artisan_statut_local(uuid,uuid,boolean)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (liste noire sans rattachement, réactivation)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014849000 : définition inattendue de artisan_statut_local (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- 5. L'acceptation par l'artisan, porte prévue d'un propriétaire direct, retire la marque de la ligne qu'elle réactive.
do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$    update public.artisan_agences set statut = 'actif' where id = aa.id;$ancre$;
  c_nouveau constant text := $nouveau$    -- Relecture du 15/10 (liste noire sans rattachement, acceptation) : le geste de l'artisan fait entrer la ligne au carnet, voir 20261014849000.
    update public.artisan_agences set statut = 'actif', creee_par_liste_noire = false where id = aa.id;$nouveau$;
begin
  select pg_get_functiondef('public.repondre_invitation_artisan(uuid,boolean)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (liste noire sans rattachement, acceptation)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014849000 : définition inattendue de repondre_invitation_artisan (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : les clients connectés (chaque fonction vérifie le rôle), jamais
-- `anon` ni PUBLIC.
revoke all on function public.artisan_blacklist_locale(uuid, uuid, text),
  public.artisan_lever_blacklist_locale(uuid, uuid),
  public.artisan_statut_local(uuid, uuid, boolean),
  public.repondre_invitation_artisan(uuid, boolean) from public, anon;
grant execute on function public.artisan_blacklist_locale(uuid, uuid, text),
  public.artisan_lever_blacklist_locale(uuid, uuid),
  public.artisan_statut_local(uuid, uuid, boolean),
  public.repondre_invitation_artisan(uuid, boolean) to authenticated;

select public.fermer_fonctions_a_anon();
