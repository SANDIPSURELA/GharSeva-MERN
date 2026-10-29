import fs from "node:fs/promises";
import path from "node:path";
import { yopmailInboxLink } from "../shared/demo-email-aliases.js";

async function writeNew(file, data) {
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function prepareDirectory(dir, repository) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const actual = await fs.realpath(dir),
    root = await fs.realpath(repository);
  const rel = path.relative(root, actual);
  if (
    !rel ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  )
    throw Error("Private credential directory must be outside the repository.");
  return actual;
}
export async function writePending(dir, record) {
  await writeNew(
    path.join(dir, "demo-provider-pending.json"),
    JSON.stringify(record),
  );
}
export async function readPending(dir) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(dir, "demo-provider-pending.json"), "utf8"),
    );
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw Error("Private recovery journal requires owner review.");
  }
}
export async function finishCredential(dir, record) {
  const file = path.join(dir, "demo-provider-accounts.txt"),
    marker = "Demo ID: " + record.marker + " | Database: " + record.database;
  try {
    const entry = await fs.lstat(file);
    if (entry.isSymbolicLink() || !entry.isFile())
      throw Error("Private credentials path must be a normal file.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let prior = "";
  try {
    prior = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const endMarker =
    "END RECORD: " + record.marker + " | Database: " + record.database;
  if (prior.includes(marker) && !prior.includes(endMarker))
    throw Error(
      "Credential entry is incomplete; keep the recovery journal and review the private file.",
    );
  if (!prior.includes(endMarker)) {
    const intro = prior
      ? ""
      : "PRIVATE OWNER FILE. Credentials for newly created fictional pending accounts only. Secure this folder; delete this file when no longer needed.\n";
    const entry =
      "\n" +
      marker +
      "\nNumber: " +
      record.number +
      "\nName: " +
      record.name +
      "\nCategory: " +
      record.category +
      "\nCity: Ahmedabad\nLogin email: " +
      record.email +
      (record.emailMode === "yopmail"
        ? "\nPublic YOPmail inbox: " + yopmailInboxLink(record.email)
        : "") +
      "\nInitial password: " +
      record.password +
      "\nApproval: PENDING; identity review required; not publicly listed\n" +
      endMarker +
      "\n";
    const handle = await fs.open(file, "a", 0o600);
    try {
      await handle.writeFile(intro + entry, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  await fs.unlink(path.join(dir, "demo-provider-pending.json"));
}
