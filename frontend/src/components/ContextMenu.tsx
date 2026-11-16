import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  /** Значок перед подписью: эмодзи или символ. */
  icon?: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Меню закрывается по клику мимо, Escape и прокрутке — как системное. */
export function ContextMenu({
  menu,
  onClose,
  ignoreRef,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
  /** Кнопка, которая открывает меню: клик по ней не должен закрывать его до обработки. */
  ignoreRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null);
      setActiveIndex(0);
      return;
    }
    const element = ref.current;
    const width = element?.offsetWidth ?? 240;
    const height = element?.offsetHeight ?? 320;
    const x = Math.min(menu.x, window.innerWidth - width - 8);
    const y = Math.min(menu.y, window.innerHeight - height - 8);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) {
        return;
      }
      if (
        ignoreRef?.current &&
        event.target instanceof Node &&
        ignoreRef.current.contains(event.target)
      ) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      const enabled = menu.items.filter((item) => !item.separator && !item.disabled);
      if (enabled.length === 0) {
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          return (current + delta + enabled.length) % enabled.length;
        });
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        enabled[activeIndex % enabled.length]?.onSelect?.();
        onClose();
      }
    };
    const onScroll = () => onClose();

    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, activeIndex, onClose, ignoreRef]);

  if (!menu) {
    return null;
  }

  let enabledIndex = -1;
  const enabledCount = menu.items.filter((item) => !item.separator && !item.disabled).length;

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: position?.x ?? menu.x, top: position?.y ?? menu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="context-menu__separator" role="separator" />;
        }
        if (!item.disabled) {
          enabledIndex += 1;
        }
        const index = enabledIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={[
              'context-menu__item',
              item.danger ? 'context-menu__item--danger' : '',
              !item.disabled && enabledCount > 0 && index === activeIndex % enabledCount
                ? 'context-menu__item--active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              onClose();
            }}
            onMouseEnter={() => {
              if (!item.disabled) {
                setActiveIndex(index);
              }
            }}
          >
            <span className="context-menu__text">
              {item.icon ? (
                <span className="context-menu__icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span>{item.label}</span>
            </span>
            {item.hint ? <kbd className="context-menu__hint">{item.hint}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}
