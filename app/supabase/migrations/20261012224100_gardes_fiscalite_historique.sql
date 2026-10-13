-- Compléments de validation du chantier fiscal approuvé, droits inchangés.
create or replace function public.qualifier_ecriture_fiscale(p_ecriture uuid,p_nature text,p_rubrique text,p_justification text,p_loyer_hc numeric default null,p_charges numeric default null,p_lot uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.ecritures; v integer; resultat uuid;
begin
 select * into e from public.ecritures where id=p_ecriture for update;
 if not found or not(e.organization_id in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if p_lot is not null and (not exists(select 1 from public.lots where id=p_lot and organization_id=e.organization_id) or (e.lot_id is not null and e.lot_id<>p_lot)) then raise exception 'Lot incompatible avec la pièce'; end if;
 if e.contre_ecriture_de is not null then raise exception 'Qualifiez la pièce d’origine : l’annulation conserve sa qualification'; end if;
 if p_nature is null or p_nature not in ('recette','deductible','non_deductible','hors_2044','a_qualifier') then raise exception 'Nature fiscale invalide'; end if;
 if length(btrim(coalesce(p_justification,''))) not between 3 and 3000 then raise exception 'Justification et référence de pièce obligatoires'; end if;
 if p_nature='recette' and (e.encaissement_id is not null or lower(e.categorie) like '%loyer%') and p_rubrique is distinct from '211' then raise exception 'Un encaissement de loyer exige la rubrique 211 et ses parts historiques'; end if;
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

create or replace function public.enregistrer_exercice_fiscal_lot(p_lot uuid,p_annee integer,p_periodes jsonb,p_justification text,p_regularisation230 numeric default null,p_quote_part230 numeric default 100,p_justification230 text default null)
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
  if (p->>'debut') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (p->>'fin') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Dates fiscales attendues au format AAAA-MM-JJ'; end if;
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
