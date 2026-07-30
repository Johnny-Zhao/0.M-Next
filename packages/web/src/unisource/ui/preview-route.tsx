import "./ant-bridge.css";

import { PreviewPage } from "../pages/preview-page";

import { AntDesignPreviewLab } from "./ant-design-preview-lab";

/** Keeps the preview-only controls outside the main route chunk. */
export default function PreviewRoute() {
  return <PreviewPage previewLab={<AntDesignPreviewLab />} />;
}
