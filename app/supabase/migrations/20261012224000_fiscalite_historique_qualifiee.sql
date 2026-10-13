-- FISC01–03, accord local 12/10 : nouvelles preuves séparées du journal.
-- Aucun ancien montant, encaissement, export ou classement n'est réécrit.
create table public.fiscal_encaissements_composantes (
 ecriture_id uuid primary key references public.ecritures(id),
 organization_id uuid not null references public.organizations(id),
 loyer_hc numeric(14,2) not null check(loyer_hc>=0),
 charges numeric(14,2) not null check(charges>=0),
 non_ventile numeric(14,2) not null check(non_ventile>=0),
 appels jsonb not null,
 version_regle integer not null default 1,
 capture_le timestamptz not null default now()
);
create table public.fiscal_qualifications_ecritures (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 ecriture_id uuid not null references public.ecritures(id),
 lot_id uuid references public.lots(id),
 version integer not null,
 nature text not null check(nature in ('recette','deductible','non_deductible','hors_2044','a_qualifier')),
 rubrique text check(rubrique in ('211','212','213','221','223','224','225','227','229','250')),
 justification text not null check(length(btrim(justification)) between 3 and 3000),
 loyer_hc numeric(14,2), charges numeric(14,2),
 auteur uuid not null references public.accounts(id),
 cree_le timestamptz not null default now(),
 version_regle integer not null default 1,
 unique(ecriture_id,version)
);
create table public.fiscal_exercices_lots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 lot_id uuid not null references public.lots(id),
 annee integer not null check(annee between 1970 and 2200),
 version integer not null,
 periodes jsonb not null,
 justification text not null check(length(btrim(justification)) between 3 and 3000),
 regularisation230 numeric(14,2) check(regularisation230>=0),
 quote_part230 numeric(7,4) not null default 100 check(quote_part230 between 0 and 100),
 justification230 text,
 auteur uuid not null references public.accounts(id),
 cree_le timestamptz not null default now(),
 version_regle integer not null default 1,
 unique(lot_id,annee,version)
);
do $$ declare t text; begin
 foreach t in array array['fiscal_encaissements_composantes','fiscal_qualifications_ecritures','fiscal_exercices_lots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy fiscal_lecture on public.%I for select using (organization_id in (select public.org_ids_avec_roles(array[''proprietaire_direct'']::public.membership_role[])))',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Instantané lors de la création de la pièce : jamais le bail courant au moment
-- de l'export. Allocation FIFO des appels disponibles, par différence d'arrondis
-- cumulés, afin que deux paiements partiels s'additionnent exactement au total.
create function public.capturer_composantes_fiscales()
returns trigger language plpgsql security definer set search_path='' as $$
declare origine public.fiscal_encaissements_composantes; enc public.encaissements;
 a record; avant numeric; cumul numeric:=0; gauche numeric; droite numeric;
 hc numeric:=0; ch numeric:=0; affecte numeric:=0; part numeric; partch numeric;
 details jsonb:='[]';
begin
 if new.contre_ecriture_de is not null then
  select * into origine from public.fiscal_encaissements_composantes where ecriture_id=new.contre_ecriture_de;
  if found then
   insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels,version_regle)
   values(new.id,new.organization_id,origine.loyer_hc,origine.charges,origine.non_ventile,origine.appels,origine.version_regle);
  end if;
  return new;
 end if;
 if new.encaissement_id is null or new.categorie<>'loyer' or new.sens<>'recette' then return new; end if;
 select * into enc from public.encaissements where id=new.encaissement_id and organization_id=new.organization_id;
 if not found then return new; end if;
 perform 1 from public.baux where id=enc.bail_id for update;
 select coalesce(sum(montant),0) into avant from public.encaissements
  where bail_id=enc.bail_id and organization_id=enc.organization_id and id<>enc.id;
 for a in select * from public.appels_loyer where bail_id=enc.bail_id and organization_id=enc.organization_id order by periode,id loop
  if a.montant_du<=0 or a.loyer_hc<0 or a.charges<0 or a.montant_du<>a.loyer_hc+a.charges then
   -- Un appel incohérent n'autorise jamais une ventilation inventée.
   cumul:=cumul+greatest(a.montant_du,0); continue;
  end if;
  gauche:=least(a.montant_du,greatest(0,avant-cumul));
  droite:=least(a.montant_du,greatest(0,avant+new.montant-cumul));
  part:=droite-gauche;
  if part>0 then
   partch:=round(droite*a.charges/a.montant_du,2)-round(gauche*a.charges/a.montant_du,2);
   hc:=hc+part-partch; ch:=ch+partch; affecte:=affecte+part;
   details:=details||jsonb_build_array(jsonb_build_object('appel_id',a.id,'periode',a.periode,'loyer_hc_appel',a.loyer_hc,'charges_appel',a.charges,'montant_du',a.montant_du,'couvert_avant',gauche,'couvert_apres',droite,'loyer_hc',part-partch,'charges',partch));
  end if;
  cumul:=cumul+a.montant_du;
 end loop;
 insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels)
 values(new.id,new.organization_id,hc,ch,round(new.montant-affecte,2),details);
 return new;
end $$;
revoke all on function public.capturer_composantes_fiscales() from public,anon,authenticated;
create trigger z_capturer_fiscalite after insert on public.ecritures for each row execute function public.capturer_composantes_fiscales();

create function public.qualifier_ecriture_fiscale(p_ecriture uuid,p_nature text,p_rubrique text,p_justification text,p_loyer_hc numeric default null,p_charges numeric default null,p_lot uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.ecritures; v integer; resultat uuid;
begin
 select * into e from public.ecritures where id=p_ecriture for update;
 if not found or not(e.organization_id in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if p_lot is not null and (not exists(select 1 from public.lots where id=p_lot and organization_id=e.organization_id) or (e.lot_id is not null and e.lot_id<>p_lot)) then raise exception 'Lot incompatible avec la pièce'; end if;
 if e.contre_ecriture_de is not null then raise exception 'Qualifiez la pièce d’origine : l’annulation conserve sa qualification'; end if;
 if p_nature is null or p_nature not in ('recette','deductible','non_deductible','hors_2044','a_qualifier') then raise exception 'Nature fiscale invalide'; end if;
 if length(btrim(coalesce(p_justification,''))) not between 3 and 3000 then raise exception 'Justification et référence de pièce obligatoires'; end if;
 if p_nature in ('recette','deductible') then
  if p_rubrique is null or (p_nature='recette' and (e.sens<>'recette' or p_rubrique not in ('211','212','213'))) or (p_nature='deductible' and (e.sens<>'depense' or p_rubrique not in ('221','223','224','225','227','229','250'))) then raise exception 'Rubrique incompatible avec la pièce'; end if;
 elsif p_rubrique is not null then raise exception 'Cette nature n’a pas de rubrique déductible'; end if;
 if p_loyer_hc is not null or p_charges is not null then
  if p_rubrique is distinct from '211' or p_loyer_hc is null or p_charges is null or p_loyer_hc::text in ('NaN','Infinity','-Infinity') or p_charges::text in ('NaN','Infinity','-Infinity') or p_loyer_hc<0 or p_charges<0 or round(p_loyer_hc,2)<>p_loyer_hc or round(p_charges,2)<>p_charges or p_loyer_hc+p_charges<>e.montant then raise exception 'Les parts loyer et charges doivent réconcilier exactement le montant encaissé'; end if;
 end if;
 if p_loyer_hc is not null and exists(select 1 from public.fiscal_encaissements_composantes where ecriture_id=e.id and non_ventile=0 and (loyer_hc<>p_loyer_hc or charges<>p_charges)) then raise exception 'La ventilation historique figée ne peut pas être remplacée'; end if;
 select coalesce(max(version),0)+1 into v from public.fiscal_qualifications_ecritures where ecriture_id=e.id;
 insert into public.fiscal_qualifications_ecritures(organization_id,ecriture_id,lot_id,version,nature,rubrique,justification,loyer_hc,charges,auteur)
 values(e.organization_id,e.id,coalesce(e.lot_id,p_lot),v,p_nature,p_rubrique,btrim(p_justification),p_loyer_hc,p_charges,auth.uid()) returning id into resultat;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),e.organization_id,'qualification_fiscale',jsonb_build_object('ecriture_id',e.id,'version',v,'nature',p_nature,'rubrique',p_rubrique));
 return resultat;
end $$;

create function public.enregistrer_exercice_fiscal_lot(p_lot uuid,p_annee integer,p_periodes jsonb,p_justification text,p_regularisation230 numeric default null,p_quote_part230 numeric default 100,p_justification230 text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; v integer; resultat uuid; p jsonb; debut date; fin date; precedente date;
begin
 select organization_id into org from public.lots where id=p_lot for update;
 if org is null or not(org in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if p_annee is null or p_annee not between 1970 and 2200 or length(btrim(coalesce(p_justification,''))) not between 3 and 3000 then raise exception 'Exercice et justification obligatoires'; end if;
 if jsonb_typeof(p_periodes) is distinct from 'array' then raise exception 'Périodes fiscales attendues'; end if;
 if jsonb_array_length(p_periodes) not between 1 and 24 then raise exception 'Indiquez de une à vingt-quatre périodes'; end if;
 for p in select value from jsonb_array_elements(p_periodes) order by value->>'debut' loop
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'debut') is distinct from 'string' or jsonb_typeof(p->'fin') is distinct from 'string' or jsonb_typeof(p->'quote_part') is distinct from 'number' or (p->>'regime') is null or (p->>'regime') not in ('nu','meuble','hors_perimetre') then raise exception 'Période fiscale invalide'; end if;
  debut:=(p->>'debut')::date;fin:=(p->>'fin')::date;
  if not isfinite(debut) or not isfinite(fin) or fin<debut or extract(year from debut)<>p_annee or extract(year from fin)<>p_annee or (p->>'quote_part')::numeric not between 0 and 100 or (precedente is not null and debut<=precedente) then raise exception 'Dates, quote-part ou chevauchement de périodes invalides'; end if;
  precedente:=fin;
 end loop;
 if p_regularisation230 is not null and (p_regularisation230::text in ('NaN','Infinity','-Infinity') or p_regularisation230<0 or round(p_regularisation230,2)<>p_regularisation230 or length(btrim(coalesce(p_justification230,''))) not between 3 and 3000) then raise exception 'Montant et justification de la régularisation 230 requis (zéro doit être confirmé)'; end if;
 if p_quote_part230 is null or p_quote_part230::text in ('NaN','Infinity','-Infinity') or p_quote_part230 not between 0 and 100 then raise exception 'Quote-part de régularisation invalide'; end if;
 select coalesce(max(version),0)+1 into v from public.fiscal_exercices_lots where lot_id=p_lot and annee=p_annee;
 insert into public.fiscal_exercices_lots(organization_id,lot_id,annee,version,periodes,justification,regularisation230,quote_part230,justification230,auteur)
 values(org,p_lot,p_annee,v,p_periodes,btrim(p_justification),p_regularisation230,p_quote_part230,nullif(btrim(p_justification230),''),auth.uid()) returning id into resultat;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),org,'exercice_fiscal_qualifie',jsonb_build_object('lot_id',p_lot,'annee',p_annee,'version',v));
 return resultat;
end $$;
revoke all on function public.qualifier_ecriture_fiscale(uuid,text,text,text,numeric,numeric,uuid) from public,anon;
grant execute on function public.qualifier_ecriture_fiscale(uuid,text,text,text,numeric,numeric,uuid) to authenticated;
revoke all on function public.enregistrer_exercice_fiscal_lot(uuid,integer,jsonb,text,numeric,numeric,text) from public,anon;
grant execute on function public.enregistrer_exercice_fiscal_lot(uuid,integer,jsonb,text,numeric,numeric,text) to authenticated;
select public.poser_gardes_diagnostic_artisan();

-- Reprise explicite d'un cas ancien démontrable, sans aucun traitement en masse.
-- Une seule échéance conservée, encaissements encore présents, aucun retrait,
-- aucune avance, chronologie non ambiguë. Les autres cas restent à justifier.
create function public.retrouver_ventilation_fiscale(p_ecriture uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.ecritures; k public.encaissements; a public.appels_loyer; n integer;
 avant numeric; total numeric; partch numeric;
begin
 select * into e from public.ecritures where id=p_ecriture for update;
 if not found or not(e.organization_id in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if exists(select 1 from public.fiscal_encaissements_composantes where ecriture_id=e.id) then return e.id; end if;
 if e.categorie<>'loyer' or e.sens<>'recette' or e.encaissement_id is null or e.contre_ecriture_de is not null then raise exception 'Cette pièce nécessite une qualification avec justificatif'; end if;
 select * into k from public.encaissements where id=e.encaissement_id and organization_id=e.organization_id;
 if not found then raise exception 'Encaissement historique incomplet : qualification nécessaire'; end if;
 perform 1 from public.baux where id=k.bail_id for update;
 select count(*) into n from public.appels_loyer where bail_id=k.bail_id and montant_du>0;
 if n<>1 then raise exception 'Plusieurs échéances ou aucune échéance : la ventilation doit être justifiée'; end if;
 select * into a from public.appels_loyer where bail_id=k.bail_id and montant_du>0;
 select coalesce(sum(montant),0) into total from public.encaissements where bail_id=k.bail_id;
 if a.organization_id<>e.organization_id or a.charges<0 or a.loyer_hc<0 or a.loyer_hc+a.charges<>a.montant_du or a.created_at>e.created_at or total>a.montant_du
  or exists(select 1 from public.ecritures x left join public.encaissements z on z.id=x.encaissement_id where x.bail_id=k.bail_id and x.categorie='loyer' and (x.contre_ecriture_de is not null or z.id is null))
  or exists(select 1 from public.encaissements z where z.bail_id=k.bail_id and z.id<>k.id and z.created_at=k.created_at)
 then raise exception 'Historique ambigu ou avance : qualification documentée nécessaire'; end if;
 select coalesce(sum(montant),0) into avant from public.encaissements where bail_id=k.bail_id and created_at<k.created_at;
 partch:=round((avant+e.montant)*a.charges/a.montant_du,2)-round(avant*a.charges/a.montant_du,2);
 insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels)
 values(e.id,e.organization_id,e.montant-partch,partch,0,jsonb_build_array(jsonb_build_object('source','reprise_explicite_echeance_unique','appel_id',a.id,'loyer_hc_appel',a.loyer_hc,'charges_appel',a.charges,'montant_du',a.montant_du,'couvert_avant',avant,'couvert_apres',avant+e.montant,'auteur',auth.uid())));
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),e.organization_id,'ventilation_historique_retrouvee',jsonb_build_object('ecriture_id',e.id,'appel_id',a.id,'loyer_hc',e.montant-partch,'charges',partch));
 return e.id;
end $$;
revoke all on function public.retrouver_ventilation_fiscale(uuid) from public,anon;
grant execute on function public.retrouver_ventilation_fiscale(uuid) to authenticated;
