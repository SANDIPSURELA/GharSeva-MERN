// Deterministic vector service diagrams, not photographs or evidence of real work.
import { mkdir, writeFile } from "node:fs/promises";
import { ahmedabadProviders } from "../seed-data/demo-accounts.js";
import services from "../seed-data/services.js";
const directory = new URL(
  "../client/public/images/demo-illustrations/",
  import.meta.url,
);
const diagrams = {
  plumbing:
    '<path d="M220 140h140v110h100v70H330V210H220"/><path d="M450 345q45-80 65 0a34 34 0 1 1-65 0Z"/>',
  electrical:
    '<rect x="210" y="130" width="170" height="160" rx="16"/><path d="m300 150-42 76h58l-30 45M440 270v-70m65 70v-70m-90 70h115v40q0 48-57 48t-57-48Z"/>',
  cleaning:
    '<path d="M240 130v180m-48 0h100l20 70H170Z"/><rect x="390" y="210" width="140" height="120" rx="20"/><path d="M410 210v-40h95v40m-80-40v-35h80m-65 130h38m-18-18v38"/>',
  cooking:
    '<path d="M210 215h300v65q0 75-150 75t-150-75Zm-20-22h340M260 140q-25 30 0 45m100-45q-25 30 0 45m100-45q-25 30 0 45"/><path d="M180 260h-35v35h40m345-35h35v35h-40"/>',
  carpentry:
    '<path d="m210 170 90-45 160 175-45 40Z"/><path d="m430 140 50 50-180 180-50-50Zm15 10 15-15m-93 80 16 16m-55 23 16 16"/><path d="M190 380h360"/>',
  masonry:
    '<path d="M180 210h380v170H180Zm0 55h380m-380 55h380m-280-110v55m140-55v55m-210 0v55m140-55v55m140-55v55m-210 0v60m140-60v60"/><path d="m275 160 50-70 50 70Zm50 0v30"/>',
  painting:
    '<rect x="205" y="125" width="270" height="75" rx="16"/><path d="M475 158h65v90H345v55m-25 0h50v85h-50Z"/><path d="M180 360h80m-55-35v60"/>',
  labour:
    '<path d="m190 205 125-65 125 65-125 65Zm0 0v130l125 65V270m125-65v130l-125 65m190-235v180h65m-65-180h-35"/><circle cx="485" cy="375" r="22"/><circle cx="550" cy="375" r="22"/>',
  appliance:
    '<rect x="190" y="110" width="280" height="280" rx="20"/><circle cx="330" cy="265" r="83"/><circle cx="330" cy="265" r="56"/><path d="M210 165h240m-205-30h45m220 75 70 70m-70 0 70-70"/>',
  gardening:
    '<path d="M270 290h200l-25 110H295Zm100 0V145m0 70q-105 0-105-80 95 0 105 80Zm0 40q105 0 105-80-95 0-105 80Z"/><path d="m190 270-55-90m35 0-35 0-10 35"/>',
};
await mkdir(directory, { recursive: true });
for (const p of ahmedabadProviders) {
  const variant = p.id.endsWith("-2");
  const title = services.find((s) => s.id === p.serviceId).name;
  const accent = variant ? "#ad704f" : "#537c8c",
    background = variant ? "#f4e8da" : "#e6f0ee";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><title>' +
    title +
    " — fictional demo illustration for " +
    p.name +
    "</title>" +
    '<rect width="800" height="500" fill="' +
    background +
    '"/><rect x="32" y="32" width="736" height="436" rx="28" fill="#fffdf8"/><text x="64" y="83" font-family="sans-serif" font-size="15" letter-spacing="3" fill="#617078">DEMO SERVICE ILLUSTRATION</text>' +
    '<g fill="none" stroke="' +
    accent +
    '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" transform="' +
    (variant
      ? "translate(720 0) scale(-0.8 0.8)"
      : "translate(75 10) scale(0.8)") +
    '">' +
    diagrams[p.serviceId] +
    "</g>" +
    '<text x="64" y="408" font-family="sans-serif" font-size="30" font-weight="bold" fill="#283e45">' +
    title +
    '</text><text x="64" y="441" font-family="sans-serif" font-size="19" fill="#617078">' +
    p.name +
    " · " +
    (variant ? "Navrangpura" : "Satellite") +
    ", Ahmedabad</text></svg>\n";
  await writeFile(new URL(p.id + ".svg", directory), svg);
}
console.log("20 deterministic local demo service diagrams generated.");
