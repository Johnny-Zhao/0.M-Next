import type { ThemeConfig } from "antd";

/** UniSource tokens are the only visual source for the Ant Design experiment. */
export const unisourceAntTheme: ThemeConfig = {
  cssVar: { prefix: "us-ant", key: "unisource" },
  token: {
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
  },
};
