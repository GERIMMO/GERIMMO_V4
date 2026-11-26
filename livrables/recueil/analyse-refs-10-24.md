# Analyse 2 — références 10 à 24 du recueil confrontées au code de Gerimmo

Date : 24/11/2026. Lecture seule. Rien n'a été modifié, lancé ni testé.

**Ce qui a été lu**
- `recueil/r2-refs10-24.txt` en entier (3 174 lignes). Les numéros « L… » ci-dessous sont ceux de ce fichier.
- `r0-preambule.txt` ; `JURISTE.md` en entier ; `QUESTIONS.md` (Q1 à Q54 en entier, Q55 à Q74 tronquées à 700 caractères
  par ligne) ; `REPONSES-JURISTE.md` (parties 1, 2 et 5 pour les réponses qui citent mes textes) ;
  `TEXTES-OFFICIELS-LUS-2026-11-24.md` (sections 3 à 8).
- Code (`$S/palier1/app`) : les modèles `bail-nu.ts`, `bail-meuble.ts`, `mentions-location.ts`, `notice.ts`,
  `decompte-restitution.ts`, `recu-depot.ts`, `conge-bailleur.ts`, `edl.ts`, `cautionnement.ts`, `rappel-assurance.ts`,
  des extraits de `quittance.ts`, `catalogue-bail.ts`, `catalogue-gestion.ts`, `designation-individuelle.ts` ; plusieurs
  écrans et migrations, trouvés par recherche de mots.

**Ce qui n'a pas été lu** : voir la fin du fichier. Les 563 migrations n'ont pas été lues une à une : pour chaque règle,
j'ai pris la définition la plus récente trouvée par recherche. Une migration plus récente qui réécrit une fonction par
remplacement de texte a pu m'échapper.

**Vocabulaire** : « constaté » = lu des deux côtés (texte et code). « supposé » = déduit, non vérifié.
Chemins de code relatifs à `$S/palier1/app/`. « mig. » = `supabase/migrations/`.

---

## Réf. 10 — Loi de 1989, article 24 (impayés, clause résolutoire, commandement)

### A. Écarts confirmés
Aucun. Constat de conformité, avec la citation :
- Texte, L7-10 : « Tout contrat de bail d'habitation contient une clause prévoyant la résiliation de plein droit […]
  pour défaut de paiement du loyer ou des charges aux termes convenus ou pour non-versement du dépôt de garantie. Cette
  clause ne produit effet que six semaines après un commandement de payer demeuré infructueux. »
- Code, `src/lib/documents/modeles/mentions-location.ts:42-44` : « Le défaut de paiement du loyer ou des charges aux
  échéances convenues, ou le non-versement du dépôt de garantie, entraîne la résiliation de plein droit du contrat. Cette
  clause ne prend effet que six semaines après un commandement de payer demeuré infructueux ». La clause est imprimée
  dans tous les baux (nu : `bail-nu.ts:257-258` ; meublé : `bail-meuble.ts:292-293`).
- Gerimmo ne fabrique pas de commandement de payer (acte du commissaire de justice). La mise en demeure dit : « Ce
  courrier ne constitue ni un commandement de payer ni une décision de résiliation du bail » (`catalogue-bail.ts:259`).
  Les six mentions obligatoires du commandement (L12-27) ne concernent donc aucun document de Gerimmo.

### B. Points de JURISTE.md que le texte tranche
- **Partie 1, point 2 (clause résolutoire rédigée autrement)** : le fond de la clause imprimée correspond à L7-10
  (mêmes trois motifs, même délai). *Le code est conforme au texte fourni sur le fond.* La question « mot pour mot du
  contrat type » relève de la réf. 8, hors de ma part. Allègement proposé : « Fond conforme à l'article 24 I du recueil ;
  reste à comparer la rédaction au contrat type (réf. 8). »
- **Partie 3, B10ter (b) (caution informée d'un impayé)** : L29-32 : « le commandement de payer est signifié à la caution
  dans un délai de quinze jours à compter de sa signification au locataire. A défaut, la caution ne peut être tenue au
  paiement des pénalités ou des intérêts de retard. » C'est une obligation attachée à l'acte du commissaire de justice,
  pas à l'e-mail de Gerimmo. Voir aussi réf. 24 (article 2303).

### C. Points que le texte ne tranche pas
- **Partie 5, point 7 (protocole d'apurement, mention des délais du juge)** : L110-114 dit que le juge peut accorder
  jusqu'à trois ans de délais. Le texte ne dit rien d'un accord amiable ni d'une mention à y porter. Reste au juriste.
- **Partie 5, point 1 (adresse de notification d'une mise en demeure)** : l'article 24 ne traite pas de la mise en
  demeure amiable.

### D. Nouveautés
- Version « en vigueur depuis le 29 juillet 2023 » (L4) : six semaines (et non deux mois), clause obligatoire dans
  « tout contrat de bail ». Gerimmo est déjà à six semaines.
- L34-40 : le commissaire de justice signale le commandement à la commission de prévention des expulsions dès deux mois
  d'impayé ou une dette de deux loyers hors charges, pour un bailleur personne physique ou SCI familiale. Rien à coder ;
  utile dans une aide à l'écran des impayés.
- L66-71 : un bailleur personne morale (hors SCI familiale) ne peut pas assigner avant deux mois après la saisine de
  cette commission. Gerimmo n'en dit rien (non trouvé dans le code ; recherche par mots).

### E. Doutes sur le recueil
- Version consultée « au 21 novembre 2024 » (L4), soit deux ans avant l'édition du recueil. Rien ne prouve qu'aucune
  modification n'est intervenue depuis. Recoupement favorable : la fiche officielle lue le 24/11 (vérifiée le
  06/08/2026) dit aussi « 6 semaines ».
- L84 : « à la diligence de le commissaire de justice » (faute de grammaire), et L78-79 « les huissiers de justice »
  dans le même article. Cela ressemble à un remplacement automatique de mots ; le sens n'est pas touché.
- L110-114 : la condition « en situation de régler sa dette locative » est écrite deux fois dans la même phrase.

---

## Réf. 11 — Loi de 1989, article 22 (dépôt de garantie)

### A. Écarts confirmés

**R11-A1 — important — le résumé de la notice dit que le dépôt non rendu « produit intérêt »**
- Texte, L290 : « Le montant de ce dépôt de garantie ne porte pas intérêt au bénéfice du locataire. » et L293-295 :
  « A défaut de restitution dans les délais prévus, le dépôt de garantie restant dû au locataire est majoré d'une somme
  égale à 10 % du loyer mensuel en principal, pour chaque période mensuelle commencée en retard. »
- Code, `src/lib/documents/modeles/notice.ts:57` : « […] déduction faite des sommes justifiées restant dues au
  bailleur. À défaut, il produit intérêt au profit du locataire. »
- Correction minimale : remplacer la dernière phrase par la formule déjà juste du décompte
  (`decompte-restitution.ts:243-246`) : « À défaut de restitution dans le délai, le solde dû est majoré de 10 % du loyer
  mensuel hors charges pour chaque période mensuelle commencée en retard. » Attention : ce résumé est joint aux dossiers
  de signature ; le changer change son empreinte (Q40).

**R11-A2 — important — le reçu de dépôt choisit le plafond d'après le logement, pas d'après le bail**
- Texte, L260-261 : le dépôt « ne peut être supérieur à un mois de loyer en principal ». (Le plafond de deux mois du
  meublé vient de l'article 25-6, absent du recueil : voir réf. 20, E.)
- Code, `src/lib/documents/modeles/recu-depot.ts:144` : `plafond: ctx.lot.meuble ? "deux mois de loyer hors charges" :
  "un mois de loyer hors charges"`. La base, elle, décide d'après le type du bail :
  `mig. 20260914110000_plafond_depot_colocation.sql:5-10` (`p_type = 'meuble'` → 2, bail nu → 1).
- Conséquence constatée : un bail nu sur un logement coché « meublé » (cas reconnu en Q47, point 2) reçoit un reçu qui
  dit « ne peut excéder deux mois », alors que la base et le bail (`bail-nu.ts:250`) disent un mois. À l'inverse, un
  bail meublé sur un logement non coché dit « un mois ».
- Correction minimale : calculer la phrase avec la même règle que la base (type du bail, et ameublement du logement
  seulement pour une colocation), comme le fait déjà `conge-bailleur.ts:114`.

**R11-A3 — mineur — l'espace locataire donne un autre critère que le texte pour le délai de deux mois**
- Texte, L276-277 : un mois « lorsque l'état des lieux de sortie est conforme à l'état des lieux d'entrée » ; sinon deux
  mois (L269).
- Code : `src/app/locataire/[orgId]/logement/carte-conge.tsx:63`, `…/logement/page.tsx:229` et `…/faq/page.tsx:58`
  disent « 2 mois si des retenues sont justifiées ». Côté bailleur, `src/lib/regle-ecart-edl.ts:12-13` applique : tout
  changement d'état, « y compris une simple usure », porte le délai à deux mois. Les deux écrans de Gerimmo ne disent
  pas la même chose, et le critère montré au locataire (« retenues ») n'est pas celui du texte (« conforme »).
- Correction minimale : écrire au locataire la formule du texte (« 2 mois si l'état des lieux de sortie n'est pas
  conforme à celui d'entrée »), comme le font déjà le reçu, l'état des lieux et le décompte.

Conformités constatées (pas d'écart) :
- Délais et point de départ : `decompte-restitution.ts:241-243` (« délai maximal de N mois à compter de la remise des
  clés (un mois lorsque l'état des lieux de sortie est conforme à celui d'entrée, deux mois sinon) ») = L269-270 et
  L276-277.
- Majoration : `decompte-restitution.ts:243-246` = L293-295. Gerimmo l'imprime, il ne la calcule nulle part (constaté :
  aucune autre occurrence).
- Pas d'intérêt, pas de révision : `recu-depot.ts:87` (« Il ne porte pas intérêt et n'est pas révisé en cours de bail »)
  = L290-291.
- Retenues « dûment justifiées » (L272, L279) : le décompte n'est pas produit sans une pièce par retenue
  (`decompte-restitution.ts:62-65`, `lib/justificatif-retenue.ts`).

### B. Points que le texte tranche
- **Partie 1, point 25 (provision de 20 % sans clause au bail)** : L281-283 : « Lorsque les locaux loués se situent dans
  un immeuble collectif, le bailleur procède à un arrêté des comptes provisoire et peut, lorsqu'elle est dûment
  justifiée, conserver une provision ne pouvant excéder 20 % du montant du dépôt de garantie jusqu'à l'arrêté annuel des
  comptes de l'immeuble. » Le texte ne demande aucune clause au bail. Constaté côté code : Gerimmo ne propose pas cette
  provision (aucune occurrence). Pas d'écart : c'est une faculté. Allègement : « Le texte le permet sans clause ;
  Gerimmo ne l'offre pas. À décider par le dirigeant : l'ajouter ou non. »
- **Partie 1, point 30 (dépôt inchangé après un avenant)** : L290-291 : « Il ne doit faire l'objet d'aucune révision
  durant l'exécution du contrat de location, éventuellement renouvelé. » *Le code est conforme au texte fourni*
  (dépôt non modifié par l'avenant : `mig. 20261122190000_avenants_bail.sql:26`, commentaire lu). Point à retirer.
- **Partie 8, point 1 (d) (bloquer le décompte fait-il courir un risque ?)** : oui, le texte ne prévoit aucune
  suspension du délai (L269-279) et la majoration court « pour chaque période mensuelle commencée en retard » (L294-295).
  L'écran le dit déjà. Allègement : garder seulement (a), (b), (c).
- **Partie 2, point 3 (adresse à la sortie)** : L272-274 : « le locataire indique au bailleur ou à son mandataire, lors
  de la remise des clés, l'adresse de son nouveau domicile ». Voir R15-A1.

### C. Points que le texte ne tranche pas
- **Partie 2, point 4 (une usure normale rend-elle la sortie « non conforme » ?)** : le texte dit seulement « conforme »
  (L277). Interprétation : reste au juriste.
- **Partie 8, point 1 (a) à (c) (devis seul, un devis pour plusieurs retenues, état des lieux comme justificatif)** : le
  texte dit « dûment justifiées » sans dire par quelle pièce.
- **Partie 3, B4 (suivi déclaratif du dépôt)** : hors de l'article 22.

### D. Nouveautés
- L295-297 : la majoration « n'est pas due lorsque l'origine du défaut de restitution dans les délais résulte de
  l'absence de transmission par le locataire de l'adresse de son nouveau domicile ». Aucun document de Gerimmo ne le dit
  (constaté sur le décompte, le reçu et l'état des lieux). Ajout utile au décompte, une phrase.
- L299-301 : en cas de vente du logement, « la restitution du dépôt de garantie incombe au nouveau bailleur ». À
  rapprocher de Q52 (changement de propriétaire).
- L265-267 : pas de dépôt si le loyer est payable d'avance pour plus de deux mois. Sans objet aujourd'hui (paiement
  mensuel seulement : `bail-nu.ts:226`).

### E. Doutes sur le recueil
- Version consultée au 21 novembre 2024 (L257). Article complet, alinéas cohérents avec la fiche officielle lue le 24/11
  (vérifiée le 09/06/2026). Pas de signe d'altération.

---

## Réf. 12 — Loi de 1989, article 23 (charges, régularisation)

### A. Écarts confirmés

**R12-A1 — mineur — la note d'information sur le chauffage collectif n'est prévue nulle part**
- Texte, L346-350 : un mois avant la régularisation, le bailleur communique le décompte par nature de charges, le mode de
  répartition « et, le cas échéant, une note d'information sur les modalités de calcul des charges de chauffage et de
  production d'eau chaude sanitaire collectifs et sur la consommation individuelle de chaleur et d'eau chaude ».
- Code, `src/lib/documents/modeles/catalogue-gestion.ts:315-318` : le courrier porte le détail par nature, la clé de
  répartition, le justificatif, les modalités de consultation. Aucune mention de cette note (0 occurrence dans le
  fichier).
- Correction minimale : dans le courrier de régularisation, une ligne facultative « Note d'information chauffage / eau
  chaude collectifs : jointe / sans objet », affichée seulement quand le logement a un chauffage ou une eau chaude
  collectifs.

Conformités constatées :
- Six mois : `catalogue-gestion.ts:318` (« Les justificatifs restent à disposition pendant six mois à compter de l'envoi
  du décompte ») = L352-353.
- Étalement : `catalogue-gestion.ts:302` (« Régularisation effectuée après le terme de l'année civile suivant
  l'exercice : le locataire peut demander à régler ce complément par douzièmes ») = L358-360.
- Forfait interdit en bail nu hors colocation : `mig. 20260927106000_forfait_charges_bail_nu.sql:21-25` ; cohérent avec
  l'article 23 (provisions) et les articles 8-1 V et 25-10 (forfait en colocation et en meublé).

### B. Points que le texte tranche
- **Partie 2, point 8 (décompte par facture)** : L346-347 : « le décompte par nature de charges ainsi que, dans les
  immeubles collectifs, le mode de répartition entre les locataires ». Le courrier de Gerimmo demande bien un « détail
  des dépenses par nature et clé de répartition » (`catalogue-gestion.ts:315`), en texte libre. *Conforme au texte fourni
  pour l'intitulé* ; le contenu saisi reste au gestionnaire. Allègement : « Le texte exige un décompte par nature ;
  Gerimmo le demande en texte libre. Reste à décider s'il faut une saisie par nature imposée. »
- **Partie 1, point 33 (provision modifiée en cours de bail)** : L340-344 : les demandes de provisions « sont justifiées
  par la communication de résultats antérieurs arrêtés lors de la précédente régularisation et […] par le budget
  prévisionnel ». Le texte lie la provision à ces justificatifs ; il ne parle pas d'avenant. Côté code : non vérifié.

### C. Points que le texte ne tranche pas
- **Partie 2, point 7 et partie 5, point 15 (délai d'un mois : jusqu'à quoi ?)** : le texte dit « Un mois avant cette
  régularisation » (L346) sans définir le mot « régularisation » ni la sanction. La prudence de Gerimmo (phrase imprimée
  seulement si les dates la rendent vraie) n'est pas contredite.
- **Partie 6, point 11 (période d'occupation dans le courrier)** : l'article 23 n'en parle pas.

### D. Nouveautés
- L355-356 : sur demande du locataire, le bailleur transmet « le récapitulatif des charges du logement par voie
  dématérialisée ou par voie postale ». Fonction à prévoir côté espace locataire (non trouvée dans le code ; recherche
  par mots).
- L362-365 : le coût d'un contrat d'entreprise ou d'énergie se récupère « toutes taxes comprises ».

### E. Doutes sur le recueil
- Version consultée au 21 novembre 2024. L355 « A compter du 1er septembre 2015 » et L367-368 (note d'entrée en vigueur
  de 2021) sont cohérents. Rien d'anormal.

---

## Réf. 13 — Arrêté du 13 décembre 2017 (notice jointe au congé du bailleur)

Rappel du champ (L505-515) : la notice vaut pour le logement **non meublé** ; elle « ne s'applique pas, notamment, aux
logements loués meublés (art. 25-3) ».

### A. Écarts confirmés

**R13-A1 — bloquant — Gerimmo accepte un congé du bailleur reçu un jour trop tard**
- Texte, L567-568 : « Si le contrat de location arrive à terme le 15 juin, la lettre de congé doit être notifiée au
  locataire au plus tard le 15 décembre de l'année précédente. » L569-572 : terme le 30 juin → au plus tard le
  31 décembre ; terme le 31 août → au plus tard le 28 février. L577-578 : échéance au 20 septembre → le préavis court
  « à compter du 20 mars ». Règle, L555-557 : le délai en mois « expire le jour du dernier mois qui porte le même
  quantième que le jour de l'acte ».
- Code : le terme calculé par la base est le **dernier jour** du bail
  (`mig. 20260929120000_audit_baux_documents.sql:495` : `(v_debut + v_duree …)::date - 1`). Le contrôle accepte le congé
  tant que « présentation + préavis ≤ terme + 1 jour » :
  `mig. 20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql:679` (`if v_effet > v_terme + 1`), et son
  message annonce la date limite `(v_terme + 1) - préavis` (ligne 682). Même calcul dans le modèle :
  `src/lib/documents/modeles/conge-bailleur.ts:72-74`.
- Exemple : dernier jour du bail le 20 septembre. Gerimmo accepte un congé présenté le 21 mars (21 mars + 6 mois =
  21 septembre = terme + 1) et affiche le 21 mars comme date limite. La notice dit 20 mars. Un congé tardif ne vaut
  rien : le bail est reconduit (L543-545 : « A défaut, le contrat de location sera reconduit tacitement »).
- Correction minimale : remplacer `v_terme + 1` par `v_terme` aux deux endroits de la fonction et dans
  `congeBailleurDansLesDelais` ; corriger la date limite du message. Petite, mais elle touche une fonction de base
  réécrite plusieurs fois : à faire avec ses tests.
- Réserve : la notice ne vaut que pour le logement nu. Pour le meublé (préavis de trois mois, article 25-8), aucun
  exemple chiffré n'est dans le recueil ; le même calcul s'y applique par analogie (supposé). Appliquer la même règle
  partout est le choix prudent.

**R13-A2 — important — « le délai s'apprécie à la première présentation » : le texte dit la réception effective**
- Texte, L550-552 : « lorsque le congé est délivré par lettre recommandée avec demande d'avis de réception, le délai
  court à compter du jour de la réception de la lettre recommandée par le locataire, c'est-à-dire à partir de la remise
  effective de la lettre à son destinataire ». Meublé, article 25-8, L2073-2074 : « Ce délai court à compter du jour de
  la réception de la lettre recommandée ».
- Code, `src/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur.tsx:51` : « le délai s'apprécie à la première
  présentation ». La base enregistre la « date de première présentation » (`p_date_presentation`, même migration) et
  l'option du catalogue s'appelle « Présentation prévue au locataire » (`lib/documents/catalogue-options.ts:32`).
- Correction minimale : pour un congé du bailleur, écrire « date de réception par le locataire (remise effective de la
  lettre ; pour un acte de commissaire de justice, date de signification ; pour une remise en main propre, date de la
  remise) » et renommer le champ à l'écran. Ajouter : « Une lettre présentée mais non retirée ne fait pas courir le
  délai. »

**R13-A3 — important — le congé pour vendre ne reproduit pas les cinq premiers alinéas de l'article 15 II**
- Texte, L713-715 : « la notification du congé doit reproduire les cinq premiers alinéas du II de l'article 15 de la loi
  du 6 juillet 1989 ».
- Code, `conge-bailleur.ts:181-193` : la lettre résume l'offre de vente en ses propres mots ; aucun alinéa n'est
  reproduit.
- Correction minimale : insérer, dans le congé pour vente d'un logement nu, les cinq premiers alinéas du II de
  l'article 15 tels qu'ils figurent à la réf. 02 du recueil (hors de ma part : texte à prendre chez l'analyse 1).

**R13-A4 — important — la notice obligatoire n'est ni jointe ni annoncée**
- Texte, L503-504 : la notice « est obligatoirement jointe au congé délivré par le bailleur pour ces motifs »
  (reprise ou vente).
- Code : aucune occurrence de l'arrêté du 13 décembre 2017 ni d'une notice de congé dans `src/` (recherche faite). La
  lettre (`conge-bailleur.ts:216-274`) n'annonce aucune pièce jointe.
- Correction minimale : le recueil donne maintenant le texte entier de l'annexe (L428-990). L'ajouter comme annexe
  générée avec le congé pour vente ou pour reprise d'un logement nu, et écrire dans la lettre « Pièce jointe : notice
  d'information (arrêté du 13 décembre 2017) ». Avant de recopier, corriger la faute signalée en E (« 30 0000 € ») avec
  l'accord du dirigeant, ou reproduire tel quel.

**R13-A5 — important — un congé pour reprise peut être préparé pour n'importe quel bailleur**
- Texte, L637-642 : l'auteur du congé pour reprise peut être « le bailleur, personne physique ; le bailleur, société
  civile immobilière de famille […] ; tout membre de l'indivision ». Article 13, L1661-1666 : les articles 11 et 15
  peuvent être invoqués par une société civile « constituée exclusivement entre parents et alliés jusqu'au quatrième
  degré inclus » et par tout membre d'une indivision.
- Code : ni le modèle (`conge-bailleur.ts:196-207`) ni l'enregistrement
  (`mig. 20261112120300_…sql:629-638` : seuls le motif, le bénéficiaire et le prix sont contrôlés) ne regardent la
  qualité du bailleur, pourtant connue (`src/lib/qualite-bailleur.ts:79-86` distingue « SCI » et « Personne morale »).
- Correction minimale : refuser le motif « reprise » quand un bailleur est « SCI » (non familiale) ou « Personne
  morale », avec un message clair. Pour une SCI familiale, demander « nom et adresse de l'associé bénéficiaire »
  (L678-679).

**R13-A6 — mineur — « le notaire doit vous notifier » : le texte dit le bailleur, ou le notaire à défaut**
- Texte, L745-748 : le prix ou les conditions plus avantageux « doivent être notifiés au locataire par le bailleur ou
  par le notaire si le bailleur ne s'en est pas chargé. Si cette notification n'est pas faite, la vente consentie est
  nulle. »
- Code, `conge-bailleur.ts:191-193` : « Si le logement est ensuite vendu à des conditions ou à un prix plus avantageux,
  le notaire doit vous notifier ces conditions et ce prix (article 15-II). »
- Correction minimale : « le bailleur, ou à défaut le notaire, doit vous notifier ces conditions et ce prix ». Ce
  paragraphe disparaît de toute façon si R13-A3 est appliqué (le texte de loi reproduit le dit lui-même).

**R13-A7 — important — les deux cas « logement acheté occupé » ne sont pas connus de Gerimmo**
- Texte, L662-665 (reprise) : si le terme du bail intervient « moins de deux ans après l'acquisition du logement, le
  congé pour reprise […] ne prendra effet qu'à l'expiration d'une durée de deux ans à compter de la date
  d'acquisition ». L696-699 (vente) : si le terme intervient « moins de trois ans après l'acquisition », le congé pour
  vendre ne peut être délivré « qu'au terme de la première reconduction tacite ou du premier renouvellement ».
- Code : aucune date d'acquisition n'existe dans les baux ni dans le calcul du congé (recherche « acquisition » : rien
  dans ce domaine). La date d'effet est toujours le terme du bail (`conge-bailleur.ts:128-151`).
- Correction minimale : sans nouvelle donnée, ajouter à l'écran de préparation une question « Avez-vous acheté ce
  logement déjà loué, depuis moins de trois ans ? » ; si oui, ne pas produire le congé et renvoyer à un professionnel.
  Solution complète (date d'acquisition et calcul) : moyenne.

**R13-A8 — mineur — la mention sur le locataire protégé oublie la personne à charge**
- Texte, L593-598 : la protection vaut aussi pour « un locataire ayant à sa charge une personne de plus de 65 ans vivant
  habituellement dans le logement », sous conditions de ressources. Même règle en meublé (L2090-2093).
- Code, `conge-bailleur.ts:267-270` : seule la situation du locataire âgé de plus de soixante-cinq ans est citée.
- Correction minimale : ajouter une phrase sur la personne à charge. Sans objet si la notice entière est jointe
  (R13-A4), pour le logement nu ; à garder pour le meublé.

Conformités constatées :
- Mentions du congé pour reprise (L672-679) : intention de reprendre pour habiter, nom et adresse du bénéficiaire, lien,
  justification du caractère réel et sérieux. Le modèle les exige toutes et ne se génère pas sans elles
  (`conge-bailleur.ts:168-171` et 197-202 : nom, lien, adresse, « Raisons de la reprise »).
- Loyer dû seulement jusqu'au départ (L620-621) : `conge-bailleur.ts:264-266`.
- Nom du bailleur quand un mandataire écrit (L525-527) : cartouche « Bailleur » (`conge-bailleur.ts:222`).

### B. Points que le texte tranche
- **Partie 1, point 14 (congé reçu le 21 mars pour un dernier jour au 20 septembre : tardif ?)** : oui, tardif, pour le
  logement nu (L577-578, citation en R13-A1). *Écart, voir R13-A1.* Pour le meublé (21 juin), la notice ne s'applique
  pas : reste au juriste, même logique supposée. Formulation : « Tranché pour le nu par la notice officielle ; corriger
  le calcul. Meublé : à confirmer. »
- **Partie 1, point 15 (lettre présentée mais non retirée)** : elle ne fait pas courir le délai (L550-552). *Écart, voir
  R13-A2.* Point à retirer après correction.
- **Partie 1, point 16 (quels alinéas de l'article 15 II ?)** : « les cinq premiers alinéas du II » (L713-714). *Écart,
  voir R13-A3.* Le contenu exact des alinéas est à la réf. 02.
- **Partie 1, point 17 (adresse du bénéficiaire)** : en logement nu, c'est une mention obligatoire de la notification
  (L675). En meublé, L2060-2062 : « A peine de nullité, le congé donné par le bailleur doit indiquer le motif allégué
  et, en cas de reprise, les nom et adresse du bénéficiaire de la reprise ainsi que la nature du lien ». *Le code est
  conforme au texte fourni* (adresse exigée). Point à retirer ; la nullité en logement nu se lit à l'article 15
  (réf. 02).
- **Partie 1, point 18 (congé sans la notice : nul ?)** : le texte dit qu'elle est « obligatoirement jointe »
  (L503-504). Il ne dit pas la sanction ; L916-920 rappelle que le juge apprécie « au cas par cas ». *Écart, voir
  R13-A4* pour l'obligation ; la sanction reste au juriste.
- **Partie 1, point 19 (SCI non familiale et reprise)** : non (L637-642 et L1661-1666). *Écart, voir R13-A5.*
- **Partie 1, point 38 (les quatre mentions du congé pour reprise)** : ce sont celles de L672-677, plus l'associé
  bénéficiaire pour une SCI familiale (L678-679). *Conforme pour la reprise par une personne physique.* Pour la vente :
  prix et conditions, désignation des locaux, cinq alinéas (L706-715) ; la désignation est reprise par le cartouche
  « Logement loué » (adresse seule) alors que le texte dit « le congé reprend la désignation des locaux loués figurant
  au bail » et « doit décrire avec exactitude les locaux loués et quelles sont leurs dépendances » (L709-711) : à
  compléter (supposé insuffisant : l'adresse ne décrit pas les dépendances).
- **Partie 6, point 6 (notification par le notaire)** : oui, il faut la réserve. *Écart, voir R13-A6.*
- **Partie 5, point 4 (congé du bailleur pendant le préavis du locataire)** : non tranché par la notice.

### C. Points que le texte ne tranche pas
- **Partie 6, points 4 et 5 (« deux premiers mois », nullité de l'offre ou du congé)** : la notice dit seulement que le
  congé « ouvre au locataire un délai de deux mois pour l'accepter » (L729) et que le locataire qui n'accepte pas « doit
  quitter les lieux au plus tard le dernier jour du préavis » (L734-736). Le mot à mot est à l'article 15 II (réf. 02).
- **Destinataires du congé** : L530-538 exige un congé à chaque époux quand le bailleur est informé du mariage. Gerimmo
  ne connaît pas la situation de famille (voir R17-A1). À signaler au dirigeant ; pas d'écart chiffrable.

### D. Nouveautés
- L580-583 : pas de congé possible tant que l'immeuble fait l'objet d'une procédure d'insalubrité ou de péril. Inconnu
  de Gerimmo (aucune occurrence).
- L722-725 : pas de droit de préemption quand la vente se fait à un parent jusqu'au troisième degré. La lettre de
  Gerimmo affirme toujours « vaut offre de vente » (`conge-bailleur.ts:183-185`).
- L771-782 : règles propres à la vente par lots de plus de cinq logements par une personne morale. Inconnu de Gerimmo.

### E. Doutes sur le recueil
- **L936-937 : « 30 0000 € »** pour l'amende d'une personne morale. Chiffre mal formé ; l'article 25-8 du même recueil
  dit « 30 000 € » (L2114). À ne pas recopier sans correction.
- Trois dates de consultation différentes pour un même arrêté (15/08/2026 L386, 13/07/2026 L422, 20/10/2026 L425).
- Texte daté dans sa rédaction : « acte d'huissier » (L520), « déclaration au greffe » pour un litige d'au plus 4 000 €
  (L880-889), « Ministère de la cohésion des territoires » (L974). Le recueil dit « dernière mise à jour 01/01/2020 »
  (L422). Ce sont des faiblesses du texte officiel, pas forcément du recueil.
- Le rectificatif (L414-417 : « deux ans » → « trois ans » au point 2-2-2) est bien intégré (L697 : « trois ans »). Le
  point 2-1-4 garde « deux ans » (L664) : cohérent, il concerne la reprise.
- Adresses internet coupées par des espaces (L860, L943, L971) : défaut d'extraction du PDF.

---

## Réf. 14 — Loi de 1989, articles 3-2 (état des lieux) et 3-3 (diagnostics)

### A. Écarts confirmés

**R14-A1 — mineur — le résumé de la notice énonce la présomption sans son exception**
- Texte, L1025-1027 : « la présomption établie par l'article 1731 du code civil ne peut être invoquée par celle des
  parties qui a fait obstacle à l'établissement de l'acte ou à sa remise à l'une des parties ».
- Code, `notice.ts:61` : « À défaut d'état des lieux, le locataire est présumé avoir reçu le logement en bon état de
  réparations locatives. » Le décompte de restitution, lui, dit bien l'exception (`decompte-restitution.ts:169-173`).
- Correction minimale : ajouter « sauf si le bailleur a fait obstacle à son établissement ».

**R14-A2 — mineur — l'état des risques est exigé partout, le texte le limite à certaines zones**
- Texte, L1077-1079 : « Dans les zones mentionnées au I de l'article L. 125-5 du code de l'environnement, le dossier de
  diagnostic technique est complété à chaque changement de locataire par l'état des risques ».
- Code, `mig. 20261027100200_diagnostics_validite_dpe_et_rapports.sql:81-87` : la mise en location est bloquée par
  « ERP absent ou expiré » pour tout bien, sans condition de zone (et même hors habitation : la condition
  `v_habitation` ne couvre que le DPE, lignes 65-80).
- Correction minimale : aucune urgence (Gerimmo demande plus que le texte). Au minimum, changer le message : « État des
  risques absent ou expiré (obligatoire dans les zones à risques ; vérifiez sur georisques) ». Laisser passer un
  logement hors zone demanderait une case « hors zone » : petite.

Conformités constatées :
- Délai pour compléter l'état des lieux d'entrée : `src/lib/textes-signature-actes.ts:14-15` (« dans les dix jours qui
  suivent son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe »)
  = L1029-1030 (« dans un délai de dix jours à compter de son établissement ») et L1033-1034. La note du code « À relire
  par le juriste » peut être levée : le texte dit bien « établissement », pas « signature ».
- État des lieux « établi contradictoirement et amiablement », « joint au contrat » : `edl.ts:194-197` = L1016-1017.
- Liste du dossier de diagnostic annoncée au bail (`bail-nu.ts:268-269` : DPE, ERP, plomb, amiante, électricité, gaz)
  = L1051-1079.

### B. Points que le texte tranche
- **Partie 1, point 11 (plomb, électricité, gaz exigés avant la signature ?)** : L1048-1049 : le dossier « est annexé au
  contrat de location lors de sa signature ou de son renouvellement et comprend » le DPE, le plomb, l'amiante,
  l'électricité et le gaz (L1051-1075). Ils font donc tous partie du dossier dû à la signature. Les conditions qui les
  rendent applicables (âge de l'immeuble, des installations) sont renvoyées à d'autres textes, absents du recueil.
  Constaté côté code : seuls le DPE et l'état des risques bloquent ; pour les autres, seul un diagnostic « déposé et
  expiré » bloque (même migration, lignes 88-95). Formulation : « Le principe est tranché : ils sont dus à la signature
  quand ils s'appliquent. Reste à lire les textes qui fixent quand ils s'appliquent. »
- **Partie 2, point 14 (bail repris, état des lieux d'entrée papier)** : la présomption et sa limite sont à L1025-1027
  et à l'article 1731 (L3115-3116). Le texte ne dit pas quelle preuve garder : reste au juriste pour la preuve.
- **Partie 5, point 16 (a) (numéro ou index du compteur)** : L1036-1038 : le bailleur complète les états des lieux « par
  les relevés des index pour chaque énergie ». Le texte demande l'index, pas le numéro. *Conforme* : Gerimmo imprime
  « — » pour un numéro absent et exige l'index avant signature (`edl.ts:209-222`). (a) à retirer ; (b) et (c) restent.

### C. Points que le texte ne tranche pas
- **Partie 2, point 1 (signature à distance par SMS après la visite)** : L1016-1017 exige « contradictoirement et
  amiablement » ; rien sur la signature à distance. Reste au juriste.
- **Partie 5, point 14 (chiffrage dans l'état des lieux)** : non traité.
- **Partie 6, point 15 et partie 8, point 4 (plusieurs DPE)** : non traité.

### D. Nouveautés
- L1082-1085 : en zone de bruit d'un aérodrome, le dossier est complété par un document qui l'indique. Aucun type de
  diagnostic ni mention de ce genre dans Gerimmo (liste des types : `mig. 20260729_sprint2_diagnostics_cle_equipements.
  sql:12-15` ; aucune occurrence « aérodrome »).
- L1087-1088 : le dossier « est communiqué au locataire par voie dématérialisée, sauf opposition explicite de l'une des
  parties ». Bon pour la signature électronique : l'envoi des diagnostics par voie électronique est la règle.
- L1094-1097 : le bailleur tient le DPE à la disposition de tout candidat et lui fournit l'état des risques « lors de la
  première visite ». Rien dans Gerimmo sur la phase de visite (supposé : non cherché en détail).
- L1036-1041 (alinéa ajouté par la loi de 2021) : l'extrait de l'état des lieux portant les index est mis à la
  disposition du diagnostiqueur qui le demande.

### E. Doutes sur le recueil
- Article 3-3 : « depuis le 01/01/2023 » avec un identifiant d'article en « 043… » (version de 2021) : cohérent avec la
  note de L1099-1101. Rien d'anormal.

---

## Réf. 15 — Décret n° 2016-382 du 30 mars 2016 (état des lieux, vétusté)

### A. Écarts confirmés

**R15-A1 — important — l'état des lieux de sortie ne porte pas la mention exigée sur le nouveau domicile**
- Texte, L1159-1160 : à la sortie, l'état des lieux comporte « L'adresse du nouveau domicile ou du lieu d'hébergement du
  locataire ».
- Code, `src/lib/documents/modeles/edl.ts:277` : « Adresse de restitution du dépôt de garantie : … » (champ
  `adresse_restitution_depot`).
- Correction minimale : changer le libellé imprimé et le libellé de saisie en « Adresse du nouveau domicile ou du lieu
  d'hébergement du locataire ». La donnée est la même. Elle sert aussi à l'article 22 (L272-274 et L295-297). Attention
  à l'empreinte des états des lieux déjà préparés pour signature (Q40).

**R15-A2 — mineur (mode agence, hors palier 1) — le domicile du bailleur manque quand un mandataire établit l'acte**
- Texte, L1149-1151 : « d) Le nom ou la dénomination des parties et le domicile ou le siège social du bailleur ; e) Le
  cas échéant, le nom ou la dénomination et le domicile ou le siège social des personnes mandatées ».
- Code : l'en-tête de l'état des lieux est celui de l'« expéditeur » (`edl.ts:184`), qui est l'agence en mode agence
  (`communs.ts:316-333`). Les cartouches ne portent que Locataire, Bail, Établi le, Personnes présentes
  (`edl.ts:188-193`). Le bailleur n'apparaît que par son nom dans le cadre de signature (`edl.ts:297`).
- Correction minimale : ajouter un cartouche « Bailleur : nom, domicile ou siège ». Chez un propriétaire qui gère
  lui-même, l'en-tête porte déjà son nom et son adresse.

**R15-A3 — mineur — la date de l'état des lieux d'entrée peut rester en blanc sur celui de sortie**
- Texte, L1161 : à la sortie, « La date de réalisation de l'état des lieux d'entrée ».
- Code : `edl.ts:123` (`mentionEdlEntree`) imprime la date quand l'entrée est signée dans Gerimmo, sinon un blanc à
  compléter à la main (décrit dans JURISTE.md, partie 2, point 16 ; fonction lue).
- Correction minimale : demander la date à la saisie de la sortie quand l'entrée a été faite hors Gerimmo (avec le choix
  « aucun état des lieux d'entrée »).

Conformités constatées (article 2, L1145-1158) : type et date (`edl.ts:160`, 191), localisation (sous-titre), compteurs
(`edl.ts:201-222`), clés (`edl.ts:225-242`), état par pièce avec observations et photos (`edl.ts:163-178`), signatures
(`edl.ts:296-299`), évolutions depuis l'entrée (tableau « Synthèse », `edl.ts:262-275`). Article 3, 2° (forme
comparable) : même modèle pour l'entrée et la sortie.

### B. Points que le texte tranche
- **Partie 2, point 3** : oui, la formule du décret doit être imprimée. *Écart, voir R15-A1.* Point à retirer après
  correction.
- **Partie 2, point 15 (domicile du bailleur en mode agence)** : oui (L1149-1151). *Écart, voir R15-A2.*
- **Partie 2, point 16 (date de l'entrée sur la sortie)** : la mention est exigée (L1161). *Écart mineur, voir R15-A3.*
- **Partie 2, point 2 (note sur cinq niveaux)** : L1155-1157 : « la description précise de l'état des revêtements des
  sols, murs et plafonds, des équipements et des éléments du logement. Il peut être complété d'observations ou de
  réserves et illustré d'images ». Les observations sont donc facultatives dans le texte (« peut »). Savoir si une note
  suffit comme « description précise » reste une interprétation. Formulation : « Le texte rend les observations
  facultatives ; reste à savoir si une note à cinq niveaux est une description précise. »
- **Partie 5, point 13 (quelle date porte l'état des lieux ?)** : L1147 : « Sa date d'établissement ». Gerimmo imprime
  la date du constat (`edl.ts:292-294`). *Conforme au texte fourni.* Point à retirer.
- **Partie 5, point 16 (a)** : L1152 : « Le cas échéant, les relevés des compteurs individuels » ; L1153 : « Le détail et
  la destination des clés ». Index et clés sont des mentions attendues ; le numéro du compteur n'est pas cité.
- **Partie 2, point 5 (grille de vétusté choisie seul par le bailleur)** : L1189-1192 : les parties « peuvent convenir
  de l'application d'une grille de vétusté dès la signature du bail, choisie parmi celles ayant fait l'objet d'un accord
  collectif ». Une grille est donc un accord des deux parties, pris dans une liste. Le bailleur ne peut pas appeler
  « grille de vétusté » ses propres durées. Constaté : l'écran le dit honnêtement (`formulaire-restitution.tsx:659-662` :
  « ne viennent d'aucune grille de vétusté convenue »), mais le décompte imprime « Vétusté appliquée — 3/10 ans — décote
  30 % » sans cette précision (`decompte-restitution.ts:74-79`). Proposition : ajouter au décompte « durée de vie
  retenue par le bailleur, en l'absence de grille convenue au bail ». Le reste du point 5 (retenir 100 %) reste ouvert.

### C. Points que le texte ne tranche pas
- **Partie 2, point 1 et partie 5, point 17** : L1179-1180 dit que l'état des lieux « est remis en main propre ou par
  voie dématérialisée à chacune des parties […] au moment de sa signature ». La voie électronique est donc admise ; la
  signature à distance après la visite n'est pas traitée.
- **Partie 5, point 14** : le décret liste un contenu minimal (« au moins », L1143) ; il n'interdit ni n'impose le
  chiffrage.

### D. Nouveautés
- L1175 : « Le logement contient les seuls meubles ou équipements mentionnés au contrat de location ». Lien direct avec
  l'inventaire du meublé (réf. 20).
- Aucune modification depuis 2016 selon le recueil (L1118).

### E. Doutes sur le recueil
- Texte complet (six articles, signatures). Rien d'anormal.

---

## Réf. 16 — Loi de 1989, articles 4, 6, 7, 7-1 et 20-1

### A. Écarts confirmés

**R16-A1 — important — Gerimmo déclare « prescrit » un complément de charges à partir d'une date que le texte ne fixe pas**
- Texte, L1501-1502 : les actions sont prescrites par trois ans « à compter du jour où le titulaire d'un droit a connu
  ou aurait dû connaître les faits lui permettant d'exercer ce droit ».
- Code : `mig. 20260929130000_audit_gestion.sql:137-138` et `mig. 20261028155855_regularisations_depuis_fournitures.
  sql:106` refusent toute régularisation en faveur du bailleur quand le 31 décembre de l'exercice a plus de trois ans :
  « Exercice prescrit : aucun complément ne peut être réclamé au-delà de trois ans ». Écran :
  `…/baux/[bailId]/formulaire-loyers.tsx:1001` (« Un complément ne se réclame plus au-delà de trois ans (art. 7-1) »).
- L'écart : Gerimmo fait partir le délai de la fin de l'exercice. Le texte le fait partir du jour où le bailleur a connu
  les dépenses (par exemple l'approbation des comptes de copropriété, plus tardive). Gerimmo peut donc refuser un
  complément encore dû, en affirmant qu'il est prescrit.
- Correction minimale : transformer le refus en avertissement avec confirmation (« Cet exercice a plus de trois ans : le
  complément est peut-être prescrit. Le délai court du jour où vous avez connu ces dépenses. »). C'est aussi la réponse
  reçue (2 · 6 : « avertir sans refuser »).

**R16-A2 — mineur — le rappel d'assurance mélange deux procédures distinctes**
- Texte, L1455-1457 : la résiliation de plein droit pour défaut d'assurance suppose une clause et « ne produit effet
  qu'un mois après un commandement demeuré infructueux ». L1459-1466 : à part, après « un délai d'un mois à compter
  d'une mise en demeure non suivie d'effet », le bailleur peut souscrire une assurance pour le compte du locataire, et
  cette mise en demeure « vaut renoncement à la mise en œuvre de la clause » de résiliation.
- Code, `src/lib/documents/modeles/rappel-assurance.ts:53-56` : « Son défaut, après mise en demeure restée sans effet,
  constitue un motif de résiliation, ou permet au bailleur de souscrire une assurance pour le compte du locataire ».
  Et `notice.ts:73` : le locataire « s'assure contre les risques locatifs et en justifie chaque année », alors que le
  texte dit « lors de la remise des clés puis, chaque année, à la demande du bailleur » (L1451-1452).
- Correction minimale : « À défaut, le bailleur peut soit faire jouer la clause de résiliation du bail, un mois après un
  commandement resté sans effet, soit, un mois après une mise en demeure, souscrire une assurance pour votre compte,
  récupérable par douzième. » Et dans le résumé : « en justifie à la remise des clés puis chaque année, à la demande du
  bailleur ».

**R16-A3 — mineur — le bail parle encore d'un « seuil de consommation d'énergie finale »**
- Texte, L1321-1327 : le logement décent répond « à un niveau de performance minimal au sens de l'article L. 173-1-1 ».
  L'article 160 de la loi de 2021 a supprimé les mots « défini par un seuil maximal de consommation d'énergie finale par
  mètre carré et par an » (L3030-3031). Le décret ne donne plus que des classes (L2679-2692) ; un seuil en
  kilowattheures ne subsiste que pour Saint-Pierre-et-Miquelon (L2846-2848).
- Code, `mentions-location.ts:24` : « La consommation d'énergie finale doit également respecter le seuil applicable. »
- Correction minimale : supprimer cette phrase. Réserve : vérifier d'abord qu'elle ne vient pas du contrat type
  (réf. 8, hors de ma part). Elle touche l'empreinte des baux préparés (Q40).

**R16-A4 — mineur — un logement classé G est bloqué partout, y compris outre-mer, et qualifié d'« interdit »**
- Texte, L1339-1342 : en Guadeloupe, Martinique, Guyane, à La Réunion et à Mayotte, le niveau exigé est « a) A compter
  du 1er janvier 2028, entre la classe A et la classe F ». L1343-1344 : les logements hors critères « sont considérés
  comme non décents ». L1513-1515 : le locataire peut demander la mise en conformité « sans qu'il soit porté atteinte à
  la validité du contrat en cours ».
- Code, `mig. 20261027100200_diagnostics_validite_dpe_et_rapports.sql:75-80` : tout DPE en classe G bloque la mise en
  location, sans regarder le département, avec le message « DPE classe G : logement interdit à la location (loi
  Climat) ».
- Correction minimale : message « DPE classe G : logement non décent depuis le 1er janvier 2025 (métropole) ». Exception
  outre-mer jusqu'au 31 décembre 2027 : petite, mais seulement utile si Gerimmo a des clients outre-mer. Le rappel
  imprimé au bail, lui, donne déjà le bon calendrier (`mentions-location.ts:20-23` = L1336-1342).

Conformités constatées :
- Clause « défaut d'assurance » du bail (`mentions-location.ts:45` : « ne produit effet qu'un mois après un commandement
  demeuré infructueux ») = L1455-1457.
- Clause « troubles de voisinage constatés par une décision de justice passée en force de chose jugée »
  (`mentions-location.ts:46`) et clause « servitude de résidence principale » avec le délai fixé par le maire
  (`mentions-location.ts:47`) = article 4 g), L1260-1268.
- Frais de relance et d'envoi des quittances laissés au bailleur
  (`…/baux/[bailId]/avertissement-clauses.tsx:4`) = article 4 p), L1300-1302.
- Révision du loyer perdue après un an (Q23) : L1504-1505 : « l'action en révision du loyer par le bailleur est
  prescrite un an après la date convenue par les parties dans le contrat de bail pour réviser ledit loyer ».

### B. Points que le texte tranche
- **Partie 2, point 6 (point de départ des trois ans)** : c'est le jour où le bailleur a connu ou aurait dû connaître les
  faits (L1501-1502). *Écart, voir R16-A1.* Formulation : « Point de départ tranché par le texte. Reste à dire, pour une
  copropriété, quelle date le prouve (approbation des comptes ?). »
- **Partie 2, point 12 (attestation d'assurance avant la signature ?)** : L1451-1452 : le locataire en justifie « lors
  de la remise des clés puis, chaque année, à la demande du bailleur ». Elle n'est pas dans la liste des pièces du
  candidat (réf. 19). Voir R19-A1.
- **Partie 6, point 9 (autorisation de travaux : qui autorise qui ?)** : le texte distingue deux cas. Travaux du
  **locataire** : article 7 f), L1437 : « De ne pas transformer les locaux et équipements loués sans l'accord écrit du
  propriétaire » ; pour l'adaptation au handicap ou la rénovation énergétique, demande par lettre recommandée, et
  « L'absence de réponse dans un délai de deux mois […] vaut décision d'acceptation du bailleur » (L1444-1447). Travaux
  du **bailleur** : article 7 e), L1419-1421 : le locataire « est informé par le bailleur de leur nature et des
  modalités de leur exécution par une notification de travaux », remise en main propre ou par lettre recommandée. Donc :
  une « autorisation de travaux » est l'accord écrit du bailleur donné au locataire ; les travaux du bailleur font
  l'objet d'une notification, pas d'une autorisation. Proposition : le document s'ouvre par « Le bailleur autorise le
  locataire à réaliser les travaux suivants : … », et un second modèle « Notification de travaux » est à créer pour
  l'autre cas. Point à retirer après correction.
- **Partie 6, point 16 (c) et partie 7, point 4 (délai d'un an : à partir de quand ?)** : à partir de « la date convenue
  par les parties dans le contrat de bail pour réviser » (L1504-1505). (c) est tranché : *conforme*. Le dernier jour
  exact (veille ou jour anniversaire) n'est pas dit : reste ouvert.
- **Partie 1, point 3 (clauses « assurance » et « troubles » imprimées par défaut)** : l'article 4 g) admet ces deux
  motifs de résiliation de plein droit (L1260-1264). Leur impression par défaut relève du contrat type (réf. 8).
- **Partie 2, point 11 (prélèvement)** : article 4 c), L1248-1249 : est réputée non écrite la clause « qui impose comme
  mode de paiement du loyer l'ordre de prélèvement automatique ».

### C. Points que le texte ne tranche pas
- **Partie 1, point 9 (bail d'avant 2025 sur un logement G : dès la première reconduction ?)** : l'article 6 (L1336) et
  l'article 160 II (L3063 : « Le I du présent article entre en vigueur le 1er janvier 2025 ») ne contiennent aucune
  règle transitoire par contrat, contrairement à l'article 159 IV. Lecture à confirmer par le juriste.
- **Partie 1, point 10 (activer un bail sur un logement G avec une simple alerte)** : le texte qualifie le logement de
  « non décent » et laisse le contrat valable (L1343-1344, L1513-1515) ; il ne dit pas ce qu'un logiciel doit bloquer.
  Choix du dirigeant, éclairé par le juriste.
- **Partie 1, point 8 (révision sans DPE valide)** : non traité.
- **Partie 5, points 3 et 5** : non traités.

### D. Nouveautés
- **1er janvier 2028 (dans treize mois)** : la classe F devient non décente en métropole (L1337, L2684). Gerimmo ne
  bloque que la lettre « G », écrite en dur dans la base (même migration, ligne 77). À prévoir : une règle par date.
  Même date : début de l'exigence (classe F au plus) outre-mer.
- **Article 7 a), version du 15 juin 2025** (L1383, L1389-1391) : « Le paiement partiel du loyer par le locataire réalisé
  en application de l'article L. 843-1 du code de la construction et de l'habitation ne peut être considéré comme un
  défaut de paiement ». Quand la CAF conserve l'aide d'un logement non décent, le locataire ne paie que le reste, et ce
  n'est pas un impayé. Gerimmo relancerait ce locataire comme un mauvais payeur (aucune occurrence de ce cas dans le
  code ; recherche par mots). À traiter au moins par une mention dans l'écran des impayés.
- **Article 7 f)** (L1442-1449) : travaux de rénovation énergétique aux frais du locataire, accord tacite du bailleur
  après deux mois, sans remise en état au départ.
- **Article 7 h) et article 4 g)** (version du 21 novembre 2024) : servitude de résidence principale. Déjà prise en
  compte dans le bail (`mentions-location.ts:31-36` et 47).
- **Article 20-1** (L1530-1543) : le juge ne peut pas ordonner les travaux de performance énergétique dans deux cas
  (copropriété, contraintes patrimoniales). Information utile pour l'alerte « DPE classé G ».

### E. Doutes sur le recueil
- L1232 : « L'article 4, absent de la V5, est rétabli. L'article 7-1, auparavant dupliqué, figure une seule fois. » Le
  recueil a donc connu des oublis ; l'article 4 a été ajouté tard. Lettres a) à t) complètes et dans l'ordre.
- Article 4 : « en vigueur depuis le 21 novembre 2024 » mais adresse datée du 22/03/2026 (L1237-1238) ; article 20-1 :
  consulté au 26/08/2025 et « également vu au 21/08/2026 » (L1509). Dates de consultation dispersées, sans incohérence.
- Article 7 g) : après « g) … attestation de l'assureur ou de son représentant ; » le texte continue par des alinéas
  sans lettre, puis « h) » (L1451-1486). La mise en page suit celle d'un article consolidé ; pas de phrase tronquée.

---

## Réf. 17 — Loi de 1989, articles 8-1 (colocation), 11 (durée réduite) et 13

### A. Écarts confirmés

**R17-A1 — important — la clause de solidarité « colocation » est imprimée pour tout bail à plusieurs locataires, époux compris**
- Texte, L1566-1570 : la colocation est la location d'un même logement par plusieurs locataires, « à l'exception de la
  location consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de
  la conclusion initiale du contrat ». L'extinction à six mois (L1610-1613) est une règle de la colocation. Entre
  époux : code civil, article 220 (L3098-3099, « toute dette ainsi contractée par l'un oblige l'autre solidairement »)
  et article 1751 (L3123-3127, bail réputé appartenir aux deux).
- Code : `bail-nu.ts:252-255` et `bail-meuble.ts:287-290` impriment, dès qu'il y a plus d'un locataire
  (`plusieursLocataires = ctx.locataires.length > 1`, `bail-nu.ts:85`) : « En cas de congé de l'un d'eux, la solidarité
  s'éteint six mois après la date d'effet du congé, ou dès qu'un nouveau locataire le remplace au bail. » Gerimmo n'a
  aucune donnée « mariés » ou « pacsés » (recherche « époux », « pacs », « conjoint » : aucune donnée, seulement du
  texte dans le congé pour reprise). La base applique aussi les six mois à tout départ
  (`mig. 20260929120000_audit_baux_documents.sql:699-757`).
- Correction minimale : une case au bail « Les locataires sont mariés ou pacsés entre eux (et seuls au bail) ». Cochée :
  la clause imprimée s'arrête à « tenus solidairement et indivisiblement de l'exécution du présent contrat », sans la
  phrase des six mois, et le départ d'un seul ne calcule pas de fin de solidarité.

**R17-A2 — important — un bail nu « à durée réduite » imprime « trois ans » et n'indique ni la durée ni les raisons**
- Texte, L1635-1638 : « les parties peuvent conclure un contrat d'une durée inférieure à trois ans mais d'au moins un
  an. Le contrat doit mentionner les raisons et l'événement invoqués. » L1635 : faculté du « bailleur personne
  physique » ; article 13 (L1661-1666) : aussi la SCI familiale et l'indivision.
- Code, `bail-nu.ts:189-199` : la durée imprimée est toujours « trois ans » ou « six ans »
  (`dureeBailNuAnnees`), même quand `duree_reduite_evenement` est rempli ; s'y ajoute seulement « Un contrat d'une durée
  réduite (au moins un an) n'est possible que si un événement précis justifie la reprise […] : [événement] ». La durée
  convenue n'est pas enregistrée (`mig. 20260927103000_…sql:37-39` : « la durée convenue n'est pas enregistrée, le terme
  ne peut pas se calculer »). Aucun contrôle de la qualité du bailleur (`src/app/actions/baux.ts:355` enregistre le
  texte tel quel).
- Conséquence : le contrat dit à la fois « trois ans » et « durée réduite ». Il ne dit pas la durée réelle.
- Correction minimale : tant que la durée réduite n'est pas une vraie donnée, refuser de générer le bail quand le champ
  est rempli, avec le message « Gerimmo ne sait pas encore préparer un bail à durée réduite ». Solution complète
  (durée, raisons, événement, contrôle « personne physique, SCI familiale ou indivision », confirmation deux mois avant
  le terme, L1640-1641) : moyenne.

**R17-A3 — important — en colocation, l'acte de cautionnement peut ne désigner aucun colocataire**
- Texte, L1623-1625 : l'acte de cautionnement d'une colocation « identifie nécessairement, sous peine de nullité, le
  colocataire pour lequel l'extinction de la solidarité met fin à l'engagement de la caution ».
- Code, `cautionnement.ts:95-102` : si le garant n'est pas rattaché à un colocataire (`garant_de` vide), l'acte garantit
  « les obligations de » tous les locataires, et la mention « Colocation — cautionnement nominatif » n'est imprimée que
  si `locataireCouvert` existe (`cautionnement.ts:185-190`). Rien ne refuse l'acte dans ce cas.
- Correction minimale : sur un bail à plusieurs locataires (hors époux ou pacsés, voir R17-A1), refuser l'acte tant que
  le garant n'est pas rattaché à un colocataire nommé.

**R17-A4 — mineur — la phrase sur la fin de la solidarité ne suit pas l'ordre du texte**
- Texte, L1610-1613 : la solidarité prend fin « à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau
  colocataire figure au bail. A défaut, [elle s'éteint] au plus tard à l'expiration d'un délai de six mois après la date
  d'effet du congé. »
- Code : baux et acte de cautionnement écrivent « s'éteint six mois après la date d'effet du congé, ou dès qu'un nouveau
  locataire le remplace » (`bail-nu.ts:254-255`, `cautionnement.ts:186-189`). L'avenant de remplacement, lui, reprend
  bien le texte (`catalogue-bail.ts:375`). Dans la base, un départ enregistré sans remplaçant reste à six mois : la
  fonction refuse un second enregistrement (« déjà enregistré », même migration ligne 728), donc l'arrivée d'un
  remplaçant après coup ne raccourcit rien (aucune autre fonction trouvée ; supposé).
- Correction minimale : reprendre dans les trois documents la phrase de l'avenant. Permettre d'indiquer un remplaçant
  après coup : petite.

Conformités constatées :
- Chambre d'un contrat individuel : au moins 9 m² (`mig. 20260914180000_colocation_contrats_individuels.sql:15`) et
  surface et volume imprimés (`designation-individuelle.ts:13`) = L1575-1576.
- Somme des loyers des contrats individuels plafonnée au loyer du logement entier (`designation-individuelle.ts:27`)
  = L1583-1585.
- Forfait de charges sans régularisation (`designation-individuelle.ts:27`, base) = L1603-1605.

### B. Points que le texte tranche
- **Partie 1, point 6 (durée réduite : SCI familiale, indivision, meublé)** : SCI familiale et indivision : oui
  (L1661-1666). Meublé : l'article 11 n'est pas dans la liste des articles applicables au meublé (L1991-1992). *Écart,
  voir R17-A2 et R20-A1.*
- **Partie 1, point 19** : voir réf. 13, R13-A5.
- **Partie 1, point 20 (clause à six mois pour deux époux)** : non, ce régime ne les concerne pas (L1566-1570). *Écart,
  voir R17-A1.*
- **Partie 1, point 21 (remplaçant entré après la date d'effet du congé)** : L1610-1613 pose deux conditions réunies
  (congé effectif **et** nouveau colocataire au bail), avec six mois « au plus tard ». La solidarité cesse donc à
  l'entrée du remplaçant si elle a lieu dans les six mois. *Écart mineur, voir R17-A4.*
- **Partie 5, point 10 (plafond en colocation à contrats individuels : toute zone ?)** : L1583-1585 : la somme des loyers
  « ne peut être supérieur[e] au montant du loyer applicable au logement en application des articles 17 ou 25-9 ». La
  règle est légale et vaut partout ; le montant « applicable » dépend de l'article 17 (absent de ma part). *La phrase
  imprimée est conforme au texte fourni.* Reste à dire ce que vaut « le loyer applicable » hors zone d'encadrement.
- **Partie 5, point 12 (b) (cautions et avenant de remplacement)** : L1623-1625 impose que chaque acte de cautionnement
  nomme son colocataire. Le texte ne demande pas la signature des cautions sur l'avenant. Reste au juriste pour le
  surplus.

### C. Points que le texte ne tranche pas
- **Partie 1, point 34 (qui signe un avenant en colocation)** : non traité.
- **Partie 8, point 3 (notice pour une colocation à contrats individuels)** : L1580-1581 dit seulement que chaque
  contrat « respecte le présent titre Ier ou […] le titre Ier bis » ; la notice du bail est à la réf. 6.

### D. Nouveautés
- L1590-1591 : le bail d'une colocation « respecte un contrat type défini par décret ». À rapprocher de la réf. 8.
- L1587-1588 : les normes de peuplement s'imposent aux colocations. Inconnu de Gerimmo (supposé).
- L1640-1650 (article 11) : confirmation de l'événement deux mois avant le terme, un seul report possible, et, sans
  confirmation, bail « réputé être de trois ans ». Aucune de ces étapes n'existe dans Gerimmo.

### E. Doutes sur le recueil
- Article 8-1 : adresse en « loda » et non « codes » (L1564) ; sans conséquence. Texte complet (I à VI).

---

## Réf. 18 — Loi de 1989, articles 21 (quittance) et 22-2 (pièces du candidat)

### A. Écarts confirmés
Aucun sur la quittance. Conformités constatées :
- L1686-1688 : quittance gratuite sur demande, qui « porte le détail des sommes versées par le locataire en distinguant
  le loyer et les charges » : `quittance.ts:184-185` (lignes « Loyer hors charges » et charges) et `quittance.ts:241-242`
  (« délivrée gratuitement au locataire qui en fait la demande, conformément à l'article 21 »).
- L1696 : « Si le locataire effectue un paiement partiel, le bailleur est tenu de délivrer un reçu » :
  `quittance.ts:180` (« Reçu de paiement partiel ») et 244-245 (« il ne vaut pas quittance »).
- L1693-1694 : transmission dématérialisée « avec l'accord exprès du locataire » : l'accord est enregistré
  (`consentements_documents_locataire.quittances_electroniques`, lu dans `src/app/locataire/[orgId]/documents/
  page.tsx:87`). Le contrôle avant chaque envoi n'a pas été relu (supposé).

Pour l'article 22-2, l'écart est décrit à la réf. 19 (R19-A1).

### B. Points que le texte tranche
- **Partie 5, point 19 (a) et (d), Q52 et Q74 (adresse, e-mail et téléphone du bailleur sur la quittance)** : l'article
  21 n'exige que le détail des sommes, loyer et charges distingués (L1687-1688). Aucune adresse, aucun e-mail, aucun
  téléphone n'est exigé par ce texte. Le choix du dirigeant (adresse de l'espace en ligne) n'est contredit par aucun
  texte de ma part. Formulation : « L'article 21 n'impose aucune adresse sur la quittance. Reste (b) et (c), qui sont
  des questions de cohérence et de données personnelles. »
- **Partie 5, point 2 (adresse du bailleur exigée en en-tête de la quittance)** : même réponse : non exigée par
  l'article 21. Le refus actuel de Gerimmo est une prudence, pas une règle de ce texte.
- **Partie 3, B10ter (a) (accord du locataire pour l'avis d'échéance par e-mail)** : l'accord exprès n'est écrit que pour
  la quittance (L1693-1694). Pour l'avis d'échéance, le texte dit seulement qu'aucuns frais ne peuvent être facturés
  (L1690-1691).
- **Partie 1, point 36** : voir réf. 19.

### C. Points que le texte ne tranche pas
- **Partie 5, point 5 (avis d'échéance établi après l'échéance)** : non traité.
- **Partie 5, point 19 (b) et (c)** : non traités.

### D. Nouveautés
- L1707-1708 : « le bailleur ne peut imposer la cosignature d'un ascendant ou d'un descendant du candidat à la
  location ». Aucun rappel dans Gerimmo (supposé ; non cherché en détail).
- L1710-1716 : amende administrative jusqu'à 3 000 € (personne physique) et 15 000 € (personne morale), prononcée dans
  l'année qui suit la constatation.

### E. Doutes sur le recueil
- **Article 22-2 : « chapitre consulté au 4 avril 2023 »** (L1700). C'est la consultation la plus ancienne de ma part
  (plus de trois ans). L'article est dit en vigueur depuis 2014, mais le recueil ne prouve pas qu'il n'a pas changé
  depuis avril 2023.
- Article 21 : consulté au 21 novembre 2024.

---

## Réf. 19 — Décret n° 2015-1437 du 5 novembre 2015 (pièces justificatives)

### A. Écarts confirmés

**R19-A1 — important — Gerimmo laisse demander n'importe quelle pièce à un candidat**
- Texte, L1752-1757 : les pièces « pouvant être exigées par le bailleur de chacun des candidats à la location » figurent
  en annexe 1, celles des cautions en annexe 2. Listes fermées : annexe I, L1791-1873 ; annexe II, L1885-1956. Le relevé
  d'identité bancaire n'y figure pas ; l'attestation d'assurance non plus (pour le candidat). Sanction : L1710-1712.
- Code : `src/app/actions/pieces-demandees.ts:43-48` accepte un libellé libre de 120 caractères et trois types
  (« piece_identite », « justificatif », « attestation_assurance »), sans regarder si la personne a un bail signé.
  L'écran (`…/personnes/[personId]/carte-pieces-demandees.tsx:29-35` et 156-167) propose trois raccourcis et un rappel
  (« encadrées par la réglementation […] Gerimmo ne contrôle pas ce que vous demandez »).
- Correction minimale : quand la personne n'a aucun bail signé (candidat) ou est une caution, remplacer le libellé libre
  par les listes des annexes I et II, en cases à cocher, avec les règles « une seule pièce » pour le domicile (L1805,
  L1902) et « une pièce » pour l'identité (L1793). Le type « attestation d'assurance » n'est proposé qu'après la
  signature. Le texte étant maintenant dans le recueil, la correction est possible sans attendre.

Remarque : les trois raccourcis actuels (« Avis d'imposition », « Justificatif de domicile », « Pièce d'identité ») sont
dans la liste (L1841, L1805, L1793).

### B. Points que le texte tranche
- **Partie 1, point 36 et partie 2, point 11 (liste fermée, RIB)** : la liste est fermée et le RIB n'y est pas
  (L1791-1873). *Écart, voir R19-A1.* Après la signature, l'article 4 c) interdit seulement d'imposer le prélèvement
  (L1248-1249). Points à retirer après correction.
- **Partie 3, A9 (RIB avant la signature)** : même réponse.
- **Partie 2, point 12 (attestation d'assurance)** : absente de l'annexe I ; due à la remise des clés (L1451-1452).
- **Partie 3, A10 (date et lieu de naissance d'une caution)** : l'annexe II ne permet d'exiger de la caution qu'une
  pièce d'identité, un justificatif de domicile, d'activité et de ressources (L1886-1956). Le texte ne dit rien du
  contenu de l'acte de cautionnement. Reste ouvert (article 2297, réf. 04).

### C. Points que le texte ne tranche pas
- **Partie 2, point 13 (pièce reçue en trop)** : le décret parle de ce qui peut être « exigé », pas de ce qui est reçu
  spontanément. Question de données personnelles.

### D. Nouveautés
- Annexes dans leur version du 1er janvier 2023 (L1786, L1874-1875) : « fiche d'immatriculation au Registre national des
  entreprises » (L1828-1829, L1930-1931) à la place de l'ancien extrait du répertoire des métiers. À reprendre mot pour
  mot dans les cases à cocher.
- L1758-1760 : les pièces peuvent être des copies ; les originaux « doivent pouvoir être présentés à la demande du
  bailleur ».
- L1762-1770 (article 1-1, depuis 2019) : procédure de l'amende par le préfet, deux mois pour présenter des
  observations.

### E. Doutes sur le recueil
- Annexe I : adresse sans date de consultation (L1787), mais « En vigueur au 20/11/2026 » (L1786).
- Annexe II, A : la liste d'identité de la caution s'arrête au permis de conduire (L1889-1893), sans le « document
  justifiant du droit au séjour » présent pour le candidat (L1801-1803). Différence possible entre les deux annexes ;
  à vérifier avant de coder les cases, car une ligne a pu sauter à l'extraction.
- Sauts de ligne irréguliers dans les listes (extraction du PDF) ; aucune phrase tronquée repérée.

---

## Réf. 20 — Loi de 1989, articles 25-3, 25-5, 25-7 à 25-10 (meublé)

### A. Écarts confirmés

**R20-A1 — important — le bail meublé garde la rubrique « durée réduite pour un événement précis », qui ne lui est pas applicable**
- Texte, L1991-1992 : « Les articles 1er, 3, 3-2, 3-3, 4, à l'exception du l, 5, 6, 6-2, 7, 7-1, 8, 8-1, 17, 18, 20-1,
  21, 22, 22-1, 22-2, 24 et 24-1 sont applicables aux logements meublés. » L'article 11 n'y est pas. L2025 : le bail
  meublé « est conclu pour une durée d'au moins un an » ; L2030-2031 : neuf mois pour un étudiant.
- Code, `bail-meuble.ts:229-236` : si le champ est rempli, le bail meublé imprime « Un contrat d'une durée réduite n'est
  possible que si un événement précis justifie la reprise du logement par le bailleur : … », à côté de « Durée du
  contrat : un an, reconduit tacitement » (`bail-meuble.ts:106-108`, 228). Sinon il imprime « Durée réduite pour un
  événement précis […] : sans objet » (`mentions-location.ts:90-93`).
- Correction minimale : dans le bail meublé, ne plus lire `duree_reduite_evenement` et masquer le champ à la saisie
  quand le bail est meublé. Garder ou non la ligne « sans objet » dépend du contrat type meublé (réf. 8). C'est aussi la
  réponse reçue (5 · 12 a).

Le défaut « première présentation » (R13-A2) vaut aussi pour le meublé (L2073-2074).

Conformités constatées :
- Durée et reconduction : `bail-meuble.ts:105-108` (« un an, reconduit tacitement » ; « neuf mois — bail étudiant, non
  reconductible tacitement ») = L2025-2031.
- Préavis du bailleur de trois mois : `conge-bailleur.ts:114-116` = L2055-2056.
- Mentions du congé pour reprise : motif, nom, adresse, lien (`conge-bailleur.ts:197-202`) = L2060-2062 ; caractère réel
  et sérieux (`conge-bailleur.ts:206-207`) = L2052-2053.
- Pas d'offre de vente en meublé (`conge-bailleur.ts:178-180`) : l'article 25-8 n'en prévoit aucune.
- Révision bloquée en classe F ou G aussi en meublé (`bail-meuble.ts:255-258`) = L2127 (« les I et III de l'article 17-1
  sont applicables aux logements meublés »).
- Forfait de charges sans régularisation = L2150-2155.
- Inventaire joint au bail (`bail-meuble.ts:210-211` : « Le mobilier mis à disposition est décrit dans l'inventaire
  annexé au présent contrat ») = L2011-2014 pour l'annexe. Le modèle de l'inventaire lui-même n'a pas été relu.

### B. Points que le texte tranche
- **Partie 5, point 12 (a)** : la durée réduite de l'article 11 ne s'applique pas au meublé (L1991-1992) ; le bail
  étudiant de neuf mois est une règle propre (L2030-2031). *Écart, voir R20-A1.* Point à retirer après correction.
- **Partie 1, point 6** : même réponse pour le meublé.
- **Partie 1, point 17** : en meublé, l'adresse du bénéficiaire est exigée « à peine de nullité » (L2060-2062).
  *Conforme.*
- **Partie 1, point 33 (forfait de charges modifié par avenant)** : L2152-2154 : le forfait « peut être révisé chaque
  année aux mêmes conditions que le loyer principal ». Même phrase en colocation (L1605-1607). Le texte ne prévoit pas
  d'autre voie. Côté code : non vérifié.
- **Q47, point 2 (bail nu sur un logement coché meublé et inventaire)** : l'inventaire de l'article 25-5 appartient aux
  « contrats de location de logements meublés » (L1987-1989, L2011). Il suit donc le type du bail, pas la case du
  logement. À rapprocher de R11-A2 (même confusion entre le bail et le logement).

### C. Points que le texte ne tranche pas
- **Partie 5, point 17 (« établi contradictoirement » sur un inventaire préparé à l'avance)** : L2011-2014 exige que
  l'inventaire soit établi « contradictoirement et amiablement » ; il ne dit pas quoi écrire sur un document préparé
  avant.
- **Partie 1, point 14 pour le meublé (congé reçu le 21 juin)** : aucun exemple de calcul en meublé dans le recueil.
- **Partie 1, point 19 pour le meublé** : l'article 13 ne vise que les articles 11 et 15 (L1661). Pour le meublé, le
  bénéficiaire « ne peut être que le bailleur, son conjoint… » (L2062-2065) : une société n'a pas de conjoint, mais le
  texte ne le dit pas en toutes lettres. Reste au juriste.

### D. Nouveautés
- L2112-2114 : amende pénale jusqu'à 6 000 € (personne physique) et 30 000 € (personne morale) pour un congé
  frauduleux. La lettre de Gerimmo ne parle que de « dommages et intérêts » (`conge-bailleur.ts:206-207`).
- L2084-2097 : protection du locataire de plus de soixante-cinq ans aussi en meublé, avec la personne à charge
  (voir R13-A8).
- L2014-2015 : l'inventaire ne peut « donner lieu à aucune autre facturation que celle liée à l'établissement de l'état
  des lieux ».
- L2129-2131 : hausse de plus de 10 % au renouvellement, appliquée « par tiers annuel ».

### E. Doutes sur le recueil
- **Les articles 25-4 et 25-6 manquent** (titre de la référence, L1980-1981 : « 25-3, 25-5, 25-7 à 25-10 »). Or Gerimmo
  s'appuie sur l'article 25-6 pour le plafond de deux mois du dépôt en meublé (`bail-meuble.ts:285` : « au plus deux
  mois de loyer hors charges (article 25-6 de la loi du 6 juillet 1989) » ; base, reçu, résumé de la notice). Le recueil
  ne permet pas de confirmer ce plafond ; pire, lu seul, il laisse croire que l'article 22 (un mois) s'applique au
  meublé, puisqu'il est dans la liste de L1991-1992. L'article 25-4 (définition du meublé, liste du mobilier) manque
  aussi pour vérifier l'inventaire. **À demander au dirigeant.**
- Articles 25-9 et 25-10 : « Version affichée au 17/08/2024 » (L2121), ancienne.

---

## Réf. 21 — Décret n° 87-713 du 26 août 1987 (charges récupérables)

### A. Écarts confirmés
Aucun. Les textes d'aide de Gerimmo (`src/lib/conseil-repartition.ts:12-21`) restent prudents et ne contredisent pas
l'annexe : assurance et internet exclus, taxe d'enlèvement des ordures ménagères récupérable (L2503), entretien courant
et menues réparations seulement (L2304, L2353, L2428).

### B. Points que le texte tranche
- **Partie 2, point 10 (gardien : lire le contrat de travail ?)** : oui. L2210-2213 : 75 % quand le gardien assure,
  « conformément à son contrat de travail, l'entretien des parties communes et l'élimination des rejets » ; L2218-2219 :
  40 % quand il « n'assure, conformément à son contrat de travail, que l'une ou l'autre des deux tâches ». L'intervention
  d'un tiers pendant les repos, congés, arrêts de travail ne change pas le taux (L2213-2217). Un employé d'immeuble :
  « en totalité » (L2246-2249). Éléments exclus de l'assiette : L2235-2244. Formulation : « Tranché par le texte :
  75 %, 40 % ou 100 % selon le contrat de travail. Reste le cas d'un partage permanent avec une entreprise. »
- **Partie 2, point 17 (poste « tout ou rien »)** : le texte impose des parts (75 %, 40 %, et 10 % pour l'encadrement,
  L2202-2203). Un poste sans pourcentage ne peut pas l'exprimer : la saisie en deux lignes reste un contournement.
  Besoin confirmé par le texte ; ce n'est pas un écart d'un document généré.
- **Partie 2, point 9 (désinsectisation)** : L2465-2466 : sont récupérables les « Produits relatifs à la désinsectisation
  et à la désinfection » (rubrique « fournitures consommables »). La main-d'œuvre n'est pas citée. Tranché pour ce
  poste.
- **Partie 2, point 9 (gaz d'une chaudière individuelle)** : L2386-2388 : pour les installations individuelles, seules
  les « Dépenses d'alimentation commune de combustible » sont citées. Le gaz d'un compteur individuel payé par le
  bailleur n'entre pas clairement dans cette ligne : interprétation, reste au juriste.

### C. Points que le texte ne tranche pas
- **Partie 2, point 9 (part d'un contrat d'ascenseur « complet »)** : L2304-2321 liste les opérations récupérables, sans
  pourcentage. L2203-2205 : « le bailleur doit s'assurer que ce contrat distingue les dépenses récupérables et les autres
  dépenses ». Aucun taux dans le texte.

### D. Nouveautés
- L2260-2261 : le remplacement d'un équipement n'est une menue réparation « que si son coût est au plus égal au coût de
  celles-ci ».
- L2264-2266 : les dépenses des installations individuelles (rubrique III) sont récupérables « lorsqu'elles sont
  effectuées par le bailleur au lieu et place du locataire » : utile pour le contrat d'entretien de chaudière payé par
  le bailleur.
- Aucune modification récente annoncée (article 2 depuis 2009).

### E. Doutes sur le recueil
- Le visa cite l'article 18 de la loi de 1986 (L2184-2186, L2191) alors que la loi de 1989 renvoie à ce décret par son
  article 23 : normal pour un décret de 1987 ; le lien est fait par l'article 3 bis pour la Polynésie (L2277-2278)
  seulement. Rien à corriger.
- L2501 : « Droit de bail » figure encore dans la liste (taxe disparue depuis longtemps) : faiblesse du texte officiel.
- Bloc des signatures dans le désordre (L2507-2518 : « Par le Premier ministre : JACQUES CHIRAC. ») : défaut de mise en
  page.
- L2201 : espace en trop (« d' encadrement ») : extraction.

---

## Réf. 22 — Décret n° 2002-120 du 30 janvier 2002 (logement décent)

### A. Écarts confirmés
Aucun écart propre. Les deux écarts liés sont décrits à la réf. 16 :
- R16-A3 (phrase du bail sur un « seuil de consommation d'énergie finale ») : l'article 3 bis ne donne que des classes
  (L2679-2692).
- R16-A4 (classe G bloquée outre-mer) : L2687-2692.

Conformité constatée : le calendrier imprimé au bail (`mentions-location.ts:20-23` : F en 2025, E en 2028, D en 2034 ;
outre-mer F en 2028, E en 2031) = L2683-2685 et L2691-2692.

Non vérifié : les « critères de décence » affichés sur la fiche du logement (`src/lib/parc.ts:176` et suivantes) n'ont
pas été comparés un à un aux articles 2 à 4 du décret.

### B. Points que le texte tranche
- **Partie 1, points 9 et 10** : le décret fixe le calendrier (L2683-2685) mais ne dit rien des baux en cours. Voir
  réf. 16, C.

### C. Points que le texte ne tranche pas
- Les questions sur plusieurs DPE (partie 6, point 15 ; partie 8, point 4).

### D. Nouveautés
- Article 3 ter (L2699-2718, depuis le 1er janvier 2025) : cas où le juge ne peut pas ordonner les travaux (risque pour
  le bâti attesté par un homme de l'art ; refus d'autorisation au titre du patrimoine).
- Article 4 (L2734-2736) : une pièce principale d'au moins 9 m² et 2,20 m sous plafond, ou 20 m³. Même seuil que la
  chambre d'une colocation à contrats individuels (L1575-1576). Gerimmo contrôle 9 m² pour la chambre ; pour le
  logement entier : non vérifié.
- Article 6 bis (L2771-2797) : adaptations pour Mayotte jusqu'au 31 décembre 2029.
- Article 2, version du 21 août 2023 (L2603-2608) : protection contre les infiltrations d'air, sauf outre-mer.

### E. Doutes sur le recueil
- Le préambule du recueil dit avoir « remis en ordre » les articles de ce décret (r0, L62-63). L'ordre est maintenant
  correct (1, 2, 3, 3 bis, 3 ter, 4, 5, 6, 6 bis, 6 ter, 6 quater, 7).
- Un même bandeau de version est recopié sur plusieurs articles (L2535-2536, L2579-2580, L2729-2730, L2743-2744) : on ne
  sait pas, article par article, quelle page a réellement été consultée. Dates de consultation entre le 12/05/2026 et
  le 04/08/2026.
- Sauts de ligne irréguliers (L2610-2612, L2642-2647, L2667-2669) : extraction.

---

## Réf. 23 — Loi n° 2021-1104 du 22 août 2021, articles 159 et 160

### A. Écarts confirmés

**R23-A1 — mineur — la révision est refusée pour tout logement F ou G, sans regarder la date du bail**
- Texte, L2995-3000 : les articles modifiés « sont applicables aux contrats de location conclus, renouvelés ou
  tacitement reconduits un an après la publication de la présente loi » (loi publiée au Journal officiel du 24 août
  2021, L2952). Outre-mer, L3011-3012 : contrats « conclus, renouvelés ou tacitement reconduits après le 1er juillet
  2024 ».
- Code, `mig. 20260929120000_audit_baux_documents.sql:230-236` (et versions antérieures) : « Révision interdite :
  logement classé DPE % (passoire thermique, depuis 2022) », pour tout bail, quelle que soit sa date. Même règle pour
  l'avenant (`mig. 20261122190000_avenants_bail.sql:218-221`).
- Portée réelle aujourd'hui : un bail de six ans (bailleur personne morale) conclu avant le 24 août 2022 et pas encore
  reconduit échappe au gel selon le texte ; Gerimmo le bloque. Outre-mer : baux conclus avant le 1er juillet 2024 et non
  reconduits. Gerimmo est donc plus sévère que le texte, au détriment du bailleur.
- Correction minimale : pour un bail nu de six ans dont la date de début est antérieure au 24 août 2022 et qui n'a pas
  encore atteint son premier terme, remplacer le refus par un avertissement à confirmer. Ou garder le refus et le dire
  comme une prudence. À décider par le dirigeant.

Conformité constatée : le gel de la révision et de la majoration en classe F ou G, imprimé au bail (`bail-nu.ts:218-221`,
`bail-meuble.ts:255-258`) = L2964-2966.

### B. Points que le texte tranche
- **Partie 1, point 7 (gel et bail de six ans conclu avant le 24 août 2022, non reconduit)** : le gel ne s'applique
  qu'aux contrats « conclus, renouvelés ou tacitement reconduits » à partir d'un an après la publication (L2995-3000).
  Un tel bail n'est donc pas visé tant qu'il n'est pas reconduit. *Écart, voir R23-A1.* Point à retirer après décision.
- **Partie 1, point 9** : l'article 160 n'a pas de règle équivalente : il « entre en vigueur le 1er janvier 2025 »
  (L3063), sans distinguer les contrats. Le contraste avec l'article 159 IV est à soumettre au juriste (voir réf. 16, C).

### C. Points que le texte ne tranche pas
- **Partie 1, point 27 (refus de toute hausse par avenant en classe F ou G)** : l'article 159 vise la révision annuelle
  et la majoration pour travaux (L2964-2966), la réévaluation au renouvellement (L2972-2974) et la nouvelle location
  (L2958-2961). Une hausse par avenant en cours de bail n'est pas citée. Le refus de Gerimmo est une prudence, pas une
  règle lue. Reste au juriste.
- **Partie 1, point 26 (hausse par avenant en général)** : non traité.

### D. Nouveautés
- **L2958-2961 (article 17 II complété)** : quand un logement classé F ou G « fait l'objet d'une nouvelle location, le
  loyer du nouveau contrat de location ne peut excéder le dernier loyer appliqué au précédent locataire ». Gerimmo
  bloque les nouveaux baux en classe G, mais pas en classe F. Aucun contrôle de ce plafond n'a été trouvé
  (`src/lib/coherence-loyer.ts` et migrations, recherche par mots : supposé absent). Le bail imprime pourtant le dernier
  loyer du précédent locataire (`mentions-location.ts:78-82`). À ajouter : une alerte quand le logement est classé F et
  que le nouveau loyer dépasse le dernier loyer saisi. Petite.
- L3065-3067 : rapport du Gouvernement au Parlement « avant le 1er juillet 2027 » sur le passage à la classe D en 2034 :
  le calendrier pourrait encore bouger.
- L2990-2993 : en zone d'encadrement, l'action en réévaluation d'un loyer sous-évalué est fermée aux logements F et G.

### E. Doutes sur le recueil
- Les deux articles sont donnés en « Version INITIALE — JORF du 24/08/2021 » (L2952, L3016) : c'est le texte d'origine,
  non les articles de la loi de 1989 qu'il modifie. Cohérent avec les articles 6, 20-1, 25-3 et 25-9 reproduits
  ailleurs dans le recueil (mêmes mots).
- L2952 : « JORF du 24/08/2021 ; article consolidé en vigueur depuis le 25/08/2021 » : la date d'application « un an
  après la publication » est donc le 24 août 2022 (JURISTE.md) ou le 25 août 2022 selon la façon de compter. Un jour
  d'incertitude, sans effet pratique aujourd'hui.

---

## Réf. 24 — Code civil, articles 220, 1731, 1751 et 2303

### A. Écarts confirmés

**R24-A1 — important (bailleur professionnel) — la caution peut être informée d'un impayé après le délai d'un mois**
- Texte, L3151-3154 : « Le créancier professionnel est tenu d'informer toute caution personne physique de la défaillance
  du débiteur principal dès le premier incident de paiement non régularisé dans le mois de l'exigibilité de ce
  paiement, à peine de déchéance de la garantie des intérêts et pénalités échus entre la date de cet incident et celle à
  laquelle elle en a été informée. »
- Code : la caution n'est informée qu'à la seconde relance (`src/lib/relance-loyer-email.ts:40-46`,
  `src/lib/missions-planifiees/relances.ts:215-242`). Le délai de cette seconde relance est réglable de 2 à 90 jours
  après l'échéance (`mig. 20260920030000_relances_loyer_automatiques.sql:44-49` ; 15 jours par défaut, ligne 37). Réglé
  au-delà de 30 jours, l'information part après le mois. De plus, l'envoi est aujourd'hui fermé (Q6) : aucune
  information ne part.
- Correction minimale : informer la caution au plus tard 30 jours après l'échéance impayée, quel que soit le réglage des
  relances (envoi séparé, ou plafond de 30 jours sur la seconde relance quand le bail a une caution).
- Réserve : le texte vise le « créancier professionnel ». Un bailleur particulier l'est-il ? Non tranché (voir C). Pour
  une agence qui gère pour compte, la question se pose aussi.

Conformités constatées :
- Article 1731 (L3115-3116) : repris mot pour mot dans le décompte, avec la limite de l'article 3-2
  (`decompte-restitution.ts:169-173`).

Les articles 220 et 1751 fondent l'écart R17-A1 (époux et partenaires pacsés).

### B. Points que le texte tranche
- **Partie 1, point 20** : entre époux, la solidarité vient de l'article 220 (L3098-3099) et le bail appartient aux deux
  (article 1751, L3123-3127). Voir R17-A1.
- **Partie 3, B10ter (b) (quand informer la caution ?)** : « dès le premier incident de paiement non régularisé dans le
  mois de l'exigibilité » (L3151-3152), pour un créancier professionnel. Le texte ne dit pas par quel moyen. *Écart,
  voir R24-A1.* Formulation : « Délai tranché par le texte (un mois) pour un créancier professionnel. Restent le moyen
  de preuve et la qualité du bailleur particulier. »
- **Partie 2, point 14** : présomption de l'article 1731 (L3115-3116). Voir réf. 14.

### C. Points que le texte ne tranche pas
- **Un bailleur particulier est-il un « créancier professionnel » ?** Le texte ne définit pas le terme. Jurisprudence :
  reste au juriste.
- **Partie 1, point 32 (hausse de loyer par avenant et caution)** : non traité par ces quatre articles.
- **Partie 1, points 22 et 23 (mention de la caution, article 2297)** : réf. 03 et 04, hors de ma part.

### D. Nouveautés
- Article 2303 applicable depuis le 1er janvier 2022, « y compris aux cautionnements […] constitués antérieurement »
  (L3159-3161) : il vaut donc pour les baux repris dans Gerimmo.
- L3156-3157 : pendant la période où la caution n'est pas informée, les paiements du locataire « sont imputés
  prioritairement sur le principal de la dette », dans les rapports avec la caution.
- Article 1751, L3125-3127 : les partenaires pacsés ne sont cotitulaires que s'ils « en font la demande
  conjointement ». L3134-3136 : droit exclusif du conjoint survivant sur le bail. Gerimmo ne connaît pas ces situations.

### E. Doutes sur le recueil
- Article 1751 : adresse se terminant par « ?isSuggest=true » (L3121), sans date : c'est une adresse de recherche, pas
  une adresse de version. Texte cohérent avec la citation de la notice de congé (L531-536).
- Rien d'autre.

---

## Tableau récapitulatif

| Identifiant | Gravité | Document ou écran touché | Taille |
|---|---|---|---|
| R13-A1 | bloquant | Congé du bailleur : contrôle du délai dans la base, message de date limite, modèle du congé | petite |
| R11-A1 | important | Résumé de la notice d'information (« produit intérêt ») | petite |
| R11-A2 | important | Reçu de dépôt de garantie (plafond un mois ou deux mois) | petite |
| R13-A2 | important | Écran de préparation du congé, option du catalogue (« première présentation ») | petite |
| R13-A3 | important | Congé pour vendre, logement nu (cinq alinéas de l'article 15 II à reproduire) | petite |
| R13-A4 | important | Congé pour vente ou reprise, logement nu (notice de l'arrêté à joindre) | moyenne |
| R13-A5 | important | Congé pour reprise (bailleur société non familiale) : base et modèle | petite |
| R13-A7 | important | Congé du bailleur (logement acheté occupé : deux ans, trois ans) | petite (question bloquante) à moyenne (calcul) |
| R15-A1 | important | État des lieux de sortie (adresse du nouveau domicile) : document et saisie | petite |
| R16-A1 | important | Régularisation de charges : deux fonctions de base, écran des loyers (« prescrit ») | petite |
| R17-A1 | important | Baux nu et meublé, départ d'un locataire (époux et partenaires pacsés) | moyenne |
| R17-A2 | important | Bail nu à durée réduite (durée imprimée « trois ans ») | petite (refus) à moyenne (fonction) |
| R17-A3 | important | Acte de cautionnement en colocation (colocataire non désigné) | petite |
| R19-A1 | important | Demande de pièces à un candidat ou à une caution : écran et action | moyenne |
| R20-A1 | important | Bail meublé (rubrique « durée réduite ») | petite |
| R24-A1 | important | Information de la caution d'un impayé (délai d'un mois) | petite |
| R11-A3 | mineur | Espace locataire : carte du congé, page logement, questions fréquentes | petite |
| R12-A1 | mineur | Courrier de régularisation de charges (note chauffage et eau chaude collectifs) | petite |
| R13-A6 | mineur | Congé pour vendre (« le notaire doit vous notifier ») | petite |
| R13-A8 | mineur | Congé du bailleur (personne à charge de plus de 65 ans) | petite |
| R14-A1 | mineur | Résumé de la notice (présomption sans son exception) | petite |
| R14-A2 | mineur | Blocage de mise en location (état des risques exigé hors zone) | petite |
| R15-A2 | mineur | État des lieux en mode agence (domicile du bailleur) | petite |
| R15-A3 | mineur | État des lieux de sortie (date de l'entrée laissée en blanc) | petite |
| R16-A2 | mineur | Rappel d'assurance ; résumé de la notice (obligations du locataire) | petite |
| R16-A3 | mineur | Baux nu et meublé (« seuil de consommation d'énergie finale ») | petite |
| R16-A4 | mineur | Blocage « DPE classe G » (outre-mer ; mot « interdit ») | petite |
| R17-A4 | mineur | Baux, acte de cautionnement (phrase sur la fin de la solidarité) ; remplaçant tardif | petite |
| R23-A1 | mineur | Révision du loyer et avenant, logement F ou G (baux anciens non reconduits) | petite |

Total : 1 bloquant, 15 importants, 13 mineurs.

À faire ensemble (même document, une seule nouvelle empreinte, voir Q40) : R11-A1, R14-A1 et R16-A2 (résumé de la
notice) ; R13-A1 à R13-A8 (congé du bailleur) ; R16-A3, R17-A1, R17-A4 et R20-A1 (baux).

## Points de JURISTE.md qui peuvent être allégés grâce à ma part du recueil

- À retirer après correction du code : partie 1, points 14 (nu), 15, 16, 19, 20 ; partie 2, points 3, 15 ; partie 5,
  point 12 (a) ; partie 6, points 6 et 9.
- À retirer sans correction (code conforme au texte fourni) : partie 1, points 17 et 30 ; partie 5, points 13 et
  16 (a) ; partie 6, point 16 (c).
- À réduire (une partie est tranchée) : partie 1, points 2, 6, 7, 11, 18, 21, 25, 33, 36, 38 ; partie 2, points 2, 5,
  6, 8, 9, 10, 11, 12, 14, 16, 17 ; partie 3, A9 et B10ter ; partie 5, points 2, 10, 19 ; partie 8, point 1.

## Ce qui manque dans le recueil pour finir le travail sur ma part

1. Loi de 1989, **article 25-6** (dépôt de garantie en meublé) et **article 25-4** (définition du meublé).
2. Les textes qui disent quand le plomb, l'électricité, le gaz et l'amiante sont dus (article 3-3, L1054-1075 : renvois).
3. Une version de l'article 22-2 consultée en 2026 (celle du recueil date d'avril 2023).

## Ce que je n'ai pas pu lire ou vérifier

- `QUESTIONS.md`, lignes Q55 à Q74 : lues tronquées (700 premiers caractères de chaque ligne).
- `REPONSES-JURISTE.md` : parties 3A, 3B (sauf B10ter) et 4 non lues (elles ne citent pas mes textes, d'après les
  titres) ; `TEXTES-OFFICIELS-LUS` : sections 0 à 2 et 9 à 11 non lues.
- Code non lu : `avis-echeance.ts`, `avenant.ts`, `revision-irl.ts`, `mandat-gestion.ts`, `prorata.ts`,
  `facture-honoraires.ts`, `bail-colocation.ts`, `bail-individuel.ts`, la plus grande partie de `catalogue-bail.ts`,
  `catalogue-gestion.ts` et `quittance.ts`. Les écrans ont été lus par extraits.
- Migrations : 563 fichiers ; lues par recherche de mots, jamais en entier. Une réécriture récente d'une fonction par
  remplacement de texte a pu m'échapper (notamment pour la révision du loyer, lot D2 du 24/11).
- Aucun document n'a été généré : tous les constats viennent de la lecture du code, pas d'un PDF produit.
- Légifrance n'a pas été consulté : le recueil est traité comme « texte fourni par le dirigeant, non recontrôlé ».
