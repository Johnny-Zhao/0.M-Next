package com.mnext.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mnext")
public class MNextApplication {
  public static void main(String[] args) {
    SpringApplication.run(MNextApplication.class, args);
  }
}
