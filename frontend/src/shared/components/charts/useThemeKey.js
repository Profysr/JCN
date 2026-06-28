import { useEffect, useState } from "react";

/**
 * Returns a key that increments whenever the dark/light theme class toggles on
 * the document root. Use as a `key` prop on Chart.js canvas wrappers to force a
 * full remount (and fresh color reads) after a theme switch.
 */
export function useThemeKey() {
  const [key, setKey] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setKey((k) => k + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return key;
}
