-- Une facture fournisseur payée alimente le livre, avec sa preuve, une seule fois.
-- Les écritures restent immuables ; une ventilation tardive contre-passe l'attente.
create table public.paiements_factures_fourniture (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 facture_id uuid not null unique references public.factures_fourniture(id),
 bien_id uuid not null, document_id uuid not null,
 date_paiement date not null, montant_cents bigint not null check(montant_cents>0),
 etat text not null check(etat in('a_ventiler','ventile')),
 source jsonb not null, created_by uuid not null references public.accounts(id),
 created_at timestamptz not null default now(),
 foreign key(bien_id,organization_id) references public.biens(id,organization_id),
 foreign key(document_id,organization_id) references public.documents(id,organization_id)
);
create index paiements_fourniture_org on public.paiements_factures_fourniture(organization_id);
create index paiements_fourniture_bien on public.paiements_factures_fourniture(bien_id,organization_id);
create index paiements_fourniture_document on public.paiements_factures_fourniture(document_id,organization_id);
create index paiements_fourniture_auteur on public.paiements_factures_fourniture(created_by);
create table public.ecritures_factures_fourniture (
 ecriture_id uuid primary key references public.ecritures(id),
 paiement_id uuid not null references public.paiements_factures_fourniture(id),
 repartition_id uuid references public.repartitions_fourniture(id),
 phase text not null check(phase in('paiement','ventilation','annulation'))
);
create index ecritures_fourniture_paiement on public.ecritures_factures_fourniture(paiement_id);
create index ecritures_fourniture_repartition on public.ecritures_factures_fourniture(repartition_id);
alter table public.paiements_factures_fourniture enable row level security;
alter table public.ecritures_factures_fourniture enable row level security;
revoke all on public.paiements_factures_fourniture,public.ecritures_factures_fourniture from public,anon,authenticated;
grant select on public.paiements_factures_fourniture,public.ecritures_factures_fourniture to authenticated;
create policy paiements_fourniture_lecture on public.paiements_factures_fourniture for select to authenticated
 using(exists(select 1 from public.factures_fourniture f where f.id=facture_id and f.organization_id=organization_id));
create policy ecritures_fourniture_lecture on public.ecritures_factures_fourniture for select to authenticated
 using(exists(select 1 from public.ecritures e where e.id=ecriture_id) and exists(select 1 from public.paiements_factures_fourniture p where p.id=paiement_id));
create trigger traversee_lecture_seule before insert or update or delete on public.paiements_factures_fourniture for each row execute function support_interne.garder_ecriture_traversee();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.paiements_factures_fourniture for each row execute function public.refuser_mutation_diagnostic_artisan();

-- Privé : seuls le paiement et la validation contrôlés peuvent créer ces liens.
create function consommations_interne.ecrire_facture(p_paiement uuid,p_lot uuid,p_centimes bigint,p_categorie text,p_phase text,p_repartition uuid,p_contre uuid,p_imputation date)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.paiements_factures_fourniture; v_id uuid; v_libelle text;
begin
 if p_centimes<=0 then return null; end if;
 select * into strict p from public.paiements_factures_fourniture where id=p_paiement;
 if p_lot is not null and not exists(select 1 from public.lots l where l.id=p_lot and l.organization_id=p.organization_id and l.bien_id=p.bien_id and not public.lot_hors_portefeuille(p.organization_id,l.id)) then raise exception 'Logement hors du paiement'; end if;
 v_libelle:=concat(p.source->'contrat'->>'fournisseur',' · facture ',p.source->'facture'->>'reference',' · ',p.source->>'bien_nom');
 if p_lot is null then v_libelle:=v_libelle||' · part bâtiment à ventiler'; end if;
 if p_phase='annulation' then v_libelle:='Reclassement de la facture : '||v_libelle; end if;
 insert into public.ecritures(organization_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,systeme,contre_ecriture_de,motif)
 values(p.organization_id,p_lot,p_categorie,case when p_phase='annulation' then 'recette' else 'depense' end,p_centimes::numeric/100,p.date_paiement,p_imputation,v_libelle,true,p_contre,
 case when p_phase='annulation' then 'Ventilation de la facture fournisseur après validation de son décompte' end) returning id into v_id;
 insert into public.ecritures_factures_fourniture(ecriture_id,paiement_id,repartition_id,phase) values(v_id,p.id,p_repartition,p_phase);
 return v_id;
end $$;
revoke all on function consommations_interne.ecrire_facture(uuid,uuid,bigint,text,text,uuid,uuid,date) from public,anon,authenticated,service_role;

-- Les frais de gestion ne rejoignent jamais la TEOM récupérable. Les autres
-- dépenses restent à qualifier fiscalement dans le parcours existant.
create function consommations_interne.ventiler_paiement_facture(p_paiement uuid,p_repartition uuid,p_imputation date,p_phase text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.paiements_factures_fourniture; r public.repartitions_fourniture; ligne record;
 v_frais bigint; v_reparti bigint; v_categorie text; v_lot uuid; v_reste bigint;
begin
 select * into strict p from public.paiements_factures_fourniture where id=p_paiement for update;
 v_categorie:=case when p.source->'contrat'->>'categorie'='teom' then 'teom' else 'autre' end;
 v_frais:=(p.source->'facture'->>'frais_gestion_cents')::bigint;
 v_lot:=(p.source->'contrat'->>'lot_id')::uuid;
 if p_repartition is not null then
  select * into strict r from public.repartitions_fourniture where id=p_repartition and facture_id=p.facture_id and organization_id=p.organization_id and statut='validee';
  select coalesce(sum(x.montant_cents),0) into v_reparti from jsonb_to_recordset(r.lignes) as x(montant_cents bigint);
  if v_reparti<0 or v_reparti+v_frais>p.montant_cents then raise exception 'Le décompte ne correspond pas au paiement'; end if;
  for ligne in select x.lot_id,sum(x.montant_cents)::bigint as cents from jsonb_to_recordset(r.lignes) as x(lot_id uuid,montant_cents bigint) group by x.lot_id loop
   perform consommations_interne.ecrire_facture(p.id,ligne.lot_id,ligne.cents,v_categorie,p_phase,r.id,null,p_imputation);
  end loop;
  -- Sans clé démontrée pour l'écart général et les frais, aucune affectation
  -- arbitraire à un logement. Ils restent explicitement au bâtiment.
  v_reste:=p.montant_cents-v_reparti-v_frais;
  perform consommations_interne.ecrire_facture(p.id,v_lot,v_reste,v_categorie,p_phase,r.id,null,p_imputation);
  perform consommations_interne.ecrire_facture(p.id,v_lot,v_frais,'autre',p_phase,r.id,null,p_imputation);
 else
  perform consommations_interne.ecrire_facture(p.id,v_lot,p.montant_cents-v_frais,v_categorie,p_phase,null,null,p_imputation);
  perform consommations_interne.ecrire_facture(p.id,v_lot,v_frais,'autre',p_phase,null,null,p_imputation);
 end if;
end $$;
revoke all on function consommations_interne.ventiler_paiement_facture(uuid,uuid,date,text) from public,anon,authenticated,service_role;

create function consommations_interne.payer_facture(p_org uuid,p_facture uuid,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare f public.factures_fourniture; c public.contrats_fourniture; p public.paiements_factures_fourniture;
 v_repartition uuid; v_bien text; v_id uuid;
begin
 select * into f from public.factures_fourniture where id=p_facture and organization_id=p_org for update;
 select * into c from public.contrats_fourniture where id=f.contrat_id and organization_id=p_org for share;
 if f.id is null or not consommations_interne.gerant(p_org,c.bien_id,c.lot_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not public.org_ecriture_ouverte(p_org) then raise exception 'Les écritures de ce dossier sont fermées'; end if;
 if p_date is null or not isfinite(p_date) or p_date>public.aujourdhui_paris() or p_date<'1970-01-01' then raise exception 'Date de paiement invalide : indiquez une date passée ou aujourd’hui'; end if;
 select * into p from public.paiements_factures_fourniture where facture_id=f.id;
 if found then
  if p.date_paiement<>p_date then raise exception 'Cette facture est déjà payée à une autre date. Son paiement et ses écritures sont conservés'; end if;
  return p.id;
 end if;
 if f.payee_le is not null and f.payee_le<>p_date then raise exception 'Cette facture est déjà marquée payée à une autre date'; end if;
 if f.total_cents<=0 then raise exception 'Une facture de montant nul ne nécessite pas de paiement'; end if;
 if not exists(select 1 from public.documents d where d.id=f.document_id and d.organization_id=p_org and d.purged_at is null and (not public.est_agent_restreint(p_org) or public.document_dans_portefeuille(p_org,d.id))) then raise exception 'Le justificatif du paiement n’est plus accessible'; end if;
 select id into v_repartition from public.repartitions_fourniture where facture_id=f.id and statut='validee';
 if c.lot_id is null and v_repartition is null and public.est_agent_restreint(p_org) then raise exception 'Validez la répartition avant le paiement, ou demandez à l’administrateur d’enregistrer la dépense du bâtiment'; end if;
 select nom into v_bien from public.biens where id=c.bien_id and organization_id=p_org;
 insert into public.paiements_factures_fourniture(organization_id,facture_id,bien_id,document_id,date_paiement,montant_cents,etat,source,created_by)
 values(p_org,f.id,c.bien_id,f.document_id,p_date,f.total_cents,case when c.lot_id is not null or v_repartition is not null then 'ventile' else 'a_ventiler' end,
 jsonb_build_object('facture',to_jsonb(f),'contrat',to_jsonb(c),'bien_nom',v_bien),auth.uid()) returning id into v_id;
 perform consommations_interne.ventiler_paiement_facture(v_id,v_repartition,p_date,'paiement');
 update public.factures_fourniture set payee_le=p_date where id=f.id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'facture_fourniture_payee',jsonb_build_object('facture_id',f.id,'paiement_id',v_id,'date',p_date,'montant_cents',f.total_cents));
 return v_id;
end $$;
revoke all on function consommations_interne.payer_facture(uuid,uuid,date) from public,anon;
grant execute on function consommations_interne.payer_facture(uuid,uuid,date) to authenticated;
create function public.payer_facture_fourniture(p_org uuid,p_facture uuid,p_date date)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.payer_facture(p_org,p_facture,p_date); $$;
revoke all on function public.payer_facture_fourniture(uuid,uuid,date) from public,anon;
grant execute on function public.payer_facture_fourniture(uuid,uuid,date) to authenticated;

create function consommations_interne.rattacher_paiement_valide()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.paiements_factures_fourniture; c public.contrats_fourniture; ligne record;
begin
 if new.statut<>'validee' or old.statut='validee' then return new; end if;
 select * into p from public.paiements_factures_fourniture where facture_id=new.facture_id for update;
 if not found or p.etat<>'a_ventiler' then return new; end if;
 select c0.* into c from public.contrats_fourniture c0 join public.factures_fourniture f on f.contrat_id=c0.id where f.id=new.facture_id;
 if not consommations_interne.gerant(p.organization_id,c.bien_id,c.lot_id) or not public.org_ecriture_ouverte(p.organization_id) then raise exception 'Accès refusé : le paiement ne peut pas être ventilé'; end if;
 -- Reclassification au mois courant ouvert : aucune réécriture d'un mois clos.
 for ligne in select e.* from public.ecritures e join public.ecritures_factures_fourniture l on l.ecriture_id=e.id where l.paiement_id=p.id and l.phase='paiement' loop
  perform consommations_interne.ecrire_facture(p.id,ligne.lot_id,(ligne.montant*100)::bigint,ligne.categorie,'annulation',new.id,ligne.id,public.aujourdhui_paris());
 end loop;
 perform consommations_interne.ventiler_paiement_facture(p.id,new.id,public.aujourdhui_paris(),'ventilation');
 update public.paiements_factures_fourniture set etat='ventile' where id=p.id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p.organization_id,'paiement_fourniture_ventile',jsonb_build_object('paiement_id',p.id,'repartition_id',new.id));
 return new;
end $$;
revoke all on function consommations_interne.rattacher_paiement_valide() from public,anon,authenticated,service_role;
create trigger z_paiement_repartition after update of statut on public.repartitions_fourniture for each row execute function consommations_interne.rattacher_paiement_valide();

-- SECURITY INVOKER permet de distinguer une mutation directe du client d'une
-- écriture atomique interne. Aucune session cliente ne peut modifier payee_le.
create function consommations_interne.garder_paiement_facture()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon') and ((tg_op='INSERT' and new.payee_le is not null) or (tg_op='UPDATE' and new.payee_le is distinct from old.payee_le)) then raise exception 'Enregistrez le paiement depuis la facture pour mettre à jour les finances'; end if;
 if tg_op='UPDATE' and exists(select 1 from public.paiements_factures_fourniture p where p.facture_id=old.id)
 and (to_jsonb(new)-'payee_le') is distinct from (to_jsonb(old)-'payee_le') then raise exception 'Cette facture est payée : ses données financières et son justificatif sont figés'; end if;
 return new;
end $$;
revoke all on function consommations_interne.garder_paiement_facture() from public,anon,authenticated,service_role;
create trigger conso_paiement_facture before insert or update on public.factures_fourniture for each row execute function consommations_interne.garder_paiement_facture();
