-- Décision du dirigeant du 24/11/2026 (Q49), reprise du lot D3 (B1) — une pièce DÉJÀ rangée dans Documents peut
-- justifier une retenue, et plusieurs retenues peuvent partager la même pièce.
--
-- LE BESOIN. Depuis le lot D3, chaque retenue doit avoir son justificatif, sinon les deux décomptes sont bloqués. Or
-- un même fichier ne se dépose qu'une fois par espace (index `documents_empreinte_unique`). Un devis unique pour trois
-- réparations, ou l'état des lieux de sortie déjà rangé, ne pouvaient donc justifier qu'UNE retenue. L'écran rattache
-- maintenant la pièce existante, sans copie, par deux fonctions qui existaient déjà :
--   · `justifier_retenue(p_retenue, p_document)` ;
--   · `ajouter_retenue(…, p_justificatif)`.
--
-- CE QUE POSE CETTE MIGRATION : un seul garde-fou, sur la table `retenues`, pour tous les chemins d'écriture.
-- Avant d'accepter une pièce sur une retenue, la base vérifie que cette pièce :
--   1. est un document vivant (non purgé) du MÊME espace que la retenue ;
--   2. est lisible par la personne qui fait le geste (mêmes conditions que les règles de lecture de `documents` : un
--      agent limité à son portefeuille ne rattache que ce qu'il a déposé ou ce qui est dans son portefeuille) ;
--   3. n'est pas rangée dans le dossier d'un AUTRE bail (lien « bail » vers un autre bail, ou contrat signé d'un autre
--      bail) : le document d'un autre locataire ne justifie pas la retenue de celui-ci.
-- Les refus 1 et 2 portent le même message, « Justificatif introuvable » : il ne dit pas si la pièce existe ailleurs.
--
-- POURQUOI UN DÉCLENCHEUR. `justifier_retenue` vérifiait déjà l'espace, mais `ajouter_retenue` acceptait n'importe quel
-- identifiant de document (la clé étrangère ne porte que sur l'identifiant). Un contrôle unique sur la table couvre les
-- deux fonctions, et celles qui viendraient ensuite, sans réécrire leur texte.
--
-- CE QUI NE CHANGE PAS. Aucune fonction existante n'est réécrite, aucun droit n'est ouvert, aucune règle de lecture
-- (RLS) n'est touchée, aucune donnée n'est écrite ni supprimée. Les retenues déjà enregistrées ne sont pas relues.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124200000_justificatif_retenue_piece_existante.retour.sql

create or replace function public.garde_justificatif_retenue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_doc record;
  v_bail uuid;
begin
  -- Rien à contrôler si la retenue n'a pas de pièce, ou si sa pièce ne change pas.
  if new.justificatif_document is null
     or (tg_op = 'UPDATE' and new.justificatif_document is not distinct from old.justificatif_document) then
    return new;
  end if;

  -- 1. Un document vivant du même espace.
  select d.id, d.storage_path, d.deposited_by into v_doc
    from public.documents d
   where d.id = new.justificatif_document
     and d.organization_id = new.organization_id
     and d.purged_at is null;
  if v_doc.id is null then
    raise exception 'Justificatif introuvable';
  end if;

  -- 2. Lisible par la personne qui fait le geste. Cette fonction écrit sans les règles de lecture (elle est appelée
  --    depuis des fonctions qui s'exécutent avec les droits de leur propriétaire) : elle refait donc ici les deux
  --    conditions restrictives de la lecture de `documents` (chemin du fichier dans l'espace ; portefeuille de l'agent).
  if not ged_securite_interne.chemin_organisation(new.organization_id, v_doc.storage_path)
     or (public.est_agent_restreint(new.organization_id)
         and v_doc.deposited_by is distinct from (select auth.uid())
         and not public.document_dans_portefeuille(new.organization_id, v_doc.id)) then
    raise exception 'Justificatif introuvable';
  end if;

  -- 3. Pas le dossier d'un autre bail. Une pièce rangée à la fois dans ce bail et dans un autre reste admise.
  select r.bail_id into v_bail from public.restitutions r where r.id = new.restitution_id;
  if (exists (select 1 from public.document_liens l
               where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id <> v_bail)
      or exists (select 1 from public.baux b
                  where b.document_signe = v_doc.id and b.id <> v_bail))
     and not exists (select 1 from public.document_liens l
                      where l.document_id = v_doc.id and l.entite = 'bail' and l.entite_id = v_bail) then
    raise exception 'Cette pièce est rangée dans le dossier d''un autre bail : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail';
  end if;

  return new;
end;
$$;
comment on function public.garde_justificatif_retenue() is
  'Avant d''accepter une pièce sur une retenue : document vivant du même espace, lisible par l''appelant, pas rangé dans le dossier d''un autre bail (Q49, reprise du lot D3).';
revoke all on function public.garde_justificatif_retenue() from public, anon, authenticated, service_role;

drop trigger if exists retenues_justificatif_admis on public.retenues;
create trigger retenues_justificatif_admis
  before insert or update of justificatif_document on public.retenues
  for each row execute function public.garde_justificatif_retenue();

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
