# Points à porter au plan de publication (collectés au fil des lots)
- ORDRE DES MIGRATIONS : règle générale « base avant code » (T1R-4 : sinon l'ancienne base accorde un mois d'office en zone tendue).
- EXCEPTION D4 (reprise, migration 20261125150000_accord_conditions_version_archivee) : selon l'auteur, déployer le code, vérifier zéro abonné, archiver la version 2026-11-24, PUIS appliquer 20261125150000. À REVÉRIFIER lors de la fusion (pourquoi l'ordre inverse ? que se passe-t-il si appliquée avant l'archivage ?) et à trancher avant le plan final.
- D5 : avant d'appliquer 20261125140000 : `select count(*), count(*) filter (where signee_le is null) from public.demandes_signature;` → 0 et 0.
- Vendeur : saisir l'identité complète (DECISIONS-2026-11-24.md, Q76) + « type de vendeur » ; archiver les conditions ; médiateur absent → ventes aux particuliers fermées sauf levée explicite (case « j'ai lu ») par le dirigeant.
- Envois : ouvrir les cinq interrupteurs un par un (ouvrir la relance de loyer ouvre aussi la relance à la main) ; GERIMMO_MODE=commercial ; repères fiscaux 15 000 / 30 % avec source.
- Circuits de signature « prêts » non envoyés à re-préparer : bail, acte de cautionnement, état des lieux de sortie, protocole, autorisation de travaux (prod : un seul circuit, bail terminé).
- Sauvegarde préalable avec la nouvelle clé (Q9) — rappel programmé.
