/**
 * 入口分流:/us/* → 同源 UniSource 壳;其余 → 现有 M-Next 工作台。
 * 动态 import 保证两套全局样式互不加载(styles.css vs us-tokens.css)。
 */
const path = window.location.pathname;

if (path === "/us" || path.startsWith("/us/")) {
  void import("./unisource/boot");
} else {
  void import("./workbench-boot");
}
