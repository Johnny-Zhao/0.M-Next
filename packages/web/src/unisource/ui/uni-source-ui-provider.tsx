import { ConfigProvider } from "antd";
import type { ReactNode } from "react";

import { unisourceAntTheme } from "./ant-theme";

export const UNISOURCE_UI_PROVIDER_CLASS = "us-ant-provider";

/** This provider is mounted only by the UniSource application shell. */
export function UniSourceUiProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      getPopupContainer={(node) => {
        const provider = node?.closest(`.${UNISOURCE_UI_PROVIDER_CLASS}`);
        return provider instanceof HTMLElement ? provider : document.body;
      }}
      prefixCls="us-ant"
      theme={unisourceAntTheme}
    >
      <div className={UNISOURCE_UI_PROVIDER_CLASS}>{children}</div>
    </ConfigProvider>
  );
}
