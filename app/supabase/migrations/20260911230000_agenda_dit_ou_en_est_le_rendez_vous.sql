-- L'agenda de l'artisan disait « Proposer trois créneaux » à qui venait de les
-- proposer.
--
-- CONSTAT, AU NAVIGATEUR, LE 11/09. Parcours joué en entier : l'agence retient
-- le devis, l'artisan accepte la mission, propose trois créneaux. Son agenda
-- affiche alors « Acceptée — à planifier » et, en action à faire, « Proposer
-- trois créneaux au locataire ». Il les a proposés. L'écran ne le sait pas.
--
-- CE QUE ÇA COÛTE, ET POURQUOI CE N'EST PAS COSMÉTIQUE. Un artisan qui lit
-- cette consigne la suit : il repropose. Or `proposer_creneaux` rend CADUCS
-- les créneaux du tour précédent (c'est correct : on ne veut pas six dates
-- ouvertes en même temps). Le locataire qui s'apprêtait à choisir voit ses
-- dates disparaître, et le compteur de tours avance vers l'arbitrage du gérant
-- (RM-10.4.1, six refus) sans que personne n'ait refusé quoi que ce soit.
-- Les deux côtés attendent l'autre, et l'écran fabrique le blocage.
--
-- LA CAUSE. `mon_agenda_artisan` ne rend rien sur les créneaux : la page n'a
-- que `debut_prevu`, qui reste nul tant que le locataire n'a pas choisi. Elle
-- ne peut pas distinguer « rien n'est proposé » de « proposé, en attente de
-- réponse ». On ajoute donc le fait manquant plutôt qu'une astuce d'affichage.

-- Le type de retour change (une colonne de plus) : Postgres exige de défaire
-- la fonction avant de la refaire. Aucune vue ni politique ne s'y adosse — le
-- portail l'appelle par RPC, rien d'autre ne la nomme.
drop function if exists public.mon_agenda_artisan(timestamptz, timestamptz);

create function public.mon_agenda_artisan(
  p_du timestamptz default null,
  p_au timestamptz default null
)
returns table (
  intervention_id uuid, organization_id uuid, agence_nom text, incident_numero text,
  statut public.intervention_statut, debut_prevu timestamptz, fin_prevue timestamptz,
  categorie text, description text, urgence public.incident_urgence, piece text,
  nature_travaux public.nature_travaux, adresse text, code_postal text, ville text,
  lot_nom text, etage text, occupant_nom text, occupant_prenom text,
  occupant_telephone text, montant_ttc_cents bigint, compte_rendu_depose boolean,
  photo_apres_deposee boolean,
  -- Combien de dates sont posées et attendent une réponse. Zéro = la balle est
  -- dans le camp de l'artisan ; au-delà, elle est chez le locataire.
  creneaux_en_attente integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id, i.organization_id, o.name, inc.numero, i.statut,
    i.debut_prevu, i.fin_prevue,
    inc.categorie, inc.description, inc.urgence, inc.piece, i.nature_travaux,
    b.address_line1, b.postal_code, b.city, l.nom, l.etage,
    -- Ni avant l'acceptation, ni après la fin : le contact de l'occupant n'est
    -- lisible que pendant la mission vivante. Une fois le travail terminé,
    -- l'artisan garde sa ligne d'agenda (son historique) mais plus le
    -- téléphone de quelqu'un chez qui il n'a plus à se rendre.
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.nom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.prenom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.telephone end,
    d.montant_ttc_cents,
    exists (select 1 from public.intervention_comptes_rendus cr where cr.intervention_id = i.id),
    exists (select 1 from public.intervention_photos ip
            where ip.intervention_id = i.id and ip.moment = 'apres'),
    (select count(*)::integer from public.intervention_creneaux cr
      where cr.intervention_id = i.id and cr.statut = 'propose'
        and cr.propose_par = 'artisan')
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = i.organization_id
  left join public.incident_devis d on d.id = i.devis_id
  left join public.baux ba on ba.id = inc.bail_id
  left join public.persons pe on pe.id = ba.locataire_principal
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee')
    and (p_du is null or i.debut_prevu is null or i.debut_prevu >= p_du)
    and (p_au is null or i.debut_prevu is null or i.debut_prevu < p_au)
  order by i.debut_prevu nulls first, i.confiee_le;
$$;
