package com.mnext.server;

import org.springframework.transaction.support.TransactionTemplate;

final class TestOutboxRelay {
  private final OutboxRelay relay;
  private final TransactionTemplate transactions;

  TestOutboxRelay(OutboxRelay relay, TransactionTemplate transactions) {
    this.relay = relay;
    this.transactions = transactions;
  }

  int drain() {
    return transactions.execute(status -> relay.drain());
  }
}
