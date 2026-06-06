import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Fixed-position dropdown menu anchored to an input element. */
export default function DropdownPortal({
  open,
  anchorEl,
  children,
  menuMaxHeightPx = 240,
}) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const gapPx = 4;
      const availableBelow = Math.max(80, window.innerHeight - rect.bottom - gapPx - 8);
      const maxHeight = Math.min(menuMaxHeightPx, availableBelow);

      setStyle({
        position: "fixed",
        top: rect.bottom + gapPx,
        left: rect.left,
        width: rect.width,
        maxHeight,
        overflow: "auto",
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl, menuMaxHeightPx]);

  if (!open || !anchorEl || !style) return null;

  return createPortal(
    <div data-dropdown-root="true" style={style} className="z-[99999]">
      {children}
    </div>,
    document.body
  );
}
