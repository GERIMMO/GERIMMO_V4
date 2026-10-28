import { redirect } from "next/navigation";

export const metadata = { title: "Mon agenda" };

// Toutes les missions vivent dans l'agenda ; `/artisan/missions` n'est que le préfixe de leurs fiches. Une adresse
// tronquée ou devinée mène donc à l'agenda plutôt qu'à la page « introuvable » (audit final, DOC-24). La garde d'accès
// est celle de l'agenda.
export default function PageMissions() {
  redirect("/artisan/agenda");
}
