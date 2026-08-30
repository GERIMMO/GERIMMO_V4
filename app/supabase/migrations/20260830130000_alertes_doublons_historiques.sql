-- Sprint « Alertes & documents » — rattrapage : les crons diagnostics/assurance
-- empilaient une alerte par seuil ; désormais une seule par objet. Les doublons
-- encore ouverts sont fermés (motif conservé), la plus récente reste.
with classees as (
  select id,
         row_number() over (
           partition by type, coalesce(details->>'diagnostic_id', details->>'document_id')
           order by created_at desc) as rang
  from public.alerts
  where statut = 'ouverte'
    and type in ('diagnostic_expiration', 'assurance_expiration')
    and coalesce(details->>'diagnostic_id', details->>'document_id') is not null
)
update public.alerts a
   set statut = 'fermee', closed_at = now(),
       closed_action = 'Doublon d''un seuil antérieur — une seule alerte par objet depuis le 30/08'
  from classees c
 where c.id = a.id and c.rang > 1;
