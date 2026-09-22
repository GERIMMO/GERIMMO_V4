-- Audit pré-bêta : chaque clé étrangère publique doit être couverte par un
-- index afin d'éviter les ralentissements soudains lors des suppressions,
-- mises à jour et jointures quand le portefeuille grandit.

create index if not exists demandes_signature_preuve_document_id_idx
  on public.demandes_signature(preuve_document_id);

create index if not exists marketing_campagnes_cree_par_idx
  on public.marketing_campagnes(cree_par);

create index if not exists marketing_reglages_modifie_par_idx
  on public.marketing_reglages(modifie_par);

-- Ce déclencheur n'accède à aucun objet par son nom : un chemin vide réduit
-- sa surface de résolution et aligne les 287 fonctions sensibles du schéma.
alter function public.proteger_mentions_edl_signe() set search_path = '';
revoke execute on function public.proteger_mentions_edl_signe()
  from public, anon, authenticated;
