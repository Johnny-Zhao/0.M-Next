# 能源分系统 Profile 草案(阶段 A — 标量闭环)

- 目的:把《能源分系统设计工具》阶段 A 的内核落成一个可在 M-Next 上**用 meta-commands 定义**的 profile(对象/字段/关系/派生/规则),作为立项起点与 Codex 建型卡的蓝本。
- 口径(阶段 A 边界,与可行性备忘 §2 一致):**只做标量代数 + 聚合的闭环核算**。凡需三角函数/开方(轨道周期、β角光照率)、查表插值(DOD-循环、衰减曲线)、时序积分(SOC 曲线)、推荐排序的,**阶段 A 一律作为输入字段或简化常数**,留给长板算子。下文派生字段逐条标注 `[A]`(阶段 A 可派生)或 `[算子]`(暂作输入/后续算子)。
- 表达式风格沿用规则/派生 DSL:`field('x')`、`traverse('rel')`、`sum/avg/max/min/count(...)`、算术、`if(cond, a, b)`。

## 1. 值类型(单位,value_type)

`power_w`(W,≥0)、`energy_wh`(Wh,≥0)、`mass_kg`(kg,≥0)、`area_m2`(m²,≥0)、`voltage_v`(V,≥0)、`ratio`(0..1)、`cost_cny`(¥,≥0)、`fr_per_h`(失效率,≥0)、`count_int`(整数,≥0)。基元类型 number;约束附在 value_type 上,被字段复用。

## 2. 对象类型 + 字段

### mission_orbit(任务与轨道)
| 字段 | 类型 | 来源 | 说明 |
|---|---|---|---|
| altitude_km / inclination_deg / beta_angle_deg | number | 输入 | 轨道要素 |
| period_min | number | `[算子]` | 由高度算(Kepler,需开方)→阶段 A 作输入 |
| sunlight_min / eclipse_min | number | `[算子]` | 由 β 角算(需三角)→阶段 A 作输入 |
| power_source_type | enum(PV/RTG) | 输入 | RTG/深空走条件分支 |
| design_cycles | count_int | 输入 | 循环次数(手动覆盖) |
| dod_limit | ratio | 输入 | 由 design_cycles 查表→阶段 A 作输入 |

### operating_mode(工况)
| 字段 | 类型 | 来源 |
|---|---|---|
| name | text | 输入 |
| sunlight_power_w | power_w | `[A]` = `sum(traverse('mode_has_load') where field('phase') in [sunlight,both]: field('power_w'))` |
| eclipse_power_w | power_w | `[A]` = `sum(...where phase in [eclipse,both]...)` |

### load_item(负载项)
| 字段 | 类型 | 来源 |
|---|---|---|
| name | text | 输入 |
| power_w | power_w | 输入 |
| phase | enum(sunlight/eclipse/both) | 输入 |
| duty | enum(continuous/peak) | 输入 |

### solar_array(太阳电池阵)
| 字段 | 类型 | 来源 |
|---|---|---|
| cell_efficiency / packing_factor / degradation_eol / temp_factor | ratio | 输入(temp_factor、degradation 阶段 A 作输入,后续算子插值) |
| bus_efficiency | ratio | `[A]` = `traverse('powers_bus')` 取 PCDU 效率(回填) |
| required_power_eol_w | power_w | `[A]` = `max(traverse(...mode...): field('sunlight_power_w'))` / bus_efficiency |
| area_m2 | area_m2 | `[A]` = `required_power_eol_w / (1361 * cell_efficiency * packing_factor * (1 - degradation_eol) * temp_factor)` |

### battery_pack(蓄电池组)
| 字段 | 类型 | 来源 |
|---|---|---|
| discharge_efficiency | ratio | 输入 |
| required_energy_wh | energy_wh | `[A]` = `max(mode: eclipse_power_w) * (eclipse_min/60) / discharge_efficiency` |
| capacity_wh | energy_wh | `[A]` = `required_energy_wh / dod_limit` |

### bus_pcdu(母线与 PCDU)
| 字段 | 类型 | 来源 |
|---|---|---|
| architecture | enum(全调节/半调节/不调节) | 输入 |
| bus_voltage_v | voltage_v | 输入 |
| efficiency | ratio | 输入 |

### product_item(产品库基类,泛化父类)
| 字段 | 类型 | 说明 |
|---|---|---|
| name / vendor | text | |
| mass_kg | mass_kg | 质量汇总用 |
| unit_cost | cost_cny | 成本汇总用 |
| failure_rate | fr_per_h | 可靠度用 |

子类(`parent_type` = product_item):`solar_cell`、`battery_cell`、`pcdu_product`、`pdu_product`、`other_unit`,各加专有字段(如 solar_cell.cell_efficiency、battery_cell.capacity_wh_each)。**用泛化/重定义**(M2 已支持)。

## 3. 关系类型(relation_type)

- `mode_has_load`:operating_mode → load_item(工况含哪些负载)。
- `powers_bus`:solar_array → bus_pcdu;`feeds`:bus_pcdu → battery_pack(母线拓扑)。
- `selected_as`:设计槽(solar_array/battery_pack/bus_pcdu)→ product_item 子类(选型)。
- `connects`:equipment ↔ equipment(接口/电缆拓扑,图视图用)。
- `redundant_with`:product_item ↔ product_item(冗余组,RBD 用)。

## 4. 关键派生字段(阶段 A 闭环核心)

- **质量汇总** `system.mass_total` `[A]` = `sum(traverse('selected_as'): field('mass_kg'))`(全选型质量)。
- **成本汇总** `system.cost_total` `[A]` = `sum(traverse('selected_as'): field('unit_cost'))`。
- **功率裕度** `solar_array.power_margin` `[A]` = `(供给能力 - required_power_eol_w) / required_power_eol_w`(供给来自选型电池片面积×效率)。
- **能量裕度** `battery_pack.energy_margin` `[A]` = `(capacity_from_selection - required_energy_wh) / required_energy_wh`。
- **可靠度(串)** `chain.reliability` `[A]` = 串联 `∏ exp(-fr*t)`(无环节冗余时);**并联** = `1 - ∏(1 - R_i)`(冗余组,`redundant_with`)。注:`exp` 若 DSL 无→阶段 A 用近似 `1 - fr*t` 或作输入,标 `[算子]`。

## 5. 报警规则(rule,触发 RULE-422 或冷路径 check_result)

- `power_margin < 0.10` → 告警(裕度不足)。
- `energy_margin < 0.0` → BLOCK(蓄电池容量不足)。
- `battery_pack` 实配 DOD `>` dod_limit → 违规。
- `required_power_eol_w > 选型电池阵上限` → 告警。
- 母线 efficiency 缺失/为 0 → 数据完整性告警。

## 6. 阶段 A 闭环验证点(e2e 应断言)

输入任务/轨道 + 负载清单 + 选型 → 自动算出:工况功率汇总、太阳阵面积、蓄电池容量、质量/成本汇总、功率/能量裕度、串并联可靠度;改一处选型(换电池片)→ 上述派生**全部重算**;裕度跌破阈值 → 报警规则触发。**这条链跑通 = 阶段 A 可行性实证**(全程 profile 配置 + 派生 + 规则,不写引擎)。

## 7. 下一步

转成 **Codex 建型卡**(纯测试/种子卡,零生产代码):一个 e2e 集成测试经 meta-commands 建上述 profile(草稿版本→发布)+ DefineDerivedField + DefineRule,建一组样例数据,断言 §6 闭环。封闭清单 = 一个测试文件 + (若做种子)一个种子脚本。`[算子]` 标记项在阶段 A 作输入字段,不阻塞。
