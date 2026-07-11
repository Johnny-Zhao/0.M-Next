import { Link } from "react-router-dom";

import { usPaths } from "../routes-paths";

/** 同源 Logo(设计稿 SVG:主色圆角方块 + 三行「点 + 横条」,第三行 55% 透明)。 */
export function UsLogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="6"
        fill="var(--us-primary)"
      />
      <rect
        x="5.5"
        y="6"
        width="3"
        height="3"
        rx="0.8"
        fill="var(--us-white)"
      />
      <rect
        x="5.5"
        y="11"
        width="3"
        height="3"
        rx="0.8"
        fill="var(--us-white)"
      />
      <rect
        x="5.5"
        y="16"
        width="3"
        height="3"
        rx="0.8"
        fill="var(--us-white)"
        opacity="0.55"
      />
      <rect
        x="11"
        y="6.6"
        width="8"
        height="1.8"
        rx="0.9"
        fill="var(--us-white)"
      />
      <rect
        x="11"
        y="11.6"
        width="8"
        height="1.8"
        rx="0.9"
        fill="var(--us-white)"
      />
      <rect
        x="11"
        y="16.6"
        width="5"
        height="1.8"
        rx="0.9"
        fill="var(--us-white)"
        opacity="0.55"
      />
    </svg>
  );
}

export function UsLogo({ sub = true }: { sub?: boolean }) {
  return (
    <Link to={usPaths.home} className="us-logo" aria-label="同源 · 首页">
      <UsLogoMark />
      <span className="us-logo__name">同源</span>
      {sub ? <span className="us-logo__sub">UNISOURCE</span> : null}
    </Link>
  );
}
