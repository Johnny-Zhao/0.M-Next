import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  defaultCommandRegistry,
  groupCommandItems,
  resolveCommandItems,
  type CommandContext,
  type CommandDefinition,
  type CommandRegistry,
} from "./commands";

export interface CommandPaletteProps {
  readonly context: CommandContext;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onError: (message: string) => void;
  readonly registry?: CommandRegistry;
}

export function isCommandPaletteShortcut(
  event: Pick<
    KeyboardEvent | globalThis.KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
): boolean {
  return (
    event.key.toLocaleLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function nextActiveIndex(
  current: number,
  length: number,
  direction: 1 | -1,
): number {
  if (length <= 0) return 0;
  return (current + direction + length) % length;
}

export async function executeCommand(
  command: CommandDefinition,
  context: CommandContext,
  query: string,
): Promise<void> {
  await command.run(context, { query });
}

export function CommandPalette({
  context,
  isOpen,
  onClose,
  onError,
  registry = defaultCommandRegistry,
}: CommandPaletteProps): ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly CommandDefinition[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const groupedItems = useMemo(() => groupCommandItems(items), [items]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    setLoading(true);
    void resolveCommandItems(registry, context, query)
      .then((nextItems) => {
        if (disposed) return;
        setItems(nextItems);
        setActiveIndex(0);
      })
      .catch((error) => {
        if (disposed) return;
        setItems([]);
        onError(error instanceof Error ? error.message : "命令加载失败");
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [context, isOpen, onError, query, registry]);

  if (!isOpen) return null;

  async function runActiveCommand(): Promise<void> {
    const command = items[activeIndex];
    if (!command) return;
    try {
      await executeCommand(command, context, query);
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "命令执行失败");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        nextActiveIndex(
          current,
          items.length,
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void runActiveCommand();
    }
  }

  return (
    <div className="command-palette-backdrop" onKeyDown={handleKeyDown}>
      <section
        aria-label="命令面板"
        aria-modal="true"
        className="command-palette"
        role="dialog"
      >
        <input
          aria-label="搜索命令"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索对象、命令或面板"
          ref={inputRef}
          value={query}
        />
        <div aria-live="polite" className="command-palette-list">
          {loading ? <p className="command-palette-empty">加载中</p> : null}
          {!loading && items.length === 0 ? (
            <p className="command-palette-empty">无匹配命令</p>
          ) : null}
          {!loading ? (
            <CommandGroups
              activeIndex={activeIndex}
              groupedItems={groupedItems}
              onChoose={(command, index) => {
                setActiveIndex(index);
                void executeCommand(command, context, query)
                  .then(onClose)
                  .catch((error) =>
                    onError(
                      error instanceof Error ? error.message : "命令执行失败",
                    ),
                  );
              }}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

interface CommandGroupsProps {
  readonly activeIndex: number;
  readonly groupedItems: readonly [string, readonly CommandDefinition[]][];
  readonly onChoose: (command: CommandDefinition, index: number) => void;
}

function CommandGroups({
  activeIndex,
  groupedItems,
  onChoose,
}: CommandGroupsProps): ReactElement {
  let index = 0;
  return (
    <>
      {groupedItems.map(([group, commands]) => (
        <section className="command-palette-group" key={group}>
          <h2>{group}</h2>
          {commands.map((command) => {
            const itemIndex = index;
            index += 1;
            return (
              <button
                aria-current={itemIndex === activeIndex ? "true" : undefined}
                key={command.id}
                onClick={() => onChoose(command, itemIndex)}
                type="button"
              >
                <span>{command.title}</span>
                {command.description ? (
                  <small>{command.description}</small>
                ) : null}
              </button>
            );
          })}
        </section>
      ))}
    </>
  );
}
