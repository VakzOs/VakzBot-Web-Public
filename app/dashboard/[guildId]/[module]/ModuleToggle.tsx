"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "../ModulesClient";
import { toggleModuleAction } from "../actions";

/**
 * Interrupteur du module, dans l'en-tête de sa page de configuration.
 *
 * Il était jusqu'ici sur la seule liste des modules : régler un module puis
 * devoir ressortir pour l'allumer n'avait aucune raison d'être.
 *
 * Le basculement est optimiste — l'interrupteur suit le doigt — puis
 * `router.refresh()` fait re-rendre la page côté serveur, ce qui met à jour le
 * bandeau « module désactivé » du formulaire. Sans ce rafraîchissement, l'état
 * affiché ailleurs sur la page contredirait l'interrupteur.
 */
export function ModuleToggle({
  guildId,
  moduleName,
  initial,
}: {
  guildId: string;
  moduleName: string;
  initial: boolean;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleModuleAction(guildId, moduleName, next);
      if (!res.ok) {
        setEnabled(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="ml-auto flex shrink-0 items-center gap-[10px]">
      <span className="text-[13px] font-semibold text-[var(--mut)]">
        {enabled ? "Activé" : "Désactivé"}
      </span>
      <Toggle enabled={enabled} pending={pending} onChange={toggle} />
    </div>
  );
}
