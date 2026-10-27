-- Diagnostics : validité réglementaire du DPE, rapport déjà rangé dans Documents, rapports à renouveler (audit de la
-- refonte #264, constats DOC-01, DOC-02 et DOC-04). Rejouable. Aucune donnée existante n'est réécrite : l'échéance
-- enregistrée d'un DPE reste telle quelle, elle est PLAFONNÉE à la lecture.
--
-- 1. DOC-01 — Décret n° 2020-1610 du 17 décembre 2020, art. 1 (art. D. 134-4-2 du code de la construction et de
--    l'habitation) : un DPE vaut dix ans, sauf ceux réalisés avant le 1er juillet 2021 — du 01/01/2013 au 31/12/2017 :
--    valables jusqu'au 31/12/2022 ; du 01/01/2018 au 30/06/2021 : jusqu'au 31/12/2024. Un DPE de 2019 enregistré
--    « valable jusqu'en 2029 » (la règle de l'époque, et le pré-remplissage de l'application jusqu'ici) levait le
--    blocage de mise en location. La même règle vit côté application : src/lib/documents-bail.ts (plafondDpe).
--    Le blocage de mise en location et l'alerte quotidienne lisent désormais l'échéance plafonnée.
-- 2. DOC-02 — Le même rapport rangé d'abord dans Documents en « Autre » ou « Courrier » (ou joint au bail comme annexe)
--    ne pouvait plus être déclaré comme diagnostic : l'anti-doublon refusait le second dépôt, sans issue. L'application
--    propose désormais de l'utiliser ; la base le reclasse en « Diagnostic » DANS la transaction du diagnostic, pour
--    qu'il suive la conservation des diagnostics (fin de gestion du bien + 5 ans) et non celle d'un document
--    quelconque (cinq ans après le dépôt, alors qu'un DPE en vaut dix). Trace dans audit_log.
-- 3. DOC-04 — La bibliothèque Documents ne comptait pas un DPE expiré dans « à renouveler » : son échéance vit dans
--    diagnostics, pas dans documents.expire_le. diagnostics_a_renouveler la lit, plafond compris.

-- 1. L'échéance qui fait foi.
create or replace function public.echeance_reglementaire_diagnostic(p_type text, p_realisation date, p_expiration date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'dpe' and p_realisation between date '2013-01-01' and date '2017-12-31'
      then least(coalesce(p_expiration, date '2022-12-31'), date '2022-12-31')
    when p_type = 'dpe' and p_realisation between date '2018-01-01' and date '2021-06-30'
      then least(coalesce(p_expiration, date '2024-12-31'), date '2024-12-31')
    else p_expiration
  end;
$$;
comment on function public.echeance_reglementaire_diagnostic(text, date, date) is
  'Échéance saisie d''un diagnostic, ramenée au plafond du décret n° 2020-1610 pour un DPE réalisé avant le 01/07/2021 (DOC-01). Lecture seule : rien n''est réécrit.';
revoke execute on function public.echeance_reglementaire_diagnostic(text, date, date) from public, anon;
grant execute on function public.echeance_reglementaire_diagnostic(text, date, date) to authenticated, service_role;

-- Blocage de mise en location : corps de 20260802_lot_blocages_habitation_inclut_immeuble.sql (définition en vigueur),
-- seule la condition « DPE valide » change.
create or replace function public.lot_blocages_location(p_lot uuid)
returns text[] language plpgsql stable set search_path to '' as $function$
declare
  v_lot record; v_bien record; v_total numeric;
  v_blocages text[] := '{}'; v_habitation boolean;
begin
  select * into v_lot from public.lots where id = p_lot;
  if not found then return array['Lot introuvable']; end if;
  select * into v_bien from public.biens where id = v_lot.bien_id;

  if v_lot.nom is null or length(trim(v_lot.nom)) = 0 then
    v_blocages := array_append(v_blocages, 'Nom du lot manquant');
  end if;
  if v_lot.surface_m2 is null then
    v_blocages := array_append(v_blocages, 'Surface manquante');
  end if;

  select coalesce(sum(quote_part), 0) into v_total
  from public.detentions where lot_id = p_lot and date_fin is null;
  if v_total <> 100 then
    v_blocages := array_append(v_blocages,
      format('Détention incomplète (%s %% — il faut exactement 100 %%)', v_total));
  end if;

  v_habitation := v_bien.type in ('appartement', 'maison', 'immeuble');
  -- DOC-01 : un DPE d'avant le 01/07/2021 ne vaut que jusqu'au plafond du décret n° 2020-1610.
  if v_habitation and not exists (
    select 1 from public.diagnostics d
    where d.lot_id = p_lot and d.type = 'dpe' and d.archived_at is null
      and (public.echeance_reglementaire_diagnostic(d.type::text, d.date_realisation, d.date_expiration) is null
           or public.echeance_reglementaire_diagnostic(d.type::text, d.date_realisation, d.date_expiration) >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'DPE absent ou expiré (obligatoire en habitation)');
  end if;
  if v_habitation and exists (
    select 1 from public.diagnostics d
    where d.lot_id = p_lot and d.type = 'dpe' and d.archived_at is null and d.classe_dpe = 'G'
  ) then
    v_blocages := array_append(v_blocages, 'DPE classe G : logement interdit à la location (loi Climat)');
  end if;
  if not exists (
    select 1 from public.diagnostics d
    where d.bien_id = v_lot.bien_id and d.type = 'erp' and d.archived_at is null
      and (d.date_expiration is null or d.date_expiration >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'ERP absent ou expiré (état des risques, validité 6 mois)');
  end if;
  if exists (
    select 1 from public.diagnostics d
    where (d.lot_id = p_lot or d.bien_id = v_lot.bien_id)
      and d.type not in ('dpe', 'erp') and d.archived_at is null
      and d.date_expiration is not null and d.date_expiration < current_date
  ) then
    v_blocages := array_append(v_blocages, 'Un diagnostic déposé est expiré');
  end if;

  if (select count(*) from public.lots l
      where l.bien_id = v_lot.bien_id and l.etat <> 'archive') > 1
     and not exists (
       select 1 from public.cles_repartition c
       where c.bien_id = v_lot.bien_id and c.invalidated_at is null
     ) then
    v_blocages := array_append(v_blocages, 'Clé de répartition à (re)valider');
  end if;

  return v_blocages;
end;
$function$;

-- Alerte quotidienne des échéances : définition en vigueur (20260830120000, tête d'arrêt d'urgence posée par
-- 20261014200000), l'échéance lue est plafonnée. Un DPE de 2019 « valable jusqu'en 2029 » est signalé expiré.
create or replace function public.generer_alertes_diagnostics()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_diag record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_diagnostics: reserve au cron et au super admin';
  end if;
  -- Audit du 14/10 (SUP-01) : l'arrêt d'urgence couvre aussi cette tâche pg_cron. Arrêt actif : aucun effet.
  if not public.tache_planifiee_autorisee('alertes-diagnostics-quotidiennes') then
    return 0;
  end if;

  for v_diag in
    select e.* from (
      select d.id, d.organization_id, d.type,
             public.echeance_reglementaire_diagnostic(d.type::text, d.date_realisation, d.date_expiration) as date_expiration,
             coalesce(l.nom, b2.nom) as cible,
             coalesce(b.nom, b2.nom) as bien_nom
      from public.diagnostics d
      left join public.lots l on l.id = d.lot_id
      left join public.biens b on b.id = l.bien_id
      left join public.biens b2 on b2.id = d.bien_id
      where d.archived_at is null
    ) e
    where e.date_expiration is not null
      and e.date_expiration <= current_date + 90
  loop
    v_seuil := case
      when v_diag.date_expiration <= current_date then 'J+0'
      when v_diag.date_expiration <= current_date + 30 then 'J-30'
      else 'J-90'
    end;
    v_criticite := case v_seuil
      when 'J+0' then 'critique'::public.alerte_criticite
      when 'J-30' then 'normale'::public.alerte_criticite
      else 'informative'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_diag.organization_id, 'diagnostic_expiration', 'diagnostic_id', v_diag.id, v_seuil,
      v_criticite,
      format('%s — %s : %s',
        upper(v_diag.type::text), v_diag.bien_nom,
        case when v_seuil = 'J+0'
          then 'diagnostic expiré (bail bloqué tant qu''il n''est pas redéposé)'
          else format('expire le %s', to_char(v_diag.date_expiration, 'DD/MM/YYYY')) end),
      jsonb_build_object('diagnostic_id', v_diag.id, 'type_diagnostic', v_diag.type),
      v_diag.date_expiration);
  end loop;

  return v_crees;
end;
$function$;

-- 2. DOC-02 — reclassement du rapport rangé en « Autre » ou « Courrier ». La fiche document reste fermée en écriture
-- aux comptes (update révoqué) : seule cette fonction, déclenchée par l'insertion du diagnostic qui la cite, change
-- son type. Les autres types (pièce d'identité, justificatif, bail…) ne sont jamais reclassés ; l'application ne les
-- propose d'ailleurs pas (lirePieceDiagnostic, src/app/actions/parc.ts). Un courrier mis à disposition du locataire
-- n'est pas reclassé non plus : son espace ne montre que les quittances et courriers partagés (mes_pieces_locataire),
-- il le perdrait sans que personne l'ait décidé.
create or replace function public.reclasser_rapport_diagnostic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancien text;
  v_partage timestamptz;
begin
  if new.document_id is null then return new; end if;
  select d.type::text, d.partage_le into v_ancien, v_partage
    from public.documents d
   where d.id = new.document_id
     and d.organization_id = new.organization_id
     and d.type in ('autre', 'courrier')
     and d.purged_at is null
   for update;
  if not found then return new; end if;
  -- L'acte ou une annexe d'une signature en cours est verrouillé (proteger_document_en_signature_bail, même condition) :
  -- le refus est dit dans les termes du diagnostic, au lieu de « Annulez le circuit… avant de modifier ce document ».
  if exists (select 1 from public.bail_signature_circuits c
              where (c.document_id = new.document_id
                     or exists (select 1 from jsonb_array_elements(c.annexes) a where a ->> 'id' = new.document_id::text))
                and c.etat in ('preparation', 'en_cours', 'a_verifier')) then
    raise exception 'Ce fichier fait partie d’une signature en cours : déclarez ce diagnostic une fois la signature terminée ou annulée.'
      using errcode = '23514';
  end if;
  if v_partage is not null then
    raise exception 'Ce fichier est mis à disposition de votre locataire : retirez la mise à disposition avant de le déclarer comme rapport de diagnostic.'
      using errcode = '23514';
  end if;
  update public.documents set type = 'diagnostic' where id = new.document_id;
  insert into public.audit_log (organization_id, account_id, action, details)
  values (new.organization_id, (select auth.uid()), 'document_reclasse_diagnostic',
          jsonb_build_object('document_id', new.document_id, 'ancien_type', v_ancien,
                             'diagnostic_id', new.id, 'type_diagnostic', new.type));
  return new;
end;
$$;
revoke execute on function public.reclasser_rapport_diagnostic() from public, anon, authenticated;

drop trigger if exists diagnostics_reclasser_rapport on public.diagnostics;
create trigger diagnostics_reclasser_rapport
  after insert on public.diagnostics
  for each row execute function public.reclasser_rapport_diagnostic();

-- 3. DOC-04 — les rapports de diagnostic à renouveler, dans le périmètre de documents_courants (portefeuille de
-- l'agent compris ; fonction invoker, la RLS de diagnostics s'applique aussi). `rattachement` nomme le bien et le
-- lot : deux ERP du même jour sur deux biens ne se confondent plus (DOC-N1).
create or replace function public.diagnostics_a_renouveler(p_org uuid, p_limite date, p_lots uuid[] default null)
returns table (id uuid, titre text, expire_le date, rattachement text)
language sql stable set search_path = '' as $$
  select d.id, d.titre,
         min(public.echeance_reglementaire_diagnostic(g.type::text, g.date_realisation, g.date_expiration)),
         string_agg(distinct coalesce(bl.nom || ' · ' || l.nom, b.nom), ', ')
  from public.documents_courants(p_org, p_lots) d
  join public.diagnostics g on g.document_id = d.id and g.organization_id = p_org and g.archived_at is null
  left join public.lots l on l.id = g.lot_id
  left join public.biens bl on bl.id = l.bien_id
  left join public.biens b on b.id = g.bien_id
  where d.purged_at is null
  group by d.id, d.titre
  having min(public.echeance_reglementaire_diagnostic(g.type::text, g.date_realisation, g.date_expiration)) <= p_limite
  order by 3;
$$;
revoke execute on function public.diagnostics_a_renouveler(uuid, date, uuid[]) from public, anon;
grant execute on function public.diagnostics_a_renouveler(uuid, date, uuid[]) to authenticated;

select public.fermer_fonctions_a_anon();
