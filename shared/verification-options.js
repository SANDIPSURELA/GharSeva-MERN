// Only public capability flags are consumed here; roles and identity stay server-owned.
export function verificationAvailability(
  options,
  { purpose = "register", showSocial = true, fixedChannel } = {},
) {
  const channels = ["email", "mobile"].filter(
    (key) => options?.[key] === true && (!fixedChannel || fixedChannel === key),
  );
  const social =
    showSocial && !["verify", "recover"].includes(purpose) && !fixedChannel
      ? ["google"].filter((key) => options?.[key] === true)
      : [];
  return { channels, social, available: channels.length + social.length > 0 };
}
