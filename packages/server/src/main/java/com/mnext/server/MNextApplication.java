package com.mnext.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.mnext")
@EnableScheduling
public class MNextApplication {
  public static void main(String[] args) {
    SpringApplication.run(MNextApplication.class, args);
  }
}
