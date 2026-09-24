-- ── L'essai finit, mais il n'y a rien à payer : l'écriture reste ouverte ──
-- Décision du 24/09 (tour du site). Les conditions (art. 8.2), la FAQ et
-- « Mon abonnement » promettent au propriétaire direct que son premier bien
-- est offert à vie et que son compte reste ouvert tant qu'il ne gère qu'un
-- bien. La base, elle, fermait l'écriture au lendemain de l'essai sans
-- regarder ce qu'il y avait à payer — et ce propriétaire ne pouvait même pas
-- souscrire (« il n'y a rien à payer »). Au 15ᵉ jour, il était bloqué en
-- lecture seule sans issue.
--
-- La règle devient : à la fin de l'essai, l'écriture reste ouverte si la
-- quantité facturable (abonnement_quantite_cible) est nulle — le propriétaire
-- d'un seul bien, comme l'agence sans lot sous mandat actif : personne ne
-- doit rien. Dès qu'une unité devient facturable, la règle d'avant s'applique
-- et la souscription redevient possible.
create or replace function public.org_ecriture_ouverte(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case o.status
           -- L'essai court jusqu'à sa date incluse ; sans date, il ne ferme pas
           -- (organisation créée avant que l'essai n'existe). Essai fini mais
           -- rien à payer : ouvert (24/09).
           when 'essai' then o.essai_fin is null
                          or o.essai_fin >= current_date
                          or public.abonnement_quantite_cible(o.id) < 1
           -- Active, mais le prélèvement est en défaut depuis plus de quinze
           -- jours : l'écriture se ferme, le statut ne change pas. Ce client
           -- paie — c'est sa carte qui a échoué.
           when 'active' then
             a.paiement_en_defaut_depuis is null
             or (current_date - a.paiement_en_defaut_depuis) < public.delai_defaut_paiement_jours()
           else false                     -- suspendue, archivee
         end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;
comment on function public.org_ecriture_ouverte(uuid) is
  'L''écriture est-elle ouverte ? Essai non expiré — ou expiré sans rien à payer (quantité facturable nulle, 24/09) —, ou compte actif dont le prélèvement n''est pas en défaut depuis quinze jours ou plus. Aucune tâche de nuit : la date suffit, et la régularisation rouvre à la seconde.';
revoke execute on function public.org_ecriture_ouverte(uuid) from public, anon;
