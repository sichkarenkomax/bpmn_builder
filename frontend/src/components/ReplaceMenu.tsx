import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ReplaceEntry {
  label?: string;
  className?: string;
  action?: () => void;
}

export interface ReplaceMenuState {
  x: number;
  y: number;
  entries: ReplaceEntry[];
}

/**
 * Компактное меню «Сменить тип»: только иконки, открывается по ПКМ.
 * Подписи остаются в title/aria-label, чтобы меню не занимало пол-экрана.
 */
export function ReplaceMenu({
  menu,
  onClose,
}: {
  menu: ReplaceMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null);
      return;
    }
    const element = ref.current;
    const width = element?.offsetWidth ?? 176;
    const height = element?.offsetHeight ?? 160;
    setPosition({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="replace-menu"
      role="menu"
      aria-label="Сменить тип элемента"
      style={{ left: position?.x ?? menu.x, top: position?.y ?? menu.y }}
    >
      {menu.entries.map((entry, index) => {
        const label = entry.label || 'Элемент';
        return (
          <button
            key={`${label}-${index}`}
            type="button"
            role="menuitem"
            className="replace-menu__item"
            title={label}
            aria-label={label}
            onClick={() => {
              entry.action?.();
              onClose();
            }}
          >
            {entry.className ? (
              <span className={`replace-menu__icon ${entry.className}`} aria-hidden="true" />
            ) : (
              <span className="replace-menu__icon replace-menu__icon--text" aria-hidden="true">
                {label.slice(0, 1)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
