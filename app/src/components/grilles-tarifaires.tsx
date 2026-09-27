"use client";

import Link from "next/link";
import { useState } from "react";
import { GRILLE_PARTICULIERS, TRANCHES_AGENCE, calculerTarif, formaterCentimes } from "@/lib/tarification";

/** Les montants viennent du même barème que la facturation, en centimes. */
export function GrillesTarifaires() {
  const [publicTarif, setPublicTarif] = useState<"proprietaire_direct" | "agence">("proprietaire_direct");
  const [volume, setVolume] = useState("1");
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">("mensuel");
  const nombre = /^\d+$/.test(volume) ? Number(volume) : null;
  const offre = nombre !== null && Number.isSafeInteger(nombre) && nombre <= 100_000
    ? calculerTarif(publicTarif, nombre, publicTarif === "agence" ? "mensuel" : periodicite)
    : null;
  const exempleMensuel = calculerTarif("proprietaire_direct", 25, "mensuel");
  const exempleAnnuel = calculerTarif("proprietaire_direct", 25, "annuel");

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="tarifs-particuliers">
        <h3 id="tarifs-particuliers" className="font-heading text-xl font-bold text-[var(--encre)]">Particuliers et SCI qui gèrent leurs propres biens</h3>
        <p className="mt-2 text-sm text-[var(--texte-secondaire)]">Les mêmes fonctionnalités dans les quatre formules. Seule la capacité change.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GRILLE_PARTICULIERS.map((formule) => (
            <article key={formule.formule} className="vitrine-carte flex flex-col gap-3">
              <h4 className="font-heading text-lg font-bold">{formule.libelle}</h4>
              <p className="text-sm text-[var(--texte-secondaire)]">{formule.capacite === 1 ? "1 bien" : `Jusqu’à ${formule.capacite} biens`}</p>
              <p className="font-heading text-2xl font-bold text-[var(--marque-sombre)]"><span className="whitespace-nowrap">{formaterCentimes(formule.mensuelCentimes)}</span><span className="block text-sm font-normal">TTC / mois</span></p>
              <p className="border-t border-[var(--filet)] pt-3 text-sm"><strong className="whitespace-nowrap">{formaterCentimes(formule.annuelCentimes)} TTC / an</strong><span className="mt-1 block text-[var(--texte-secondaire)]">Prélevés en une fois pour 12 mois</span></p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--texte-secondaire)]">
          L’annuel correspond à deux mois offerts par rapport à douze mensualités. Au-delà de 20 biens, Patrimoine ajoute {formaterCentimes(calculerTarif("proprietaire_direct", 21, "mensuel").supplementCentimes)} TTC par bien et par mois, ou {formaterCentimes(calculerTarif("proprietaire_direct", 21, "annuel").supplementCentimes)} TTC par bien et par an. Pour 25 biens : <strong>{formaterCentimes(exempleMensuel.montantCentimes)} TTC / mois</strong> ou <strong>{formaterCentimes(exempleAnnuel.montantCentimes)} TTC prélevés par an</strong>.
        </p>
      </section>

      <section aria-labelledby="tarifs-agences" className="vitrine-carte">
        <h3 id="tarifs-agences" className="font-heading text-xl font-bold text-[var(--encre)]">Agences qui gèrent pour des tiers</h3>
        <p className="mt-2 text-sm text-[var(--texte-secondaire)]">Paiement mensuel uniquement. Le socle s’applique à une agence ayant souscrit, même avec moins de 10 lots. La création du compte ne démarre aucun abonnement.</p>
        <dl className="mt-5 divide-y divide-[var(--filet)]">
          {TRANCHES_AGENCE.map((tranche, index) => (
            <div key={tranche.jusqua ?? "suite"} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm">
              <dt>{index === 0 ? `Socle incluant jusqu’à ${tranche.jusqua} lots` : tranche.jusqua ? `Du ${TRANCHES_AGENCE[index - 1].jusqua! + 1}ᵉ au ${tranche.jusqua}ᵉ lot` : `À partir du ${TRANCHES_AGENCE[index - 1].jusqua! + 1}ᵉ lot`}</dt>
              <dd className="font-semibold whitespace-nowrap">{index === 0 ? `${formaterCentimes(tranche.forfaitCentimes)} HT / mois` : `+ ${formaterCentimes(tranche.unitaireCentimes)} HT / lot / mois`}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-[var(--texte-secondaire)]">Les tranches s’additionnent ; le tarif de la dernière tranche n’est jamais appliqué à tout le portefeuille. Les taxes applicables dépendent du régime fiscal vérifié de Gerimmo. Le HT, les taxes et le total à payer sont présentés avant votre confirmation.</p>
        <p className="mt-3 text-sm text-[var(--texte-secondaire)]">Exemples : {[10, 20, 50, 100, 200, 300, 500].map((nb) => `${nb} lots : ${formaterCentimes(calculerTarif("agence", nb).montantCentimes)} HT/mois`).join(" · ")}.</p>
      </section>

      <section aria-labelledby="estimer-abonnement" className="vitrine-carte vitrine-carte-mise-en-avant">
        <h3 id="estimer-abonnement" className="font-heading text-xl font-bold">Estimer mon abonnement</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">Je gère
            <select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={publicTarif} onChange={(e) => setPublicTarif(e.target.value as "proprietaire_direct" | "agence")}>
              <option value="proprietaire_direct">Mes propres biens, en nom propre ou SCI</option>
              <option value="agence">Des biens pour des tiers, en agence</option>
            </select>
          </label>
          <label className="block text-sm">{publicTarif === "agence" ? "Lots sous mandat actif" : "Biens activement gérés"}
            <input type="number" min={0} max={100000} step={1} value={volume} onChange={(e) => setVolume(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
          </label>
          {publicTarif === "proprietaire_direct" ? <label className="block text-sm">Paiement
            <select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={periodicite} onChange={(e) => setPeriodicite(e.target.value as "mensuel" | "annuel")}>
              <option value="mensuel">Mensuel</option><option value="annuel">Annuel, prélevé en une fois</option>
            </select>
          </label> : <p className="self-end pb-3 text-sm text-[var(--texte-secondaire)]">Facturation mensuelle, selon le nombre de lots distincts sous mandat actif, même vacants.</p>}
        </div>
        <div aria-live="polite" aria-atomic="true" className="mt-5 rounded-lg bg-background p-4">
          {offre ? <>
            <p className="text-sm font-semibold">{offre.libelle} · {publicTarif === "agence" ? "estimation hors taxes" : "formule la moins chère couvrant votre portefeuille"}</p>
            <p className="mt-1 font-heading text-2xl font-bold text-[var(--marque-sombre)]">{formaterCentimes(offre.montantCentimes)} {publicTarif === "agence" ? "HT / mois" : periodicite === "annuel" ? "TTC prélevés par an" : "TTC / mois"}</p>
            <p className="mt-2 text-sm text-[var(--texte-secondaire)]">{publicTarif === "agence" ? "Taxes et total à payer à confirmer avant toute souscription." : periodicite === "annuel" ? "Un seul prélèvement couvre douze mois. Renouvellement annuel, sauf résiliation pour la prochaine échéance." : "Sans engagement annuel, résiliable pour la prochaine échéance."} Cette estimation ne souscrit aucune offre.</p>
          </> : <p className="text-sm">Indiquez un nombre entier entre 0 et 100 000.</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/inscription" className="btn-or">Essayer 14 jours sans carte</Link>
          <a href="#agences" className="btn-secondaire">Demander mon essai agence</a>
        </div>
      </section>

      <div className="grid gap-5 text-sm leading-relaxed text-[var(--texte-secondaire)] sm:grid-cols-2">
        <div><h3 className="font-semibold text-[var(--encre)]">Ce qui est inclus</h3><p className="mt-2">Les fonctions de gestion disponibles pour votre profil, les accès locataires, les propriétaires invités par une agence et ses collaborateurs. Aucun supplément par personne ni par document. Sans frais d’installation pour démarrer en autonomie.</p><p className="mt-2">Les biens occupés et vacants comptent. Les biens archivés restent dans l’historique ; un lot sous mandat actif reste compté. Un logement et ses annexes sur le même bail comptent pour un bien ; un parking loué séparément compte distinctement.</p></div>
        <div><h3 className="font-semibold text-[var(--encre)]">Vous gardez la main</h3><p className="mt-2">Toute augmentation payante présente son montant, sa date et le prorata avant votre accord. Une baisse prend effet à la prochaine échéance si le portefeuille le permet. Une résiliation conserve les droits déjà payés ; ensuite, consultation et export restent accessibles sans suppression automatique.</p><p className="mt-2">Les jours d’essai restants sont conservés si vous souscrivez avant leur fin. Aucun abonnement gratuit permanent dans cette nouvelle grille. Les avantages et contrats déjà accordés ne sont pas remplacés silencieusement.</p></div>
        <div className="sm:col-span-2"><h3 className="font-semibold text-[var(--encre)]">Les prestations séparées</h3><p className="mt-2">La gestion immobilière est accessible partout en France. L’ouverture du réseau d’artisans, selon la commune du bien et le métier validé, ne modifie pas l’abonnement. Les interventions et travaux restent sur devis, facturés séparément. Les signatures électroniques, SMS et services bancaires payants ne sont pas inclus en illimité ; les éventuelles options sont présentées séparément avant accord. Une reprise manuelle de données d’agence peut être proposée sur devis, sans facturation automatique.</p></div>
      </div>
    </div>
  );
}
