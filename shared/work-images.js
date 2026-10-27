import { demoProviders } from "../seed-data/demo-accounts.js";
import { demoImageFor } from "../seed-data/demo-work-images.js";

export const workPhotoPlaceholder = "/images/work-photo-placeholder.svg";
export const isWorkUpload = (src) =>
  typeof src === "string" && /^\/api\/files\/[a-f0-9]{24}$/i.test(src);
const legacyCategory = { appliance: "electrical", labour: "masonry" };
export const legacyDemoImage = (service) =>
  "/images/" + (legacyCategory[service] || service) + ".jpg";

export function demoProviderFor(provider, { publicView = false } = {}) {
  const profile = provider.profile || provider;
  // New seeds carry an explicit identifier, never editable through profile forms.
  const marked = demoProviders.find(
    (p) => p.id === profile.demoProviderId && p.serviceId === profile.category,
  );
  if (marked) return marked;
  // Compatibility with an already-running older API: its public records omit
  // contact details and the new marker. Match the complete original fictional
  // profile fingerprint, including the explicit demo disclaimer, never name or
  // category alone. This is a read-only sample alias, not an account lookup.
  if (
    publicView &&
    !provider.profile &&
    provider.role === undefined &&
    provider.email === undefined &&
    provider.mobile === undefined
  ) {
    return (
      demoProviders.find(
        (p) =>
          provider.name === p.name &&
          provider.category === p.serviceId &&
          provider.area === p.location &&
          provider.city === p.city &&
          provider.bio ===
            p.bio +
              " Sample professional profile for the college demonstration.",
      ) || null
    );
  }
  // Old seeds: strict original account identity, role and category. Name alone
  // cannot classify a real professional as a demo account.
  return (
    demoProviders.find(
      (p) =>
        provider.role === "provider" &&
        provider.email === p.email &&
        provider.mobile === p.mobile &&
        provider.name === p.name &&
        profile.category === p.serviceId,
    ) || null
  );
}

export function resolveWorkImages(provider, { allowedUploads } = {}) {
  if (Array.isArray(provider.workImages) && allowedUploads === undefined)
    return provider.workImages;
  const profile = provider.profile || provider;
  const raw = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  const unique = [...new Set(raw.filter((src) => typeof src === "string"))];
  const uploads = unique
    .filter(
      (src) =>
        isWorkUpload(src) && (!allowedUploads || allowedUploads.has(src)),
    )
    .map((src) => ({
      src,
      kind: "upload",
      label: "Professional upload",
      alt: "Work photograph uploaded by " + provider.name,
    }));
  const demo = demoProviderFor(provider, {
    publicView: allowedUploads === undefined,
  });
  if (!demo) return uploads;
  const sample = demoImageFor(demo.id);
  if (!sample) return uploads;
  const hasSample =
    unique.length === 0 ||
    unique.includes(legacyDemoImage(demo.serviceId)) ||
    unique.includes(sample.src);
  if (hasSample)
    uploads.push({
      src: sample.src,
      kind: sample.kind || "sample",
      label:
        sample.kind === "illustration"
          ? "Demo service illustration"
          : "Sample photograph",
      alt:
        sample.description +
        (sample.kind === "illustration"
          ? " - fictional illustration, not verified work by "
          : " - illustrative stock photograph, not verified work by ") +
        provider.name,
    });
  return uploads;
}

// This changes presentation only. No user record, hash, approval or upload is saved.
export function publicWorkImageView(user, portfolioFiles) {
  const allowedUploads = new Set(
    portfolioFiles
      .filter(
        (f) => f.kind === "portfolio" && String(f.owner) === String(user._id),
      )
      .map((f) => "/api/files/" + f._id),
  );
  const workImages = resolveWorkImages(user, { allowedUploads });
  return {
    demoProviderId: demoProviderFor(user)?.id,
    workImages,
    portfolio: workImages.map((photo) => photo.src),
  };
}
