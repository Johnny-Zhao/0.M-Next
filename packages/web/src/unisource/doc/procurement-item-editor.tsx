import { useMemo, useState } from "react";

import { UsButton, pushToast } from "../primitives";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { selectionStore } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import {
  buildProcurementItemFormModel,
  createInitialProcurementItemDraft,
  createProcurementItem,
  type ProcurementItemDraft,
} from "./procurement-item-flow";

export function ProcurementItemEditor({ planId }: { readonly planId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProcurementItemDraft>(
    createInitialProcurementItemDraft,
  );
  const [saving, setSaving] = useState(false);
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
    setOpen(true);
  };
  const save = async () => {
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
  };

  return (
    <div className="us-procurement-item-editor">
      <UsButton disabled={!canCreate || saving} onClick={begin} size="sm">
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
                  {`${quote.code} · ${quote.name} · 单价 ${quote.unitPriceCny} · 库存 ${quote.inventoryQty} · 交期 ${quote.deliveryDays} 天${quote.supplierName ? ` · ${quote.supplierName}` : ""}`}
                </option>
              ))}
            </select>
          </label>
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
            <UsButton disabled={saving} type="submit" variant="primary">
              {saving ? "正在创建…" : "创建明细"}
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
    </div>
  );
}
