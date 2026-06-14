package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DiffControllerTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private final ReadModelRepository repository = mock(ReadModelRepository.class);
  private final DiffController controller = new DiffController(repository);

  @Test
  void diffsTwoProvidedDataSetsWithoutReadingCurrentState() {
    var result =
        controller.diff(
            WORKSPACE, new DiffRequest(data(object("one", 1)), data(object("one", 2)), null, null));

    assertEquals(1, result.summary().objectsChanged());
    verifyNoInteractions(repository);
  }

  @Test
  void readsWorkspaceScopedCurrentDataSet() {
    when(repository.dataSet(WORKSPACE)).thenReturn(data(object("one", 1)));

    var result =
        controller.diff(WORKSPACE, new DiffRequest(null, null, "current", data(object("two", 1))));

    assertEquals(1, result.summary().objectsAdded());
    assertEquals(1, result.summary().objectsRemoved());
    verify(repository).dataSet(WORKSPACE);
  }

  @Test
  void rejectsUnsupportedOrIncompleteRequests() {
    assertThrows(
        IllegalArgumentException.class,
        () -> controller.diff(WORKSPACE, new DiffRequest(null, null, "snapshot", null)));
    assertThrows(
        IllegalArgumentException.class,
        () -> controller.diff(WORKSPACE, new DiffRequest(null, null, null, null)));
  }

  private static DataSet data(DataObject... objects) {
    return new DataSet(List.of(objects), List.of());
  }

  private static DataObject object(String id, Object value) {
    return new DataObject(id, "demo", Map.of("value", value), "DRAFT", 1);
  }
}
