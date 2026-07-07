package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandRejectedException;
import java.io.IOException;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import org.junit.jupiter.api.Test;

class AiExtractionGatewayTest {
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void postsJsonChatRequestAndParsesModules() throws Exception {
    var client = new FakeHttpClient(responseJson(extractedJson()));
    var gateway = gateway(client);

    var modules = gateway.extractModules("系统包含编排模块约200W负责任务调度");

    assertEquals(1, modules.size());
    assertEquals("编排模块", modules.getFirst().name());
    assertEquals("200", modules.getFirst().powerW().toPlainString());
    assertEquals("任务调度", modules.getFirst().responsibility());
    assertEquals("http://localhost:9999/chat/completions", client.request.uri().toString());
    assertEquals(
        "Bearer test-key", client.request.headers().firstValue("Authorization").orElse(""));
    var requestJson = mapper.readTree(client.body);
    assertEquals(
        AiExtractionGateway.SYSTEM_PROMPT,
        requestJson.path("messages").get(0).path("content").asText());
    assertEquals("json_object", requestJson.path("response_format").path("type").asText());
    assertEquals("test-model", requestJson.path("model").asText());
  }

  @Test
  void rejectsBadGatewayJson() throws Exception {
    var gateway = gateway(new FakeHttpClient(responseJson("not json")));

    var error = assertThrows(CommandRejectedException.class, () -> gateway.extractModules("坏响应"));

    assertEquals("AI-502-GATEWAY-BAD-RESPONSE", error.error().code());
  }

  @Test
  void rejectsGatewayTimeout() {
    var gateway = gateway(new FakeHttpClient(new HttpTimeoutException("timeout")));

    var error = assertThrows(CommandRejectedException.class, () -> gateway.extractModules("超时"));

    assertEquals("AI-408-GATEWAY-TIMEOUT", error.error().code());
  }

  private AiExtractionGateway gateway(FakeHttpClient client) {
    return new AiExtractionGateway(
        mapper,
        client,
        name ->
            switch (name) {
              case "AI_GATEWAY_URL" -> "http://localhost:9999";
              case "AI_GATEWAY_KEY" -> "test-key";
              case "AI_MODEL" -> "test-model";
              default -> null;
            });
  }

  private String extractedJson() throws Exception {
    return mapper.writeValueAsString(
        Map.of(
            "modules",
            List.of(
                Map.of(
                    "name", "编排模块",
                    "power_w", 200,
                    "responsibility", "任务调度"))));
  }

  private String responseJson(String content) throws Exception {
    return mapper.writeValueAsString(
        Map.of("choices", List.of(Map.of("message", Map.of("content", content)))));
  }

  private static final class FakeHttpClient extends HttpClient {
    private final String responseBody;
    private final IOException failure;
    private HttpRequest request;
    private String body;

    FakeHttpClient(String responseBody) {
      this.responseBody = responseBody;
      this.failure = null;
    }

    FakeHttpClient(IOException failure) {
      this.responseBody = null;
      this.failure = failure;
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
        throws IOException {
      this.request = request;
      this.body = body(request);
      if (failure != null) throw failure;
      return (HttpResponse<T>) new FakeHttpResponse(request, responseBody);
    }

    @Override
    public <T> CompletableFuture<HttpResponse<T>> sendAsync(
        HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler) {
      throw new UnsupportedOperationException();
    }

    @Override
    public <T> CompletableFuture<HttpResponse<T>> sendAsync(
        HttpRequest request,
        HttpResponse.BodyHandler<T> responseBodyHandler,
        HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<CookieHandler> cookieHandler() {
      return Optional.empty();
    }

    @Override
    public Optional<Duration> connectTimeout() {
      return Optional.empty();
    }

    @Override
    public HttpClient.Redirect followRedirects() {
      return HttpClient.Redirect.NEVER;
    }

    @Override
    public Optional<ProxySelector> proxy() {
      return Optional.empty();
    }

    @Override
    public SSLContext sslContext() {
      return null;
    }

    @Override
    public SSLParameters sslParameters() {
      return null;
    }

    @Override
    public Optional<Authenticator> authenticator() {
      return Optional.empty();
    }

    @Override
    public HttpClient.Version version() {
      return HttpClient.Version.HTTP_1_1;
    }

    @Override
    public Optional<Executor> executor() {
      return Optional.empty();
    }

    private static String body(HttpRequest request) {
      var subscriber = new StringSubscriber();
      request.bodyPublisher().orElseThrow().subscribe(subscriber);
      return subscriber.result();
    }
  }

  private record FakeHttpResponse(HttpRequest request, String body)
      implements HttpResponse<String> {
    @Override
    public int statusCode() {
      return 200;
    }

    @Override
    public HttpHeaders headers() {
      return HttpHeaders.of(Map.of(), (name, value) -> true);
    }

    @Override
    public Optional<HttpResponse<String>> previousResponse() {
      return Optional.empty();
    }

    @Override
    public Optional<SSLSession> sslSession() {
      return Optional.empty();
    }

    @Override
    public URI uri() {
      return request.uri();
    }

    @Override
    public HttpClient.Version version() {
      return HttpClient.Version.HTTP_1_1;
    }
  }

  private static final class StringSubscriber implements Flow.Subscriber<ByteBuffer> {
    private final StringBuilder value = new StringBuilder();
    private final CompletableFuture<String> done = new CompletableFuture<>();

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
      subscription.request(Long.MAX_VALUE);
    }

    @Override
    public void onNext(ByteBuffer item) {
      value.append(StandardCharsets.UTF_8.decode(item));
    }

    @Override
    public void onError(Throwable throwable) {
      done.completeExceptionally(throwable);
    }

    @Override
    public void onComplete() {
      done.complete(value.toString());
    }

    String result() {
      return done.join();
    }
  }
}
