-- AUDIT SÉCURITÉ DU 27/09 — MAJEUR : LA CONSERVATION PARTAIT DU DÉPÔT.
--
-- `appliquer_retention` comptait la durée de `retention_rules` depuis
-- `documents.retention_reference_date`, posée à la date du dépôt et JAMAIS
-- décalée. Or la matrice A2 ([[RGPD]], [[Registre des traitements]]) et la
-- colonne `declencheur` de la table elle-même disent autre chose :
--   · « Fin du bail »           — bail, EDL, attestations, courriers, règlement ;
--   · « Fin du dernier bail »   — pièces du dossier locataire ;
--   · « Fin du mandat »         — mandats ;
--   · « Fin de gestion du bien » — diagnostics ;
--   · « Clôture de l'incident » — photos d'incident ;
--   · « Émission » / « Dépôt »  — quittances, rapports, autres.
-- Un bail signé d'un bail ACTIF était donc purgé 60 mois après son dépôt, et
-- les sorts « anonymisation » (bail, EDL, mandat, quittance, rapport)
-- détruisaient la fiche exactement comme une « suppression ».
--
-- LA CORRECTION.
-- 1. `debut_conservation_document(doc)` rend la date à partir de laquelle le
--    compteur court, selon le déclencheur de la règle, ou NULL tant que le
--    contrat, la gestion ou l'incident dont dépend la pièce n'est pas terminé
--    (NULL = rien ne se purge). La date retenue est la plus TARDIVE des dates
--    connues (fin contractuelle, EDL de sortie, dernière mise à jour) : en cas
--    de doute, on conserve plus longtemps, jamais moins. Une pièce rattachée à
--    rien garde l'ancien comportement (date de dépôt).
-- 2. Les deux sorts ne se confondent plus (RM-A2.3 / RM-A2.5) :
--    · « suppression » : le fichier part en file de suppression physique, la
--      fiche est vidée et tous ses rattachements retirés (inchangé) ;
--    · « anonymisation » : ce qui subsiste est la contrepartie — la fiche
--      reste (type, organisation, rattachements au lot, au bail, au mandat, à
--      l'incident, dates, empreinte), marquée `anonymise_le`, SANS rien qui
--      désigne une personne : titre remplacé par le libellé de la règle,
--      auteur, vérificateur et rattachements « personne » retirés. Le fichier
--      lui-même (un PDF qui nomme les parties) ne peut pas être expurgé
--      automatiquement ; le conserver tel quel serait une pseudonymisation,
--      que la règle exclut expressément (« irréversible obligatoirement »,
--      RM-A2.5) : il part donc aussi en file de suppression.
-- 3. Un document sans fichier ne met plus un chemin NULL en file.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.

alter table public.documents add column if not exists anonymise_le timestamptz;
comment on column public.documents.anonymise_le is
  'Sort final « anonymisation » appliqué (RM-A2.5) : la fiche subsiste sans donnée de personne, le fichier est détruit.';

create or replace function public.debut_conservation_document(p_doc uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
  v_n integer;
  v_en_cours integer;
  v_fin date;
begin
  select doc.id, doc.organization_id, doc.retention_reference_date as ref, r.declencheur
    into d
  from public.documents doc
  left join public.retention_rules r
    on r.data_type = 'document:' || doc.type::text and r.actif
  where doc.id = p_doc;
  if not found then return null; end if;

  if d.declencheur in ('Fin du bail', 'Fin du dernier bail') then
    -- Les baux dont dépend la pièce. « Fin du bail » : ceux auxquels elle est
    -- rattachée (lien, bail signé, règlement annexé) ; à défaut seulement,
    -- ceux des personnes rattachées. « Fin du dernier bail » (pièces du
    -- dossier) : tous les baux des personnes rattachées, en plus des liens.
    with liens as (
      select l.entite, l.entite_id from public.document_liens l where l.document_id = p_doc
    ), directs as (
      select b.id from public.baux b
      where b.organization_id = d.organization_id
        and (b.id in (select entite_id from liens where entite = 'bail')
             or b.document_signe = p_doc
             or b.reglement_copropriete = p_doc)
    ), des_personnes as (
      select b.id from public.baux b
      where b.organization_id = d.organization_id
        and (b.locataire_principal in (select entite_id from liens where entite = 'personne')
             or b.id in (select bp.bail_id from public.bail_personnes bp
                          where bp.organization_id = d.organization_id
                            and bp.person_id in (select entite_id from liens where entite = 'personne')))
    ), baux_vises as (
      select b.id, b.etat, b.date_fin, b.updated_at
      from public.baux b
      where b.id in (select id from directs)
         or ((d.declencheur = 'Fin du dernier bail' or not exists (select 1 from directs))
             and b.id in (select id from des_personnes))
    )
    select count(*),
           count(*) filter (where bv.etat <> 'termine'),
           max(greatest(bv.date_fin, bv.updated_at::date,
                        (select max(e.date_edl) from public.etats_des_lieux e
                          where e.bail_id = bv.id and e.type = 'sortie')))
      into v_n, v_en_cours, v_fin
    from baux_vises bv;
    if v_n = 0 then return d.ref; end if;
    if v_en_cours > 0 then return null; end if;
    return greatest(d.ref, v_fin);

  elsif d.declencheur = 'Fin du mandat' then
    select count(*), count(*) filter (where m.etat <> 'resilie'),
           max(greatest(m.date_fin, m.updated_at::date))
      into v_n, v_en_cours, v_fin
    from public.mandats m
    where m.organization_id = d.organization_id
      and m.id in (select l.entite_id from public.document_liens l
                    where l.document_id = p_doc and l.entite = 'mandat');
    if v_n = 0 then return d.ref; end if;
    if v_en_cours > 0 then return null; end if;
    return greatest(d.ref, v_fin);

  elsif d.declencheur = 'Fin de gestion du bien' then
    select count(*), count(*) filter (where lo.etat <> 'archive'), max(lo.updated_at::date)
      into v_n, v_en_cours, v_fin
    from public.lots lo
    where lo.organization_id = d.organization_id
      and (lo.id in (select l.entite_id from public.document_liens l
                      where l.document_id = p_doc and l.entite = 'lot')
           or lo.id in (select dg.lot_id from public.diagnostics dg where dg.document_id = p_doc));
    if v_n = 0 then return d.ref; end if;
    if v_en_cours > 0 then return null; end if;
    return greatest(d.ref, v_fin);

  elsif d.declencheur = 'Clôture de l''incident' then
    select count(*), count(*) filter (where i.etat <> 'clos' or i.clos_le is null),
           max(i.clos_le::date)
      into v_n, v_en_cours, v_fin
    from public.incidents i
    where i.organization_id = d.organization_id
      and (i.id in (select l.entite_id from public.document_liens l
                     where l.document_id = p_doc and l.entite = 'incident')
           or i.id in (select ii.incident_id from public.intervention_photos ip
                         join public.incident_interventions ii on ii.id = ip.intervention_id
                        where ip.document_id = p_doc));
    if v_n = 0 then return d.ref; end if;
    if v_en_cours > 0 then return null; end if;
    return greatest(d.ref, v_fin);
  end if;

  -- « Émission », « Dépôt », « Événement »… : la date posée à la création.
  return d.ref;
end $$;

revoke execute on function public.debut_conservation_document(uuid) from public, anon, authenticated;
grant execute on function public.debut_conservation_document(uuid) to service_role;

create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_docs_anonymises int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);

  delete from public.intentions_conge
    where traitee_le is not null
      and traitee_le < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('intentions_conge', v_count);

  delete from public.demandes_signature ds
    where exists (select 1 from public.documents d
                  where d.id = ds.document_id and d.purged_at is not null
                    and d.anonymise_le is null)
       or (ds.signee_le is not null
           and ds.signee_le < now() - make_interval(months => 24));
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', v_count);

  -- Le compteur court depuis le déclencheur de la règle (fin du bail, du
  -- mandat, de la gestion, clôture de l'incident), pas depuis le dépôt.
  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type, r.libelle,
           public.debut_conservation_document(d.id) as debut
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      -- préfiltre bon marché : le déclencheur n'est jamais avant le dépôt
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    continue when v_doc.debut is null;
    continue when v_doc.debut + make_interval(months => (select duree_mois from public.retention_rules
                                                           where data_type = v_doc.data_type)) > now();

    if v_doc.storage_path is not null then
      insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    end if;

    if v_doc.sort = 'anonymisation' then
      -- La contrepartie subsiste, sans personne : rattachements non
      -- personnels gardés, titre neutre, auteurs retirés.
      delete from public.document_liens where document_id = v_doc.id and entite = 'personne';
      update public.documents
        set purged_at = now(), anonymise_le = now(), storage_path = null, mime_type = null,
            taille_octets = null, titre = v_doc.libelle || ' (anonymisé)',
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
      v_docs_anonymises := v_docs_anonymises + 1;
    else
      delete from public.document_liens where document_id = v_doc.id;
      update public.documents
        set purged_at = now(), storage_path = null, mime_type = null,
            taille_octets = null, empreinte = null, titre = null,
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
    end if;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort,
                               'debut_conservation', v_doc.debut));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());
  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'documents_anonymises', v_docs_anonymises,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$function$;

revoke execute on function public.appliquer_retention() from public, anon;
grant execute on function public.appliquer_retention() to authenticated, service_role;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
