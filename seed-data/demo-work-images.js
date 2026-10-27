import { ahmedabadProviders } from "./demo-accounts.js";
// Stable assignments for fictional demo accounts. Never pick by array order.
export const demoWorkImages = {
  "rajesh-kumar": {
    src: "/images/plumbing.jpg",
    description: "Pipework and plumbing fittings",
    source: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39",
  },
  "anita-sharma": {
    src: "/images/cleaning.jpg",
    description: "Window cleaning",
    source: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
  },
  "imran-sheikh": {
    src: "/images/electrical.jpg",
    description: "Electrical wall installation",
    source: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e",
  },
  "deepak-yadav": {
    src: "/images/carpentry.jpg",
    description: "Carpentry tools and a timber work surface",
    source: "https://images.unsplash.com/photo-1504148455328-c376907d081c",
  },
  "meena-patel": {
    src: "/images/cooking.jpg",
    description: "A kitchen prepared for cooking",
    source: "https://images.unsplash.com/photo-1556911220-bff31c812dba",
  },
  "suresh-naik": {
    src: "/images/demo-work/suresh-naik.jpg",
    description: "An open dishwasher and its components",
    source:
      "https://unsplash.com/photos/a-machine-with-wires-and-tubes-ZFtJx5nRZ2k",
    credit: "Kaede Nakamura / Unsplash",
  },
  "ravi-verma": {
    src: "/images/painting.jpg",
    description: "A paint roller and painting supplies",
    source: "https://images.unsplash.com/photo-1562259949-e8e7689d7828",
  },
  "farah-khan": {
    src: "/images/demo-work/farah-khan.jpg",
    description: "Kitchen sink and counter cleaning",
    source:
      "https://unsplash.com/photos/a-woman-is-cleaning-a-kitchen-sink-with-a-rag-SqOMDOQb3ws",
    credit: "everdrop GmbH / Unsplash",
  },
  "ganesh-more": {
    src: "/images/masonry.jpg",
    description: "Construction and masonry site work",
    source: "https://images.unsplash.com/photo-1504307651254-35680f356dfd",
  },
  "lata-joshi": {
    src: "/images/demo-work/lata-joshi.jpg",
    description: "Vegetables cooking on a stove",
    source:
      "https://unsplash.com/photos/a-pot-filled-with-vegetables-sitting-on-top-of-a-stove-9-nzzhnSBrs",
    credit: "fuseviews / Unsplash",
  },
  "vikram-singh": {
    src: "/images/professional.jpg",
    description: "Electrical equipment repair at a workbench",
    source: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789",
  },
  "pooja-desai": {
    src: "/images/gardening.jpg",
    description: "Potting soil and gardening tools",
    source: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b",
  },
};

// Deterministic service diagrams, clearly labelled as fictional illustrations.
export const demoIllustrations = Object.fromEntries(
  ahmedabadProviders.map((p) => [
    p.id,
    {
      src: "/images/demo-illustrations/" + p.id + ".svg",
      description:
        p.serviceId + " service diagram for a fictional Ahmedabad profile",
      kind: "illustration",
    },
  ]),
);
export const demoImageFor = (id) => demoWorkImages[id] || demoIllustrations[id];
