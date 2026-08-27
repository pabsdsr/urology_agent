import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Dropdown menu anchored to (and tracking) an input element. */
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
      // Position in *document* coordinates (position: absolute) rather than
      // fixed-to-viewport. iOS Safari doesn't fire scroll events or repaint
      // fixed elements continuously during a touch-scroll gesture, which makes a
      // fixed menu detach from its input while scrolling. Absolute positioning
      // lets the browser scroll the menu together with the page natively.
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;

      const viewport = window.visualViewport;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const availableBelow = Math.max(80, viewportBottom - rect.bottom - gapPx - 8);
      const maxHeight = Math.min(menuMaxHeightPx, availableBelow);

      setStyle({
        position: "absolute",
        top: rect.bottom + scrollY + gapPx,
        left: rect.left + scrollX,
        width: rect.width,
        maxHeight,
        overflow: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      });
    };

    update();
    // Recompute on layout-affecting changes (rotation, keyboard show/hide).
    // Page scrolling is handled natively by absolute positioning, so we don't
    // reposition on every scroll event (which is janky/deferred on iOS Safari).
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
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
