import { useEffect, useState } from "react";
import type { Notice } from "./notice";

const SUCCESS_MS = 6000;

/** Like useState for a form message, but a success message clears itself so it does not go stale. */
export function useFlashMessage() {
  const [message, setMessage] = useState<Notice | null>(null);

  useEffect(() => {
    if (!message?.ok) return;
    const timer = window.setTimeout(() => setMessage(null), SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return [message, setMessage] as const;
}
