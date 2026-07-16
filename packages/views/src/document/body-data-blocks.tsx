import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactElement, ReactNode } from "react";

export type DocumentDataBlock =
  | {
      readonly kind: "dataReference";
      readonly config: DocumentDataReferenceConfig;
    }
  | { readonly kind: "dataTable"; readonly config: DocumentDataTableConfig };

export interface DocumentDataReferenceConfig {
  readonly objectTypeCode?: string;
  readonly objectId?: string;
  readonly objectCode?: string;
  readonly objectBinding?: "document-root";
  readonly fieldCode?: string;
  readonly relationTypeCode?: string;
}

export interface DocumentDataTableColumnConfig {
  readonly id: string;
  readonly label?: string;
  readonly fieldCode: string;
  readonly relationPath?: readonly string[];
  readonly minWidth?: number;
}

export interface DocumentDataTableConfig {
  readonly objectTypeCode: string;
  readonly relationTypeCode?: string;
  readonly scope?: "workspace" | "document-root";
  readonly columns: readonly DocumentDataTableColumnConfig[];
  readonly maxRows?: number;
  readonly sort?: {
    readonly fieldCode: string;
    readonly direction: "asc" | "desc";
  };
  readonly filter?: {
    readonly fieldCode: string;
    readonly equals: string | number | boolean;
  };
  readonly allowRowSelection?: boolean;
  readonly showDerivedBadge?: boolean;
}

export interface DocumentDataBlockRenderContext {
  readonly block: DocumentDataBlock;
  readonly selected: boolean;
}

export type DocumentDataBlockRenderer = (
  context: DocumentDataBlockRenderContext,
) => ReactNode;

export interface DocumentBodyEditorActions {
  readonly selectedBlock: DocumentDataBlock | null;
  readonly insertDataReference: (
    config: DocumentDataReferenceConfig,
  ) => boolean;
  readonly insertDataTable: (config: DocumentDataTableConfig) => boolean;
  readonly replaceSelectedBlock: (block: DocumentDataBlock) => boolean;
  readonly removeSelectedBlock: () => boolean;
}

export function documentDataBlockExtensions(
  renderer?: DocumentDataBlockRenderer,
) {
  return [
    documentDataBlockNode("dataReference", renderer),
    documentDataBlockNode("dataTable", renderer),
  ];
}

export function selectedDocumentDataBlock(
  editor: Editor,
): DocumentDataBlock | null {
  const node = (
    editor.state.selection as unknown as {
      readonly node?: {
        readonly type: { readonly name: string };
        readonly attrs: Record<string, unknown>;
      };
    }
  ).node;
  if (node?.type.name !== "dataReference" && node?.type.name !== "dataTable") {
    return null;
  }
  const config = readRecord(node.attrs.config);
  if (!config) return null;
  return node.type.name === "dataReference"
    ? { kind: "dataReference", config }
    : {
        kind: "dataTable",
        config: config as unknown as DocumentDataTableConfig,
      };
}

function documentDataBlockNode(
  name: "dataReference" | "dataTable",
  renderer?: DocumentDataBlockRenderer,
) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return { config: { default: null } };
    },
    parseHTML() {
      return [{ tag: `[data-document-block="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, { "data-document-block": name }),
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => (
        <DocumentDataBlockNodeView
          block={readBlock(name, props.node.attrs.config)}
          renderer={renderer}
          selected={props.selected}
        />
      ));
    },
  });
}

function DocumentDataBlockNodeView({
  block,
  renderer,
  selected,
}: {
  readonly block: DocumentDataBlock | null;
  readonly renderer?: DocumentDataBlockRenderer;
  readonly selected: boolean;
}): ReactElement {
  return (
    <div className="document-body-data-block" data-selected={selected}>
      {block && renderer ? (
        renderer({ block, selected })
      ) : (
        <span>数据块配置不可用</span>
      )}
    </div>
  );
}

function readBlock(
  kind: "dataReference" | "dataTable",
  value: unknown,
): DocumentDataBlock | null {
  const config = readRecord(value);
  if (!config) return null;
  if (kind === "dataReference") {
    return { kind, config: config as DocumentDataReferenceConfig };
  }
  if (
    typeof config.objectTypeCode !== "string" ||
    !Array.isArray(config.columns)
  ) {
    return null;
  }
  return { kind, config: config as unknown as DocumentDataTableConfig };
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
