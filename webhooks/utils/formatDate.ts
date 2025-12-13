export function formatDate(dateString: string): string {
  // Input: "2025-12-09"
  // Output: "09-DEC-2025"

  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  // 1. Split the string directly to avoid timezone conversion issues
  const [year, month, day] = dateString.split("-");

  // 2. Safety check: ensure we have all parts
  if (!year || !month || !day) {
    console.warn("Invalid date format provided:", dateString);
    return dateString;
  }

  // 3. Convert month number to index (e.g., "12" -> 11)
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = months[monthIndex];

  return `${day}-${monthName}-${year}`;
}
