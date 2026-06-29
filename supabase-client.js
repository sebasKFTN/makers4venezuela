/* ============================================================
 * Makers Colombia por Venezuela — Supabase client layer
 * Drop-in module. Replaces the Google Sheets doPost call and
 * the localStorage-only dashboard. Keeps the low-friction flow:
 * a maker can log production WITHOUT an account (anonymous),
 * identified by a uuid we mint once and keep on the device.
 * Magic-link verification is OPTIONAL (Phase 2 makes it matter).
 *
 * Load before your app code:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="supabase-client.js"></script>
 * ============================================================ */

const SUPABASE_URL = "https://gwydqpbyopmxqjhrfwxi.supabase.co";   // <- fill in
const SUPABASE_ANON_KEY = "sb_publishable_y1Dnx36uomXrlGhpkmmytQ_cZSvfrPx";          // <- fill in (safe to ship)

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- device-local maker identity (low friction) ---------- */
const LS_MAKER = "m4v_maker_id";
const LS_PROFILE = "m4v_profile";

function getDeviceMakerId() {
  let id = localStorage.getItem(LS_MAKER);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(LS_MAKER, id); }
  return id;
}

/* Create/refresh this maker's profile row. Call on login screen submit.
 * profile = {name, org, country, city, phone, email} */
async function saveProfile(profile) {
  const id = getDeviceMakerId();
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  const { error } = await db.from("makers").upsert({
    id, name: profile.name, org: profile.org, country: profile.country,
    city: profile.city || null, phone: profile.phone || null,
    email: profile.email || null
  }, { onConflict: "id" });
  if (error) console.warn("saveProfile:", error.message);
  return id;
}

function getProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE) || "{}"); }
  catch { return {}; }
}

/* ---------- OPTIONAL magic-link verification (Phase 2) ---------- */
async function sendMagicLink(email) {
  return db.auth.signInWithOtp({
    email,
    options: { data: { name: getProfile().name } }
  });
}

/* ---------- catalog ---------- */
async function listModels() {
  const { data, error } = await db.from("models")
    .select("id,name,variant,image_url,medically_validated,is_custom")
    .eq("active", true).order("sort");
  if (error) { console.warn("listModels:", error.message); return []; }
  return data;
}

/* ---------- photo upload (delivery evidence) ---------- */
async function uploadPhoto(file) {
  if (!file) return null;
  const path = `${getDeviceMakerId()}/${Date.now()}_${file.name}`;
  const { error } = await db.storage.from("fotos").upload(path, file, { upsert: false });
  if (error) { console.warn("uploadPhoto:", error.message); return null; }
  return db.storage.from("fotos").getPublicUrl(path).data.publicUrl;
}

/* ---------- register a production batch ----------
 * entry = {modelId, modelLabel, fabricadas, entregadas, fecha,
 *          notas, status, photoFile, destinationId} */
async function registerProduction(entry) {
  const maker_id = getDeviceMakerId();
  let photo_url = null;
  if (entry.photoFile) photo_url = await uploadPhoto(entry.photoFile);

  const { data, error } = await db.from("production_events").insert({
    maker_id,
    model_id: entry.modelId || null,
    model_label: entry.modelLabel || null,
    qty_fabricated: Number(entry.fabricadas) || 0,
    qty_delivered:  Number(entry.entregadas) || 0,
    status: entry.status || "printed",
    event_date: entry.fecha || new Date().toISOString().slice(0, 10),
    destination_id: entry.destinationId || null,
    photo_url,
    source: entry.source || "manual",
    notes: entry.notas || null
  }).select("id").single();

  if (error) throw new Error(error.message);
  return data;
}

/* ---------- new clinic/destination ---------- */
async function addDestination({ name, city, org }) {
  const { data, error } = await db.from("destinations")
    .insert({ name, city, org }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/* ---------- DASHBOARD (global, from the DB — not this device) ----------
 * range: 'all' | 'today' | 'week' | 'month'   country: '' or name */
function rangeStart(range) {
  const d = new Date();
  if (range === "today") return d.toISOString().slice(0, 10);
  if (range === "week")  { d.setDate(d.getDate() - 7);  return d.toISOString().slice(0,10); }
  if (range === "month") { d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0,10); }
  return null;
}

async function getDashboard({ range = "all", country = "" } = {}) {
  // Pull the safe event feed and aggregate client-side so the
  // existing date/country filters keep working unchanged.
  let q = db.from("dashboard_events").select("*");
  const start = rangeStart(range);
  if (start) q = q.gte("event_date", start);
  if (country) q = q.eq("country", country);
  const { data, error } = await q;
  if (error) { console.warn("getDashboard:", error.message); return null; }

  const byModel = {}, byCountry = {}, orgs = new Set();
  let fab = 0, ent = 0; const makers = new Set();
  for (const r of data) {
    fab += r.qty_fabricated; ent += r.qty_delivered;
    if (r.org) orgs.add(r.org);
    const k = r.model_name + "|" + (r.variant || "");
    byModel[k] = byModel[k] || { name: r.model_name, variant: r.variant,
      image_url: r.image_url, validated: r.medically_validated, fab: 0, ent: 0 };
    byModel[k].fab += r.qty_fabricated; byModel[k].ent += r.qty_delivered;
    const c = r.country || "Sin país";
    byCountry[c] = byCountry[c] || { fab: 0, ent: 0 };
    byCountry[c].fab += r.qty_fabricated; byCountry[c].ent += r.qty_delivered;
  }
  return {
    totals: { fabricated: fab, delivered: ent, makers: makers.size, orgs: orgs.size },
    byModel: Object.values(byModel).sort((a, b) => b.fab - a.fab),
    byCountry, orgs: [...orgs].sort(),
    countries: Object.keys(byCountry).sort()
  };
}

/* ---------- row-level feed for the existing renderDash() ----------
 * Returns rows shaped exactly like the old Google-Sheets rows:
 * {fecha, empresa, tipo, fab, ent, pais} so the dashboard renderer
 * works unchanged. */
async function getRows() {
  const { data, error } = await db.from("dashboard_events")
    .select("*").order("event_date", { ascending: false });
  if (error) { console.warn("getRows:", error.message); return []; }
  return data.map(r => ({
    fecha:   r.event_date || "",
    empresa: r.org || "",
    tipo:    (r.model_name || "") + (r.variant ? " - " + r.variant : ""),
    fab:     r.qty_fabricated || 0,
    ent:     r.qty_delivered || 0,
    pais:    r.country || ""
  }));
}

/* ---------- my inventory (TTW layer; needs verified login) ---------- */
async function getMyInventory() {
  const { data, error } = await db.from("inventory")
    .select("*").eq("maker_id", getDeviceMakerId());
  if (error) { console.warn("getMyInventory:", error.message); return []; }
  return data;
}

/* expose */
window.M4V = {
  saveProfile, getProfile, getDeviceMakerId, sendMagicLink,
  listModels, registerProduction, addDestination, uploadPhoto,
  getDashboard, getRows, getMyInventory
};
