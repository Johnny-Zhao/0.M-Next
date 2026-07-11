import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { UsButton, UsMonoTag } from "../primitives";
import { usPaths, type UsFormKind } from "../routes-paths";
import { useWorkspaceSnapshot } from "../state/workspace-store";

export interface FormOption {
  readonly form: string;
  readonly label: string;
}

const BUILTIN_FORMS: readonly FormOption[] = [
  { form: "grid", label: "表格 GRID" },
  { form: "doc", label: "文档 DOC" },
  { form: "canvas", label: "视图 CANVAS" },
  { form: "matrix", label: "矩阵 MATRIX" },
  { form: "bi", label: "BI" },
  { form: "ana", label: "分析 ANA" },
];

const FORM_LABEL: Record<string, string> = {
  grid: "GRID",
  doc: "DOC",
  canvas: "CANVAS",
  matrix: "MATRIX",
  bi: "BI",
  ana: "ANA",
};

export function nextFormSearch(search: string, form: string): string {
  const params = new URLSearchParams(search);
  params.set("form", form);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function formLabel(form: string): string {
  return FORM_LABEL[form] ?? form.toUpperCase();
}

export function FormRow({
  activeForm,
  forms,
  onFormChange,
  children,
}: {
  readonly activeForm: string;
  readonly forms: readonly string[];
  readonly onFormChange: (form: UsFormKind) => void;
  readonly children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const snapshot = useWorkspaceSnapshot();
  const pluginForms = snapshot.plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.forms.map((form) => ({
        form: `plugin:${plugin.id}:${form}`,
        label: `${plugin.name} · ${form.toUpperCase()}`,
      })),
    );

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="us-formrow" ref={rootRef}>
      <span className="us-formrow__kicker">描述形式 · HOW</span>
      <div className="us-formrow__tags" aria-label="描述形式">
        {forms.map((form) => (
          <button
            aria-pressed={form === activeForm}
            className="us-formrow__tag"
            key={form}
            onClick={() => onFormChange(form as UsFormKind)}
            type="button"
          >
            <UsMonoTag active={form === activeForm}>
              {formLabel(form)}
            </UsMonoTag>
          </button>
        ))}
      </div>
      <UsButton
        className="us-formrow__add"
        onClick={() => setOpen((value) => !value)}
        size="sm"
        variant="ghost"
      >
        + 添加形式
      </UsButton>
      {open ? (
        <div className="us-formmenu" role="menu">
          {BUILTIN_FORMS.map((option) => (
            <button
              key={option.form}
              onClick={() => {
                onFormChange(option.form as UsFormKind);
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {option.label}
            </button>
          ))}
          {pluginForms.length > 0 ? (
            <span className="us-formmenu__sep" />
          ) : null}
          {pluginForms.map((option) => (
            <button key={option.form} role="menuitem" type="button">
              {option.label}
            </button>
          ))}
          <span className="us-formmenu__sep" />
          <Link
            onClick={() => setOpen(false)}
            role="menuitem"
            to={usPaths.plugins}
          >
            管理插件
          </Link>
        </div>
      ) : null}
      <span className="us-formrow__spacer" />
      {children ? <span className="us-formrow__aside">{children}</span> : null}
    </div>
  );
}
