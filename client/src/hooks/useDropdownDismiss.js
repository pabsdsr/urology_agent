import { useEffect } from "react";

/**
 * Dismiss an open dropdown when the user clicks outside of it.
 *
 * A click is considered "inside" when it lands within any element marked with
 * `data-dropdown-root="true"` (the trigger/menu wrappers, including portalled
 * menus) or within any of the provided `extraRefs`. Anything else calls
 * `onDismiss`.
 *
 * The listener is attached once on mount; `onDismiss` and `extraRefs` are read
 * lazily on each click, so callers can pass inline closures and stable refs.
 */
export function useDropdownDismiss(onDismiss, { extraRefs = [] } = {}) {
  useEffect(() => {
    const handleDocumentClick = (event) => {
      const roots = document.querySelectorAll('[data-dropdown-root="true"]');
      const insideRoot = Array.from(roots).some((el) => el.contains(event.target));
      const insideExtra = extraRefs.some((ref) => ref.current?.contains(event.target));
      if (!insideRoot && !insideExtra) onDismiss();
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
    // Listener reads the latest closures via the refs above; attach once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
