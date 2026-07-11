import type { SVGProps } from "react";

/** 图标一律 currentColor,颜色由外层 token 类控制。 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
};

const SVG_BASE = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconSearch({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

export function IconClose({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

/** AI 星标(设计系统 · AI 指令条统一识别) */
export function IconSpark({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="M8 1.5l1.4 3.6 3.6 1.4-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4z" />
    </svg>
  );
}

/** 双向同步箭头(Toast 默认图标) */
export function IconSync({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} strokeWidth={1.8} {...rest}>
      <path d="M2.5 5.5h9L9 3M13.5 10.5h-9L7 13" />
    </svg>
  );
}

export function IconCheck({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} strokeWidth={2.4} {...rest}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

export function IconChevronRight({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

export function IconGrid({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}
