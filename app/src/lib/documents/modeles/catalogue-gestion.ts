import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cadreSignature, cartouches, enTete, faitA, section, titre, eur, facultatif, echapper } from "../gabarit";
import { CATALOGUE_DOCUMENTS } from "../catalogue";
import { lireLignes, lignesTableau, RefusDocument, texte, montant, anneeDocument } from "./catalogue-bail";
import { chargerContexteBail, nomsLocataires, adresseLogement, referenceCourte } from "./communs";
import { recapitulatifFiscal, type EcritureFiscale } from "@/lib/fiscal";
import type { Assemblage, LienDocument } from "./index";

export const CODES_COMPLEMENTS_GESTION = ["bon_visite", "regularisation_charges", "decompte_charges", "consultation_charges", "restitution_cles", "ordre_intervention", "comparatif_devis", "compte_rendu_intervention", "recap_incident", "cloture_mensuelle", "ecriture_rectificative", "recap_fiscal_nu", "recap_fiscal_meuble", "avenant_mandat", "avenant_perimetre", "rapport_gestion", "bordereau_versement", "resiliation_mandat", "recap_fiscal_agence"] as const;

export async function assemblerComplementGestion(code: typeof CODES_COMPLEMENTS_GESTION[number], db: SupabaseClient, orgId: string, cibleId: string, options: Record<string,string> = {}): Promise<Assemblage> {
  try {
    const lire = (table:string) => db.from(table).select("*").eq("organization_id", orgId);
    const unique = async (table:string,id:string) => {
      const lignes = await lireLignes(lire(table).eq("id",id).limit(1));
      if (!lignes.length) throw new RefusDocument("Le dossier demandé est introuvable ou inaccessible.");
      return lignes[0];
    };
    const orgs = await lireLignes(db.from("organizations").select("*").eq("id",orgId).limit(1));
    if (!orgs.length) throw new RefusDocument("Organisation inaccessible.");
    const org = orgs[0], f = new Fusion(), meta = CATALOGUE_DOCUMENTS.find(m=>m.id===code)!;
    const exp = { nom:texte(org.name), adresse:[org.address_line1,org.postal_code,org.city].filter(Boolean).join(" "), email:texte(org.email_contact), telephone:texte(org.telephone), ville:texte(org.city) };
    const aujourdhui = new Date().toISOString().slice(0,10);
    const champ = (cle:string,libelle:string) => f.champ(options[cle]?.trim()||null,libelle);
    const liens: LienDocument[] = [];
    let contenu = "", destinataire = "", logement = "", signatures = false;
    const lotConcerne = async (id:string) => {
      const lot = await unique("lots",id), bien = await unique("biens",texte(lot.bien_id));
      logement = [lot.nom,bien.address_line1,bien.postal_code,bien.city].filter(Boolean).join(" · ");
      liens.push({entite:"lot",entiteId:id});
      return lot;
    };
    const bailConcerne = async (id:string) => {
      const ctx = await chargerContexteBail(db,orgId,id);
      if ("erreur" in ctx) throw new RefusDocument(ctx.erreur);
      destinataire = nomsLocataires(f,ctx.locataires); logement = adresseLogement(ctx.lot,ctx.bien);
      liens.push({entite:"bail",entiteId:id},{entite:"lot",entiteId:ctx.lot.id});
      return ctx;
    };
    if (["regularisation_charges","decompte_charges","consultation_charges"].includes(code)) {
      const r = await unique("regularisations_charges",cibleId);
      const ctx = await bailConcerne(texte(r.bail_id));
      if (ctx.bail.charges_mode === "forfait") throw new RefusDocument("Les charges forfaitaires ne font pas l’objet d’une régularisation annuelle.");
      contenu = `${section(`Charges de l’exercice ${texte(r.annee)}`)}${lignesTableau(f,[r],[["Provisions versées","provisions","montant"],["Charges réelles","charges_reelles","montant"],["Écart enregistré","ecart","montant"]])}
        <p>${montant(r.ecart)>=0 ? "Solde à régler" : "Trop-perçu en faveur du locataire"} : ${eur(Math.abs(montant(r.ecart)))}.</p>`;
      if (code !== "consultation_charges") contenu += `${section("Décompte et répartition")}
        <p>${f.champ(texte(r.note)||null,"détail des dépenses par nature et clé de répartition")}</p>
        <p>Justificatif annexé : ${r.justificatif_document ? "pièce enregistrée dans le dossier, à joindre" : f.champ(null,"décompte justificatif à déposer et joindre")}.</p>`;
      contenu += `${section("Consultation des justificatifs")}<p>Modalités : ${champ("consultation","lieu ou accès, horaires et contact pour consulter les justificatifs")}.</p>
        <p>Le décompte par nature de charges et le mode de répartition sont communiqués un mois avant la régularisation. Les justificatifs restent à disposition pendant six mois à compter de l’envoi du décompte.</p>
        <p>Date du dossier : ${f.date(texte(r.date_emission))}. Ce PDF ne déclenche aucun prélèvement ni envoi.</p>`;
    } else if (code === "restitution_cles") {
      const edl = await unique("etats_des_lieux",cibleId);
      await bailConcerne(texte(edl.bail_id));
      const cles = await lireLignes(lire("edl_cles").eq("edl_id",cibleId).order("libelle"));
      if (!cles.length) throw new RefusDocument("Renseignez les clés dans l’état des lieux avant de préparer le bordereau.");
      contenu = `${section(edl.type === "sortie" ? "Clés restituées au bailleur" : "Clés remises au locataire")}
        <p>Date du constat : ${f.date(texte(edl.date_edl))}. État des lieux ${edl.etat === "signe" ? "signé" : "en préparation : remise à confirmer contradictoirement"}.</p>
        ${lignesTableau(f,cles,[["Clé / accès","libelle","texte"],["Nombre","nombre","texte"],["Référence","reference","texte"]])}`;
      signatures = true;
    } else if (["ordre_intervention","comparatif_devis","compte_rendu_intervention","recap_incident"].includes(code)) {
      const intervention = ["ordre_intervention","compte_rendu_intervention"].includes(code) ? await unique("incident_interventions",cibleId) : null;
      const incident = await unique("incidents",intervention ? texte(intervention.incident_id) : cibleId);
      await lotConcerne(texte(incident.lot_id));
      // Les comptes rendus sont rattachés au lot. Leur visibilité suit la GED du lot.
      contenu = `${section(`Incident ${texte(incident.numero)}`)}<p>Signalement : ${f.champ(texte(incident.description),"description du signalement")}.</p>
        <p>Pièce : ${facultatif(texte(incident.piece))} ; catégorie : ${facultatif(texte(incident.categorie))} ; état : ${f.champ(texte(incident.etat),"état du dossier")}.</p>`;
      if (intervention) {
        const artisans = await lireLignes(db.from("artisans").select("raison_sociale,siret,telephone,email").eq("id",intervention.artisan_id).limit(1));
        if (!artisans.length) throw new RefusDocument("Les coordonnées de l’artisan ne sont pas accessibles.");
        const a = artisans[0]; destinataire = f.champ(texte(a.raison_sociale),"entreprise intervenante");
        contenu += `${section("Mission enregistrée")}<p>${f.champ(texte(intervention.nature_travaux),"nature des travaux")}.</p>
          <p>Artisan : ${destinataire} ; SIRET : ${facultatif(texte(a.siret))}. Contact : ${facultatif(texte(a.telephone))} · ${facultatif(texte(a.email))}.</p>
          <p>État de la mission : ${f.champ(texte(intervention.statut),"statut de la mission")} ; confiée le ${f.date(texte(intervention.confiee_le))}.</p>`;
        if (code === "ordre_intervention") {
          if (["annulee","refusee"].includes(texte(intervention.statut))) throw new RefusDocument("Cette mission a été annulée ou refusée. Préparez une nouvelle mission pour émettre un ordre d’intervention.");
          contenu += `<p>Créneau prévu : ${f.date(texte(intervention.debut_prevu)||null,"début prévu")} au ${f.date(texte(intervention.fin_prevue)||null,"fin prévue")}.</p>
            <p>Accès et personne à contacter : ${champ("acces","modalités d’accès et contact sur place")}.</p><p>Aucun travail supplémentaire n’est autorisé par ce document sans accord préalable du donneur d’ordre.</p>`;
        } else {
          const crs = await lireLignes(lire("intervention_comptes_rendus").eq("intervention_id",cibleId).order("created_at",{ascending:false}));
          if (!crs.length) throw new RefusDocument("L’artisan doit déposer son compte rendu avant la génération du document.");
          for (const cr of crs) contenu += `${section("Compte rendu déclaré par l’artisan")}<p>Travaux réalisés : ${f.champ(texte(cr.travaux_realises),"travaux réalisés")}.</p>
            <p>Cause constatée : ${facultatif(texte(cr.cause_reelle))}.</p>
            <p>Montant final déclaré : ${cr.montant_final_cents == null ? f.champ(null,"montant final déclaré") : eur(montant(cr.montant_final_cents)/100)} ; nouvelle intervention nécessaire : ${cr.nouvelle_intervention_necessaire ? "oui" : "non"}.</p>
            <p>Compte rendu du ${f.date(texte(cr.created_at))}. Il ne remplace pas la facture de l’entreprise.</p>`;
        }
      } else if (code === "comparatif_devis") {
        const devis = await lireLignes(lire("incident_devis").eq("incident_id",cibleId).order("depose_le"));
        if (!devis.length) throw new RefusDocument("Aucun devis n’a encore été déposé pour cet incident.");
        const artisans = await lireLignes(db.from("artisans").select("id,raison_sociale").in("id",[...new Set(devis.map(d=>texte(d.artisan_id)))]));
        const noms = new Map(artisans.map(a=>[a.id,a.raison_sociale]));
        contenu += lignesTableau(f,devis.map(d=>({...d,entreprise:noms.get(d.artisan_id),montant:montant(d.montant_ttc_cents)/100})),[["Entreprise","entreprise","texte"],["Prestation","description","texte"],["TTC","montant","montant"],["Validité","valide_jusqu_au","date"],["Décision","statut","texte"]]);
        contenu += "<p>Comparaison des offres déposées. Le choix reste soumis à la validation prévue dans le dossier ; ce document ne commande aucune prestation.</p>";
      } else {
        contenu += `${section("Décision et clôture")}<p>Imputation enregistrée : ${facultatif(texte(incident.imputation))}.</p>
          <p>Justification : ${facultatif(texte(incident.imputation_justification))}.</p>
          <p>${incident.clos_le ? `Clôturé le ${f.date(texte(incident.clos_le))}. ${facultatif(texte(incident.cloture_commentaire))}` : "Le dossier est toujours ouvert."}</p>`;
      }
    } else if (["bon_visite","recap_fiscal_nu","recap_fiscal_meuble"].includes(code)) {
      const lot = await lotConcerne(cibleId);
      if (code === "bon_visite") {
        destinataire = champ("visiteur","nom et prénom du visiteur");
        contenu = `${section("Visite du logement")}<p>Visiteur : ${destinataire} ; contact : ${champ("contact","coordonnées du visiteur")}.</p>
          <p>Date et heure : ${champ("rendez_vous","date et heure de la visite")} ; représentant : ${champ("representant","personne ayant assuré la visite")}.</p>
          <p>Ce bon atteste uniquement la présentation du logement. Il ne constitue ni un bail, ni une réservation, ni un engagement de louer ou de payer des honoraires.</p>`;
        signatures = true;
      } else {
        if ((code === "recap_fiscal_meuble") !== Boolean(lot.meuble)) throw new RefusDocument("Choisissez le récapitulatif correspondant au caractère nu ou meublé du lot.");
        const annee = anneeDocument(options);
        const ecritures = await lireLignes(lire("ecritures").eq("lot_id",cibleId).gte("date_piece",`${annee}-01-01`).lt("date_piece",`${annee+1}-01-01`).order("date_piece"));
        const baux = await lireLignes(lire("baux").eq("lot_id",cibleId));
        const fiscal = recapitulatifFiscal(ecritures as EcritureFiscale[],annee,{lotsMeubles:lot.meuble?new Set([cibleId]):new Set(),ventilationLoyers:new Map(baux.map(b=>[texte(b.id),{loyerHc:montant(b.loyer_hc),charges:montant(b.charges)}]))});
        contenu = `${section(`Exercice ${annee}`)}<p>Récapitulatif du lot à 100 %, avant ventilation entre propriétaires. Les dépôts de garantie sont exclus et les contre-écritures déduites. Périmètre : ${ecritures.length} écritures enregistrées.</p>`;
        if (lot.meuble) contenu += `<p>Recettes enregistrées : ${eur(fiscal.meuble.recettes)} ; dépenses enregistrées : ${eur(fiscal.meuble.depenses)}.</p><p>Les amortissements, emprunts et retraitements BIC sont à établir avec le comptable ; aucun résultat fiscal n’est certifié ici.</p>`;
        else contenu += lignesTableau(f,fiscal.rubriques.map(r=>({...r,montant:r.aCompleter?null:r.montant})),[["Rubrique","code","texte"],["Libellé","libelle","texte"],["Montant enregistré","montant","montant"]])+`<p>Fonds de travaux ALUR suivis séparément : ${eur(fiscal.fondsTravauxAlur)}.</p>`;
        contenu += "<p>Aide à la préparation de la déclaration. Vérifiez les pièces, la quote-part, les intérêts d’emprunt et les dépenses externes avant déclaration. Les loyers et provisions sont ventilés selon les montants du bail enregistrés lors de la génération.</p>";
      }
    } else if (code === "ecriture_rectificative" || code === "cloture_mensuelle") {
      if (code === "ecriture_rectificative") {
        const e = await unique("ecritures",cibleId);
        if (!e.contre_ecriture_de) throw new RefusDocument("Ce justificatif concerne une contre-écriture enregistrée.");
        const origine = await unique("ecritures",texte(e.contre_ecriture_de));
        if (e.lot_id) await lotConcerne(texte(e.lot_id));
        contenu = `${section("Pièce d’origine et rectification")}${lignesTableau(f,[{...origine,role:"Origine"},{...e,role:"Rectification"}],[["Pièce","role","texte"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"],["Date","date_piece","date"]])}<p>Motif : ${f.champ(texte(e.motif)||null,"motif de la rectification")}.</p>`;
      } else {
        if (cibleId !== orgId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.mois ?? "")) throw new RefusDocument("Choisissez le mois du journal à exporter.");
        const debut = `${options.mois}-01`, finDate = new Date(`${debut}T12:00:00Z`); finDate.setUTCMonth(finDate.getUTCMonth()+1);
        const ecritures = await lireLignes(lire("ecritures").gte("date_imputation",debut).lt("date_imputation",finDate.toISOString().slice(0,10)).order("date_imputation"));
        const clotures = await lireLignes(lire("clotures_comptables").eq("mois",debut).limit(1));
        contenu = `${section(`Journal ${options.mois}`)}<p>${clotures.length ? `Mois clôturé le ${f.date(texte(clotures[0].cloture_at))}` : "Mois ouvert — document provisoire"}.</p>
          ${lignesTableau(f,ecritures,[["Date","date_imputation","date"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]])}
          <p>Total recettes : ${eur(ecritures.filter(e=>e.sens==="recette").reduce((s,e)=>s+montant(e.montant),0))} ; dépenses : ${eur(ecritures.filter(e=>e.sens==="depense").reduce((s,e)=>s+montant(e.montant),0))}.</p>`;
      }
    } else {
      if (org.type !== "agence") throw new RefusDocument("Les documents de mandat concernent les agences de gestion.");
      const rapport = ["rapport_gestion","bordereau_versement"].includes(code) ? await unique("rapports_gestion",cibleId) : null;
      const mandat = await unique("mandats",rapport ? texte(rapport.mandat_id) : cibleId);
      const mandant = await unique("persons",texte(mandat.person_id));
      destinataire = f.champ([mandant.nom,mandant.prenom].filter(Boolean).join(" "),"mandant");
      liens.push({entite:"mandat",entiteId:texte(mandat.id)},{entite:"personne",entiteId:texte(mandant.id)});
      const lignes = await lireLignes(lire("mandat_lignes").eq("mandat_id",mandat.id).order("date_debut"));
      const lots = lignes.length ? await lireLignes(lire("lots").in("id",[...new Set(lignes.map(l=>texte(l.lot_id)))])) : [];
      const noms = new Map(lots.map(l=>[l.id,l.nom]));
      contenu = `${section("Mandat et périmètre")}<p>Mandat ${referenceCourte("MANDAT",texte(mandat.id))} ; état : ${f.champ(texte(mandat.etat),"état du mandat")}.</p>
        ${lignesTableau(f,lignes.map(l=>({...l,lot:noms.get(l.lot_id),fin:l.date_fin||"En cours"})),[["Lot","lot","texte"],["Début","date_debut","date"],["Fin","fin","texte"],["Honoraires (%)","taux_honoraires","texte"]])}`;
      if (rapport) {
        if (code === "bordereau_versement" && (rapport.versement_montant == null || !rapport.versement_date)) throw new RefusDocument("Enregistrez le versement du rapport avant d’émettre son bordereau.");
        contenu += `${section(code === "rapport_gestion" ? "Situation mensuelle" : "Versement enregistré")}
          <p>Mois : ${f.date(texte(rapport.mois))} ; état du rapport : ${f.champ(texte(rapport.statut),"état du rapport")} ; net enregistré : ${f.montant(rapport.net as number)}.</p>
          <p>Versement : ${rapport.versement_montant == null ? "non enregistré" : eur(montant(rapport.versement_montant))} ; date : ${facultatif(texte(rapport.versement_date))}.</p>
          <p>${facultatif(texte(rapport.commentaire))}</p>`;
        if (code === "rapport_gestion") {
          const finDate = new Date(`${texte(rapport.mois).slice(0,10)}T12:00:00Z`); finDate.setUTCMonth(finDate.getUTCMonth()+1);
          const debut = texte(rapport.mois).slice(0,10), fin = finDate.toISOString().slice(0,10);
          const ids = [...new Set(lignes.filter(l=>texte(l.date_debut)<fin && (!l.date_fin || texte(l.date_fin)>=debut)).map(l=>texte(l.lot_id)))];
          const mouvements = ids.length ? await lireLignes(lire("ecritures").in("lot_id",ids).gte("date_imputation",debut).lt("date_imputation",fin).order("date_imputation")) : [];
          const netActuel = mouvements.reduce((s,e)=>s+(e.sens==="recette"?1:-1)*Math.round(montant(e.montant)*100),0);
          if (Math.abs(netActuel-Math.round(montant(rapport.net)*100))>0) throw new RefusDocument("Le détail comptable ne correspond plus au net du rapport. Vérifiez le rapport avant de générer son PDF.");
          contenu += lignesTableau(f,mouvements,[["Date","date_imputation","date"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]]);
        }
        contenu += "<p>Ce document restitue les opérations enregistrées. Il ne constitue pas un ordre de virement.</p>";
      } else if (code === "recap_fiscal_agence") {
        const annee = anneeDocument(options);
        const ids = [...new Set(lignes.map(l=>texte(l.lot_id)))];
        const brutes = ids.length ? await lireLignes(lire("ecritures").in("lot_id",ids).gte("date_piece",`${annee}-01-01`).lt("date_piece",`${annee+1}-01-01`).order("date_piece")) : [];
        const mouvements = brutes.filter(e=>lignes.some(l=>l.lot_id===e.lot_id && texte(l.date_debut)<=texte(e.date_piece) && (!l.date_fin||texte(l.date_fin)>=texte(e.date_piece))));
        contenu += `${section(`Mouvements de gestion ${annee}`)}${lignesTableau(f,mouvements,[["Date","date_piece","date"],["Nature","categorie","texte"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]])}
          <p>Relevé annuel du mandat, à rapprocher des pièces et à transmettre au comptable. Les transferts de fonds et dépôts ne constituent pas automatiquement des recettes fiscales. Ce relevé ne calcule pas un revenu imposable.</p>`;
      } else if (code === "resiliation_mandat") {
        contenu += `${section("Résiliation proposée")}<p>Date d’effet : ${f.date(options.date_effet||null,"date d’effet de la résiliation")} ; motif : ${champ("motif","motif et fondement de la résiliation")}.</p><p>Remise des fonds, pièces et dossiers : ${champ("remise","modalités de remise du dossier et du solde")}.</p>
          <p>Le préavis prévu au mandat est de ${f.champ(texte(mandat.preavis_mois),"durée du préavis")} mois. La génération ne résilie pas le mandat dans Gerimmo ; la date convenue doit être enregistrée après notification.</p>`; signatures = true;
      } else {
        contenu += `${section(code === "avenant_perimetre" ? "Périmètre convenu" : "Conditions convenues")}<p>Date d’effet : ${f.date(options.date_effet||null,"date d’effet de l’avenant")}.</p><p>${champ("modifications",code === "avenant_perimetre" ? "lots ajoutés ou retirés et conditions applicables" : "clauses modifiées et nouvelles conditions convenues")}.</p><p>Les autres stipulations du mandat restent inchangées. Les modifications doivent être enregistrées dans le dossier après signature ; ce document ne les applique pas automatiquement.</p>`; signatures = true;
      }
    }
    const reference = referenceCourte(code.toUpperCase().replaceAll("_","-"),cibleId);
    const corps = `${enTete(f,exp,{libelle:"Dossier",reference,etabliLe:aujourdhui})}${titre(meta.nom,"Document de gestion",[])}
      ${cartouches([["Dossier",reference],["Destinataire",destinataire||"Organisation"],["Logement",facultatif(logement)]])}${contenu}${faitA(f,exp.ville,aujourdhui)}
      ${signatures?`<div class="signatures">${cadreSignature("Bailleur / mandataire",echapper(exp.nom))}${cadreSignature("Partie concernée",destinataire)}</div>`:""}`;
    return {document:assemblerPage({f,titreDocument:meta.nom,nomPied:meta.nom,reference,corps:`<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`}),titreGed:meta.nom,nomFichier:`${code}-${cibleId.slice(0,8)}`,liens};
  } catch(e) { if(e instanceof RefusDocument) return {erreur:e.message}; throw e; }
}
