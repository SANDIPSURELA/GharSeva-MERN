import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  FileImage,
  Fingerprint,
  LockKeyhole,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { api, label } from "../api";
import "./IdentityVerification.css";
const stateLabel = {
  SUBMITTED: "Waiting for human review",
  NEEDS_CORRECTION: "Please update your evidence",
  REVIEWED: "Document review complete",
  WITHDRAWN: "Evidence removed",
};
const checkLabel = {
  CONSISTENT: "Name components consistent",
  REVIEW: "Name needs a closer look",
  UNREADABLE: "Name could not be read",
  DISCREPANCY: "Name discrepancy to review",
};
const date = (v) =>
  new Date(v).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function PrivateImage({ image }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="gs-id__image">
      <figcaption>
        <LockKeyhole size={13} />
        {label(image.side)} · private image
      </figcaption>
      {failed ? (
        <p>
          Image unavailable or expired. Refresh the record or request a new
          upload.
        </p>
      ) : (
        <a href={image.url} target="_blank" rel="noreferrer">
          <img
            src={image.url}
            alt={`${label(image.side)} of submitted review evidence`}
            onError={() => setFailed(true)}
          />
          <span>
            Open full image <ArrowRight size={13} />
          </span>
        </a>
      )}
    </figure>
  );
}
function NameCheck({ record }) {
  const c = record.check;
  if (!c) return null;
  return (
    <div className={`gs-id__check gs-id__check--${c.status?.toLowerCase()}`}>
      <div className="gs-id__check-head">
        <ScanLine size={22} />
        <div>
          <span>OCR-ASSISTED NAME CHECK</span>
          <h3>{checkLabel[c.status] || "Manual review required"}</h3>
        </div>
      </div>
      <p className="gs-id__account-name">
        <b>Registration name:</b> {record.accountName}
      </p>
      <div className="gs-id__names">
        <div>
          <small>Name entered by applicant</small>
          <strong>
            {[record.firstName, record.middleName, record.lastName]
              .filter(Boolean)
              .join(" ")}
          </strong>
        </div>
        <div>
          <small>Name read from front image</small>
          <strong>{c.extractedName || "Not read reliably"}</strong>
        </div>
      </div>
      <ul>
        {c.reasons?.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {c.matched?.length > 0 && (
        <p>
          <b>Matching components:</b> {c.matched.join(" · ")}
        </p>
      )}
      {c.missing?.length > 0 && (
        <p>
          <b>Check these components:</b> {c.missing.join(" · ")}
        </p>
      )}
      {c.extra?.length > 0 && (
        <p>
          <b>Additional document components:</b> {c.extra.join(" · ")}
        </p>
      )}
      <small className="gs-id__explain">
        Read by local English OCR. Reordered names can be consistent; spelling
        changes, initials and other scripts need human review. This result does
        not verify document authenticity or decide provider approval.
      </small>
    </div>
  );
}
function History({ record }) {
  return (
    <div className="gs-id__history">
      <h3>Review history</h3>
      <ol>
        {[...(record.history || [])].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`}>
            <span />
            <div>
              <strong>{label(h.action)}</strong>
              <small>{date(h.at)}</small>
              <p>{h.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
function Record({ record }) {
  return (
    <>
      <div className="gs-id__status">
        <span
          className={`gs-id__pill gs-id__pill--${record.state?.toLowerCase()}`}
        >
          {stateLabel[record.state]}
        </span>
        <small>
          Revision {record.revision} · {label(record.documentType)}
        </small>
      </div>
      {record.state !== "WITHDRAWN" && (
        <>
          <NameCheck record={record} />
          <div className="gs-id__evidence-heading">
            <h3>Submitted evidence</h3>
            <span>
              <LockKeyhole size={13} /> Owner & administrators only
            </span>
          </div>
          {record.evidenceExpired ? (
            <p className="gs-id__alert">
              The retained images have expired. Submit new evidence for any
              further review.
            </p>
          ) : (
            <div className="gs-id__images">
              {record.images?.map((image) => (
                <PrivateImage key={image.url} image={image} />
              ))}
            </div>
          )}
          <p className="gs-id__retention">
            Consent recorded {date(record.consentAt)}. Images expire{" "}
            {date(record.evidenceExpiresAt)} and are removed by background
            cleanup. Aadhaar authenticity: <b>not verified by UIDAI</b>.
          </p>
          {record.reviewedName && (
            <div className="gs-id__human">
              <CheckCircle2 size={19} />
              <div>
                <strong>Human document review recorded</strong>
                <p>
                  Name recorded by reviewer: {record.reviewedName}. Provider
                  listing approval is a separate administrator decision.
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <History record={record} />
    </>
  );
}
function FileChoice({ side, file, onChange, busy, required }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const reader = new FileReader();
    let active = true;
    reader.onload = () => {
      if (active) setPreview(String(reader.result));
    };
    reader.readAsDataURL(file);
    return () => {
      active = false;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);
  return (
    <label className="gs-id__file">
      <span>
        <FileImage size={18} />
        {label(side)} image {required ? "*" : "(optional)"}
      </span>
      {preview ? (
        <img src={preview} alt={`Selected ${side} image preview`} />
      ) : (
        <div className="gs-id__file-placeholder">
          <Upload size={26} />
          <strong>Choose {side} image</strong>
          <small>JPG, PNG or WebP · up to 3 MB</small>
        </div>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`${label(side)} verification image`}
        required={required}
        disabled={busy}
        onChange={(e) => onChange(e.target.files?.[0] || null, e.target)}
      />
      <small>
        {file
          ? `${file.name} · ${Math.ceil(file.size / 1024)} KB`
          : "Clear, uncropped and readable · at least 500 × 300 px"}
      </small>
    </label>
  );
}
export function ProviderIdentityVerification() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    documentType: "AADHAAR_MASKED",
    firstName: "",
    middleName: "",
    lastName: "",
    consent: false,
    maskedConfirmed: false,
  });
  const [front, setFront] = useState(null),
    [back, setBack] = useState(null);
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      setData(await api("/provider/identity"));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const record = data?.record,
    showForm = !record || record.state === "WITHDRAWN" || editing;
  const change = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };
  const choose = (setter) => (f, input) => {
    setError("");
    if (
      f &&
      (f.size > 3 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(f.type))
    ) {
      setError("Choose a JPG, PNG or WebP of 3 MB or less.");
      input.value = "";
      setter(null);
      return;
    }
    setter(f);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(form)) body.append(k, String(v));
      body.append("revision", String(record?.revision || 0));
      if (front) body.append("front", front);
      if (back) body.append("back", back);
      await api("/provider/identity", { method: "POST", body });
      setFront(null);
      setBack(null);
      setEditing(false);
      setForm((f) => ({ ...f, consent: false, maskedConfirmed: false }));
      await load();
      setNotice(
        "Private evidence saved. Your name check is ready; an administrator will review it.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="gs-id">
      <div className="gs-id__hero">
        <div className="gs-id__hero-icon">
          <Fingerprint size={29} />
        </div>
        <div>
          <span className="eyebrow">A CLEARER PATH TO REVIEW</span>
          <h2>
            Your identity documents,
            <br />
            <em>handled with care.</em>
          </h2>
          <p>
            Share readable evidence, check the name we read, and keep track of
            the administrator’s review.
          </p>
        </div>
        <span className="gs-id__private">
          <LockKeyhole size={14} /> Private review
        </span>
      </div>
      <div className="gs-id__steps">
        <span className="is-current">
          <b>1</b> Submit evidence
        </span>
        <span>
          <b>2</b> Assisted name check
        </span>
        <span>
          <b>3</b> Human review
        </span>
      </div>
      <div className="gs-id__boundary">
        <ShieldCheck size={20} />
        <p>
          <b>Document review, with a person in charge.</b> OCR reads text and
          compares names. It does not authenticate Aadhaar, prove ownership or
          automatically approve or reject your application. Alternative identity
          evidence is available.
        </p>
      </div>
      {error && (
        <div className="gs-id__alert" role="alert">
          {error}
          <button type="button" onClick={load} disabled={busy}>
            Refresh record
          </button>
        </div>
      )}
      {notice && (
        <p className="gs-id__success" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <p role="status">Loading your verification…</p>
      ) : (
        <>
          {record && <Record record={record} />}
          {!showForm && (
            <div className="gs-id__actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    documentType: record.documentType,
                    firstName: record.firstName || "",
                    middleName: record.middleName || "",
                    lastName: record.lastName || "",
                    consent: false,
                    maskedConfirmed: false,
                  }));
                  setEditing(true);
                }}
              >
                Replace or correct evidence <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    await api("/provider/identity", {
                      method: "DELETE",
                      body: { revision: record.revision },
                    });
                    await load();
                    setNotice(
                      "Review images removed. Existing bookings are unchanged; pending listing approval still requires evidence.",
                    );
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                Remove retained evidence
              </button>
            </div>
          )}
          {showForm && (
            <form className="gs-id__form" onSubmit={submit}>
              <div className="gs-id__form-heading">
                <span className="eyebrow">YOUR REVIEW EVIDENCE</span>
                <h3>
                  {editing
                    ? "Update the details. Keep your progress."
                    : "Let’s start with the name and images."}
                </h3>
                <p>
                  For a college demonstration, use the fictional samples below.
                  No real identity number is needed.
                </p>
              </div>
              <div className="gs-id__sample-links">
                <a href="/demo/identity-front.png" download>
                  Download sample front <ArrowRight size={13} />
                </a>
                <a href="/demo/identity-back.png" download>
                  Download sample back <ArrowRight size={13} />
                </a>
              </div>
              <label>
                Document type
                <select
                  name="documentType"
                  value={form.documentType}
                  onChange={change}
                  disabled={busy}
                >
                  <option value="AADHAAR_MASKED">
                    Masked Aadhaar — front and back
                  </option>
                  <option value="OTHER">Alternative identity evidence</option>
                </select>
              </label>
              <div className="gs-id__field-grid">
                {[
                  ["firstName", "First / given name", true],
                  ["middleName", "Middle name (optional)", false],
                  ["lastName", "Surname (optional)", false],
                ].map(([name, title, required]) => (
                  <label key={name}>
                    {title}
                    <input
                      name={name}
                      value={form[name]}
                      onChange={change}
                      required={required}
                      maxLength={60}
                      disabled={busy}
                      autoComplete="off"
                    />
                  </label>
                ))}
              </div>
              <p className="gs-id__tip">
                Example: first name “Sandip”, surname “Surela”, document “Surela
                Sandip Rajubhai”. Reordered matching components are recognised.
                Enter any middle name you use; single names and initials receive
                human review.
              </p>
              <div className="gs-id__images">
                <FileChoice
                  side="front"
                  file={front}
                  onChange={choose(setFront)}
                  busy={busy}
                  required
                />
                <FileChoice
                  side="back"
                  file={back}
                  onChange={choose(setBack)}
                  busy={busy}
                  required={form.documentType === "AADHAAR_MASKED"}
                />
              </div>
              {form.documentType === "AADHAAR_MASKED" && (
                <label className="gs-id__consent">
                  <input
                    type="checkbox"
                    name="maskedConfirmed"
                    checked={form.maskedConfirmed}
                    onChange={change}
                    required
                    disabled={busy}
                  />
                  <span>
                    I am using fictional samples, or have masked the Aadhaar
                    number except its last four digits and covered unnecessary
                    address, date-of-birth and QR information on both images. I
                    understand image reading is not Aadhaar authentication.
                  </span>
                </label>
              )}
              <label className="gs-id__consent">
                <input
                  type="checkbox"
                  name="consent"
                  checked={form.consent}
                  onChange={change}
                  required
                  disabled={busy}
                />
                <span>
                  I agree to local OCR processing and private storage of these
                  images for this application review, for up to 30 days. The
                  administrator can view them; I can remove them from this page.
                </span>
              </label>
              <div className="gs-id__actions">
                <p>
                  <LockKeyhole size={15} /> Encrypted private images · local OCR
                </p>
                {editing && (
                  <button
                    type="button"
                    className="btn light"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setFront(null);
                      setBack(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Reading & saving…" : "Submit for document review"}
                  <ArrowRight size={15} />
                </button>
              </div>
              {busy && (
                <p className="gs-id__tip" role="status">
                  The local reader may take up to 40 seconds. Keep this page
                  open. No booking or listing approval is created by this check.
                </p>
              )}
            </form>
          )}
          <p className="gs-id__footer-note">
            Live Aadhaar authentication is not connected. OCR can miss private
            numbers: prepare masked copies before uploading and use fictional
            evidence for classroom demonstrations.
          </p>
        </>
      )}
    </section>
  );
}
function AdminIdentityPanel({ providerId, onBack, onSaved }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [reviewedName, setReviewedName] = useState(""),
    [humanReviewed, setHumanReviewed] = useState(false),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      const v = await api(`/admin/identities/${providerId}`);
      setData(v);
      setReviewedName(
        v.record?.reviewedName || v.record?.check?.extractedName || "",
      );
      setHumanReviewed(false);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [providerId]);
  useEffect(() => {
    load();
  }, [load]);
  const review = async (action) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/identities/${providerId}`, {
        method: "PATCH",
        body: {
          revision: data.record.revision,
          action,
          note,
          reviewedName,
          humanReviewed,
        },
      });
      setNote("");
      await load();
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="gs-id__detail">
      <div className="gs-id__detail-heading">
        <button className="text-link" onClick={onBack} disabled={busy}>
          <ChevronLeft size={16} /> All identity reviews
        </button>
        <button className="text-link" onClick={load} disabled={busy}>
          <RefreshCw size={14} /> Refresh evidence
        </button>
      </div>
      {error && (
        <div className="gs-id__alert" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p role="status">Loading private evidence…</p>
      ) : (
        <>
          <h3 className="gs-id__applicant">{data.provider.name}</h3>
          <p className="gs-id__tip">
            Current listing: {label(data.provider.profile.status)}. Review the
            original evidence and any differences yourself. The automated name
            result is advisory.
          </p>
          {!data.record ? (
            <div className="gs-id__empty">
              <FileImage size={30} />
              <h3>Waiting for private evidence.</h3>
              <p>
                The applicant can open Identity verification to submit their
                images. Existing supporting files remain in Providers &
                approval.
              </p>
            </div>
          ) : (
            <>
              <Record record={data.record} />
              {data.record.state !== "WITHDRAWN" && (
                <div className="gs-id__review-form">
                  <h3>Record your document review</h3>
                  <p>
                    A consistent name is not proof that a document is genuine or
                    belongs to the applicant. Completing this review does not
                    publish the provider.
                  </p>
                  <label>
                    Name you read from the document
                    <input
                      value={reviewedName}
                      maxLength={100}
                      disabled={busy}
                      onChange={(e) => setReviewedName(e.target.value)}
                    />
                  </label>
                  <label>
                    Review reason or correction instructions
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      minLength={10}
                      maxLength={500}
                      rows={3}
                      disabled={busy}
                      placeholder="Explain the evidence checked or the correction needed…"
                    />
                  </label>
                  <label className="gs-id__consent">
                    <input
                      type="checkbox"
                      checked={humanReviewed}
                      disabled={busy}
                      onChange={(e) => setHumanReviewed(e.target.checked)}
                    />
                    <span>
                      I personally reviewed the submitted images, the
                      applicant’s name and any discrepancies. I am recording a
                      human document-review decision, not UIDAI authentication.
                    </span>
                  </label>
                  <div className="gs-id__actions">
                    <button
                      className="btn light"
                      disabled={busy || note.trim().length < 10}
                      onClick={() => review("NEEDS_CORRECTION")}
                    >
                      Request a correction
                    </button>
                    <button
                      className="btn"
                      disabled={
                        busy ||
                        !humanReviewed ||
                        note.trim().length < 10 ||
                        !reviewedName.trim() ||
                        data.record.evidenceExpired
                      }
                      onClick={() => review("REVIEWED")}
                    >
                      Record completed review <CheckCircle2 size={15} />
                    </button>
                  </div>
                </div>
              )}
              <Link
                className="gs-id__return"
                to="/dashboard/admin?section=applications"
              >
                Continue to application decision <ArrowRight size={15} />
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}
export function IdentityReviewQueue() {
  const [params, setParams] = useSearchParams(),
    [data, setData] = useState(null),
    [state, setState] = useState("SUBMITTED"),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const selected = params.get("provider");
  const load = useCallback(async () => {
    try {
      setData(
        await api(
          `/admin/identities?${new URLSearchParams({ state, page: String(page) })}`,
        ),
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [state, page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="gs-id">
      <div className="gs-id__hero">
        <div className="gs-id__hero-icon">
          <ShieldCheck size={29} />
        </div>
        <div>
          <span className="eyebrow">PRIVATE EVIDENCE · HUMAN DECISIONS</span>
          <h2>
            A careful review.
            <br />
            <em>A clear next step.</em>
          </h2>
          <p>
            Read the evidence, understand name differences and leave useful
            correction instructions.
          </p>
        </div>
      </div>
      <div className="gs-id__boundary">
        <ScanLine size={20} />
        <p>
          OCR helps read names. It never approves or rejects an applicant.
          Aadhaar authenticity and ownership are not verified by this workflow.
        </p>
      </div>
      {selected ? (
        <AdminIdentityPanel
          key={selected}
          providerId={selected}
          onSaved={load}
          onBack={() => setParams({ section: "verification" })}
        />
      ) : (
        <>
          <div className="gs-id__queue-tools">
            <label>
              Review status
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="SUBMITTED">Waiting for review</option>
                <option value="NEEDS_CORRECTION">Needs correction</option>
                <option value="REVIEWED">Review complete</option>
                <option value="WITHDRAWN">Evidence removed</option>
                <option value="">All statuses</option>
              </select>
            </label>
            <button className="btn light small" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {error && (
            <p className="gs-id__alert" role="alert">
              {error}
            </p>
          )}
          {!data ? (
            <p role="status">Loading review queue…</p>
          ) : (
            <>
              <p className="gs-id__tip">
                {data.total} records · Page {data.page} of {data.pages}
              </p>
              <div className="gs-id__queue">
                {data.items.map((r) => (
                  <article key={r._id}>
                    <div className="gs-id__queue-icon">
                      <FileImage size={23} />
                    </div>
                    <div>
                      <h3>{r.provider?.name || "Unavailable account"}</h3>
                      <p>
                        {stateLabel[r.state]} · {date(r.updatedAt)}
                      </p>
                      <small>
                        {r.evidenceExpired
                          ? "Evidence expired"
                          : checkLabel[r.check?.status] ||
                            "No active name check"}
                      </small>
                    </div>
                    <button
                      className="btn light small"
                      onClick={() =>
                        setParams({
                          section: "verification",
                          provider: r.provider?._id,
                        })
                      }
                      disabled={!r.provider}
                    >
                      Review evidence <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
              </div>
              {!data.items.length && (
                <div className="gs-id__empty">
                  <CheckCircle2 size={32} />
                  <h3>No records in this view.</h3>
                  <p>
                    New private submissions will appear here for a person to
                    review.
                  </p>
                </div>
              )}
              <div className="gs-id__actions">
                <button
                  className="btn light small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn light small"
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
