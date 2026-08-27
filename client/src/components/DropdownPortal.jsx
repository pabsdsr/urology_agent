import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function isInsideMenu(eventTarget, menuEl) {
  return Boolean(menuEl && eventTarget instanceof Node && menuEl.contains(eventTarget));
}

/** Fixed-position dropdown menu anchored to (and tracking) an input element. */
export default function DropdownPortal({
  open,
  anchorEl,
  children,
  menuMaxHeightPx = 240,
}) {
  const [style, setStyle] = useState(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return undefined;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const gapPx = 4;
      const viewport = window.visualViewport;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const availableBelow = Math.max(80, viewportBottom - rect.bottom - gapPx - 8);
      const maxHeight = Math.min(menuMaxHeightPx, availableBelow);

      setStyle({
        position: "fixed",
        top: rect.bottom + gapPx,
        left: rect.left,
        width: rect.width,
        maxHeight,
        overflow: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      });
    };

    // Reposition the menu to stay pinned under the input, but ignore scrolls that
    // happen inside the menu itself so its own list can scroll normally.
    const handleReposition = (event) => {
      if (isInsideMenu(event.target, menuRef.current)) return;
      update();
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", handleReposition, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", handleReposition, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, anchorEl, menuMaxHeightPx]);

  if (!open || !anchorEl || !style) return null;

  return createPortal(
    <div ref={menuRef} data-dropdown-root="true" style={style} className="z-[99999]">
      {children}
    </div>,
    document.body
  );
}
