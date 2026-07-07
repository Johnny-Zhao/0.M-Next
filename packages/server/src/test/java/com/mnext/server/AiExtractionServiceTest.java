package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.server.ai.AiActionProvider;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AiExtractionServiceTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID MODULE_TYPE = UUID.fromString("99999999-0000-4000-8000-000000000010");
  private static final UUID SET_ID = UUID.fromString("99999999-0000-4000-8000-000000000011");

  @Test
  void submitsExtractedModulesAsCreateObjectChangeItems() {
    var gateway = mock(AiExtractionGateway.class);
    when(gateway.extractModules("系统包含编排模块约200W负责任务调度"))
        .thenReturn(
            List.of(
                new AiExtractionGateway.ExtractedModule(
                    "编排模块", new BigDecimal("200"), "任务调度", null)));
    when(gateway.descriptor()).thenReturn(new AiActionProvider.ProviderDescriptor("fake", "1"));
    var readModel = mock(ReadModelRepository.class);
    when(readModel.objectTypeId(WORKSPACE, "module")).thenReturn(MODULE_TYPE);
    var submitter = new CapturingSubmitter();
    var service = new AiExtractionService(gateway, submitter, readModel);

    var setId = service.extract(WORKSPACE, "actor", "系统包含编排模块约200W负责任务调度");

    assertEquals(SET_ID, setId);
    assertEquals("EXTRACT_MODULES", submitter.action);
    assertEquals(1, submitter.items.size());
    var item = submitter.items.getFirst();
    assertEquals("CreateObject", item.opType());
    assertEquals("module", item.payload().get("objectTypeCode"));
    assertEquals(MODULE_TYPE.toString(), item.payload().get("objectTypeId"));
    var fields = (Map<?, ?>) item.payload().get("fields");
    assertEquals("编排模块", fields.get("name"));
    assertEquals(new BigDecimal("200"), fields.get("power_w"));
    assertEquals("任务调度", fields.get("responsibility"));
  }

  @Test
  void rejectsEmptyExtractionResult() {
    var gateway = mock(AiExtractionGateway.class);
    when(gateway.extractModules("没有模块")).thenReturn(List.of());
    var service =
        new AiExtractionService(gateway, new CapturingSubmitter(), mock(ReadModelRepository.class));

    var error =
        assertThrows(
            CommandRejectedException.class, () -> service.extract(WORKSPACE, "actor", "没有模块"));

    assertEquals("AI-422-EXTRACT-EMPTY", error.error().code());
  }

  private static final class CapturingSubmitter implements AiChangeSetSubmitter {
    private String action;
    private List<AiActionProvider.AiChangeItem> items = List.of();

    @Override
    public CommandResult submitGenerated(
        UUID workspaceId,
        String actorId,
        String idempotencyKey,
        String action,
        AiActionProvider.ProviderDescriptor provider,
        String contextHash,
        AiActionProvider.AiResult aiResult,
        String payloadHash) {
      this.action = action;
      this.items = aiResult.items();
      return new CommandResult(
          "cmd", CommandStatus.ACCEPTED, false, List.of(SET_ID.toString()), null);
    }

    @Override
    public String payloadHash(Object value) {
      return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    }
  }
}
