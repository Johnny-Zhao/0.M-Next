import {
  type StructuredDocumentActionRegistry,
  type StructuredDocumentActionProps,
} from "../doc/structured-document-action-registry";
import { ProcurementItemEditor } from "./pc-procurement-item-editor";

export const pcProcurementItemActionId = "pc_procurement.procurement-item";

export function registerPcProcurementDocumentActions(
  registry: StructuredDocumentActionRegistry,
): void {
  registry.register(pcProcurementItemActionId, ProcurementItemDocumentAction);
}

function ProcurementItemDocumentAction({
  rootObjectId,
}: StructuredDocumentActionProps) {
  return <ProcurementItemEditor planId={rootObjectId} />;
}
