package com.mnext.server;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ViewQueryController {
  private final ReadModelRepository repository;

  public ViewQueryController(ReadModelRepository repository) {
    this.repository = repository;
  }

  @GetMapping("/workspaces/{workspaceId}/views/object-types")
  public List<ObjectTypeView> objectTypes(@PathVariable("workspaceId") UUID workspaceId) {
    return repository.objectTypes(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects")
  public PageView<ObjectView> objects(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectType") String objectType,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
    if (objectType.isBlank()) throw new IllegalArgumentException("objectType 必填");
    if (page < 0 || pageSize < 1 || pageSize > 200) {
      throw new IllegalArgumentException("page 必须非负且 pageSize 必须为 1..200");
    }
    return repository.objects(workspaceId, objectType, page, pageSize);
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects/{objectId}")
  public ObjectDetailView object(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("objectId") UUID objectId) {
    return repository.object(workspaceId, objectId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/relations")
  public List<RelationView> relations(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("relationType") String relationType,
      @RequestParam("direction") String direction,
      @RequestParam("sourceId") UUID sourceId,
      @RequestParam(value = "depth", defaultValue = "1") int depth) {
    if (relationType.isBlank() || !Set.of("out", "in").contains(direction)) {
      throw new IllegalArgumentException("relationType 与 direction(out|in) 必填");
    }
    if (depth < 1 || depth > 5) throw new IllegalArgumentException("depth 必须为 1..5");
    return repository.relations(workspaceId, relationType, direction, sourceId, depth);
  }

  @GetMapping("/workspaces/{workspaceId}/views/tree")
  public List<TreeNodeView> tree(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("relationType") String relationType,
      @RequestParam("rootId") UUID rootId) {
    if (!repository.hierarchicalRelationType(workspaceId, relationType)) {
      throw new IllegalArgumentException("tree relationType 必须为 hierarchical");
    }
    return repository.tree(workspaceId, relationType, rootId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/matrix")
  public MatrixView matrix(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("rowType") String rowType,
      @RequestParam("colType") String colType,
      @RequestParam("relationType") String relationType,
      @RequestParam(value = "rowPage", defaultValue = "0") int rowPage,
      @RequestParam(value = "rowSize", defaultValue = "50") int rowSize,
      @RequestParam(value = "colPage", defaultValue = "0") int colPage,
      @RequestParam(value = "colSize", defaultValue = "50") int colSize) {
    if (rowType.isBlank() || colType.isBlank() || relationType.isBlank()) {
      throw new IllegalArgumentException("rowType、colType 与 relationType 必填");
    }
    if (rowPage < 0 || colPage < 0 || rowSize < 1 || colSize < 1) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为正数");
    }
    return repository.matrix(
        workspaceId,
        rowType,
        colType,
        relationType,
        rowPage,
        Math.min(rowSize, 50),
        colPage,
        Math.min(colSize, 50));
  }

  @GetMapping("/workspaces/{workspaceId}/views/sync-status")
  public SyncStatusView syncStatus(@PathVariable("workspaceId") UUID workspaceId) {
    return repository.syncStatus(workspaceId);
  }
}
