import { useEffect, useMemo, useRef, useState } from "react";

import type { FieldDef } from "../model/kernel";
import { UsMonoTag } from "../primitives";
import {
  filterFieldOptions,
  popoverReducer,
  type PopoverState,
} from "./doc-view-model";

export function RefInsertPopover({
  fields,
  sourceLabel,
  objectLabel,
  query,
  onQuery,
  onInsert,
  onCancel,
}: {
  readonly fields: readonly FieldDef[];
  readonly sourceLabel: string;
  readonly objectLabel: string;
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly onInsert: (field: FieldDef) => void;
  readonly onCancel: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<PopoverState>({
    open: true,
    activeIndex: 0,
  });
  const options = useMemo(
    () => filterFieldOptions(fields, query),
    [fields, query],
  );
  const activeIndex = Math.min(
    state.activeIndex,
    Math.max(0, options.length - 1),
  );

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onCancel]);

  return (
    <div
      className="us-refpop"
      onKeyDown={(event) => {
        if (
          event.key !== "ArrowDown" &&
          event.key !== "ArrowUp" &&
          event.key !== "Enter" &&
          event.key !== "Escape"
        ) {
          return;
        }
        event.preventDefault();
        const result = popoverReducer(state, {
          kind: event.key as "ArrowDown" | "ArrowUp" | "Enter" | "Escape",
          size: options.length,
        });
        setState(result.state);
        if ("cancelled" in result) onCancel();
        if ("selectedIndex" in result && result.selectedIndex !== undefined) {
          onInsert(options[result.selectedIndex]!);
        }
      }}
      ref={rootRef}
    >
      <header>
        <strong>
          @引用字段 · {sourceLabel} › {objectLabel}
        </strong>
        <UsMonoTag>@{query}</UsMonoTag>
      </header>
      <input
        autoFocus
        onChange={(event) => {
          onQuery(event.currentTarget.value);
          setState({ open: true, activeIndex: 0 });
        }}
        placeholder="输入字段名或 code"
        value={query}
      />
      <div className="us-refpop__list">
        {options.map((field, index) => (
          <button
            data-active={index === activeIndex}
            key={field.code}
            onClick={() => onInsert(field)}
            type="button"
          >
            <span>{field.name}</span>
            <UsMonoTag>{field.code}</UsMonoTag>
          </button>
        ))}
        {options.length === 0 ? <p>无匹配字段</p> : null}
      </div>
      <footer>↑↓ 选择 ↵ 插入引用 esc 取消</footer>
    </div>
  );
}
