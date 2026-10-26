import providers from "./providers.js";
const legacyProviders = providers.slice(0, 12).map((provider, index) => ({
  ...provider,
  email:
    index === 0 ? "provider@gharseva.com" : `provider${index + 1}@example.com`,
  mobile:
    index === 0 ? "9876500002" : `987651${String(index).padStart(4, "0")}`,
}));

// Stable fictional identities: append entries; never renumber existing logins.
const ahmedabadNames = [
  ["Kiran Patel", "Nilesh Shah"],
  ["Harsh Mehta", "Jayesh Parmar"],
  ["Kavita Trivedi", "Bhavna Joshi"],
  ["Hetal Vyas", "Mansi Dave"],
  ["Chirag Suthar", "Paresh Panchal"],
  ["Mukesh Prajapati", "Dinesh Rathod"],
  ["Jignesh Solanki", "Rakesh Chauhan"],
  ["Amit Makwana", "Bharat Thakor"],
  ["Dhaval Desai", "Pratik Modi"],
  ["Hiren Mali", "Sanjay Vaghela"],
];
const categories = [
  "plumbing",
  "electrical",
  "cleaning",
  "cooking",
  "carpentry",
  "masonry",
  "painting",
  "labour",
  "appliance",
  "gardening",
];
const prices = [349, 299, 499, 449, 399, 699, 799, 449, 449, 299];
export const ahmedabadProviders = categories.flatMap((serviceId, index) =>
  ahmedabadNames[index].map((name, variant) => ({
    id: "ahm-" + serviceId + "-" + (variant + 1),
    name,
    serviceId,
    city: "Ahmedabad",
    location: variant ? "Navrangpura, Ahmedabad" : "Satellite, Ahmedabad",
    price: prices[index] + variant * 50,
    experience: 5 + variant * 2,
    bio: "Fictional Ahmedabad professional for classroom service requests and booking demonstrations.",
    skills: ["Home service", "Scheduled visits"],
    email: "ahm." + serviceId + (variant + 1) + "@example.com",
    mobile: "987652" + String(index * 2 + variant + 1).padStart(4, "0"),
  })),
);
export const demoProviders = [...legacyProviders, ...ahmedabadProviders];
export const demoPeople = [
  {
    id: "demo-customer",
    name: "Demo Customer",
    role: "customer",
    city: "Ahmedabad",
    email: "customer@gharseva.com",
    mobile: "9876500001",
  },
  {
    id: "demo-admin",
    name: "Project Administrator",
    role: "admin",
    city: "Ahmedabad",
    email: "admin@gharseva.com",
    mobile: "9876500003",
  },
];
