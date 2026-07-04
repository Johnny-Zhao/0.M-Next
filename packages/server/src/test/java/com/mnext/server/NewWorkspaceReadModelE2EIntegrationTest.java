package com.mnext.server;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * 回归:新工作空间(非 11111111)的数据事件必须经共享队列 readmodel.events 投影到读模型。 修复前发布器只投 per-workspace 队列、监听器却写死监听
 * 11111111 的队列,导致新建项目页面空白。
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "mnext.readmodel.enabled=true",
      "spring.rabbitmq.listener.simple.missing-queues-fatal=false"
    })
class NewWorkspaceReadModelE2EIntegrationTest {
  private static final UUID NEW_WORKSPACE = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  private static final UUID MODULE_TYPE = UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  private static final UUID OBJECT_ID = UUID.fromString("ffffffff-ffff-4fff-8fff-ffffffffffff");
  private static final String EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69NEWWS";

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @Container
  static final RabbitMQContainer RABBIT =
      new RabbitMQContainer(
          DockerImageName.parse(
              System.getenv().getOrDefault("RABBITMQ_TEST_IMAGE", "rabbitmq:4.1-alpine")));

  @DynamicPropertySource
  static void infrastructure(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("spring.rabbitmq.host", RABBIT::getHost);
    registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
    registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
    registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired OutboxRelay relay;
  @Autowired TestRestTemplate http;
  @LocalServerPort int port;

  @Test
  void newWorkspaceObjectEventFlowsThroughSharedReadModelQueue() throws Exception {
    // 模拟"新建项目":一个全新工作空间 + 它的对象类型(元模型)。
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, '测试方案', 'ACTIVE')", NEW_WORKSPACE);
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'module', 'Module', NULL, TRUE, 'test', 'test', now(), now())
        """,
        MODULE_TYPE,
        NEW_WORKSPACE);

    // 创建对象:落 outbox(PENDING),由 OutboxRelay 经 Rabbit 投递到共享队列 readmodel.events。
    jdbc.update(
        """
        INSERT INTO event_outbox
          (id, event_type, aggregate_type, aggregate_id, sequence, payload, created_at)
        VALUES (?, 'ObjectCreated', 'object', ?, 1, CAST(? AS jsonb), now())
        """,
        EVENT_ID,
        OBJECT_ID.toString(),
        objectCreatedPayload());

    // 轮询断言:新工作空间的对象经读模型投影后能从 views/objects 读到(不用裸睡眠等待,改用 Awaitility 带超时轮询)。
    await()
        .atMost(60, SECONDS)
        .pollInterval(250, MILLISECONDS)
        .untilAsserted(
            () -> {
              relay.drain();
              var response =
                  http.getForEntity(
                      "http://localhost:"
                          + port
                          + "/workspaces/"
                          + NEW_WORKSPACE
                          + "/views/objects?objectType=module&page=0&pageSize=10",
                      Map.class);
              assertEquals(
                  200, response.getStatusCode().value(), String.valueOf(response.getBody()));
              assertEquals(
                  1,
                  ((Number) response.getBody().get("total")).intValue(),
                  String.valueOf(response.getBody()));
            });
  }

  private String objectCreatedPayload() throws Exception {
    var after = new LinkedHashMap<String, Object>();
    after.put("objectId", OBJECT_ID.toString());
    after.put("objectTypeId", MODULE_TYPE.toString());
    after.put("status", "DRAFT");
    var envelope =
        new EventEnvelope(
            EVENT_ID,
            "ObjectCreated",
            1,
            NEW_WORKSPACE,
            "object",
            OBJECT_ID.toString(),
            1L,
            null,
            after,
            Actor.user("test"),
            "manual",
            Instant.now(),
            UUID.randomUUID(),
            "cmd-" + EVENT_ID,
            1L,
            null);
    return mapper.writeValueAsString(envelope);
  }
}
