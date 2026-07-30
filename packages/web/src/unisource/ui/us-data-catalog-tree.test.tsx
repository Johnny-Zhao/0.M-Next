import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UniSourceUiProvider } from "./uni-source-ui-provider";
import {
  applyCatalogTreeExpand,
  applyCatalogTreeSelect,
  recordLibraryToLoad,
  UsDataCatalogTree,
} from "./us-data-catalog-tree";

const renderTree = (props: Partial<Parameters<typeof UsDataCatalogTree>[0]>) =>
  renderToStaticMarkup(
    <UniSourceUiProvider>
      <UsDataCatalogTree
        error={null}
        expandedKeys={[]}
        loading={false}
        nodes={[]}
        onExpandedKeysChange={vi.fn()}
        onLibraryOpen={vi.fn()}
        onLoadMore={vi.fn()}
        onRecordLibraryExpand={vi.fn()}
        onRecordOpen={vi.fn()}
        onRetry={vi.fn()}
        onRetryRecords={vi.fn()}
        selectedKeys={[]}
        {...props}
      />
    </UniSourceUiProvider>,
  );

describe("UsDataCatalogTree", () => {
  it("renders the catalog empty and retry states without fabricating nodes", () => {
    expect(renderTree({})).toContain("当前工作空间未配置数据目录");
    const failed = renderTree({ error: "服务不可用" });
    expect(failed).toContain("数据目录读取失败：服务不可用");
    expect(failed).toContain("重试");
  });

  it("renders an explicit empty search result", () => {
    expect(
      renderTree({ searchEmptyMessage: "没有匹配的数据目录内容" }),
    ).toContain("没有匹配的数据目录内容");
  });
  it("only requests records when a record library, not a directory, expands", () => {
    expect(
      recordLibraryToLoad(
        { key: "directory:root", label: "Root", kind: "directory" },
        true,
      ),
    ).toBeNull();
    expect(
      recordLibraryToLoad(
        {
          key: "library:product",
          label: "Product",
          kind: "record-library",
          objectTypeCode: "product",
        },
        true,
      ),
    ).toBe("product");
  });

  it("maps actual tree expansion and selection events to catalog callbacks", () => {
    const callbacks = {
      onExpandedKeysChange: vi.fn(),
      onLibraryOpen: vi.fn(),
      onRecordLibraryExpand: vi.fn(),
      onRecordOpen: vi.fn(),
      onLoadMore: vi.fn(),
      onRetryRecords: vi.fn(),
    };
    const directory = {
      key: "directory:root",
      label: "Root",
      kind: "directory",
    } as const;
    const library = {
      key: "library:product",
      label: "Product",
      kind: "record-library",
      objectTypeCode: "product",
    } as const;
    const record = {
      key: "record:product:product-1",
      label: "Product 1",
      kind: "record",
      objectTypeCode: "product",
      objectId: "product-1",
    } as const;

    applyCatalogTreeExpand(directory, [directory.key], true, callbacks);
    expect(callbacks.onExpandedKeysChange).toHaveBeenCalledWith([
      directory.key,
    ]);
    expect(callbacks.onRecordLibraryExpand).not.toHaveBeenCalled();

    applyCatalogTreeExpand(library, [library.key], true, callbacks);
    expect(callbacks.onRecordLibraryExpand).toHaveBeenCalledOnce();
    expect(callbacks.onRecordLibraryExpand).toHaveBeenCalledWith("product");

    applyCatalogTreeSelect(library, [], callbacks);
    applyCatalogTreeSelect(record, [], callbacks);
    applyCatalogTreeSelect(
      {
        key: "record-action:product:more:1",
        label: "More",
        kind: "record-action",
        objectTypeCode: "product",
        action: "load-more",
      },
      [],
      callbacks,
    );
    applyCatalogTreeSelect(
      {
        key: "record-action:product:retry",
        label: "Retry",
        kind: "record-action",
        objectTypeCode: "product",
        action: "retry",
      },
      [],
      callbacks,
    );

    expect(callbacks.onLibraryOpen).toHaveBeenCalledWith("product");
    expect(callbacks.onRecordOpen).toHaveBeenCalledWith("product", "product-1");
    expect(callbacks.onLoadMore).toHaveBeenCalledWith("product");
    expect(callbacks.onRetryRecords).toHaveBeenCalledWith("product");
  });

  it("does not map disabled diagnostic nodes to catalog callbacks", () => {
    const callbacks = {
      onExpandedKeysChange: vi.fn(),
      onLibraryOpen: vi.fn(),
      onRecordOpen: vi.fn(),
      onLoadMore: vi.fn(),
      onRetryRecords: vi.fn(),
    };

    applyCatalogTreeSelect(
      {
        key: "library:missing",
        label: "Missing",
        kind: "record-library",
        objectTypeCode: "missing",
        disabled: true,
      },
      [],
      callbacks,
    );

    expect(callbacks.onExpandedKeysChange).not.toHaveBeenCalled();
    expect(callbacks.onLibraryOpen).not.toHaveBeenCalled();
    expect(callbacks.onRecordOpen).not.toHaveBeenCalled();
    expect(callbacks.onLoadMore).not.toHaveBeenCalled();
    expect(callbacks.onRetryRecords).not.toHaveBeenCalled();
  });
});
