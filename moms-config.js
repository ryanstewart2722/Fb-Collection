// Public connection details for the MoMS database. The key is a publishable (public) key:
// it only allows what the database security rules allow, so it's safe in the page.
window.MOMS = {
  url: "https://alfsnqpxmptvuvakyzcl.supabase.co",
  key: "sb_publishable_fpAMGrL1QxRngyGLfvgy1Q_DByMA1ww",
};

// Read rows from the public API. Returns { rows, total }.
window.momsFetch = async function (path, { count = false } = {}) {
  const res = await fetch(`${MOMS.url}/rest/v1/${path}`, {
    headers: { apikey: MOMS.key, ...(count ? { Prefer: "count=exact" } : {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const total = count ? Number((res.headers.get("content-range") || "").split("/")[1]) || 0 : null;
  return { rows: await res.json(), total };
};

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
// "Oct. 5, 2025", "Oct. 2025" or "2025", depending on how much of the date is known.
window.momsDate = function (date, precision) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (precision === "day") return `${MONTHS[m - 1]} ${d}, ${y}`;
  if (precision === "month") return `${MONTHS[m - 1]} ${y}`;
  return String(y);
};
window.momsYear = (date) => (date ? date.slice(0, 4) : "");
