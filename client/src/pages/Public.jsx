import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Clock,
  Scale,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Check,
  Mail,
  Plus,
  Minus,
} from "lucide-react";
import { useApp } from "../context";
import { api, money } from "../api";
import {
  PageHead,
  ProviderCard,
  Empty,
  ErrorBox,
  Avatar,
  Field,
} from "../components/UI";
const issues = [
  {
    name: "A leaking tap or blocked drain",
    category: "plumbing",
    text: "A plumbing professional handles water fittings, leaks and drainage.",
  },
  {
    name: "A light, fan or socket needs repair",
    category: "electrical",
    text: "An electrical professional handles household fittings and electrical repairs.",
  },
  {
    name: "My home needs a deep clean",
    category: "cleaning",
    text: "A cleaning professional can help with kitchens, bathrooms and full-home care.",
  },
  {
    name: "A door or piece of furniture needs fixing",
    category: "carpentry",
    text: "A carpenter handles furniture repairs, fittings and assembly.",
  },
  {
    name: "My appliance is not working properly",
    category: "appliance",
    text: "An appliance technician can inspect and service your household appliance.",
  },
  {
    name: "I need help with meals",
    category: "cooking",
    text: "A home cook helps with everyday meals and food preparation.",
  },
  {
    name: "My garden needs attention",
    category: "gardening",
    text: "A gardener handles plants, trimming and routine garden upkeep.",
  },
  {
    name: "A room needs painting",
    category: "painting",
    text: "A painter helps with surface preparation, fresh paint and touch-ups.",
  },
];
export function Finder() {
  const { providers, categories } = useApp();
  const [step, setStep] = useState(0),
    [issue, setIssue] = useState(null),
    [city, setCity] = useState(""),
    [urgency, setUrgency] = useState("STANDARD");
  const enabled = issues.filter((i) =>
    categories.some((c) => c.slug === i.category),
  );
  const matches = issue
    ? providers
        .filter(
          (p) =>
            (p.categories || [p.category]).includes(issue.category) &&
            (!city || p.city === city) &&
            p.available,
        )
        .sort((a, b) => b.rating - a.rating || a.price - b.price)
        .slice(0, 3)
    : [];
  return (
    <>
      <PageHead
        eyebrow="GHARSEVA SERVICE FINDER"
        title="Tell us the job. We'll find the fit."
        text="A few simple choices help you find the right service and local professionals."
      />
      <section className="section">
        <div className="container finder-container">
          <div className="finder-progress">
            {["The job", "Your preferences", "Your matches"].map((s, i) => (
              <span key={s} className={i <= step ? "active" : ""}>
                <b>{i < step ? <Check size={14} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          {step === 0 ? (
            <div className="card finder-panel">
              <span className="eyebrow">STEP 01</span>
              <h2>What needs a helping hand?</h2>
              <div className="issue-grid">
                {enabled.map((i) => (
                  <button
                    key={i.category}
                    className={issue === i ? "issue selected" : "issue"}
                    onClick={() => setIssue(i)}
                  >
                    <span>{i.name}</span>
                    {issue === i ? (
                      <CheckCircle2 size={20} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </button>
                ))}
              </div>
              <div className="finder-bottom">
                <span>Recommendations use your selected issue and city.</span>
                <button
                  className="btn"
                  disabled={!issue}
                  onClick={() => setStep(1)}
                >
                  Next <ArrowRight size={17} />
                </button>
              </div>
            </div>
          ) : step === 1 ? (
            <div className="card finder-panel">
              <span className="eyebrow">STEP 02</span>
              <h2>Make it work for you.</h2>
              <div className="form-grid">
                <Field label="Your city">
                  <select
                    aria-label="Your city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    <option value="">All listed cities</option>
                    {[...new Set(providers.map((p) => p.city))]
                      .sort()
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                </Field>
                <Field label="Request priority">
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                  >
                    <option value="STANDARD">
                      Standard — planned household help
                    </option>
                    <option value="PRIORITY">
                      Priority — I'd appreciate an earlier response
                    </option>
                  </select>
                </Field>
              </div>
              <p className="muted">
                Priority requests are highlighted to the provider. Availability
                and acceptance still apply.
              </p>
              <div className="finder-bottom">
                <button className="btn light" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="btn" onClick={() => setStep(2)}>
                  Find my matches <Sparkles size={17} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="recommendation card">
                <div className="recommendation-icon">
                  <Sparkles />
                </div>
                <div>
                  <span className="eyebrow">YOUR RECOMMENDED SERVICE</span>
                  <h2>
                    {categories.find((c) => c.slug === issue.category)?.name}
                  </h2>
                  <p>{issue.text}</p>
                  <small>
                    {city || "All listed cities"} ·{" "}
                    {urgency === "PRIORITY"
                      ? "Priority request"
                      : "Standard request"}
                  </small>
                </div>
                <button className="btn light small" onClick={() => setStep(0)}>
                  Start again
                </button>
              </div>
              <div className="provider-grid finder-matches">
                {matches.map((p) => (
                  <div key={p._id}>
                    <ProviderCard provider={p} />
                    <Link
                      className="btn finder-book"
                      to={`/booking/${p._id}?urgency=${urgency}&notes=${encodeURIComponent(issue.name)}`}
                    >
                      Request this professional <ArrowRight size={15} />
                    </Link>
                  </div>
                ))}
              </div>
              {!matches.length && (
                <Empty
                  title="No match in this city yet"
                  text="Try another city or browse all professionals."
                  action={
                    <Link
                      className="btn"
                      to={`/services?category=${issue.category}`}
                    >
                      Explore this service
                    </Link>
                  }
                />
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
export function Compare() {
  const { providers, comparison, toggleCompare } = useApp();
  const rows = providers.filter((p) => comparison.includes(p._id));
  const fields = [
    ["Service", (p) => p.categoryName],
    ["City / area", (p) => p.area],
    ["Starting visit price", (p) => money(p.price)],
    ["Experience", (p) => `${p.experience} years`],
    [
      "Customer rating",
      (p) =>
        p.reviews
          ? `${p.rating.toFixed(1)} / 5 (${p.reviews} reviews)`
          : "New — no reviews yet",
    ],
    ["Completed jobs", (p) => p.completed],
    [
      "Availability",
      (p) => (p.available ? "Accepting bookings" : "Currently unavailable"),
    ],
    ["Skills", (p) => p.skills.join(", ")],
  ];
  return (
    <>
      <PageHead
        eyebrow="A CONFIDENT CHOICE"
        title="Good options. Side by side."
        text="Compare up to three professionals on the details that matter to you."
      />
      <section className="section">
        <div className="container">
          {rows.length ? (
            <div className="comparison-scroll">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>What matters to you</th>
                    {rows.map((p) => (
                      <th key={p._id}>
                        <Avatar person={p} />
                        <h3>{p.name}</h3>
                        <button
                          className="text-link"
                          onClick={() => toggleCompare(p._id)}
                        >
                          Remove
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([name, value]) => (
                    <tr key={name}>
                      <th>{name}</th>
                      {rows.map((p) => (
                        <td key={p._id}>{value(p)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th>Your next step</th>
                    {rows.map((p) => (
                      <td key={p._id}>
                        <Link className="btn small" to={`/providers/${p._id}`}>
                          View profile <ArrowRight size={14} />
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Let's give you some options"
              text="Use Compare on provider cards to add up to three professionals."
              action={
                <Link className="btn" to="/services">
                  Find professionals <ArrowRight size={16} />
                </Link>
              }
            />
          )}
        </div>
      </section>
    </>
  );
}
const faqs = [
  [
    "How does a booking work?",
    "Choose a professional and an available slot. Your request starts as Pending, and the provider can accept or reject it. Track each step in your dashboard.",
  ],
  [
    "What is the visit OTP?",
    "A six-digit code appears in your customer booking. Share it with your assigned professional when they arrive and you are ready for work to start.",
  ],
  [
    "How do payments work?",
    "New bookings require an online deposit after provider acceptance and before arrival verification and work. Approve extras and the final itemised bill, then pay the approved total less the valid deposit credit online. Razorpay TEST receipts do not represent live money collection or provider payout. Unavailable checkout blocks required payments; historical bookings retain their saved rules.",
  ],
  [
    "Can I change or cancel my booking?",
    "Pending and accepted bookings can be cancelled or rescheduled from your customer dashboard. Once the professional is on the way, those options close.",
  ],
  [
    "How are profiles reviewed?",
    "New professionals provide their service details. An administrator approves the service profile before it appears in search. Documents are optional; approval does not establish identity verification. Faculty Demo profiles remain fictional and cannot receive normal bookings.",
  ],
];
export function About() {
  return (
    <>
      <PageHead
        eyebrow="HELLO, WE'RE GHARSEVA"
        title="Better everyday living starts at home."
        text="A home services platform built around clear choices, local skills and a thoughtful booking experience."
      />
      <section className="section">
        <div className="container about-grid">
          <img src="/images/home.jpg" alt="A welcoming home" />
          <div>
            <span className="eyebrow">OUR PURPOSE</span>
            <h2>A bridge between busy homes and skilled hands.</h2>
            <p>
              Finding household help should feel straightforward. GharSeva
              brings service discovery, professional profiles, comparison and
              booking into one place.
            </p>
            <p>
              For local professionals, it offers a workspace to manage incoming
              requests, appointment schedules, service details and feedback.
            </p>
            <Link className="btn" to="/services">
              Explore GharSeva <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SMALL DETAILS, BETTER EXPERIENCE</span>
              <h2>Designed to make choosing easier.</h2>
            </div>
          </div>
          <div className="feature-grid">
            {[
              [
                Sparkles,
                "Guided service finder",
                "Match your household issue to a service category and local professionals.",
              ],
              [
                Scale,
                "Thoughtful comparison",
                "Compare starting prices, experience, availability and customer reviews.",
              ],
              [
                ShieldCheck,
                "Visit OTP",
                "Your assigned provider needs your code before marking work as started.",
              ],
            ].map(([Icon, title, body]) => (
              <article className="card feature-card" key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container narrow">
          <span className="eyebrow">PROJECT CONTEXT</span>
          <h2>Made for learning. Built to work.</h2>
          <p>
            GharSeva is a college MERN project with customer, provider and
            administrator roles. Profiles and sample records are fictional. Its
            purpose is to demonstrate a working service marketplace and a
            connected booking lifecycle.
          </p>
        </div>
      </section>
    </>
  );
}
export function Contact() {
  const [form, setForm] = useState({
      name: "",
      email: "",
      mobile: "",
      subject: "Booking support",
      message: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(""),
    [open, setOpen] = useState(0);
  return (
    <>
      <PageHead
        eyebrow="LET'S TALK"
        title="A little support goes a long way."
        text="Have a question about your booking or profile? Leave a message for the project administrator."
      />
      <section className="section">
        <div className="container contact-grid">
          <div>
            <span className="eyebrow">YOUR QUESTIONS, WELCOME</span>
            <h2>
              We're here to
              <br />
              make things simpler.
            </h2>
            <p>
              Messages are saved in the platform and appear in the
              administrator's enquiry inbox.
            </p>
            <div className="contact-note">
              <Mail />
              <div>
                <strong>Support through the platform</strong>
                <span>Send a message using this form.</span>
              </div>
            </div>
            <div className="contact-note">
              <Clock />
              <div>
                <strong>A clear record</strong>
                <span>
                  You'll receive an enquiry reference after submission.
                </span>
              </div>
            </div>
            <img
              className="contact-image"
              src="/images/home.jpg"
              alt="Bright home interior"
              loading="lazy"
            />
          </div>
          <div className="card contact-form">
            {receipt ? (
              <div className="receipt">
                <CheckCircle2 size={45} />
                <h2>Your message is saved.</h2>
                <p>
                  Reference: <strong>{receipt.slice(-8).toUpperCase()}</strong>
                </p>
                <p>
                  The project administrator can review it in the enquiry inbox.
                  No email was sent.
                </p>
                <button className="btn" onClick={() => setReceipt("")}>
                  Send another message
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const r = await api("/enquiries", {
                      method: "POST",
                      body: form,
                    });
                    setReceipt(r._id);
                    setForm({
                      name: "",
                      email: "",
                      mobile: "",
                      subject: "Booking support",
                      message: "",
                    });
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h2>What's on your mind?</h2>
                <div className="form-grid">
                  <Field label="Your name">
                    <input
                      required
                      minLength={3}
                      maxLength={80}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Full name"
                    />
                  </Field>
                  <Field label="Email address">
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field label="Mobile number">
                    <input
                      required
                      inputMode="tel"
                      pattern="[6-9][0-9]{9}"
                      maxLength={10}
                      value={form.mobile}
                      onChange={(e) =>
                        setForm({ ...form, mobile: e.target.value })
                      }
                      placeholder="10-digit Indian mobile"
                    />
                  </Field>
                  <Field label="Subject">
                    <select
                      value={form.subject}
                      onChange={(e) =>
                        setForm({ ...form, subject: e.target.value })
                      }
                    >
                      {[
                        "Booking support",
                        "Provider registration",
                        "Account help",
                        "General enquiry",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Your message" wide>
                    <textarea
                      required
                      minLength={20}
                      maxLength={2000}
                      rows={5}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      placeholder="Tell us a little more (at least 20 characters)…"
                    />
                  </Field>
                </div>
                <ErrorBox message={error} />
                <button className="btn full" disabled={busy}>
                  {busy ? "Saving your message…" : "Send message"}
                  <ArrowRight size={16} />
                </button>
                <small className="form-note">
                  Your message is stored for support. See our{" "}
                  <Link to="/privacy">privacy notice</Link>.
                </small>
              </form>
            )}
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container faq-grid">
          <div>
            <span className="eyebrow">A FEW QUICK ANSWERS</span>
            <h2>
              Good questions.
              <br />
              Clear answers.
            </h2>
          </div>
          <div>
            {faqs.map(([q, a], i) => (
              <article className="faq" key={q}>
                <button
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? -1 : i)}
                >
                  {q}
                  {open === i ? <Minus size={17} /> : <Plus size={17} />}
                </button>
                {open === i && <p>{a}</p>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
export function Policy({ privacy = false }) {
  return (
    <>
      <PageHead
        eyebrow="GHARSEVA COLLEGE PROJECT"
        title={
          privacy
            ? "Your information, explained."
            : "Clear expectations. Better experiences."
        }
        text={
          privacy
            ? "How this demonstration project handles account, booking and support information."
            : "Terms for using this educational home services platform."
        }
      />
      <section className="section">
        <div className="container narrow policy">
          {privacy ? (
            <>
              <h2>Information stored</h2>
              <p>
                The platform stores account details, hashed passwords, booking
                addresses, service requests, reviews, favourites and support
                messages in MongoDB. Session authentication uses an HttpOnly
                cookie.
              </p>
              <h2>Provider uploads</h2>
              <p>
                Profile and portfolio images are publicly visible. Provider
                documents are available only to their owner and the
                administrator. Use sample documents for classroom
                demonstrations.
              </p>
              <h2>Private identity document review</h2>
              <p>
                A provider can consent to submitting identity evidence for human
                review. Masked Aadhaar front/back images or alternative evidence
                can be used. Use fictional sample images for classroom work. The
                server runs local English OCR and compares name components;
                document images are not sent to the service chatbot or an
                external AI service. Name consistency does not authenticate an
                identity document or prove that it belongs to the applicant.
              </p>
              <p>
                These private images are encrypted before being stored in
                MongoDB and are accessible to their owner and administrators.
                They expire after 30 days; background cleanup may run later, but
                expired images cannot be opened. The provider can remove
                retained images or replace them from Identity verification.
                Minimal name comparison results, consent and review history
                remain for the application audit. Original filenames and raw OCR
                text are not retained. Prepare masked copies before upload: OCR
                cannot reliably detect every private number or detail. Actual
                UIDAI authentication is not connected.
              </p>
              <h2>Saved applications and follow-up</h2>
              <p>
                Provider application drafts are stored only after you choose to
                save progress. Administrators can see those opted-in details and
                application progress. Drafts expire after 30 days of saved
                inactivity; you can remove a saved draft by turning off saving
                before submission. Passwords and selected files are excluded
                from drafts. Staff follow-up is a separate optional choice; only
                the verified primary contact is shown for that purpose.
                Submitted applications, supporting documents and decision
                history remain with the provider account for review.
              </p>
              <h2>Contact verification and external sign-in</h2>
              <p>
                When configured, email codes are delivered through the project’s
                email service, SMS codes through Twilio Verify, and Google
                identity proof through Firebase Authentication. Classroom demo
                mode sends no messages and labels test proof as a demonstration.
                Codes expire in five minutes; registration sessions last 30
                minutes. Contact proof is cleared if that contact changes.
                Identity linking requires confirmation of the existing GharSeva
                password.
              </p>
              <h2>Account invitations</h2>
              <p>
                Administrators can prepare a customer or provider invitation
                using a name, contact and city. Invitation records include
                status, expiry and action history, with background removal after
                up to 90 days. A private link is shown once; its hash is stored.
                No invitation message is sent automatically. Recipients must
                verify the exact contact, choose their own password and complete
                registration. Accepted account records are retained separately.
              </p>
              <h2>Test payments</h2>
              <p>
                Deposit records include booking references, amounts, test mode,
                gateway references, status, refunds and payment activity. They
                are visible to the customer, assigned professional and
                administrator. GharSeva does not store card numbers, CVVs, UPI
                credentials or bank credentials. Configured Razorpay test
                checkout handles financial entry separately; local classroom
                simulation requires no financial details. Raw gateway webhook
                payloads and checkout signatures are not retained. Test payment
                history remains separate from service estimates and bookings.
              </p>
              <h2>Service assistant</h2>
              <p>
                The conversation stays in the current page’s memory and is
                cleared when you leave or reload it. Guided matching processes
                descriptions on the GharSeva server. When live AI is configured,
                you can explicitly choose to send your current problem
                description and available service names to OpenAI. Account
                records and private booking addresses are excluded from that AI
                request. Basic contact and identity-number redaction is applied,
                but cannot detect every private detail: keep personal
                information out of the conversation. The AI provider’s own
                data-handling terms apply; this is not a promise of zero
                retention.
              </p>
              <p>
                A booking draft stores your chosen service, professional, time,
                address and notes for 20 minutes and is accessible only through
                your customer account. It does not reserve a time or create a
                booking. Confirmation creates a regular booking record that
                remains in your history. A public service/provider/city/date
                selection may be kept in this browser tab for 20 minutes through
                login; conversation text and addresses are excluded. Notes you
                approve for the booking are shared with the assigned
                professional. You can discard an unconfirmed draft using Edit
                details or changing your selection; expired draft cleanup runs
                in the background.
              </p>
              <h2>Who can see your records</h2>
              <p>
                Customers see their own bookings. Assigned providers see the
                details needed to perform the service. Administrators can review
                platform activity and support enquiries. Visit codes are
                returned only to the booking's customer.
              </p>
              <h2>Project data</h2>
              <p>
                This is an educational project. Use fictional sample
                information. Contact the project administrator through the
                support form for account or record changes.
              </p>
            </>
          ) : (
            <>
              <h2>Educational demonstration</h2>
              <p>
                GharSeva demonstrates service discovery and booking. Seeded
                professional profiles, work photographs and sample reviews are
                demonstration content.
              </p>
              <h2>Booking and pricing</h2>
              <p>
                A booking request requires provider acceptance. Listed prices
                are starting estimates. Additional work or parts must be agreed
                through customer approval. New bookings require an online
                deposit after acceptance and before arrival verification and
                work, then the approved remaining balance online after
                completion. Historical bookings retain their saved rules.
                Razorpay TEST receipts do not represent live collection or a
                final service invoice. Deposits are credited toward agreed
                charges; cancellation requires a separate refund review.
              </p>
              <h2>Visit code and reviews</h2>
              <p>
                Share your visit code with the assigned professional when you
                are ready to start the service. Reviews are available after
                completed bookings and should describe your experience fairly.
              </p>
              <h2>Account responsibility</h2>
              <p>
                Keep login details private. Provider approval is managed by the
                project administrator. Misleading profiles or inappropriate
                content can be suspended or hidden.
              </p>
            </>
          )}
          <Link className="btn light" to="/contact">
            Contact the administrator
          </Link>
        </div>
      </section>
    </>
  );
}
export function NotFound() {
  return (
    <div className="container section not-found">
      <span className="eyebrow">404 · A SMALL DETOUR</span>
      <h1>
        This page has
        <br />
        left the house.
      </h1>
      <p>Let's get you back to somewhere helpful.</p>
      <Link className="btn" to="/">
        Back to home <ArrowRight size={17} />
      </Link>
    </div>
  );
}
