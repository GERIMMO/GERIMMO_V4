-- D18-A, compléments du 16/10 : PDF de chaque version et alerte du gérant si le dépôt d'une révision est refusé.
-- Aucune donnée historique réécrite. Retour : même nom dans retours-arriere, suffixe .retour.sql.
-- Les définitions en vigueur sont relues ; chaque ancre doit apparaître une fois. Les gardes préexistantes subsistent.

do $migration$
declare d text; ancien text; nouveau text;
begin
  select pg_get_functiondef('public.lire_devis_structure(uuid)'::regprocedure) into d;
  ancien := 'lire_devis_structure(p_sollicitation uuid)';
  if (length(d)-length(replace(d,ancien,''))) <> length(ancien) then raise exception 'D18 PDF : signature lire_devis_structure inattendue'; end if;
  d := replace(d,ancien,'lire_devis_pdf_version(p_sollicitation uuid, p_version integer default null)');
  ancien := 'where sollicitation_id=p_sollicitation order by version desc limit 1;';
  if (length(d)-length(replace(d,ancien,''))) <> length(ancien) then raise exception 'D18 PDF : sélection lire_devis_structure inattendue'; end if;
  d := replace(d,ancien,'where sollicitation_id=p_sollicitation and (p_version is null or version=p_version) order by version desc limit 1;');
  ancien := 'return resultat;';
  if (length(d)-length(replace(d,ancien,''))) <> length(ancien) then raise exception 'D18 PDF : résultat lire_devis_structure inattendu'; end if;
  nouveau := $code$return resultat || jsonb_build_object('version',d.version,'reference_id',d.id,
    'pdf_bucket','documents','pdf_path',(select doc.storage_path from public.documents doc where doc.id=d.document_id and doc.organization_id=d.organization_id),
    'pdf_sha',(select doc.empreinte from public.documents doc where doc.id=d.document_id and doc.organization_id=d.organization_id));$code$;
  d := replace(d,ancien,nouveau);
  execute d;
end $migration$;
revoke all on function public.lire_devis_pdf_version(uuid,integer) from public,anon;
grant execute on function public.lire_devis_pdf_version(uuid,integer) to authenticated;

-- La ligne de version précédente porte le marqueur : une seule alerte pour cette révision, même fermée ensuite.
alter table public.incident_devis add column if not exists revision_non_affectable_signalee_le timestamptz;

do $migration$
declare d text; ancien text;
begin
  select pg_get_functiondef('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)'::regprocedure) into d;
  if position('D18 complément 16/10 alerte durable' in d)>0 then return; end if;
  ancien := $code$raise exception 'Votre profil ne permet plus de répondre à cette demande (attestation, validation ou zone) : la nouvelle version n''a pas été déposée.';$code$;
  if (length(d)-length(replace(d,ancien,''))) <> length(ancien) then raise exception 'D18 alerte : refus deposer_devis inattendu'; end if;
  d := replace(d,ancien,$code$-- D18 complément 16/10 alerte durable : RETURN NULL, car RAISE annulerait aussi l'alerte.
      update public.incident_devis set revision_non_affectable_signalee_le=now()
      where id=v_precedent and revision_non_affectable_signalee_le is null;
      if found then
        insert into public.alerts(organization_id,type,criticite,titre,details,origine_type,origine_id)
        values(v.organization_id,'devis_revision_non_affectable','normale','Révision de devis impossible',
          jsonb_build_object('incident_id',v.incident_id,'lot_id',(select i.lot_id from public.incidents i where i.id=v.incident_id),
            'sollicitation_id',p_sollicitation,'devis_id',v_precedent,'artisan_id',v.artisan_id,
            'libelle','L''artisan ne peut plus déposer sa révision. Vérifiez sa disponibilité ou sollicitez un autre artisan.'),
          'devis',v_precedent);
      end if;
      return null;$code$);
  execute d;
end $migration$;

do $migration$
declare d text; ancien text;
begin
  select pg_get_functiondef('public.envoyer_mon_devis_prepare(uuid,integer)'::regprocedure) into d;
  if position('D18 complément 16/10 conserver la préparation' in d)>0 then return; end if;
  ancien := $code$update public.artisan_devis_preparations set statut='envoye',devis_id=v,pdf_bucket='documents',updated_at=now()$code$;
  if (length(d)-length(replace(d,ancien,''))) <> length(ancien) then raise exception 'D18 alerte : envoi préparation inattendu'; end if;
  d := replace(d,ancien,$code$-- D18 complément 16/10 conserver la préparation quand le dépôt est refusé (alerte déjà écrite).
  if v is null then return null; end if;
  update public.artisan_devis_preparations set statut='envoye',devis_id=v,pdf_bucket='documents',updated_at=now()$code$);
  execute d;
end $migration$;
select public.fermer_fonctions_a_anon();
