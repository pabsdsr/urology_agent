// Practitioner pods and desired display order within each pod. Shared by the
// calendar (PractitionerSchedule) and the billing form's provider picker so the
// two stay in sync — the providers offered on a bill match who appears on the
// calendar.
export const PODS = [
  {
    name: "North Pod",
    callKey: "North Pod",
    practitioners: [
      "Don Bui",
      "Leah Nakamura",
      "Paul Oh",
      "Tammy Ho",
      "Ashley Swanson",
      "Michael Bui",
    ],
  },
  {
    name: "Central Pod",
    callKey: "Central Pod",
    practitioners: [
      "Moses Kim",
      "Daniel Su",
      "Aaron Spitz",
      "Neyssan Tebyani",
      "Daniel Cabanero",
      "Taralyn Johnson",
    ],
  },
  {
    name: "South Pod",
    callKey: "South Pod",
    practitioners: [
      "Josh Randall",
      "Poone Shoureshi",
      "Karan Singh",
      "James Meaglia",
      "Olivia Carr",
      "Jennifer Kim",
      "Lauren Lum",
    ],
  },
];

// Flat, de-duplicated list of every practitioner name across all pods, in pod order.
export const POD_PRACTITIONER_NAMES = [
  ...new Set(PODS.flatMap((pod) => pod.practitioners)),
];

// Providers who are not billable as an attending (e.g. mid-levels). They stay
// available in the provider picker but are excluded from the attending picker.
const NON_ATTENDING_NAMES = new Set([
  "Ashley Swanson",
  "Daniel Cabanero",
  "Jennifer Kim",
  "Olivia Carr",
  "Michael Bui",
  "Taralyn Johnson",
]);

// Practitioners offered in the attending picker, in pod order.
export const ATTENDING_PRACTITIONER_NAMES = POD_PRACTITIONER_NAMES.filter(
  (name) => !NON_ATTENDING_NAMES.has(name)
);
