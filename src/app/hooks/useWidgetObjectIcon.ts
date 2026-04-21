import { useEffect, useState } from "react";
import { getIconMap } from "../../platform/persistence/sessionReadRepository.ts";

export function useWidgetObjectIcon(objectIconKey: string | null) {
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!objectIconKey || icons[objectIconKey]) {
      return;
    }

    let cancelled = false;

    void getIconMap()
      .then((nextIcons) => {
        if (!cancelled) {
          setIcons(nextIcons);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("load widget object icon failed", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [icons, objectIconKey]);

  return objectIconKey ? icons[objectIconKey] ?? null : null;
}
