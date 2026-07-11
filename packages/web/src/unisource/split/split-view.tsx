import { useState } from "react";

import { RefChip } from "../doc/ref-chip";
import { DataGrid } from "../grid/data-grid";
import { GridToolbar } from "../grid/grid-toolbar";
import { IconSync, UsButton, UsMonoTag } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { ChangeLog, deriveChangeLogItems } from "./change-log";

const PRODUCT_TYPE = "product_specs";

export function SplitView({ exprId }: { readonly exprId: string }) {
  const workspace = useWorkspaceSnapshot();
  const [search, setSearch] = useState("");
  const [hideEol, setHideEol] = useState(false);
  const objectType = workspace.objectTypes.find(
    (type) => type.code === PRODUCT_TYPE,
  );
  const objects = workspace.objects.filter(
    (object) => object.objectTypeCode === PRODUCT_TYPE,
  );
  const refs = workspace.fieldRefs.filter((ref) => ref.exprId === exprId);
  const justSynced = refs.filter((ref) => ref.state === "justSynced").length;
  const logItems = deriveChangeLogItems({
    events: workspace.changeEvents,
    objects: workspace.objects,
    members: workspace.members,
    objectTypeCode: PRODUCT_TYPE,
  });

  if (!objectType) return null;

  return (
    <section className="us-splitview">
      <div className="us-splitview__left">
        <GridToolbar
          hideEol={hideEol}
          onSearch={setSearch}
          onToggleHideEol={() => setHideEol((value) => !value)}
          search={search}
        />
        <DataGrid
          compact
          hideEol={hideEol}
          objectType={objectType}
          objects={objects}
          search={search}
        />
      </div>
      <div className="us-splitview__sync">
        <UsButton
          icon={<IconSync size={14} />}
          onClick={() => undefined}
          size="sm"
          variant="ghost"
        >
          同步
        </UsButton>
      </div>
      <SplitDocument exprId={exprId} justSynced={justSynced} />
      <ChangeLog items={logItems} />
    </section>
  );
}

export function SplitDocument({
  exprId,
  justSynced,
}: {
  readonly exprId: string;
  readonly justSynced?: number;
}) {
  return (
    <article className="us-splitdoc">
      <header>
        <span>产品规格书</span>
        <UsMonoTag tone={justSynced ? "change" : "primary"}>
          {justSynced ? `${justSynced} 项已更新` : "✓ 自动同步"}
        </UsMonoTag>
      </header>
      <h1>智能门锁 S3 产品规格书</h1>
      <p>
        S3 面向高端入户门场景,当前权威售价为{" "}
        <RefChip
          exprId={exprId}
          fieldCode="price"
          label="售价"
          objectId="prod-s3"
        />
        ,预计上市日期为{" "}
        <RefChip
          exprId={exprId}
          fieldCode="launch_date"
          label="上市日期"
          objectId="prod-s3"
        />
        。
      </p>
      <p>正文中的字段引用来自同一份产品规格数据,表格编辑会同步刷新文档。</p>
      <table>
        <tbody>
          <tr>
            <th>字段</th>
            <th>值</th>
          </tr>
          <tr>
            <td>续航</td>
            <td>
              <RefChip
                exprId={exprId}
                fieldCode="battery_months"
                label="续航"
                objectId="prod-s3"
              />
            </td>
          </tr>
          <tr>
            <td>防护等级</td>
            <td>
              <RefChip
                exprId={exprId}
                fieldCode="rating"
                label="防护"
                objectId="prod-s3"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
