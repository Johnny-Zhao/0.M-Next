package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.KernelCommandService;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;
import org.springdoc.core.configuration.SpringDocConfiguration;
import org.springdoc.core.properties.SpringDocConfigProperties;
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

@WebMvcTest({CommandController.class, DiffController.class, ViewQueryController.class})
@ImportAutoConfiguration({
  SpringDocConfiguration.class,
  SpringDocConfigProperties.class,
  SpringDocWebMvcConfiguration.class
})
class OpenApiContractTest {
  @MockitoBean KernelCommandService commands;
  @MockitoBean ReadModelRepository readModel;
  @MockitoBean CheckResultRepository checkResults;
  @MockitoBean DerivedFieldRepository derivedFields;
  @MockitoBean LineageQueryRepository lineageQueries;
  @MockitoBean WorkspaceAuthorizer authorizer;
  @Autowired MockMvc http;
  @Autowired ObjectMapper mapper;

  @Test
  void generatedOpenApiCoversCommandEnvelopeAndErrors() throws Exception {
    var response =
        http.perform(MockMvcRequestBuilders.get("/v3/api-docs")).andReturn().getResponse();
    var document = mapper.readTree(response.getContentAsString());

    assertEquals("3.1.0", document.get("openapi").asText());
    var operation = document.at("/paths/~1workspaces~1{workspaceId}~1commands/post");
    assertNotNull(operation.get("requestBody"));
    for (var status : Set.of("200", "400", "403", "409", "422", "500")) {
      assertNotNull(operation.at("/responses/" + status));
      assertEquals(
          "#/components/schemas/CommandResult",
          operation.at("/responses/" + status + "/content/application~1json/schema/$ref").asText());
    }

    JsonNode values = document.at("/components/schemas/CommandRequest/properties/commandType/enum");
    var actual =
        StreamSupport.stream(values.spliterator(), false)
            .map(JsonNode::asText)
            .collect(Collectors.toSet());
    assertEquals(registeredCommandTypes(), actual);
    for (var path :
        Set.of(
            "objects",
            "object-types",
            "objects~1{objectId}",
            "relations",
            "tree",
            "sync-status",
            "rule-status",
            "lineage",
            "check-results")) {
      assertFalse(
          document
              .at("/paths/~1workspaces~1{workspaceId}~1views~1" + path + "/get")
              .isMissingNode(),
          path);
    }
    assertFalse(document.at("/paths/~1workspaces~1{workspaceId}~1diff/post").isMissingNode());
  }

  private Set<String> registeredCommandTypes() throws Exception {
    var fixture =
        Path.of("..", "..", "tests", "contracts", "openapi", "registered-command-types.json");
    return StreamSupport.stream(mapper.readTree(fixture.toFile()).spliterator(), false)
        .map(JsonNode::asText)
        .collect(Collectors.toSet());
  }
}
