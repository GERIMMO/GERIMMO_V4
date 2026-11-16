-- Les droits opérationnels suivent la personne, le bail et le jour à Paris.
-- La solidarité financière éventuelle du colocataire sortant ne prolonge pas
-- ses droits sur les rendez-vous du logement. Aucun bail ni incident réécrit.
create or replace function public.occupant_bail_incident(
  p_org uuid, p_bail uuid, p_jour date default public.aujourdhui_paris(),
  p_historique boolean default false
) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.baux b
    join public.persons p on p.organization_id=b.organization_id and p.account_id=auth.uid()
    join public.memberships m on m.organization_id=b.organization_id and m.account_id=p.account_id
    where b.id=p_bail and b.organization_id=p_org and m.role='locataire'
      and (m.status='active' or (p_historique and m.status='inactive'))
      and (b.etat in ('actif','preavis') or (p_historique and b.etat='termine'))
      and (
        exists (select from public.bail_personnes bp
                where bp.organization_id=p_org and bp.bail_id=b.id and bp.person_id=p.id
                  and bp.role='colocataire' and (bp.date_depart is null or bp.date_depart>=p_jour))
        or (b.locataire_principal=p.id and not exists (
            select from public.bail_personnes bp where bp.bail_id=b.id
              and bp.person_id=p.id and bp.role='colocataire'))
      )
  );
$$;
revoke all on function public.occupant_bail_incident(uuid,uuid,date,boolean)
  from public, anon, authenticated, service_role;

-- Conserver les signatures, les privilèges et les autres règles des RPC.
-- Même procédé que la migration 20261027100100 : si le fragment attendu
-- n'est pas unique, le lot s'arrête avant tout changement durable.
do $droits$
declare
  cible record;
  definition text;
begin
  for cible in select * from (values
    ('declarer_mon_incident(uuid,text,text,text,text,public.incident_urgence)',
     $avant$where b.organization_id = p_org and b.etat in ('actif', 'preavis')$avant$,
     $apres$where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('choisir_creneau(uuid,uuid)',
     $avant$and b.organization_id = p_org and b.etat in ('actif', 'preavis')$avant$,
     $apres$and b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('contre_proposer_creneaux(uuid,uuid,jsonb)',
     $avant$and b.organization_id = p_org and b.etat in ('actif', 'preavis')$avant$,
     $apres$and b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('mes_creneaux_locataire(uuid)',
     $avant$where b.organization_id = p_org and b.etat in ('actif', 'preavis')$avant$,
     $apres$where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('mes_rendez_vous_locataire(uuid)',
     $avant$and moi.id is not null$avant$,
     $apres$and moi.id is not null
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('mon_bail_locataire(uuid)',
     $avant$and b.etat in ('actif', 'preavis')$avant$,
     $apres$and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('intervention_du_locataire(uuid,uuid)',
     $avant$and b.etat in ('actif', 'preavis')$avant$,
     $apres$and b.etat in ('actif', 'preavis')
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('mes_incidents_locataire(uuid)',
     $avant$where i.organization_id = p_org$avant$,
     $apres$where i.organization_id = p_org
      and (i.bail_id is null or public.occupant_bail_incident(p_org,i.bail_id,
             coalesce((i.clos_le at time zone 'Europe/Paris')::date,public.aujourdhui_paris()),true))$apres$),
    ('mon_suivi_intervention(uuid)',
     $avant$where i.organization_id = p_org$avant$,
     $apres$where i.organization_id = p_org
      and (i.bail_id is null or public.occupant_bail_incident(p_org,i.bail_id,public.aujourdhui_paris(),true))$apres$),
    ('noter_artisan_locataire(uuid,uuid,smallint,text)',
     $avant$where i.id = v.incident_id and i.organization_id = p_org$avant$,
     $apres$where i.id = v.incident_id and i.organization_id = p_org
      and public.occupant_bail_incident(p_org,b.id)$apres$),
    ('contester_imputation(uuid,uuid,text)',
     $avant$and p.account_id = (select auth.uid())$avant$,
     $apres$and p.account_id = (select auth.uid())
      and public.occupant_bail_incident(p_org,i.bail_id)$apres$),
    ('rouvrir_incident(uuid,uuid,text)',
     $avant$if not (v_gerant or v_declarant) then$avant$,
     $apres$if not (v_gerant or (coalesce(v_declarant,false) and public.occupant_bail_incident(p_org,v.bail_id))) then$apres$),
    ('joindre_photo_incident(uuid,uuid,text,text,bigint,text)',
     $avant$if not (v_gerant or v_declarant) then$avant$,
     $apres$if not (v_gerant or (coalesce(v_declarant,false) and public.occupant_bail_incident(p_org,v.bail_id))) then$apres$),
    ('verifier_declarant_photo(uuid,uuid)',
     $avant$and p.account_id=auth.uid())$avant$,
     $apres$and p.account_id=auth.uid()
      and public.occupant_bail_incident(p_org,i.bail_id))$apres$),
    ('declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence)',
     $avant$if v.account_id<>auth.uid() or v.organization_id<>p_org then$avant$,
     $apres$if v.account_id<>auth.uid() or v.organization_id<>p_org or not exists (
       select from public.incidents i where i.id=v.incident_id and i.organization_id=p_org
         and public.occupant_bail_incident(p_org,i.bail_id)) then$apres$),
    ('marquer_incident_urgent_notifie(uuid,uuid)',
     $avant$where id=p_commande and account_id=auth.uid() and organization_id=p_org and notifie_le is null$avant$,
     $apres$where id=p_commande and account_id=auth.uid() and organization_id=p_org and notifie_le is null
      and exists (select from public.incidents i where i.id=commandes_incidents_locataire.incident_id
                  and i.organization_id=p_org and public.occupant_bail_incident(p_org,i.bail_id))$apres$),
    ('ged_depot_locataire_autorise(text)',
     $avant$and d.etat='en_attente'))$avant$,
     $apres$and d.etat='en_attente' and exists (
          select from public.incidents i where i.id=d.incident_id and i.organization_id=d.organization_id
            and public.occupant_bail_incident(d.organization_id,i.bail_id))))$apres$)
  ) as changements(signature,avant,apres) loop
    definition := pg_get_functiondef(('public.'||cible.signature)::regprocedure);
    if strpos(definition,cible.apres)>0 then continue; end if;
    if cardinality(string_to_array(definition,cible.avant)) <> 2 then
      raise exception 'Définition inattendue pour % ; migration interrompue.',cible.signature;
    end if;
    execute replace(definition,cible.avant,cible.apres);
  end loop;
end $droits$;

notify pgrst, 'reload schema';
