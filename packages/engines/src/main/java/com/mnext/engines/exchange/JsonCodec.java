package com.mnext.engines.exchange;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;

public final class JsonCodec {
  private final ObjectMapper mapper;

  public JsonCodec(ObjectMapper mapper) {
    this.mapper = Objects.requireNonNull(mapper, "mapper");
  }

  public String serialize(JsonArtifact artifact) {
    try {
      return mapper.writeValueAsString(artifact);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("JSON 制品无法序列化", failure);
    }
  }

  public JsonArtifact parse(String json) {
    try {
      var artifact = mapper.readValue(json, JsonArtifact.class);
      if (artifact.version() != 1) throw new IllegalArgumentException("JSON 制品版本仅支持 1");
      return artifact;
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("JSON 制品无法解析", failure);
    }
  }
}
