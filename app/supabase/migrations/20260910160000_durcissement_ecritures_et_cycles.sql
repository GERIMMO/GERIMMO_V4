-- Audit du 2026-09-10 — suite : ce qui pouvait être rejoué, forgé ou dévié.
-- Chaque point ci-dessous a été rejoué avant correction et re-testé après.

-- 1 ─ P0 : un encaissement modifiable sans que le journal suive ──────────────
-- La politique UPDATE laissait changer montant, date ou bail d'un encaissement
-- déjà écrit au journal : les écritures (recette + honoraires) restaient sur
-- l'ancienne valeur, sans contre-passation. Le journal divergeait en silence,
-- ce que RM-A6.3 interdit (« immutabilité dès la création, correction par
-- contre-écriture »). L'application ne met JAMAIS un encaissement à jour
-- (vérifié : aucun .update() sur cette table) — elle supprime et ressaisit,
-- et le déclencheur de suppression contre-passe proprement. On aligne donc
-- le droit sur l'usage réel.
drop policy if exists encaissements_update on public.encaissements;
revoke update on public.encaissements from authenticated;
comment on table public.encaissements is
  'Immuable après création (RM-A6.3) : corriger = supprimer (contre-passation automatique) puis ressaisir.';

-- 2 ─ P1 : est_quittance et montant forgeables par UPDATE direct ─────────────
-- La quittance est une preuve légale de paiement : son caractère libératoire
-- et son montant ne se décident que dans resynchroniser_quittances, à partir
-- de l'encaissé réel. Seul l'horodatage d'envoi reste écrit par l'application.
revoke update on public.quittances from authenticated;
grant update (email_envoye_at) on public.quittances to authenticated;

-- 3 ─ P1 : contre_ecriture rejouable ────────────────────────────────────────
-- Deux appels (double-clic, retry réseau, bouton resté visible) inversaient
-- deux fois le même mouvement. Les déclencheurs d'encaissement portaient déjà
-- la garde ; la règle devient structurelle : une écriture ne se contre-passe
-- qu'une fois.
create unique index if not exists ecritures_une_contre_ecriture_par_origine
  on public.ecritures (contre_ecriture_de)
  where contre_ecriture_de is not null;

-- 4 ─ P1 : « un seul bail actif par lot » n'était garanti par rien ──────────
-- La règle vivait dans les fonctions ; un UPDATE direct de baux.etat pouvait
-- créer deux baux vivants sur le même lot (double quittancement, deux
-- locataires opposables). Elle devient une contrainte de base.
create unique index if not exists baux_un_seul_vivant_par_lot
  on public.baux (lot_id)
  where etat in ('actif', 'preavis');

-- 5 ─ P1 : la révision IRL se rejouait, composant la hausse ─────────────────
-- reviser_loyer part du loyer courant : c'est juste pour une révision
-- annuelle, faux quand le même appel est rejoué (la hausse s'applique au
-- loyer déjà révisé). Une révision par bail et par date d'effet.
create unique index if not exists revisions_loyer_une_par_date_effet
  on public.revisions_loyer (bail_id, date_effet);

-- 6 ─ P1 : la signature de l'agence n'était jamais lisible ──────────────────
-- La politique comparait organizations.signature_path à organizations.name
-- (deux colonnes de la MÊME table) au lieu du nom de l'objet de stockage :
-- la condition n'était vraie que par accident. Les documents générés
-- partaient donc sans signature, sans erreur visible.
drop policy if exists ged_select_signature on storage.objects;
create policy ged_select_signature on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.organizations o
      where o.signature_path = objects.name
        and o.id in (select public.org_ids_avec_roles(
              array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    )
  );

-- 7 ─ P1 : retirer un lot d'un mandat en brouillon était impossible ─────────
-- mandat_lignes n'avait ni privilège ni politique DELETE : le geste échouait
-- silencieusement. On l'ouvre pour les gérants de l'organisation, et
-- seulement tant que la ligne n'a pas commencé à courir (date_fin nulle sur
-- un mandat non résilié) — l'historique d'un mandat actif reste intouchable.
grant delete on public.mandat_lignes to authenticated;
create policy mandat_lignes_delete on public.mandat_lignes
  for delete to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and exists (
      select 1 from public.mandats m
      where m.id = mandat_lignes.mandat_id
        and m.etat in ('brouillon', 'a_signer')
    )
  );
