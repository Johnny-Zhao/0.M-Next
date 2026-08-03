import { useMemo, useState } from "react";

import { UsButton, UsInput, UsModal, UsSelect, pushToast } from "../primitives";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { selectionStore } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import {
  buildProcurementItemFormModel,
  createInitialProcurementItemDraft,
  createProcurementItem,
  initialProcurementItemEditDraft,
  updateProcurementItem,
  removeProcurementItemFromPlan,
  type ProcurementItemEditDraft,
  type ProcurementItemDraft,
} from "./pc-procurement-item-flow";
import { isWriteSubmissionLocked } from "./write-submission-lock";

export function ProcurementItemEditor({ planId }: { readonly planId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProcurementItemDraft>(
    createInitialProcurementItemDraft,
  );
  const [saving, setSaving] = useState(false);
  const [committedPending, setCommittedPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const model = useMemo(
    () => buildProcurementItemFormModel(workspace, planId, draft.productId),
    [draft.productId, planId, workspace],
  );
  const canCreate = sessionStore.can(
    session.currentMemberId,
    "build_plan_item",
    "editData",
  );

  const begin = () => {
    setDraft(createInitialProcurementItemDraft());
    setMessage(null);
    setCommittedPending(false);
    setOpen(true);
  };
  const save = async () => {
    if (isWriteSubmissionLocked(saving, committedPending)) return;
    setSaving(true);
    const result = await createProcurementItem({ planId, draft });
    setSaving(false);
    if (result.state === "created") {
      selectionStore.set({ entityType: "object", entityId: result.itemId });
      pushToast({ title: "采购明细已创建", desc: result.message ?? undefined });
      setOpen(false);
      return;
    }
    setMessage(result.message);
    if (result.state === "committed-pending") setCommittedPending(true);
  };

  return (
    <div className="us-procurement-item-editor">
      <UsButton
        disabled={
          !canCreate || isWriteSubmissionLocked(saving, committedPending)
        }
        onClick={begin}
        size="sm"
      >
        新增明细
      </UsButton>
      {!canCreate ? <small>当前成员没有新增采购明细权限</small> : null}
      {!open ? null : (
        <form
          className="us-procurement-item-editor__form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            明细编码
            <input
              autoComplete="off"
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value })
              }
              value={draft.code}
            />
          </label>
          <label>
            明细名称
            <input
              autoComplete="off"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              value={draft.name}
            />
          </label>
          <label>
            硬件配件
            <select
              onChange={(event) => {
                const productId = event.target.value || null;
                setDraft({ ...draft, productId, quoteId: null });
                if (productId)
                  selectionStore.set({
                    entityType: "object",
                    entityId: productId,
                  });
              }}
              value={draft.productId ?? ""}
            >
              <option value="">请选择硬件配件</option>
              {model.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {`${product.code} · ${product.name} · ${product.category} · 参考价 ${product.referencePriceCny} · 性能 ${product.performanceScore} · 功耗 ${product.powerW}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            供应商报价
            <select
              disabled={!draft.productId}
              onChange={(event) => {
                const quoteId = event.target.value || null;
                setDraft({ ...draft, quoteId });
                if (quoteId)
                  selectionStore.set({
                    entityType: "object",
                    entityId: quoteId,
                  });
              }}
              value={draft.quoteId ?? ""}
            >
              <option value="">请选择供应商报价</option>
              {model.quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {`${quote.code} · ${quote.name} · ${quote.status} · 单价 ${quote.unitPriceCny} · 库存 ${quote.inventoryQty} · 交期 ${quote.deliveryDays} 天${quote.supplierName ? ` · ${quote.supplierName}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          {draft.productId && model.quotes.length === 0 ? (
            <small>该配件没有可用且匹配的供应商报价</small>
          ) : null}
          <label>
            数量
            <input
              inputMode="numeric"
              onChange={(event) =>
                setDraft({ ...draft, quantity: event.target.value })
              }
              value={draft.quantity}
            />
          </label>
          {message ? <p role="alert">{message}</p> : null}
          <div className="us-procurement-item-editor__actions">
            <UsButton
              disabled={isWriteSubmissionLocked(saving, committedPending)}
              type="submit"
              variant="primary"
            >
              {committedPending
                ? "已提交，待同步"
                : saving
                  ? "正在创建…"
                  : "创建明细"}
            </UsButton>
            <UsButton
              disabled={saving}
              onClick={() => setOpen(false)}
              size="sm"
            >
              取消
            </UsButton>
          </div>
        </form>
      )}
      <ProcurementItemMaintenance planId={planId} />
    </div>
  );
}

function ProcurementItemMaintenance({ planId }: { readonly planId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProcurementItemEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [committedPending, setCommittedPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEdit = sessionStore.can(
    session.currentMemberId,
    "build_plan_item",
    "editData",
  );
  const items = workspace.relations
    .filter(
      (relation) =>
        relation.relationTypeCode === "build_plan_contains_item" &&
        relation.status === "active" &&
        relation.sourceId === planId,
    )
    .map((relation) =>
      workspace.objects.find((object) => object.id === relation.targetId),
    )
    .filter((object) => object?.objectTypeCode === "build_plan_item");
  const item = editingId
    ? workspace.objects.find((object) => object.id === editingId)
    : undefined;
  const model = buildProcurementItemFormModel(
    workspace,
    planId,
    draft?.productId ?? null,
  );

  const beginEdit = (itemId: string) => {
    setEditingId(itemId);
    setDraft(initialProcurementItemEditDraft(workspace, itemId));
    setMessage(null);
    setCommittedPending(false);
  };
  const close = (force = false) => {
    if (saving && !force) return;
    setEditingId(null);
    setDraft(null);
    setMessage(null);
  };
  const save = async () => {
    if (!editingId || !draft) return;
    if (isWriteSubmissionLocked(saving, committedPending)) return;
    setSaving(true);
    setMessage(null);
    const result = await updateProcurementItem({
      planId,
      itemId: editingId,
      draft,
    });
    setSaving(false);
    if (result.state === "updated") {
      pushToast({ title: "采购明细已更新", desc: result.message ?? undefined });
      close(true);
      return;
    }
    setMessage(result.message);
    if (result.state === "committed-pending") setCommittedPending(true);
  };
  const remove = async () => {
    if (!editingId) return;
    if (isWriteSubmissionLocked(saving, committedPending)) return;
    setSaving(true);
    setMessage(null);
    const result = await removeProcurementItemFromPlan({
      planId,
      itemId: editingId,
    });
    setSaving(false);
    if (result.state === "removed") {
      pushToast({ title: "已从方案移除", desc: result.message ?? undefined });
      close(true);
      return;
    }
    setMessage(result.message);
    if (result.state === "committed-pending") setCommittedPending(true);
  };

  return (
    <>
      <div className="us-procurement-item-maintenance">
        {items.map((candidate) => (
          <div
            className="us-procurement-item-maintenance__row"
            key={candidate!.id}
          >
            <span>
              {String(candidate!.fields.code?.value ?? candidate!.id)} ·{" "}
              {String(candidate!.fields.name?.value ?? "—")}
            </span>
            <UsButton
              disabled={
                !canEdit ||
                committedPending ||
                ["archived", "deleted", "soft-deleted"].includes(
                  candidate!.status,
                )
              }
              onClick={() => beginEdit(candidate!.id)}
              size="sm"
            >
              编辑明细
            </UsButton>
          </div>
        ))}
      </div>
      {item && draft ? (
        <UsModal
          footer={
            <>
              <UsButton disabled={saving} onClick={() => close()} size="sm">
                取消
              </UsButton>
              <UsButton
                disabled={
                  isWriteSubmissionLocked(saving, committedPending) || !canEdit
                }
                onClick={() => void remove()}
                size="sm"
              >
                {committedPending ? "已提交，待同步" : "从方案移除"}
              </UsButton>
              <UsButton
                disabled={
                  isWriteSubmissionLocked(saving, committedPending) || !canEdit
                }
                onClick={() => void save()}
                variant="primary"
              >
                {committedPending
                  ? "已提交，待同步"
                  : saving
                    ? "正在保存…"
                    : "保存明细"}
              </UsButton>
            </>
          }
          onClose={close}
          open
          title={`编辑采购明细 · ${String(item.fields.name?.value ?? item.id)}`}
        >
          <label className="us-create-record-form__field">
            <span>数量 *</span>
            <UsInput
              data
              disabled={saving || !canEdit}
              inputMode="numeric"
              onChange={(event) =>
                setDraft({ ...draft, quantity: event.target.value })
              }
              value={draft.quantity}
            />
          </label>
          <label className="us-create-record-form__field">
            <span>硬件配件 *</span>
            <UsSelect
              disabled={saving || !canEdit}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  productId: event.target.value || null,
                  quoteId: null,
                })
              }
              value={draft.productId ?? ""}
            >
              <option value="">请选择硬件配件</option>
              {model.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} · {product.name} · {product.category} ·{" "}
                  {product.referencePriceCny} · {product.performanceScore} ·{" "}
                  {product.powerW}
                </option>
              ))}
            </UsSelect>
          </label>
          <label className="us-create-record-form__field">
            <span>供应商报价 *</span>
            <UsSelect
              disabled={saving || !draft.productId || !canEdit}
              onChange={(event) =>
                setDraft({ ...draft, quoteId: event.target.value || null })
              }
              value={draft.quoteId ?? ""}
            >
              <option value="">请选择供应商报价</option>
              {model.quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.code} · {quote.name} · {quote.status} ·{" "}
                  {quote.unitPriceCny} · {quote.inventoryQty} ·{" "}
                  {quote.deliveryDays}天
                  {quote.supplierName ? ` · ${quote.supplierName}` : ""}
                </option>
              ))}
            </UsSelect>
          </label>
          {draft.productId && model.quotes.length === 0 ? (
            <small>该配件没有可用且匹配的供应商报价</small>
          ) : null}
          {message ? <p role="alert">{message}</p> : null}
        </UsModal>
      ) : null}
    </>
  );
}
