-- Retour recette 08/08 — unicité de l'adresse email par agence : deux fiches
-- vivantes ne peuvent pas partager la même adresse (la même adresse peut en
-- revanche exister dans deux agences différentes : isolation multi-tenant).
-- Les doublons déjà présents (fiches de test de la recette) sont archivés,
-- jamais supprimés : la fiche la plus ancienne garde l'adresse.

with doublons as (
  select id,
         row_number() over (
           partition by organization_id, lower(email)
           order by created_at
         ) as rang
  from public.persons
  where email is not null and archived_at is null
)
update public.persons p
set archived_at = now()
from doublons d
where d.id = p.id and d.rang > 1;

create unique index persons_email_unique_par_agence
  on public.persons (organization_id, lower(email))
  where email is not null and archived_at is null;
