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

export function IconCalendar({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M5 2.5v2M11 2.5v2M2.5 6.5h11" />
    </svg>
  );
}

export function IconPerson({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13c.8-2.5 2.3-3.8 4.5-3.8s3.7 1.3 4.5 3.8" />
    </svg>
  );
}

export function IconDoc({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M9 2.5v3h3M6 8h4M6 10.5h4" />
    </svg>
  );
}

export function IconNodes({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <circle cx="4" cy="5" r="2" />
      <circle cx="12" cy="11" r="2" />
      <path d="M5.5 6.5 10.5 9.5" />
    </svg>
  );
}

export function IconMatrix({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="M3 3h10M3 8h10M3 13h10M3 3v10M8 3v10M13 3v10" />
    </svg>
  );
}

export function IconBarChart({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <path d="M3 13h10M4.5 10V6M8 10V3M11.5 10V8" />
    </svg>
  );
}

export function IconSearchCheck({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...SVG_BASE} {...rest}>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3 3M5.2 7.2 6.5 8.5 9 5.8" />
    </svg>
  );
}
