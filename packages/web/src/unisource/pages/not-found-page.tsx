import { Link } from "react-router-dom";

import { FullLayout } from "../shell/layouts";
import { usPaths } from "../routes-paths";
import { PageSkeleton } from "./page-skeleton";

export function NotFoundPage() {
  return (
    <FullLayout chrome={{ breadcrumb: [{ label: "未找到页面" }] }}>
      <PageSkeleton
        kicker="404"
        title="没有这个页面"
        desc={
          <>
            地址可能已变更或尚未实现。
            <Link to={usPaths.home}>回首页总览</Link>
          </>
        }
      />
    </FullLayout>
  );
}
