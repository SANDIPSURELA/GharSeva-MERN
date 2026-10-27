import { test } from "node:test";
import assert from "node:assert/strict";
import { openTestCheckout } from "../../shared/razorpay-checkout.js";
function fake(action) {
  return class {
    constructor(options) {
      this.options = options;
    }
    on(name, fn) {
      this.failed = fn;
    }
    open() {
      action(this);
    }
    close() {}
  };
}
test("immediate success callback is verified once inside the original submission", async () => {
  let count = 0;
  const outcome = await openTestCheckout({
    Checkout: fake((c) => {
      c.options.handler({ id: "fixture" });
      c.options.handler({ id: "duplicate" });
      c.options.modal.ondismiss();
    }),
    options: {},
    verify: async (r) => {
      count++;
      assert.equal(r.id, "fixture");
      return { status: "AUTHORIZED" };
    },
  });
  assert.equal(count, 1);
  assert.equal(outcome.state, "verified");
  assert.equal(outcome.result.status, "AUTHORIZED");
});
test("dismissal and failure never call verification or invent payment success", async () => {
  let count = 0,
    notice = "";
  const result = await openTestCheckout({
    Checkout: fake((c) => {
      c.failed();
      c.options.modal.ondismiss();
      c.options.handler({});
    }),
    options: {},
    verify: async () => {
      count++;
    },
    notify: (v) => {
      notice = v;
    },
  });
  assert.equal(result.state, "closed");
  assert.equal(count, 0);
  assert.match(notice, /uncertain/);
});
test("temporary verification failure is surfaced for persisted status reconciliation", async () => {
  await assert.rejects(
    () =>
      openTestCheckout({
        Checkout: fake((c) => c.options.handler({})),
        options: {},
        verify: async () => {
          throw Error("uncertain");
        },
      }),
    /uncertain/,
  );
});
test("account switch and component disposal prevent stale callbacks", async () => {
  let active = true,
    count = 0;
  await assert.rejects(
    () =>
      openTestCheckout({
        Checkout: fake((c) => {
          active = false;
          c.options.handler({});
        }),
        options: {},
        active: () => active,
        verify: async () => {
          count++;
        },
      }),
    /session changed/,
  );
  const controller = new AbortController();
  const result = await openTestCheckout({
    Checkout: fake((c) => {
      controller.abort();
      c.options.handler({});
    }),
    options: {},
    signal: controller.signal,
    verify: async () => {
      count++;
    },
  });
  assert.equal(result.state, "closed");
  assert.equal(count, 0);
});
