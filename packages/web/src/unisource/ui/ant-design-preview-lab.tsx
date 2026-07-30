import {
  Button,
  Dropdown,
  Empty,
  Input,
  Select,
  Skeleton,
  Spin,
  Tooltip,
  message,
} from "antd";
import { useMemo, useState } from "react";

import { ExperimentalUsForm } from "./experimental-us-form";
import { ExperimentalUsModal } from "./experimental-us-modal";
import { ExperimentalUsTree } from "./experimental-us-tree";
import {
  deriveExperimentalTreeSearch,
  filterExperimentalTree,
  reorderExperimentalDirectorySiblings,
  type ExperimentalUsTreeNode,
} from "./experimental-us-tree-model";

function previewNodes(
  archiveLoaded: boolean,
  directoryOrder: readonly string[],
): ExperimentalUsTreeNode[] {
  const fields = Array.from({ length: 1000 }, (_, index) => ({
    key: `field:plan-std:${index + 1}`,
    kind: "field" as const,
    label: `字段 ${index + 1} · 方案属性`,
  }));
  const directories: ExperimentalUsTreeNode[] = [
    {
      key: "directory:procurement",
      kind: "directory",
      label: "采购目录",
      children: [
        {
          key: "library:plans",
          kind: "record-library",
          label: "采购方案记录库",
          children: [
            {
              key: "record:plan-std",
              kind: "record",
              label: "标准开发方案",
              children: fields,
            },
          ],
        },
      ],
    },
    {
      key: "directory:archive",
      kind: "directory",
      label: "归档目录（异步）",
      lazy: !archiveLoaded,
      children: archiveLoaded
        ? [
            {
              key: "library:archive",
              kind: "record-library",
              label: "历史记录库",
            },
          ]
        : undefined,
    },
  ];
  return [...directories].sort(
    (left, right) =>
      directoryOrder.indexOf(left.key) - directoryOrder.indexOf(right.key),
  );
}

/** Preview-only proof that Ant Design can preserve UniSource interaction rules. */
export function AntDesignPreviewLab() {
  const [query, setQuery] = useState("");
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [directoryOrder, setDirectoryOrder] = useState([
    "directory:procurement",
    "directory:archive",
  ]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([
    "directory:procurement",
    "library:plans",
    "record:plan-std",
  ]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [dragStatus, setDragStatus] = useState(
    "仅支持同级目录的本地排序，未保存业务数据。",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [saveMode, setSaveMode] = useState<"success" | "failure">("success");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [messageApi, messageContext] = message.useMessage();
  const nodes = useMemo(
    () => previewNodes(archiveLoaded, directoryOrder),
    [archiveLoaded, directoryOrder],
  );
  const search = useMemo(
    () => deriveExperimentalTreeSearch(nodes, query),
    [nodes, query],
  );
  const visibleNodes = useMemo(
    () =>
      query.trim() ? filterExperimentalTree(nodes, search.matches) : nodes,
    [nodes, query, search.matches],
  );

  const submitFolder = () => {
    const name = folderName.trim();
    if (!name) return setFormError("文件夹名称不能为空");
    if (name.toLocaleLowerCase() === "采购目录") {
      return setFormError("同级已存在“采购目录”");
    }
    setFormError(null);
    setSaving(true);
    void Promise.resolve().then(() => {
      setSaving(false);
      if (saveMode === "failure") return setFormError("后端保存失败，请重试");
      setModalOpen(false);
      messageApi.success("文件夹已保存（技术验证）");
    });
  };

  return (
    <section aria-labelledby="ant-preview-title" className="us-ant-preview">
      {messageContext}
      <header className="us-ant-preview__header">
        <div>
          <span className="us-ant-preview__eyebrow">TECHNICAL SPIKE</span>
          <h2 id="ant-preview-title">Ant Design 受控接入验证</h2>
          <p>仅验证组件能力；不连接任何工作空间业务数据。</p>
        </div>
        <Button onClick={() => setModalOpen(true)} type="primary">
          新建文件夹
        </Button>
      </header>

      <div className="us-ant-preview__grid">
        <section className="us-ant-preview__tree" aria-label="受控目录树">
          <Input.Search
            allowClear
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索目录、记录或字段"
            value={query}
          />
          <ExperimentalUsTree
            draggable
            expandedKeys={query ? search.expandedKeys : expandedKeys}
            height={280}
            loadedKeys={archiveLoaded ? ["directory:archive"] : []}
            nodes={visibleNodes}
            onContextMenu={setContextKey}
            onDropIntent={(intent) => {
              const result = reorderExperimentalDirectorySiblings(
                nodes,
                intent,
              );
              if (!result.moved) {
                setDragStatus("仅支持同级目录的本地排序；未改变预览顺序。");
                return;
              }
              setDirectoryOrder(result.nodes.map((node) => node.key));
              setDragStatus("目录顺序已更新。仅技术预览，未保存业务数据。");
            }}
            onExpandedKeysChange={(keys) => setExpandedKeys([...keys])}
            onLoadNode={async (key) => {
              if (key === "directory:archive") {
                await Promise.resolve();
                setArchiveLoaded(true);
              }
            }}
            onSelectedKeysChange={(keys) => setSelectedKeys([...keys])}
            searchQuery={query}
            selectedKeys={selectedKeys}
          />
          <small>{contextKey ? `已捕获右键：${contextKey}` : dragStatus}</small>
        </section>

        <section className="us-ant-preview__controls" aria-label="控件状态">
          <label>
            保存结果
            <Select
              onChange={setSaveMode}
              options={[
                { label: "保存成功", value: "success" },
                { label: "模拟后端失败", value: "failure" },
              ]}
              value={saveMode}
            />
          </label>
          <div className="us-ant-preview__actions">
            <Tooltip title="沿用 UniSource 青绿色主操作">
              <Button type="primary">主操作</Button>
            </Tooltip>
            <Dropdown
              menu={{ items: [{ key: "inspect", label: "查看验证状态" }] }}
            >
              <Button>更多操作</Button>
            </Dropdown>
            <Button disabled>禁用状态</Button>
            <Button loading>保存中</Button>
          </div>
          <Input
            placeholder="中文长文本与长 ID：REQ-2026-采购方案-00000001"
            status="error"
          />
          <div className="us-ant-preview__states">
            <Empty
              description="树空状态示例"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
            <Spin description="正在异步加载目录" />
          </div>
        </section>
      </div>
      <ExperimentalUsModal
        footer={<Button onClick={() => setModalOpen(false)}>取消</Button>}
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="新建文件夹"
      >
        <ExperimentalUsForm
          error={formError}
          onSubmit={submitFolder}
          onValueChange={(value) => {
            setFolderName(value);
            setFormError(null);
          }}
          saving={saving}
          value={folderName}
        />
      </ExperimentalUsModal>
    </section>
  );
}
