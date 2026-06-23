export const interiorPluginId = "interior-design";

export const interiorDimensions = [
  {
    id: "light",
    label: "光",
    description: "采光、照度和 lux 字段",
    match: (code: string) => /^light[_-]|采光|照度|lux/i.test(code),
  },
  {
    id: "wind",
    label: "风",
    description: "通风、换气和 ACH 字段",
    match: (code: string) => /^wind[_-]|通风|换气|ach/i.test(code),
  },
] as const;
