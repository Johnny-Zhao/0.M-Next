import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { cx } from "./cx";

export interface UsCrumb {
  label: ReactNode;
  to?: string;
}

/** Breadcrumb — 根可点回上级;末段 600 字重;可尾随 mono 标签。 */
export function UsBreadcrumb({
  items,
  tail,
  className,
}: {
  items: UsCrumb[];
  tail?: ReactNode;
  className?: string;
}) {
  return (
    <nav className={cx("us-breadcrumb", className)} aria-label="面包屑">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const cls = cx(
          "us-breadcrumb__seg",
          isLast && "us-breadcrumb__seg--current",
        );
        return (
          <Fragment key={i}>
            {i > 0 ? (
              <span className="us-breadcrumb__sep" aria-hidden>
                ›
              </span>
            ) : null}
            {item.to && !isLast ? (
              <Link className={cls} to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span className={cls} aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
      {tail}
    </nav>
  );
}
