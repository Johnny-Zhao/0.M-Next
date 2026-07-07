package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.server.ai.AiActionProvider;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
class AiExtractionGateway {
  static final String DEFAULT_MODEL = "gpt-4o-mini";
  static final String SYSTEM_PROMPT =
      """
      从草稿中抽取模块清单，输出严格 JSON：{"modules":[{"name":string,"power_w":number?,"responsibility":string?,"description":string?}]}。
      只抽草稿明确提到的内容，数值缺失就留空，禁止编造。无法确定模块名的内容不要输出。
      """;

  private final ObjectMapper mapper;
  private final HttpClient client;
  private final Function<String, String> env;

  @Autowired
  public AiExtractionGateway(ObjectMapper mapper) {
    this(
        mapper,
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
        System::getenv);
  }

  AiExtractionGateway(ObjectMapper mapper, HttpClient client, Function<String, String> env) {
    this.mapper = mapper;
    this.client = client;
    this.env = env;
  }

  List<ExtractedModule> extractModules(String draft) {
    var request = request(draft);
    HttpResponse<String> response;
    try {
      response = client.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException failure) {
      throw error("AI-408-GATEWAY-TIMEOUT", "AI 网关响应超时", "稍后重试，或检查 AI_GATEWAY_URL 网络连通性");
    } catch (IOException failure) {
      throw error("AI-502-GATEWAY-BAD-RESPONSE", "AI 网关调用失败", "检查 AI_GATEWAY_URL 与网关服务状态");
    } catch (InterruptedException failure) {
      Thread.currentThread().interrupt();
      throw error("AI-408-GATEWAY-TIMEOUT", "AI 网关调用被中断", "稍后重试");
    }
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      throw error("AI-422-PROVIDER-FAILED", "AI 网关返回失败状态", "检查网关配置与模型可用性");
    }
    return parseGatewayResponse(response.body());
  }

  AiActionProvider.ProviderDescriptor descriptor() {
    return new AiActionProvider.ProviderDescriptor("ai-gateway", model());
  }

  private HttpRequest request(String draft) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("model", model());
    payload.put("response_format", Map.of("type", "json_object"));
    payload.put(
        "messages",
        List.of(
            Map.of("role", "system", "content", SYSTEM_PROMPT),
            Map.of("role", "user", "content", draft)));
    return HttpRequest.newBuilder()
        .uri(URI.create(baseUrl() + "/chat/completions"))
        .timeout(Duration.ofSeconds(30))
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer " + gatewayKey())
        .POST(HttpRequest.BodyPublishers.ofString(json(payload)))
        .build();
  }

  private List<ExtractedModule> parseGatewayResponse(String body) {
    try {
      var root = mapper.readTree(body);
      var content = root.path("choices").path(0).path("message").path("content");
      if (!content.isTextual()) throw badResponse();
      return parseExtractedJson(content.asText());
    } catch (JsonProcessingException failure) {
      throw badResponse();
    }
  }

  private List<ExtractedModule> parseExtractedJson(String content) {
    try {
      var root = mapper.readTree(content.trim());
      var modules = root.path("modules");
      if (!modules.isArray()) throw badResponse();
      var values = new ArrayList<ExtractedModule>();
      for (var module : modules) {
        var name = text(module.get("name"));
        if (name == null) continue;
        values.add(
            new ExtractedModule(
                name,
                decimal(module.get("power_w")),
                text(module.get("responsibility")),
                text(module.get("description"))));
      }
      return List.copyOf(values);
    } catch (JsonProcessingException failure) {
      throw badResponse();
    }
  }

  private String baseUrl() {
    var value = env.apply("AI_GATEWAY_URL");
    if (value == null || value.isBlank()) {
      throw error("AI-422-PROVIDER-FAILED", "AI 网关未配置", "设置 AI_GATEWAY_URL 后重试");
    }
    return value.replaceAll("/+$", "");
  }

  private String gatewayKey() {
    var value = env.apply("AI_GATEWAY_KEY");
    if (value == null || value.isBlank()) {
      throw error("AI-422-PROVIDER-FAILED", "AI 网关密钥未配置", "设置 AI_GATEWAY_KEY 后重试");
    }
    return value;
  }

  private String model() {
    var value = env.apply("AI_MODEL");
    return value == null || value.isBlank() ? DEFAULT_MODEL : value;
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 抽取请求无法序列化", failure);
    }
  }

  private CommandRejectedException badResponse() {
    return error("AI-502-GATEWAY-BAD-RESPONSE", "AI 网关返回的 JSON 无法解析", "稍后重试，或调整草稿后重新抽取");
  }

  private static String text(JsonNode node) {
    if (node == null || node.isNull()) return null;
    var value = node.asText().trim();
    return value.isEmpty() ? null : value;
  }

  private static BigDecimal decimal(JsonNode node) {
    if (node == null || node.isNull()) return null;
    if (node.isNumber()) return node.decimalValue();
    var text = node.asText("").trim().replaceAll("[^0-9.+-]", "");
    if (text.isBlank()) return null;
    try {
      return new BigDecimal(text);
    } catch (NumberFormatException failure) {
      return null;
    }
  }

  static CommandRejectedException error(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }

  record ExtractedModule(
      String name, BigDecimal powerW, String responsibility, String description) {}
}
