import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { unisourceAntTheme } from "./ant-theme";
import {
  UNISOURCE_UI_PROVIDER_CLASS,
  UniSourceUiProvider,
} from "./uni-source-ui-provider";

describe("UniSource Ant Design theme", () => {
  it("maps every required Ant token to an existing UniSource token", () => {
    expect(unisourceAntTheme.cssVar).toEqual({
      key: "unisource",
      prefix: "us-ant",
    });
    expect(unisourceAntTheme.token).toMatchObject({
      colorPrimary: "var(--us-primary)",
      colorBgBase: "var(--us-paper)",
      colorBgContainer: "var(--us-paper)",
      colorBgLayout: "var(--us-canvas)",
      colorText: "var(--us-text)",
      colorTextSecondary: "var(--us-text-muted)",
      colorBorder: "var(--us-border)",
      colorWarning: "var(--us-change)",
      colorError: "var(--us-danger)",
      borderRadius: 6,
      controlHeight: 32,
      fontFamily: "var(--us-font-ui)",
    });
  });

  it("creates a scoped provider wrapper instead of changing the old workbench", () => {
    const markup = renderToStaticMarkup(
      <UniSourceUiProvider>
        <span>preview</span>
      </UniSourceUiProvider>,
    );
    expect(markup).toContain(UNISOURCE_UI_PROVIDER_CLASS);
    expect(markup).toContain("preview");
  });
});
