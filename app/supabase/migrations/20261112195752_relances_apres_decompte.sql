-- Les termes restent consultables pour les quittances et la comptabilité historique.
-- Seule leur réclamation au titre du loyer cesse après la finalisation du décompte.
-- Préserver les signatures, contrôles d'accès et grants des RPC installées.
do $migration$
declare
  circuit record;
  definition text;
begin
  for circuit in select * from (values
    ('rappels_loyers_proprietaire', 'where b.organization_id=p_org', 'where not exists (select from public.restitutions r where r.bail_id=b.id and r.statut=''finalise'') and b.organization_id=p_org'),
    ('relances_loyer_dues', 'where b.etat in (''actif'', ''preavis'')', 'where not exists (select from public.restitutions r where r.bail_id=b.id and r.statut=''finalise'') and b.etat in (''actif'', ''preavis'')'),
    ('confirmation_relance_proprietaire', 'where b.id=p_bail', 'where not exists (select from public.restitutions r where r.bail_id=b.id and r.statut=''finalise'') and b.id=p_bail'),
    ('dette_recommande_ar24', 'where e.date_echeance<', 'where not exists (select from public.restitutions r where r.bail_id=p_bail and r.statut=''finalise'') and e.date_echeance<'),
    ('demander_plan_apurement', 'if exists (select 1 from public.plans_apurement', 'if exists (select from public.restitutions r where r.bail_id=v_bail and r.statut=''finalise'') then raise exception ''Consultez le décompte de départ pour ce bail.''; end if;
  if exists (select 1 from public.plans_apurement'),
    ('declarer_reception_loyer', 'if p_reponse=''non_recu'' then', 'if exists (select from public.restitutions r where r.bail_id=b.id and r.statut=''finalise'') then raise exception ''Cette échéance figure déjà dans le décompte de départ.''; end if;
  if p_reponse=''non_recu'' then'),
    -- Le verrou du bail est acquis et une commande déjà réussie a pu être rejouée.
    ('encaisser_reste_atomique', 'select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),''[]''::jsonb)
 into v_avant', 'if exists (select from public.restitutions r where r.bail_id=p_bail and r.statut=''finalise'') then
   return jsonb_build_object(''statut'',''au_decompte'',''montant'',0,''rejoue'',false);
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),''[]''::jsonb)
 into v_avant'),
    ('mon_echeancier_locataire', 'e.montant_couvert, e.statut,', 'e.montant_couvert, case when e.montant_du>e.montant_couvert and exists (select from public.restitutions r where r.bail_id=b.id and r.statut=''finalise'') then ''au_decompte'' else e.statut end,')
  ) as modifications(nom, ancien, nouveau)
  loop
    select pg_get_functiondef(('public.' || circuit.nom)::regproc) into strict definition;
    if position(circuit.nouveau in definition) > 0 then continue; end if;
    if length(definition)-length(replace(definition,circuit.ancien,'')) <> length(circuit.ancien) then
      raise exception 'Définition inattendue : %', circuit.nom;
    end if;
    execute replace(definition,circuit.ancien,circuit.nouveau);
  end loop;
end $migration$;
notify pgrst, 'reload schema';
