"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formaterDate } from "@/lib/ged";
import { dateLimiteCongeBailleur } from "@/lib/delai-conge-bailleur";
import { CONGE_SANS_GARANTIE, CONGE_ACHETE_OCCUPE, CONGE_NOTICE_A_JOINDRE, CONGE_RECEPTION } from "@/lib/documents/catalogue-options";

// Génération du congé délivré par le bailleur : le motif (vente, reprise ou
// motif légitime et sérieux) et ses précisions sont les choix du geste — ils
// partent en `options`, rien n'est écrit en base. Le PDF se notifie hors
// plateforme (LRAR, acte de commissaire de justice ou remise en main propre) : Gerimmo
// génère et suit, il ne notifie jamais (RM-A3.1).
// Audit 29/09 : la date d'effet n'est plus saisie — c'est le terme du bail
// calculé par la base pour la date de réception prévue ; le prix est exigé
// pour un congé pour vente d'un logement loué nu (le congé vaut offre, art. 15 II).
// Textes officiels, lot T1 : le délai court de la RÉCEPTION par le locataire (plus de la « première présentation ») ; la
// date limite de réception pour le terme en cours est affichée ; conditions de la vente exigées en location nue ; notice
// de l'arrêté du 13 décembre 2017 à joindre par le bailleur ; question « logement acheté déjà loué ».
export function GenererCongeBailleur({
  orgId,
  bailId,
  cheminRetour,
  meuble,
  terme,
}: {
  orgId: string;
  bailId: string;
  cheminRetour: string;
  /** Location meublée : pas d'offre de vente, prix facultatif (art. 25-8). */
  meuble: boolean;
  /** Terme de la période en cours, calculé par la base (null : incalculable). */
  terme: string | null;
}) {
  const [motif, setMotif] = useState<"vente" | "reprise" | "motif_legitime">("vente");
  const [beneficiaireNom, setBeneficiaireNom] = useState("");
  const [beneficiaireLien, setBeneficiaireLien] = useState("");
  const [beneficiaireAdresse, setBeneficiaireAdresse] = useState("");
  const [raisonsReprise, setRaisonsReprise] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [datePresentation, setDatePresentation] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [conditionsVente, setConditionsVente] = useState("");
  const [acheteOccupe, setAcheteOccupe] = useState<"" | "non" | "oui">("");
  const [dateAcquisition, setDateAcquisition] = useState("");
  const prixExige = motif === "vente" && !meuble;
  const prixManquant = prixExige && (!prixVente.trim() || !conditionsVente.trim());
  // Location nue, vente ou reprise : notice à joindre et question « acheté déjà loué » (article 15 I).
  const nuVenteOuReprise = !meuble && motif !== "motif_legitime";
  // Dernière date de réception par le locataire qui laisse le préavis entier avant le terme en cours (même règle que la base).
  const dateLimite = typeof terme === "string" && /^\d{4}-\d{2}-\d{2}/.test(terme) ? dateLimiteCongeBailleur(terme, meuble ? 3 : 6) : null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Le congé du bailleur ne vaut qu&apos;au terme du bail : le locataire doit l&apos;avoir reçu
        au moins <b className="font-semibold">{meuble ? "3 mois" : "6 mois"}</b> avant
        l&apos;échéance. À notifier par lettre recommandée avec demande d&apos;avis de réception, acte de
        commissaire de justice ou remise en main propre contre récépissé ou émargement — à chaque locataire
        individuellement. Gerimmo ne notifie pas ce congé : la date de réception est à
        enregistrer ensuite sur la fiche du bail.
        {terme
          ? ` Terme de la période en cours : ${formaterDate(terme)} — si le préavis n'y tient plus à la date de réception, le congé vise l'échéance suivante.`
          : " Le terme du bail ne se calcule pas (durée réduite ou date de début manquante) : il restera à compléter sur l'épreuve."}
      </p>
      {terme && dateLimite && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-conge-date-limite={dateLimite}>
          <strong>Pour ce terme, le locataire doit avoir reçu le congé au plus tard le {formaterDate(dateLimite)}.</strong>{" "}
          Gardez une marge. {CONGE_RECEPTION} Si la date est proche, l&apos;acte de commissaire de justice est le plus sûr.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="conge-b-motif" className="text-xs">
            Motif
          </Label>
          <select
            id="conge-b-motif"
            value={motif}
            onChange={(e) =>
              setMotif(
                e.target.value === "reprise"
                  ? "reprise"
                  : e.target.value === "motif_legitime"
                    ? "motif_legitime"
                    : "vente"
              )
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="vente">Vente</option>
            <option value="reprise">Reprise</option>
            <option value="motif_legitime">Motif légitime et sérieux</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="conge-b-presentation" className="text-xs">
            Réception prévue par le locataire (aujourd&apos;hui par défaut)
          </Label>
          <Input
            id="conge-b-presentation"
            type="date"
            value={datePresentation}
            onChange={(e) => setDatePresentation(e.target.value)}
          />
        </div>
        {motif === "vente" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="conge-b-prix" className="text-xs">
                Prix de vente proposé (€){prixExige ? " — obligatoire" : " — facultatif en meublé"}
              </Label>
              <Input
                id="conge-b-prix"
                inputMode="decimal"
                placeholder="ex. 245 000"
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conge-b-conditions" className="text-xs">
                Conditions de la vente{prixExige ? " — obligatoires" : " — facultatives en meublé"}
              </Label>
              <Input
                id="conge-b-conditions"
                placeholder="ex. vente libre de toute occupation, frais d'acte à la charge de l'acquéreur"
                value={conditionsVente}
                onChange={(e) => setConditionsVente(e.target.value)}
              />
            </div>
          </>
        )}
        {motif === "reprise" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="conge-b-beneficiaire" className="text-xs">
                Bénéficiaire de la reprise (bailleur SCI familiale : l&apos;un des associés)
              </Label>
              <Input
                id="conge-b-beneficiaire"
                placeholder="ex. Marie Dupont"
                value={beneficiaireNom}
                onChange={(e) => setBeneficiaireNom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conge-b-lien" className="text-xs">
                Lien avec le bailleur
              </Label>
              <Input
                id="conge-b-lien"
                placeholder="ex. fille du bailleur"
                value={beneficiaireLien}
                onChange={(e) => setBeneficiaireLien(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="conge-b-adresse" className="text-xs">
                Adresse du bénéficiaire
              </Label>
              <Input
                id="conge-b-adresse"
                maxLength={200}
                placeholder="ex. 12 rue des Lilas, 69003 Lyon"
                value={beneficiaireAdresse}
                onChange={(e) => setBeneficiaireAdresse(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="conge-b-raisons" className="text-xs">
                Raisons de la reprise
              </Label>
              <Input
                id="conge-b-raisons"
                maxLength={500}
                placeholder="ex. le bénéficiaire quitte son logement actuel pour s’installer ici à titre de résidence principale"
                value={raisonsReprise}
                onChange={(e) => setRaisonsReprise(e.target.value)}
              />
            </div>
          </>
        )}
        {nuVenteOuReprise && (
          <>
            <div className="space-y-1">
              <Label htmlFor="conge-b-achete-occupe" className="text-xs">
                Logement acheté alors qu&apos;il était déjà loué ?
              </Label>
              <select
                id="conge-b-achete-occupe"
                value={acheteOccupe}
                onChange={(e) => setAcheteOccupe(e.target.value === "oui" ? "oui" : e.target.value === "non" ? "non" : "")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Choisir…</option>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
              </select>
            </div>
            {acheteOccupe === "oui" && (
              <div className="space-y-1">
                <Label htmlFor="conge-b-acquisition" className="text-xs">
                  Date d&apos;acquisition
                </Label>
                <Input
                  id="conge-b-acquisition"
                  type="date"
                  value={dateAcquisition}
                  onChange={(e) => setDateAcquisition(e.target.value)}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-2">{CONGE_ACHETE_OCCUPE}</p>
          </>
        )}
        {motif === "motif_legitime" && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="conge-b-detail" className="text-xs">
              Motif invoqué
            </Label>
            <Input
              id="conge-b-detail"
              placeholder="ex. impayés répétés malgré mises en demeure"
              value={motifDetail}
              onChange={(e) => setMotifDetail(e.target.value)}
            />
          </div>
        )}
      </div>
      {motif !== "motif_legitime" && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-conge-a-faire-relire={motif}>
          <strong>À faire relire avant de notifier.</strong> Faites relire ce congé pour {motif === "vente" ? "vente" : "reprise"}{" "}
          (ADIL, avocat, commissaire de justice). {CONGE_SANS_GARANTIE}
          {motif === "reprise" && " Gerimmo ne génère pas la lettre tant que le nom du bénéficiaire, son lien avec vous, son adresse et les raisons de la reprise ne sont pas renseignés."}
        </p>
      )}
      {motif === "vente" && !meuble && (
        <p className="text-xs text-muted-foreground" data-conge-texte-reproduit>
          La lettre reproduit les cinq premiers alinéas de l&apos;article 15 II de la loi du 6 juillet 1989, dans la
          version en vigueur depuis le 29 juillet 2023 : vérifiez sur Légifrance que ce texte n&apos;a pas changé. Elle
          écrit toujours que le congé vaut offre de vente : ce modèle ne traite pas les cas où la loi l&apos;écarte
          (vente à un parent jusqu&apos;au troisième degré, par exemple).
        </p>
      )}
      {nuVenteOuReprise && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-conge-notice-a-joindre>
          <strong>Notice à joindre vous-même.</strong> {CONGE_NOTICE_A_JOINDRE}
        </p>
      )}
      {prixManquant && (
        <p className="text-xs text-muted-foreground">
          En location nue, le congé pour vendre vaut offre de vente au locataire : le prix
          et les conditions de la vente doivent y figurer, le PDF ne se génère pas sans eux.
        </p>
      )}
      <BoutonGenererDocument
        orgId={orgId}
        code="conge_bailleur"
        cibleId={bailId}
        cheminRetour={cheminRetour}
        libelle="Générer le congé (PDF)"
        options={{
          motif,
          ...(motif === "reprise" && beneficiaireNom.trim()
            ? { beneficiaire_nom: beneficiaireNom.trim() }
            : {}),
          ...(motif === "reprise" && beneficiaireLien.trim()
            ? { beneficiaire_lien: beneficiaireLien.trim() }
            : {}),
          ...(motif === "reprise" && beneficiaireAdresse.trim()
            ? { beneficiaire_adresse: beneficiaireAdresse.trim() }
            : {}),
          ...(motif === "reprise" && raisonsReprise.trim()
            ? { raisons_reprise: raisonsReprise.trim() }
            : {}),
          ...(motif === "motif_legitime" && motifDetail.trim()
            ? { motif_detail: motifDetail.trim() }
            : {}),
          ...(motif === "vente" && prixVente.trim() ? { prix_vente: prixVente.trim() } : {}),
          ...(motif === "vente" && conditionsVente.trim()
            ? { conditions_vente: conditionsVente.trim() }
            : {}),
          ...(nuVenteOuReprise && acheteOccupe ? { achete_occupe: acheteOccupe } : {}),
          ...(nuVenteOuReprise && acheteOccupe === "oui" && dateAcquisition ? { date_acquisition: dateAcquisition } : {}),
          ...(datePresentation ? { date_presentation: datePresentation } : {}),
        }}
      />
    </div>
  );
}
