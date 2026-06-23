import { interiorDimensions } from "@m-next/domain-interior-design";

import { registerDimension, unregisterDimension } from "./workbench/dimensions";

export function registerInstalledPlugins(): void {
  registerInteriorDesign();
}

export function registerInteriorDesign(): void {
  interiorDimensions.forEach((dimension) => registerDimension(dimension));
}

export function unregisterInteriorDesign(): void {
  interiorDimensions.forEach((dimension) => unregisterDimension(dimension.id));
}
