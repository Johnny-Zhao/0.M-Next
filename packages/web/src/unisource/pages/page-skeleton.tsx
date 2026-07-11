import type { ReactNode } from "react";

/** P0 页面骨架空态:一句定位 + 后续批次说明(样式见 us-components.css .us-empty)。 */
export function PageSkeleton({
  kicker,
  title,
  desc,
  extra,
}: {
  kicker: ReactNode;
  title: ReactNode;
  desc: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="us-empty">
      <span className="us-empty__kicker">{kicker}</span>
      <span className="us-empty__title">{title}</span>
      <span className="us-empty__desc">{desc}</span>
      {extra}
    </div>
  );
}
