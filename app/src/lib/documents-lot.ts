// Une pièce peut être reliée au lot ET à son bail : l'afficher une seule
// fois, en conservant les différents contextes renvoyés par la lecture.
export function regrouperDocumentsLot<T extends { document_id: string; rattachement: string }>(documents: T[]): T[] {
  const groupes = new Map<string, { document: T; contextes: Set<string> }>();
  for (const document of documents) {
    const groupe = groupes.get(document.document_id);
    if (groupe) groupe.contextes.add(document.rattachement);
    else groupes.set(document.document_id, { document, contextes: new Set([document.rattachement]) });
  }
  return Array.from(groupes.values(), ({ document, contextes }) => ({
    ...document,
    rattachement: Array.from(contextes).join(" · "),
  }));
}
