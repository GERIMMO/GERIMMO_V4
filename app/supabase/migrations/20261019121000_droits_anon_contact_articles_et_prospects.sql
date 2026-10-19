-- Droits du rôle anon sur le formulaire de contact et les articles ; purge des demandes de contact compatible avec les prospects.
-- Audit du 19/10 (lot mineurs, f et i). Aucune donnée touchée. Rejouable.
-- Retour : supabase/retours-arriere/20261019121000_droits_anon_contact_articles_et_prospects.retour.sql
-- Le lot est joué dans une seule transaction (migrations.yml) : l'attente de verrou est bornée pour tout le fichier.
-- La clé reposée ci-dessous prend un verrou SHARE ROW EXCLUSIVE sur `demandes_devis` pendant sa validation ; une
-- transaction longue ferait attendre la migration sans borne (relecture du 19/10).
set local lock_timeout = '10s';

-- ── (f) Ce que anon peut lire ───────────────────────────────────────────────────────────────────────────────────────
-- `anon` lisait la table entière `demandes_devis` (nom, e-mail, téléphone et message des demandes de contact ; aucune
-- politique RLS pour lui, mais un droit sans raison d'être : l'écriture passe par le client de service depuis
-- 20261014400000) et la table entière `publications`, dont les colonnes internes de la rédaction (motif de refus,
-- erreurs Facebook, auteur, dates de validation, source de veille…). Le site public ne lit que : id, slug, titre,
-- chapo, corps, publie_le, updated_at, seo_description, sources, veine, facebook_image_url, statut (journal/[slug],
-- journal, accueil, plan du site ; `statut` et `publie_le` servent aux filtres et au tri). La politique
-- `publications_lecture_publique` (statut publiée, parution passée) n'est pas touchée ; `authenticated` et
-- `service_role` non plus. `revoke all` sur demandes_devis retire aussi tout privilège résiduel du même rôle.
revoke all privileges on table public.demandes_devis from anon;
revoke select on table public.publications from anon;
grant select (id, slug, titre, chapo, corps, publie_le, updated_at, seo_description, sources, veine, facebook_image_url, statut)
  on table public.publications to anon;

-- ── (i) M18 : la purge des demandes de contact ne bloque plus sur les prospects ─────────────────────────────────────
-- La clé `supervision_prospects.demande_id → demandes_devis` était sans action référentielle : la rétention quotidienne
-- (`appliquer_retention`, demandes de contact de plus de 24 mois, une seule transaction) échouait entière dès qu'un
-- prospect citait une demande à purger. Désormais ON DELETE SET NULL sur cette seule clé.
-- Décision du 19/10 (Q2, retour au plan) : les clés vers `accounts` (responsable, auteur ; auteur du registre) ne
-- changent pas et `auteur` reste obligatoire sur `supervision_prospects` et `supervision_registre` (les auteurs sont les
-- superviseurs permanents) ; la clé vers `organizations` non plus (un prospect « gagné » exige son espace client).
alter table public.supervision_prospects drop constraint if exists supervision_prospects_demande_id_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_demande_id_fkey
  foreign key (demande_id) references public.demandes_devis(id) on delete set null;

-- Le déclencheur de traçage voyait l'UPDATE référentiel comme une modification périmée (révision inchangée) : la purge
-- échouait encore, et pas seulement celle de 03 h sans session — aussi celle que le super admin lance depuis la console
-- (bouton « lancer la purge », `appliquer_retention` sous sa session). Chemin « système » : révision inchangée ET
-- (aucune session — tâche planifiée, clé de service — OU déclencheur imbriqué, `pg_trigger_depth() > 1`, ce qu'est
-- l'action référentielle quelle que soit la session) : pas de contrôle de version, RIEN d'écrit au registre (qui exige
-- un auteur), seule `modifie_le` est datée. Une mise à jour directe par une session reste à la profondeur 1 et garde
-- exactement la règle d'avant. Définition de production relevée le 19/10 : identique au dépôt (20261018061548).
create or replace function public.supervision_tracer_modification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.revision=old.revision and ((select auth.uid()) is null or pg_trigger_depth()>1) then
   new.modifie_le:=now(); return new; -- mise à jour système (action référentielle, tâche planifiée) : rien au registre
  elsif new.revision<>old.revision+1 then raise exception 'Version périmée : rechargez avant de modifier';end if;
  new.modifie_le:=now();
 end if;
 if tg_table_name='supervision_identite' then new.modifie_par:=(select auth.uid());end if;
 insert into public.supervision_registre(objet,objet_id,avant,apres)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id','identite'),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.supervision_tracer_modification() from public,anon,authenticated;

select public.fermer_fonctions_a_anon();
