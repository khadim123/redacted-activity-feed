const orgInput = document.querySelector("#org");
const appSelect = document.querySelector("#app");
const feed = document.querySelector("#feed");
const statusEl = document.querySelector("#status");
const countEl = document.querySelector("#count");
const redactionsEl = document.querySelector("#redactions");

let events = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function timeLabel(ts) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function render() {
  const selected = appSelect.value;
  const visible = selected ? events.filter((event) => event.app === selected) : events;
  const redactions = visible.reduce((sum, event) => sum + event.redactions, 0);

  countEl.textContent = `${visible.length} event${visible.length === 1 ? "" : "s"}`;
  redactionsEl.textContent = `${redactions} value${redactions === 1 ? "" : "s"} redacted`;

  if (visible.length === 0) {
    feed.innerHTML = "";
    statusEl.textContent = "No events for this organisation and filter.";
    return;
  }

  statusEl.textContent = "";
  feed.innerHTML = visible
    .map(
      (event) => `
      <li class="event">
        <div class="meta">
          <span class="app">${escapeHtml(event.app)}</span>
          <span class="label">${escapeHtml(event.label)}</span>
          <span class="time">${escapeHtml(timeLabel(event.ts))}</span>
        </div>
        <p class="text">${escapeHtml(event.text)}</p>
        <div class="foot">
          <span>${escapeHtml(event.user_id)}</span>
          <span class="redactions">${event.redactions} redacted</span>
        </div>
      </li>`,
    )
    .join("");
}

async function load() {
  const orgId = orgInput.value.trim();
  if (!orgId) {
    statusEl.textContent = "Enter an organisation id.";
    return;
  }
  statusEl.textContent = "Loading…";
  try {
    const response = await fetch("/events?limit=100", { headers: { "X-Org-Id": orgId } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Request failed");

    events = body.events;
    const apps = [...new Set(events.map((event) => event.app))].sort();
    const current = appSelect.value;
    appSelect.innerHTML =
      '<option value="">All apps</option>' +
      apps.map((app) => `<option value="${escapeHtml(app)}">${escapeHtml(app)}</option>`).join("");
    appSelect.value = apps.includes(current) ? current : "";
    render();
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

orgInput.addEventListener("change", load);
appSelect.addEventListener("change", render);
load();
