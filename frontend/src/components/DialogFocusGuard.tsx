import { useEffect } from 'react';

const DIALOG = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Держит фокус в верхнем модальном окне и возвращает его после закрытия. */
export function DialogFocusGuard() {
  useEffect(() => {
    let previousFocus: HTMLElement | null = null;
    let hadDialog = false;

    const dialogs = () =>
      Array.from(document.querySelectorAll<HTMLElement>(DIALOG)).filter(
        (dialog) => dialog.getClientRects().length > 0,
      );

    const focusables = (dialog: HTMLElement) =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getClientRects().length > 0,
      );

    const sync = () => {
      const open = dialogs();
      if (open.length > 0 && !hadDialog) {
        previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const top = open[open.length - 1];
        if (top) {
          (focusables(top)[0] ?? top).focus();
        }
      } else if (open.length === 0 && hadDialog) {
        previousFocus?.focus();
        previousFocus = null;
      }
      hadDialog = open.length > 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }
      const open = dialogs();
      const dialog = open[open.length - 1];
      if (!dialog) {
        return;
      }
      const items = focusables(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKeyDown, true);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return null;
}
