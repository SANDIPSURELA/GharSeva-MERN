import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  ArrowRight,
  Download,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { api, sessionClient, prettyDate, label } from "../api";
import { useApp } from "../context";
import { Modal } from "../components/UI";
import "./Payments.css";
import { openTestCheckout } from "../../../shared/razorpay-checkout.js";
const cash = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((n || 0) / 100);
const modeName = (mode) =>
  mode === "demo"
    ? "CLASSROOM SIMULATION — NO MONEY MOVED"
    : mode === "razorpay_test"
      ? "RAZORPAY TEST — NO LIVE COLLECTION"
      : "ONLINE PAYMENT SETUP NEEDED";
const purpose = (p) =>
  p.purpose === "FINAL_BALANCE" ? "Remaining balance" : "Visit deposit";
const cents = (value) => {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value)))
    throw new Error("Use rupees with at most two decimal places.");
  const [a, b = ""] = String(value).split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
};
let checkoutPromise;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutPromise) return checkoutPromise;
  checkoutPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script"),
      t = setTimeout(() => {
        s.remove();
        reject(
          new Error("Checkout could not load. Reconcile before retrying."),
        );
      }, 20000);
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => {
      clearTimeout(t);
      window.Razorpay
        ? resolve()
        : reject(new Error("Checkout is unavailable."));
    };
    s.onerror = () => {
      clearTimeout(t);
      s.remove();
      reject(
        new Error("Checkout could not load. No simulation fallback was used."),
      );
    };
    document.head.append(s);
  }).catch((e) => {
    checkoutPromise = null;
    throw e;
  });
  return checkoutPromise;
}
function CombinedReceipt({ data }) {
  const { booking: b, summary: s, payments } = data;
  const download = () => {
    const text = [
      "GHARSEVA — TWO-STAGE TEST PAYMENT SUMMARY",
      modeName(b.paymentPlan?.mode || payments[0]?.mode),
      "Not a tax invoice or provider payout confirmation.",
      `Booking: GS-${b._id.slice(-8).toUpperCase()} | ${b.service}`,
      `Service status: ${b.status}`,
      `Current final bill: ${s.total === null ? "Not billed" : cash(s.total)}`,
      `Deposit credit: ${cash(s.depositCredit)}`,
      `Balance captured: ${cash(s.balanceCaptured)}`,
      `Gross captured: ${cash(s.grossCaptured)}`,
      `Processed refunds: ${cash(s.processedRefunds)}`,
      `Current payment credit: ${cash(s.credit)}`,
      "Captured awaiting allocation/reconciliation: " +
        cash(s.unallocatedCaptured),
      `Remaining: ${s.remaining === null ? "Awaiting bill" : cash(s.remaining)}`,
      `Collection state: ${label(s.state)}`,
      `Provider payout: ${label(s.payoutStatus)}`,
      ...payments.map(
        (p) =>
          `${purpose(p)} | ${modeName(p.mode)} | ${p.status} | ${cash(p.amount)} | Bill ${p.billVersion || "-"} | Receipt ${p.receipt} | Order ${p.orderId || "pending"} | Transaction ${p.paymentId || "pending"}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `GharSeva-test-summary-${b._id.slice(-8)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="gs-pay__combined">
      <h3>Combined payment summary</h3>
      <dl className="gs-pay__breakdown">
        <div>
          <dt>
            Final bill total ({label(data.bill?.status || "not submitted")})
          </dt>
          <dd>{s.total === null ? "Awaiting bill" : cash(s.total)}</dd>
        </div>
        <div>
          <dt>Deposit credit</dt>
          <dd>{cash(s.depositCredit)}</dd>
        </div>
        <div>
          <dt>Balance captured</dt>
          <dd>{cash(s.balanceCaptured)}</dd>
        </div>
        <div>
          <dt>Processed refunds</dt>
          <dd>{cash(s.processedRefunds)}</dd>
        </div>
        <div>
          <dt>Remaining amount</dt>
          <dd>{s.remaining === null ? "Awaiting bill" : cash(s.remaining)}</dd>
        </div>
      </dl>
      <p>
        The deposit is part of the final total. It is deducted once. Refund
        requests are not processed refunds. Customer collection does not pay out
        the professional.
      </p>
      {!!s.unallocatedCaptured && (
        <p className="gs-pay__alert">
          Captured but awaiting reconciliation: {cash(s.unallocatedCaptured)}.
          This is not credited to the bill.
        </p>
      )}
      {s.settled && (
        <p className="gs-pay__pill">
          Settled bill v{b.billing?.settledVersion}. Later refunds are separate
          and do not create a new debt.
        </p>
      )}
      <button className="btn light small" onClick={download}>
        <Download size={14} />
        Download test summary & references
      </button>
    </section>
  );
}
function BillEditor({ data, busy, act }) {
  const [rows, setRows] = useState(
    () =>
      data.bill?.items
        .filter((i) => i.kind === "SERVICE")
        .map((i) => ({
          label: i.label,
          quantity: i.quantity,
          unit: String(i.unitAmount / 100),
        })) || [
        {
          label: "Service charges",
          quantity: 1,
          unit: String(data.booking.price),
        },
      ],
  );
  const approved = data.extras.filter((e) => e.status === "APPROVED"),
    [extras, setExtras] = useState(
      () =>
        data.bill?.items
          .filter((i) => i.kind === "EXTRA")
          .map((i) => i.extraId) || [],
    ),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="gs-pay__form"
      onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          const items = [
            ...rows.map((r) => ({
              kind: "SERVICE",
              label: r.label,
              quantity: Number(r.quantity),
              unitAmount: cents(r.unit),
            })),
            ...extras.map((extraId) => ({ kind: "EXTRA", extraId })),
          ];
          await api(`/payments/booking/${data.booking._id}/bill`, {
            method: "POST",
            body: { items, requestId },
          });
          setRequestId(crypto.randomUUID());
        });
      }}
    >
      <h3>{data.bill ? "Revise final bill" : "Submit itemised final bill"}</h3>
      {data.bill?.correctionReason && (
        <p className="gs-pay__alert">
          Customer correction: {data.bill.correctionReason}
        </p>
      )}
      {rows.map((r, i) => (
        <fieldset key={i}>
          <legend>Service item {i + 1}</legend>
          <label>
            Description
            <input
              required
              minLength={2}
              maxLength={120}
              value={r.label}
              disabled={busy}
              onChange={(e) =>
                setRows((old) =>
                  old.map((x, n) =>
                    n === i ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <div className="gs-pay__fields">
            <label>
              Quantity
              <input
                type="number"
                required
                min="1"
                max="1000"
                step="1"
                value={r.quantity}
                disabled={busy}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((x, n) =>
                      n === i ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Unit charge (₹)
              <input
                required
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                value={r.unit}
                disabled={busy}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((x, n) =>
                      n === i ? { ...x, unit: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => setRows((old) => old.filter((_, n) => n !== i))}
            >
              Remove item
            </button>
          )}
        </fieldset>
      ))}
      <button
        className="text-link"
        type="button"
        disabled={busy || rows.length >= 20}
        onClick={() =>
          setRows((old) => [...old, { label: "", quantity: 1, unit: "0" }])
        }
      >
        Add service item
      </button>
      <p>
        Service charges cannot exceed the starting estimate. Additional
        work/materials must be separately approved by the customer. No tax is
        invented.
      </p>
      {approved.map((e) => (
        <label className="gs-pay__consent" key={e.id}>
          <input
            type="checkbox"
            checked={extras.includes(e.id)}
            disabled={busy}
            onChange={(event) =>
              setExtras((old) =>
                event.target.checked
                  ? [...old, e.id]
                  : old.filter((x) => x !== e.id),
              )
            }
          />
          <span>
            Include approved {e.label} — {cash(e.amount)}
          </span>
        </label>
      ))}
      <button className="btn" disabled={busy}>
        Submit bill for customer approval
      </button>
    </form>
  );
}
function Extras({ data, busy, act, user }) {
  const [form, setForm] = useState({
      label: "",
      kind: "WORK",
      quantity: "1",
      unit: "",
    }),
    b = data.booking;
  return (
    <section className="gs-pay__extras">
      <h3>Additional work & materials</h3>
      {data.extras.map((e) => (
        <article key={e.id}>
          <strong>
            {e.label} — {cash(e.amount)}
          </strong>
          <p>
            {e.quantity} × {cash(e.unitAmount)} · {label(e.kind)} ·{" "}
            {label(e.status)}
          </p>
          {user.role === "customer" &&
            e.status === "PROPOSED" &&
            ["ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"].includes(b.status) && (
              <div className="gs-pay__booking-actions">
                {["APPROVED", "DECLINED"].map((decision) => (
                  <button
                    className="btn light small"
                    key={decision}
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api(
                          `/payments/booking/${b._id}/extras/${e.id}/decision`,
                          { method: "POST", body: { decision } },
                        ),
                      )
                    }
                  >
                    {decision === "APPROVED" ? "Approve this extra" : "Decline"}
                  </button>
                ))}
              </div>
            )}
        </article>
      ))}
      {!data.extras.length && <p>No extra charges have been proposed.</p>}
      {user.role === "provider" &&
        ["ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"].includes(b.status) && (
          <form
            className="gs-pay__form"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api(`/payments/booking/${b._id}/extras`, {
                  method: "POST",
                  body: {
                    label: form.label,
                    kind: form.kind,
                    quantity: Number(form.quantity),
                    unitAmount: cents(form.unit),
                  },
                });
                setForm({ label: "", kind: "WORK", quantity: "1", unit: "" });
              });
            }}
          >
            <label>
              Extra description
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.label}
                disabled={busy}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </label>
            <div className="gs-pay__fields">
              <label>
                Type
                <select
                  value={form.kind}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                >
                  <option value="WORK">Additional work</option>
                  <option value="MATERIAL">Materials</option>
                </select>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  required
                  min="1"
                  max="1000"
                  step="1"
                  value={form.quantity}
                  disabled={busy}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />
              </label>
              <label>
                Unit charge (₹)
                <input
                  required
                  inputMode="decimal"
                  value={form.unit}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </label>
            </div>
            <button className="btn light" disabled={busy}>
              Request customer approval for extra
            </button>
          </form>
        )}
    </section>
  );
}
export function PaymentJourney({ bookingId, onClose, onChanged = () => {} }) {
  const { user } = useApp(),
    [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [checkoutOpen, setCheckoutOpen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [accepted, setAccepted] = useState(false),
    [simulation, setSimulation] = useState(null),
    [reason, setReason] = useState(""),
    [refund, setRefund] = useState({ amount: "", reason: "" });
  const panelRef = useRef(null),
    checkoutAbort = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      checkoutAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    const dialog = panelRef.current?.closest('[role="dialog"]');
    const previous = document.activeElement;
    if (!dialog) return;
    dialog.querySelector('button[aria-label="Close"]')?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...dialog.querySelectorAll(
          'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]',
        ),
      ].filter((e) => e.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      dialog.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const lock = useRef(false),
    load = useCallback(async () => {
      const d = await api(`/payments/booking/${bookingId}`);
      setData(d);
      return d;
    }, [bookingId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const act = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      if (!mounted.current) return;
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        await load().catch(() => {});
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const launch = (purpose) =>
    act(async () => {
      const r = await api(`/payments/booking/${bookingId}/order`, {
        method: "POST",
        body:
          purpose === "FINAL_BALANCE"
            ? { purpose, acceptBalance: true }
            : { purpose, acceptDeposit: true },
      });
      setData(r);
      if (!r.checkoutReady) {
        setNotice(
          "No checkout opened. Reconcile the existing order or review the saved state.",
        );
        return;
      }
      if (r.payment.mode === "demo") {
        setSimulation(r.payment);
        return;
      }
      const context = sessionClient.context,
        epoch = sessionClient.epoch;
      const active = () =>
        mounted.current &&
        !sessionClient.locked &&
        sessionClient.context === context &&
        sessionClient.epoch === epoch;
      await loadCheckout();
      if (!active())
        throw new Error("The session changed. Refresh saved payment status.");
      setCheckoutOpen(true);
      checkoutAbort.current = new AbortController();
      const p = r.payment;
      try {
        const outcome = await openTestCheckout({
          Checkout: window.Razorpay,
          signal: checkoutAbort.current.signal,
          active,
          options: {
            key: r.keyId,
            order_id: p.orderId,
            amount: p.amount,
            currency: p.currency,
            name: "GharSeva",
            description:
              (purpose === "FINAL_BALANCE"
                ? "Approved bill balance"
                : "Visit deposit") + " - TEST MODE",
            theme: { color: "#087f8c" },
          },
          verify: (result) =>
            api("/payments/" + p._id + "/verify", {
              method: "POST",
              body: result,
            }),
          notify: setNotice,
        });
        if (active())
          setNotice(
            outcome.state === "closed"
              ? "Checkout closed. Refresh saved payment status before retrying."
              : "Server verification finished. Review the saved stage below; authorization alone is not captured payment.",
          );
      } finally {
        checkoutAbort.current = null;
        if (mounted.current) setCheckoutOpen(false);
      }
    });
  const b = data?.booking,
    s = data?.summary,
    bill = data?.bill,
    deposit = data?.payments.find((p) => p.purpose !== "FINAL_BALANCE"),
    balance = data?.payments.find((p) => p.purpose === "FINAL_BALANCE"),
    newPlan = b?.paymentPlan?.type === "DEPOSIT_BALANCE_V1",
    frozen = !!b?.billing?.balancePayment || !!b?.billing?.settledAt,
    blocked = busy || checkoutOpen,
    configured =
      data?.options.enabled &&
      (!newPlan || b.paymentPlan.mode === data.options.mode);
  return (
    <Modal
      title="Bill, payments & receipts"
      onClose={() => {
        if (!blocked) onClose();
      }}
    >
      <div
        ref={panelRef}
        aria-busy={blocked}
        className="gs-pay gs-pay__modal gs-pay--stages"
      >
        {error && (
          <p className="gs-pay__alert" role="alert">
            {error}
          </p>
        )}
        {!data ? (
          <>
            <p role="status">
              {error
                ? "Payment details could not load."
                : "Loading bill and payment details..."}
            </p>
            {error && (
              <button
                className="btn light"
                disabled={busy}
                onClick={() => act(load)}
              >
                Retry loading payment details
              </button>
            )}
          </>
        ) : (
          <>
            <div className="gs-pay__mode">
              <ShieldCheck size={18} />
              <div>
                <strong>
                  {modeName(b.paymentPlan?.mode || data.options.mode)}
                </strong>
                <p>{data.options.notice}</p>
              </div>
            </div>
            <h3>
              {b.service} · {b.provider}
            </h3>
            <p>
              {prettyDate(b.date)} · {b.time} IST · Booking {label(b.status)}
            </p>
            <strong className="gs-pay__stage-state" role="status">
              {label(s.state)}
            </strong>
            {!newPlan && (
              <p>
                This historical booking keeps its original optional-deposit
                behaviour. No new service-start requirement or final-bill debt
                has been imposed.
              </p>
            )}
            {newPlan && (
              <p>
                Provider acceptance → deposit → visit OTP → completed service →
                customer-approved final bill → remaining balance. The deposit
                counts toward the bill.
              </p>
            )}
            {s.refundReview && (
              <p className="gs-pay__alert">
                Refund review is required. Requested/pending refunds have not
                been processed.{" "}
                {s.overpayment > 0 && `Overpayment: ${cash(s.overpayment)}.`} No
                further collection is available while this is unresolved.
              </p>
            )}
            {s.issue && <p className="gs-pay__alert">{s.issue}</p>}
            <section>
              <h3>
                {newPlan
                  ? "Deposit before service"
                  : "Optional historical deposit"}
              </h3>
              <p>
                {cash(
                  b.paymentPlan?.depositAmount ??
                    deposit?.amount ??
                    Math.min(data.options.depositRupees * 100, b.price * 100),
                )}{" "}
                · {deposit ? label(deposit.status) : "Not paid"}.{" "}
                {newPlan
                  ? "A verified capture is required before starting work, together with the visit OTP."
                  : "This remains optional."}
              </p>
              {data.canPay &&
                user.role === "customer" &&
                (!deposit || ["READY", "FAILED"].includes(deposit.status)) &&
                !s.refundReview &&
                !s.issue && (
                  <>
                    <label className="gs-pay__consent">
                      <input
                        type="checkbox"
                        checked={accepted}
                        disabled={blocked}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      <span>
                        I reviewed the deposit, credited toward the final bill.
                        This is{" "}
                        {data.options.mode === "demo"
                          ? "a classroom simulation"
                          : "a Razorpay test payment"}
                        .
                      </span>
                    </label>
                    {configured ? (
                      <button
                        className="btn full"
                        disabled={blocked || !accepted}
                        onClick={() => launch("VISIT_DEPOSIT")}
                      >
                        {data.options.mode === "demo"
                          ? "Open deposit simulation"
                          : "Pay deposit with Razorpay test"}
                      </button>
                    ) : (
                      <p className="gs-pay__alert">
                        Payment setup is needed. No working Pay button is
                        available until credentials/mode are configured.
                      </p>
                    )}
                  </>
                )}
            </section>
            {newPlan && (
              <Extras data={data} user={user} busy={blocked} act={act} />
            )}
            {newPlan &&
              user.role === "provider" &&
              b.status === "COMPLETED" &&
              !frozen &&
              (!bill || bill.status === "CORRECTION_REQUESTED") && (
                <BillEditor
                  key={bill?.version || 0}
                  data={data}
                  busy={blocked}
                  act={act}
                />
              )}
            {bill && (
              <section className="gs-pay__bill">
                <h3>
                  Final bill v{bill.version} · {label(bill.status)}
                </h3>
                {bill.items.map((i, n) => (
                  <div className="gs-pay__bill-item" key={n}>
                    <span>
                      {i.label}
                      <small>
                        {i.quantity} × {cash(i.unitAmount)} ·{" "}
                        {i.kind === "EXTRA"
                          ? "Customer-approved extra"
                          : "Service charge"}
                      </small>
                    </span>
                    <strong>{cash(i.amount)}</strong>
                  </div>
                ))}
                <p>
                  <strong>Final total {cash(bill.total)}</strong> · No added tax
                  charges.
                </p>
                {bill.correctionReason && (
                  <p className="gs-pay__alert">
                    Correction requested: {bill.correctionReason}
                  </p>
                )}
                {user.role === "customer" &&
                  !frozen &&
                  ["SUBMITTED", "APPROVED"].includes(bill.status) && (
                    <>
                      <p>
                        Payment credit {cash(s.credit)} · Remaining{" "}
                        {cash(Math.max(0, bill.total - s.credit))}. Review all
                        items and any extra-work approvals.
                      </p>
                      <button
                        className="btn full"
                        disabled={blocked || s.pendingRefund || !!s.issue}
                        onClick={() =>
                          act(() =>
                            api(
                              `/payments/booking/${bookingId}/bill/decision`,
                              {
                                method: "POST",
                                body: {
                                  version: bill.version,
                                  decision: "APPROVED",
                                  confirm: true,
                                },
                              },
                            ),
                          )
                        }
                      >
                        Approve bill & continue to payment
                      </button>
                      <form
                        className="gs-pay__form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act(() =>
                            api(
                              `/payments/booking/${bookingId}/bill/decision`,
                              {
                                method: "POST",
                                body: {
                                  version: bill.version,
                                  decision: "CORRECTION_REQUESTED",
                                  reason,
                                },
                              },
                            ),
                          );
                        }}
                      >
                        <label>
                          Correction reason
                          <textarea
                            required
                            minLength={5}
                            maxLength={500}
                            value={reason}
                            disabled={blocked}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <button className="btn light" disabled={blocked}>
                          Request correction
                        </button>
                      </form>
                    </>
                  )}
              </section>
            )}
            {data.canBalance &&
              (!balance || ["READY", "FAILED"].includes(balance.status)) && (
                <section>
                  <h3>Remaining balance {cash(s.remaining)}</h3>
                  <p>
                    Approved bill v{bill.version}. Deposit/payment credit has
                    already been deducted once. This creates a separate balance
                    order and freezes this bill.
                  </p>
                  {configured ? (
                    <button
                      className="btn full"
                      disabled={blocked}
                      onClick={() => launch("FINAL_BALANCE")}
                    >
                      {data.options.mode === "demo"
                        ? "Open balance simulation"
                        : "Pay remaining balance with Razorpay test"}
                    </button>
                  ) : (
                    <p className="gs-pay__alert">
                      Configure the original payment mode and test credentials
                      before paying this balance.
                    </p>
                  )}
                </section>
              )}
            {simulation &&
              ["READY", "FAILED"].includes(
                data.payments.find((p) => p._id === simulation._id)?.status,
              ) && (
                <div className="gs-pay__simulator">
                  <strong>CLASSROOM SIMULATION — {purpose(simulation)}</strong>
                  <p>
                    No gateway transaction, card/UPI entry or real money
                    movement.
                  </p>
                  {[
                    ["CAPTURED", "Simulate success"],
                    ["FAILED", "Simulate failure"],
                    ["CANCELLED", "Cancel simulation"],
                  ].map(([outcome, title]) => (
                    <button
                      className="btn light small"
                      key={outcome}
                      disabled={blocked}
                      onClick={() =>
                        act(async () => {
                          await api(`/payments/${simulation._id}/demo`, {
                            method: "POST",
                            body: { outcome },
                          });
                          if (outcome !== "FAILED") setSimulation(null);
                        })
                      }
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
            <CombinedReceipt data={data} />
            <button
              className="btn light"
              disabled={blocked}
              onClick={() =>
                act(() =>
                  api(`/payments/booking/${bookingId}/refresh`, {
                    method: "POST",
                    body: {},
                  }),
                )
              }
            >
              <RefreshCw size={15} />
              Reconcile payment & refund status
            </button>
            <h3>Separate payment records</h3>
            {data.payments.map((p) => (
              <article className="gs-pay__record" key={p._id}>
                <strong>
                  {purpose(p)} — {cash(p.amount)} · {label(p.status)}
                </strong>
                <p>
                  {modeName(p.mode)} · Bill {p.billVersion || "deposit"}
                  <br />
                  Receipt {p.receipt}
                  <br />
                  Order {p.orderId || "Uncertain / not yet assigned"}
                  <br />
                  Transaction {p.paymentId || "Not captured"}
                </p>
                {p.lastError && <p className="gs-pay__alert">{p.lastError}</p>}
                {user.role === "admin" &&
                  p.mode === "demo" &&
                  ["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status) && (
                    <button
                      className="btn light small"
                      disabled={blocked}
                      onClick={() =>
                        act(() =>
                          api(`/payments/${p._id}/demo-refund`, {
                            method: "POST",
                            body: { confirm: true },
                          }),
                        )
                      }
                    >
                      Simulate remaining full refund — no money moved
                    </button>
                  )}
                {["customer", "admin"].includes(user.role) &&
                  ["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status) && (
                    <form
                      className="gs-pay__form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(() =>
                          api(`/payments/${p._id}/refund-review`, {
                            method: "POST",
                            body: {
                              amount: cents(refund.amount),
                              reason: refund.reason,
                              requestId: crypto.randomUUID(),
                            },
                          }),
                        );
                      }}
                    >
                      <label>
                        Request refund review (₹)
                        <input
                          inputMode="decimal"
                          required
                          disabled={blocked}
                          value={refund.amount}
                          onChange={(e) =>
                            setRefund({ ...refund, amount: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Reason
                        <textarea
                          required
                          minLength={5}
                          maxLength={500}
                          disabled={blocked}
                          value={refund.reason}
                          onChange={(e) =>
                            setRefund({ ...refund, reason: e.target.value })
                          }
                        />
                      </label>
                      <button className="btn light small" disabled={blocked}>
                        Request review — does not issue a refund
                      </button>
                    </form>
                  )}
                <details>
                  <summary>Payment history</summary>
                  {p.history.map((h, i) => (
                    <p key={i}>
                      {label(h.action)} · {h.source} · {h.note}
                    </p>
                  ))}
                </details>
              </article>
            ))}
            {data.refunds.length > 0 && (
              <section>
                <h3>Authoritative refund records</h3>
                {data.refunds.map((r) => (
                  <p key={r._id}>
                    {modeName(r.mode)} · {cash(r.amount)} · {label(r.status)} ·{" "}
                    {r.gatewayRefundId}{" "}
                    {r.postSettlement ? "(after settlement; no new debt)" : ""}
                  </p>
                ))}
              </section>
            )}
            {(b.billing?.refundReviews || []).map((r) => (
              <article className="gs-pay__record" key={r.id}>
                <strong>
                  Refund review {cash(r.amount)} · {label(r.status)}
                </strong>
                <p>
                  {r.reason}. A requested/closed review is not proof of returned
                  funds.
                </p>
                {user.role === "admin" && r.status === "REQUESTED" && (
                  <button
                    className="btn light small"
                    disabled={blocked}
                    onClick={() => {
                      const note = window.prompt(
                        "Record the review resolution. This does not process a refund.",
                      );
                      if (note)
                        act(() =>
                          api(
                            `/payments/booking/${bookingId}/refund-review/${r.id}/close`,
                            { method: "POST", body: { reason: note } },
                          ),
                        );
                    }}
                  >
                    Close review with recorded reason
                  </button>
                )}
              </article>
            ))}
            {newPlan && (
              <details>
                <summary>Bill versions & approval history</summary>
                {b.billing?.versions?.map((v) => (
                  <article key={v.version}>
                    <h4>
                      v{v.version} · {cash(v.total)} · {label(v.status)}
                    </h4>
                    {v.items.map((i, n) => (
                      <p key={n}>
                        {i.label} · {cash(i.amount)}
                      </p>
                    ))}
                    {v.history.map((h, n) => (
                      <p key={n}>
                        {label(h.action)} · {h.at} · {h.note}
                      </p>
                    ))}
                  </article>
                ))}
              </details>
            )}
            <p className="gs-pay__fine">
              Collection and service completion are separate. Provider payout:
              not initiated. For an actual Razorpay test refund, use its test
              Dashboard and reconcile here. No live keys or automatic payouts
              are enabled.
            </p>
          </>
        )}
        {notice && (
          <p role="status" className="gs-pay__notice">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
export function Payments() {
  const { user } = useApp();
  const [events, setEvents] = useState([]);
  const [params, setParams] = useSearchParams(),
    [data, setData] = useState(null),
    [journeys, setJourneys] = useState(null),
    [page, setPage] = useState(1),
    [mode, setMode] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [ledger, j, unresolved] = await Promise.all([
        api(
          `/payments?${new URLSearchParams({ page: String(page), ...(mode ? { mode } : {}) })}`,
        ),
        api(`/payments/journeys?page=${page}`),
        user?.role === "admin" ? api("/payments/events") : Promise.resolve([]),
      ]);
      setEvents(unresolved || []);
      setData(ledger);
      setJourneys(j);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [page, mode, user?.role]);
  useEffect(() => {
    load();
  }, [load]);
  const open = (id) => setParams({ section: "payments", booking: String(id) });
  return (
    <section className="gs-pay gs-pay--stages">
      <div className="gs-pay__hero">
        <div>
          <span className="eyebrow">
            SERVICE. APPROVAL. CLEAR PAYMENT RECORDS.
          </span>
          <h2>
            Deposit first.
            <br />
            <em>Approved balance after service.</em>
          </h2>
          <p>
            Review deposit capture, agreed extras, final bill versions and
            remaining payment. Collection is separate from professional payouts.
          </p>
        </div>
        <Wallet size={38} />
      </div>
      {error && (
        <p className="gs-pay__alert" role="alert">
          {error} Refresh this page or contact support if payment records remain
          unavailable.
        </p>
      )}
      {data && (
        <div className="gs-pay__mode">
          <ShieldCheck size={18} />
          <div>
            <strong>{modeName(data.options.mode)}</strong>
            <p>{data.options.notice}</p>
          </div>
        </div>
      )}
      {user?.role === "admin" && (
        <section className="gs-pay__combined">
          <h3>Unresolved webhook events</h3>
          <p>
            Read-only audit. Reconcile the saved order and bill before replaying
            an unprocessed event. Captured funds must never be assigned by
            editing paid flags.
          </p>
          {events.length ? (
            events.map((event) => (
              <p key={event._id}>
                {event.event} | {event.resolution || "PENDING"} |{" "}
                {event.eventKey} | Order {event.gatewayOrderId || "unresolved"}{" "}
                | Payment {event.gatewayPaymentId || "unresolved"}
              </p>
            ))
          ) : (
            <p>No unresolved webhook events returned.</p>
          )}
        </section>
      )}
      <div className="gs-pay__tools">
        <h3>Booking payment journeys</h3>
        <button className="btn light small" onClick={load}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <div className="gs-pay__list">
        {journeys?.items.map((b) => (
          <article key={b._id}>
            <div className="gs-pay__row-top">
              <div>
                <h3>{b.service}</h3>
                <p>
                  {prettyDate(b.date)} · Booking {label(b.status)}
                </p>
                <strong>{label(b.summary.state)}</strong>
                <p>
                  {b.paymentPlan
                    ? "Deposit " + cash(b.paymentPlan.depositAmount)
                    : "Historical optional deposit"}{" "}
                  · Remaining{" "}
                  {b.summary.remaining === null
                    ? "awaiting bill"
                    : cash(b.summary.remaining)}
                </p>
              </div>
              <button className="btn light small" onClick={() => open(b._id)}>
                Bill, payments & receipts
                <ArrowRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {journeys && !journeys.items.length && <p>No bookings in this view.</p>}
      <div className="gs-pay__tools">
        <h3>Deposit & balance ledger</h3>
        <select
          aria-label="Payment mode filter"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All test modes</option>
          <option value="demo">Classroom simulation</option>
          <option value="razorpay_test">Razorpay test</option>
        </select>
      </div>
      <div className="gs-pay__list">
        {data?.items.map((p) => (
          <article key={p._id}>
            <div className="gs-pay__row-top">
              <div>
                <small>{modeName(p.mode)}</small>
                <h3>
                  {purpose(p)} · {cash(p.amount)}
                </h3>
                <p>
                  {p.bookingInfo?.service} · {label(p.status)} · {p.receipt}
                </p>
              </div>
              <button className="text-link" onClick={() => open(p.booking)}>
                View booking summary
              </button>
            </div>
          </article>
        ))}
      </div>
      {data && !data.items.length && <p>No payment records on this page.</p>}
      <div className="gs-pay__pagination">
        <button
          className="text-link"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="text-link"
          disabled={page >= Math.max(data?.pages || 1, journeys?.pages || 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {params.get("booking") && (
        <PaymentJourney
          key={params.get("booking")}
          bookingId={params.get("booking")}
          onChanged={load}
          onClose={() => setParams({ section: "payments" })}
        />
      )}
    </section>
  );
}
