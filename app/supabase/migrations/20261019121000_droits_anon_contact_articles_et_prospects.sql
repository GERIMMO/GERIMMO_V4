-- Droits du rôle anon sur le formulaire de contact et les articles ; purge et suppressions compatibles avec les prospects.
-- Audit du 19/10 (lot mineurs, f et i). Aucune donnée touchée. Rejouable.
-- Retour : supabase/retours-arriere/20261019121000_droits_anon_contact_articles_et_prospects.retour.sql

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

-- ── (i) M18 : les prospects ne bloquent plus les suppressions ───────────────────────────────────────────────────────
-- Les clés étrangères de `supervision_prospects` (demande d'origine, responsable, auteur) et du registre de supervision
-- (auteur) étaient sans action référentielle. La rétention quotidienne (`appliquer_retention`, demandes de contact de
-- plus de 24 mois, une seule transaction) échouait entière dès qu'un prospect citait une demande à purger ; la
-- suppression d'un compte référencé échouerait de même. Désormais ON DELETE SET NULL vers `demandes_devis` et
-- `accounts`. La clé vers `organizations` reste telle quelle (un prospect « gagné » exige son espace client).
-- `auteur` devient facultatif sur les deux tables : sans quoi SET NULL ne peut pas s'appliquer.
alter table public.supervision_prospects alter column auteur drop not null;
alter table public.supervision_registre alter column auteur drop not null;

alter table public.supervision_prospects drop constraint if exists supervision_prospects_demande_id_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_demande_id_fkey
  foreign key (demande_id) references public.demandes_devis(id) on delete set null;
alter table public.supervision_prospects drop constraint if exists supervision_prospects_responsable_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_responsable_fkey
  foreign key (responsable) references public.accounts(id) on delete set null;
alter table public.supervision_prospects drop constraint if exists supervision_prospects_auteur_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_auteur_fkey
  foreign key (auteur) references public.accounts(id) on delete set null;
alter table public.supervision_registre drop constraint if exists supervision_registre_auteur_fkey;
alter table public.supervision_registre add constraint supervision_registre_auteur_fkey
  foreign key (auteur) references public.accounts(id) on delete set null;

-- Le déclencheur de traçage voyait l'UPDATE référentiel comme une modification périmée (révision inchangée) et
-- écrivait un auteur nul dans un registre qui l'interdisait : la purge échouait encore. Chemin « système » : sans
-- session (auth.uid() nul : action référentielle, tâche planifiée, clé de service) et révision inchangée, pas de
-- contrôle de version ; la trace est écrite au registre, sans auteur. Une session garde exactement la règle d'avant.
-- Définition de production relevée le 19/10 : identique au dépôt (20261018061548).
create or replace function public.supervision_tracer_modification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (select auth.uid()) is null and new.revision=old.revision then
   null; -- mise à jour système : aucune version à contrôler
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
