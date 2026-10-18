-- À exécuter après la migration, dans une transaction annulée, sur base fictive.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select account_id from public.memberships where role='super_admin' and status='active' limit 1),'role','authenticated','aal','aal2')::text,true) is not null as contexte_test;
set local role authenticated;
do $$
declare id_cout uuid; id_prospect uuid; rev integer; n integer;
begin
 if not public.is_permanent_super_admin() then raise exception 'Précondition : superviseur fictif requis';end if;
 insert into public.supervision_couts(fournisseur,categorie,jour,montant_cents,reference,preuve) values('Fournisseur fictif QA','hebergement','2026-10-01',1200,'FACTURE-QA-1','Justificatif fictif local') returning id into id_cout;
 if not exists(select 1 from public.supervision_registre where objet_id=id_cout::text) then raise exception 'Coût non tracé';end if;
 begin
  insert into public.supervision_couts(fournisseur,categorie,jour,montant_cents,reference,preuve) values('Fournisseur fictif QA','hebergement','2026-10-01',1200,'FACTURE-QA-1','Justificatif fictif local');
  raise exception 'Doublon de facture accepté';
 exception when unique_violation then null;end;
 begin update public.supervision_couts set montant_cents=0 where id=id_cout;raise exception 'Écriture financière modifiable';exception when insufficient_privilege then null;end;
 insert into public.supervision_prospects(nom,email,origine,prochaine_action,echeance) values('Prospect QA fictif','qa@example.test','Test local','Démonstration fictive','2026-11-01') returning id into id_prospect;
 update public.supervision_prospects set etape='qualifie',revision=1 where id=id_prospect and revision=0;
 update public.supervision_prospects set etape='offre',revision=1 where id=id_prospect and revision=0;
 get diagnostics n=row_count;if n<>0 then raise exception 'Modification périmée acceptée';end if;
 if (select count(*) from public.supervision_registre where objet_id=id_prospect::text)<>2 then raise exception 'Historique du prospect incorrect';end if;
 begin update public.supervision_prospects set etape='gagne',revision=2 where id=id_prospect;raise exception 'Conversion sans espace acceptée';exception when check_violation then null;end;
 begin update public.supervision_prospects set etape='perdu',revision=2,notes='' where id=id_prospect;raise exception 'Perte sans motif acceptée';exception when check_violation then null;end;
 begin update public.supervision_prospects set prochaine_action=null,revision=2 where id=id_prospect;raise exception 'Prospect ouvert sans prochaine action accepté';exception when check_violation then null;end;
 select revision into rev from public.supervision_identite where singleton;
 update public.supervision_identite set valeurs='{"denomination":"Identité QA fictive"}',revision=rev+1 where singleton returning revision into rev;
 if not exists(select 1 from public.supervision_registre where objet='supervision_identite') then raise exception 'Identité non tracée';end if;
 if not exists(select 1 from public.supervision_utilisateurs where 'superviseur'=any(roles)) then raise exception 'Superviseur absent de l’annuaire';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select a.id from public.accounts a where not exists(select 1 from public.memberships m where m.account_id=a.id and m.role='super_admin') limit 1),'role','authenticated','aal','aal2')::text,true) is not null as contexte_ordinaire;
set local role authenticated;
do $$begin
 if exists(select 1 from public.supervision_couts) or exists(select 1 from public.supervision_prospects) or exists(select 1 from public.supervision_registre) or exists(select 1 from public.supervision_utilisateurs) then raise exception 'Données supervision visibles à un compte ordinaire';end if;
 begin perform modifie_par from public.supervision_identite;raise exception 'Auteur divulgué à un compte ordinaire';exception when insufficient_privilege then null;end;
 begin insert into public.supervision_couts(fournisseur,categorie,jour,montant_cents,reference,preuve) values('Fictif','ia','2026-10-01',123,'NON','Interdit');raise exception 'Écriture non autorisée acceptée';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 perform valeurs from public.supervision_identite where singleton;
 begin perform id from public.supervision_prospects;raise exception 'Lecture anonyme des prospects acceptée';exception when insufficient_privilege then null;end;
 begin perform modifie_par from public.supervision_identite;raise exception 'Auteur divulgué anonymement';exception when insufficient_privilege then null;end;
end $$;
reset role;
