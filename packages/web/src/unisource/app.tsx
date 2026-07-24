import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import "@xyflow/react/dist/style.css";
import "./us-tokens.css";
import "./us-components.css";

import { UsToastHost } from "./primitives";
import { ExpressionCreateDialog } from "./expression/expression-create-dialog";
import { US_BASENAME } from "./routes-paths";
import { ViewportGuard } from "./shell/viewport-guard";
import { AccessPage } from "./pages/access-page";
import { ExprPage } from "./pages/expr-page";
import { HomePage } from "./pages/home-page";
import { ImportPage } from "./pages/import-page";
import { NotFoundPage } from "./pages/not-found-page";
import { PluginsPage } from "./pages/plugins-page";
import { PreviewPage } from "./pages/preview-page";
import { SourcePage } from "./pages/source-page";
import { ValidatePage } from "./pages/validate-page";

/**
 * 同源 UniSource 应用壳(路由映射见 docs/前端实施计划-同源主版本页面集.md §A)。
 * 注意:/source/validate 须先于 /source/:sourceId(react-router 本身静态段优先,显式前置仅为可读性)。
 */
export function UnisourceApp() {
  return (
    <BrowserRouter basename={US_BASENAME}>
      <div className="us-app">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/source/validate" element={<ValidatePage />} />
          <Route path="/source/:sourceId" element={<SourcePage />} />
          <Route path="/expr/:exprId" element={<ExprPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings/plugins" element={<PluginsPage />} />
          <Route path="/settings/access" element={<AccessPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ExpressionCreateDialog />
      </div>
      <UsToastHost />
      <ViewportGuard />
    </BrowserRouter>
  );
}
