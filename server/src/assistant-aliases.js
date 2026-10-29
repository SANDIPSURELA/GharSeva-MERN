// Curated phrases, not a language model. Only enabled catalog records can be selected.
export const serviceAliases = {
  plumbing: [
    "plumber",
    "\u0aa8\u0ab3",
    "नल",
    "पाइप",
    "नाली",
    "नल टपक",
    "पानी टपक",
    "નલ",
    "પાઇપ",
    "પાણી ટપક",
    "ગટર",
    "nal",
    "nali",
    "pani tapak",
    "paani tapak",
    "nal tapke",
    "pani leak",
  ],
  electrical: [
    "electrician",
    "पंखा",
    "बिजली",
    "स्विच",
    "પંખો",
    "પંખા",
    "વીજળી",
    "સ્વિચ",
    "pankha",
    "pankho",
    "pankhaa",
    "bijli",
  ],
  appliance: [
    "washer",
    "aircon",
    "air conditioning",
    "વોશિંગ મશીન",
    "વોશિંગ",
    "ફ્રિજ",
    "એસી",
    "વોશિંગ મશીનમાંથી",
    "वॉशिंग मशीन",
    "वाशिंग मशीन",
    "फ्रिज",
    "एसी",
    "એ સી",
    "washing mashine",
  ],
  cleaning: [
    "सफाई",
    "साफ करना",
    "झाड़ू",
    "સફાઈ",
    "સફાઇ",
    "સાફ કરવું",
    "safai",
    "safaai",
    "saaf karna",
    "saf karvu",
  ],
  cooking: [
    "रसोई",
    "खाना बनाना",
    "रसोइया",
    "રસોઈ",
    "જમવાનું બનાવવું",
    "rasoi",
    "rasoiya",
    "khana banana",
    "jamvanu",
    "jamvanu banavvu",
  ],
  carpentry: [
    "सुतार",
    "बढ़ई",
    "दरवाजा",
    "लकड़ी",
    "સુથાર",
    "કબાટ",
    "દરવાજો",
    "suthar",
    "sutaar",
    "darwaja",
  ],
  painting: [
    "पेंट",
    "रंगाई",
    "દીવાલ રંગ",
    "પેઇન્ટ",
    "રંગકામ",
    "rangai",
    "rangkam",
  ],
  gardening: ["बागवानी", "बगीचा", "બાગકામ", "બગીચો", "bagwani", "bagkam"],
  masonry: [
    "राजमिस्त्री",
    "मिस्त्री",
    "टाइल",
    "કડિયાકામ",
    "ટાઇલ્સ",
    "kadiya",
    "rajmistri",
  ],
  labour: [
    "मजदूर",
    "सामान उठाना",
    "મજૂર",
    "મજુરી",
    "મજૂરી",
    "majdoor",
    "majur",
  ],
};
export const normalizeProblem = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(leeking|leakng|leaking|leaks)\b/g, "leak")
    .replace(/\b(cleening|clening|clen)\b/g, "cleaning")
    .replace(/\b(wasing|washng)\b/g, "washing")
    .replace(/\b(coolng|coolling)\b/g, "cooling")
    .replace(/\bfann\b/g, "fan")
    .replace(/\s+/g, " ")
    .trim();
export const phrasePresent = (value, phrase) => {
  const escaped = phrase.replace(
    /[.*+?^$()|[\]\\]/g,
    (character) => "\\" + character,
  );
  return new RegExp(
    "(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])",
    "u",
  ).test(value);
};
// Send only a small fixed service vocabulary to optional AI, never arbitrary text,
// account/profile data, addresses, identifiers, codes or payment fields.
export function serviceSignals(messages) {
  const value = normalizeProblem(messages.join(" "));
  const found = [];
  for (const [slug, aliases] of Object.entries(serviceAliases))
    if (
      phrasePresent(value, slug) ||
      aliases.some((alias) => phrasePresent(value, alias))
    )
      found.push(slug);
  for (const [slug, words] of Object.entries({
    plumbing: ["tap", "pipe", "leak", "drain", "toilet"],
    electrical: ["fan", "socket", "switch", "wiring"],
    appliance: ["ac", "washing machine", "fridge", "microwave", "geyser"],
    cleaning: ["clean", "cleaning"],
    cooking: ["cook", "meal"],
    carpentry: ["carpenter", "door", "furniture"],
    painting: ["painting", "paint"],
    gardening: ["garden", "gardening"],
    masonry: ["tile", "masonry"],
    labour: ["moving", "labour"],
  }))
    if (
      words.some((word) => phrasePresent(value, word)) &&
      !found.includes(slug)
    )
      found.push(slug);
  return [
    found.length
      ? "Service signals: " + found.join(", ")
      : "Unclear household task. Ask for an enabled service choice.",
  ];
}
