// Checkout owns UI only. The server verification result confirms payment.
export function openTestCheckout({
  Checkout,
  options,
  verify,
  active = () => true,
  signal,
  notify = () => {},
}) {
  return new Promise((resolve, reject) => {
    let settled = false,
      verifying = false,
      checkout;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => {
      finish(null, { state: "closed" });
      checkout?.close?.();
    };
    if (signal?.aborted || !active()) return finish(null, { state: "closed" });
    const handler = async (response) => {
      if (settled || verifying) return;
      if (!active())
        return finish(
          new Error("The session changed. Refresh saved payment status."),
        );
      verifying = true;
      try {
        const result = await verify(response);
        if (!active())
          return finish(
            new Error("The session changed. Refresh saved payment status."),
          );
        finish(null, { state: "verified", result });
      } catch (error) {
        finish(error);
      }
    };
    try {
      checkout = new Checkout({
        ...options,
        handler,
        modal: {
          ...options.modal,
          ondismiss: () => {
            if (!verifying) finish(null, { state: "closed" });
          },
        },
      });
      signal?.addEventListener("abort", abort, { once: true });
      checkout.on("payment.failed", () => {
        if (active() && !settled)
          notify(
            "Payment failed or is uncertain. Close Checkout and refresh saved status before retrying.",
          );
      });
      checkout.open();
    } catch (error) {
      finish(error);
    }
  });
}
