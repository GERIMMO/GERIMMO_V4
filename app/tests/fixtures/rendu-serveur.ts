import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";

/** Attend les enfants serveur asynchrones sans les masquer dans les assertions. */
export async function rendreServeur(element: ReactNode): Promise<string> {
  const flux = await renderToReadableStream(element);
  await flux.allReady;
  return (await new Response(flux).text()).replace(/<!-- -->/g, "");
}
