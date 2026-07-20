/**
 * 入口分流:/ → /us/home; /us/* → 同源 UniSource 壳;其余 → 现有 M-Next 工作台。
 * 动态 import 保证两套全局样式互不加载(styles.css vs us-tokens.css)。
 */
import {
  isUnisourceLocation,
  isWorkspaceLauncherLocation,
  rootUnisourceLocation,
} from "./entry-route";

const { hash, pathname, search } = window.location;
const defaultLocation = rootUnisourceLocation(pathname, search, hash);

if (defaultLocation !== null) {
  window.location.replace(defaultLocation);
} else if (isWorkspaceLauncherLocation(pathname)) {
  void import("./workspace-launcher").then(({ renderWorkspaceLauncher }) =>
    renderWorkspaceLauncher(document.getElementById("root")),
  );
} else if (isUnisourceLocation(pathname)) {
  void import("./unisource/boot");
} else {
  void import("./workbench-boot");
}
