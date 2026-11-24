-- Textes officiels, lot T1 (25/11/2026) — congés : date limite du congé du bailleur, préavis réduit du locataire,
-- reprise par une société. Texte de référence : recueil fourni par le dirigeant (article 15 et article 13 de la loi
-- du 6 juillet 1989 ; notice annexée à l'arrêté du 13 décembre 2017), source et version déclarées, non recontrôlé.
--
-- 1. DATE LIMITE DU CONGÉ DU BAILLEUR (R13-A1). Le terme calculé par la base est le DERNIER JOUR du bail
--    (`terme_bail_calcule`). L'ancien contrôle acceptait « réception + préavis <= terme + 1 jour » : pour un dernier
--    jour au 20 septembre, un congé reçu le 21 mars passait. La notice (point 1-4) donne : terme le 15 juin, congé au
--    plus tard le 15 décembre ; terme le 30 juin, au plus tard le 31 décembre ; terme le 31 août, au plus tard le
--    28 février (29 les années bissextiles) ; échéance le 20 septembre, préavis à compter du 20 mars.
--    Nouvelle règle : « réception + préavis <= terme », l'addition de mois ramenant au dernier jour du mois quand le
--    quantième n'existe pas (ce que fait `date + interval`). `date_limite_conge_bailleur` rend la dernière date de
--    réception admise et sert au message du refus.
--    NON TRANCHÉ PAR LE TEXTE : la notice ne vaut que pour la location nue ; la même règle est appliquée au meublé
--    (trois mois) par prudence. Le texte ne dit pas non plus si « terme » désigne le dernier jour du bail ou le jour
--    anniversaire de sa prise d'effet : Gerimmo retient le dernier jour, lecture la plus stricte pour le bailleur.
--
-- 2. PRÉAVIS RÉDUIT DU LOCATAIRE EN ZONE TENDUE (R02-A5). Article 15 I : le locataire « précise le motif invoqué et
--    le justifie au moment de l'envoi de la lettre de congé. A défaut, le délai de préavis applicable à ce congé est
--    de trois mois ». La base donnait un mois d'office en zone tendue. Maintenant : un mois seulement quand
--    l'enregistrement le demande (p_preavis_mois = 1, la personne confirme que la lettre invoque et justifie le
--    motif) ; sinon trois mois. Hors zone tendue et zone inconnue : inchangé.
--
-- 3. REPRISE PAR UNE SOCIÉTÉ (R13-A5). En location nue, le congé pour reprise est refusé quand un bailleur en place
--    est une « SCI » (non familiale) ou une « Personne morale » (article 13 ; notice, point 2-1-1). Meublé : non
--    contrôlé (l'article 13 ne vise que les articles 11 et 15).
--
-- 4. La colonne `conges.date_premiere_presentation` garde son nom ; son commentaire dit ce qu'elle contient : la
--    date de RÉCEPTION (article 15 I : « Ce délai court à compter du jour de la réception de la lettre
--    recommandée, de la signification de l'acte du commissaire de justice ou de la remise en main propre »).
--
-- CE QUI NE CHANGE PAS. Aucune donnée n'est écrite, modifiée ni supprimée : les congés déjà enregistrés gardent leur
-- préavis et leur date d'effet, même ceux que l'ancienne règle a acceptés. Aucun droit n'est ouvert, aucune règle de
-- lecture (RLS) n'est touchée. `enregistrer_conge` garde sa signature et ses droits ; son texte est celui de
-- 20261112120300 avec les trois changements marqués « Lot T1 ».
--
-- À SAVOIR : rejouer SEULE la migration 20261112120300 remet l'ancien contrôle ; rejouer ensuite celle-ci.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125101500_conge_textes_officiels_t1.retour.sql

-- La dernière date de réception qui laisse le préavis entier avant le terme (dernier jour du bail).
-- Exemple : terme le 30 juin, six mois -> 31 décembre (31 décembre + 6 mois = 30 juin, dernier jour du mois).
create or replace function public.date_limite_conge_bailleur(p_terme date, p_preavis_mois integer)
returns date language plpgsql immutable set search_path = '' as $$
declare
  v_limite date;
begin
  if p_terme is null or p_preavis_mois is null or p_preavis_mois < 1 then return null; end if;
  v_limite := (p_terme - make_interval(months => p_preavis_mois))::date;
  -- Fin de mois : le lendemain convient encore tant que « lendemain + préavis » ne dépasse pas le terme
  -- (au plus trois jours : du 28 au 31).
  while ((v_limite + 1) + make_interval(months => p_preavis_mois))::date <= p_terme loop
    v_limite := v_limite + 1;
  end loop;
  return v_limite;
end $$;
-- Fonction interne : appelée par `enregistrer_conge` (qui s'exécute avec les droits de son propriétaire).
revoke execute on function public.date_limite_conge_bailleur(date, integer) from public, anon, authenticated;

create or replace function public.enregistrer_conge(p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint, p_motif text default null::text, p_justificatif uuid default null::uuid, p_prix_vente numeric default null::numeric, p_beneficiaire text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_meuble boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
  v_debut date;
  v_etudiant boolean;
  v_duree_reduite text;
  v_duree interval;
  v_reconduction interval;
  v_terme date;
  v_k integer;
  v_zone_a_verifier boolean := false;
  v_limite date;
begin
  select b.organization_id, b.lot_id, b.type, b.etat,
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien.
         -- Audit 29/09 : inconnue = NULL, jamais « non ».
         coalesce(b.zone_tendue, bi.zone_tendue),
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false))),
         b.date_debut, coalesce(b.meuble_etudiant, false), nullif(btrim(coalesce(b.duree_reduite_evenement, '')), '')
    into v_org, v_lot, v_type, v_etat, v_zone, v_meuble, v_debut, v_etudiant, v_duree_reduite
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation nue) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_meuble then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
    -- Lot T1 (R13-A5) : en location nue, la reprise pour habiter n'est pas ouverte à une société qui n'est pas une
    -- société civile de famille (article 13 de la loi du 6 juillet 1989 ; notice de l'arrêté du 13 décembre 2017,
    -- point 2-1-1). Lu sur la qualité des bailleurs en place, comme la durée du bail. En meublé : non contrôlé.
    if btrim(p_motif) ilike 'reprise%' and not v_meuble and exists (
         select 1 from public.detentions d join public.persons p on p.id = d.person_id
          where d.lot_id = v_lot and d.date_fin is null
            and public.qualite_bailleur_normalisee(p.qualite) in ('SCI', 'Personne morale')) then
      raise exception 'Congé pour reprise impossible : le bailleur est une société (SCI non familiale ou autre personne morale). En location nue, la reprise pour habiter est réservée au bailleur personne physique, à la société civile de famille au profit de l''un de ses associés et aux membres d''une indivision. Si la société est une SCI familiale, corrigez d''abord la qualité du bailleur sur sa fiche.';
    end if;
    if btrim(p_motif) ilike 'reprise%' and coalesce(btrim(p_beneficiaire), '') = '' then
      raise exception 'Congé pour reprise : indiquez le bénéficiaire de la reprise (nom et lien avec le bailleur)';
    end if;
    -- Audit 29/09 : le prix n'est exigé qu'en location NUE, où le congé pour
    -- vendre vaut offre de vente au locataire (art. 15 II). En meublé
    -- (art. 25-8), pas de droit de préemption : le prix reste facultatif.
    if btrim(p_motif) ilike 'vente%' and not v_meuble and (p_prix_vente is null or p_prix_vente <= 0) then
      raise exception 'Congé pour vente : le prix de vente proposé est obligatoire (le congé vaut offre de vente au locataire, art. 15 II)';
    end if;
    if p_prix_vente is not null and p_prix_vente <= 0 then
      raise exception 'Congé pour vente : le prix proposé doit être positif';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois quand le locataire a précisé et justifié un motif
    -- de préavis réduit dans sa lettre de congé (article 15 I de la loi du 6 juillet 1989 : « A défaut, le délai de
    -- préavis applicable à ce congé est de trois mois »).
    -- Lot T1 (R02-A5) : la zone tendue est l'un de ces motifs, elle ne donne plus un mois d'office. La personne qui
    -- enregistre le congé confirme que la lettre l'invoque et le justifie (p_preavis_mois = 1) ; sinon trois mois.
    -- Hors zone tendue, la pièce justificative reste exigée comme avant.
    if v_meuble then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := case when p_preavis_mois = 1 then 1 else 3 end;
    elsif v_zone is null and p_preavis_mois = 1 then
      -- Audit 29/09 : zone tendue inconnue — le préavis d'un mois est
      -- accepté (choix protecteur du locataire), à vérifier par le gérant.
      v_preavis := 1;
      v_zone_a_verifier := p_justificatif is null;
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;

  -- Audit 27/09 : le congé du bailleur se donne pour le TERME du bail
  -- (wiki [[Bail]] § 1.11), avec le préavis complet avant ce terme.
  if p_par = 'bailleur' and v_debut is not null
     and not (not v_meuble and v_duree_reduite is not null) then
    -- Audit 29/09 : une seule règle de durée (SCI familiale et indivision =
    -- 3 ans), partagée avec le bail PDF.
    v_terme := public.terme_bail_calcule(p_bail, p_date_presentation);
    if v_terme < p_date_presentation then
      raise exception 'Congé du bailleur impossible : le bail étudiant a pris fin le % (il n''est jamais reconduit)',
        to_char(v_terme, 'DD/MM/YYYY');
    end if;
    -- Lot T1 (R13-A1) : le délai, compté en mois depuis la réception, doit être écoulé AU PLUS TARD le dernier jour
    -- du bail (notice de l'arrêté du 13 décembre 2017, point 1-4 : terme le 15 juin, congé au plus tard le
    -- 15 décembre). L'ancien contrôle acceptait un jour de plus (réception + préavis <= terme + 1 jour).
    if v_effet > v_terme then
      v_limite := public.date_limite_conge_bailleur(v_terme, v_preavis::integer);
      raise exception 'Congé du bailleur tardif : le bail arrive à son terme le %, le congé devait être reçu par le locataire au plus tard le % (préavis de % mois). Reçu le %, il serait sans effet pour ce terme (wiki Bail § 1.11)',
        to_char(v_terme, 'DD/MM/YYYY'),
        to_char(v_limite, 'DD/MM/YYYY'),
        v_preavis, to_char(p_date_presentation, 'DD/MM/YYYY');
    end if;
    v_effet := v_terme;
  end if;

  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue, prix_vente, beneficiaire_reprise, zone_tendue_a_verifier)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, coalesce(v_zone, false),
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'vente%' then p_prix_vente end,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'reprise%'
          then nullif(btrim(coalesce(p_beneficiaire, '')), '') end,
     v_zone_a_verifier)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  if v_zone_a_verifier then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v_org, 'zone_tendue_a_verifier', 'normale',
            'Congé à 1 mois accepté, zone tendue non renseignée — à vérifier',
            jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'conge_id', v_conge));
  end if;

  -- Audit final du 27/10 (LOY-01) : l'appel du mois de sortie, s'il est déjà généré, passe au prorata.
  perform public.ajuster_appel_fin_de_bail(p_bail);

  return v_conge;
end $function$;

comment on column public.conges.date_premiere_presentation is
  'Date de réception du congé par son destinataire : remise effective de la lettre recommandée, signification de l''acte du commissaire de justice ou remise en main propre. Le nom de la colonne est ancien : une lettre présentée mais non retirée ne fait pas courir le délai.';

-- Même fermeture que 20261112120300 (la fonction existait déjà : ses droits ne changent pas).
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) from public, anon;

select public.fermer_fonctions_a_anon();
