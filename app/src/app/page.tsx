import { redirect } from "next/navigation";

export default function Home() {
  // Le proxy redirige les non-connectés vers /connexion
  redirect("/espaces");
}
