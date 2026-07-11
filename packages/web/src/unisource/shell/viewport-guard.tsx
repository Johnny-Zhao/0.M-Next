import { UsPanel } from "../primitives";

/**
 * ViewportGuard — <1280 显示「请加宽窗口」占位(交接规格 §04:本期不做移动端/平板)。
 * 纯 CSS 媒体查询控制显隐。
 */
export function ViewportGuard() {
  return (
    <div className="us-viewport-guard" role="alert">
      <UsPanel shadow bodyClassName="us-empty" style={{ maxWidth: 420 }}>
        <span className="us-empty__kicker">DESKTOP ONLY</span>
        <span className="us-empty__title">请加宽窗口</span>
        <span className="us-empty__desc">
          同源工作区需要至少 <span className="us-data">1280px</span>{" "}
          宽度;移动端与平板不在本期支持范围。
        </span>
      </UsPanel>
    </div>
  );
}
