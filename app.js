const $ = (sel) => document.querySelector(sel);

const state = {
  meta: null,
  category: localStorage.getItem("lf.category") || "all",
  loc: localStorage.getItem("lf.loc") || "seoul",
  search: "",
  newsPayload: null,
  fxUsdKrw: null
};

// -----------------------------
// Helpers
// -----------------------------
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function relTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function setStatus(text) {
  $("#statusText").textContent = text;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  return String(s ?? "").replaceAll("'", "%27");
}

function weatherEmoji(code) {
  if (code == null) return "🌡️";
  if (code === 0) return "🌞";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function toUsd(krw, usdKrw) {
  if (krw == null || usdKrw == null) return null;
  const n = Number(krw);
  const r = Number(usdKrw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || r <= 0) return null;
  return n / r;
}

function parseNumberInput(v) {
  const t = String(v ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------
// API
// -----------------------------
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return await res.json();
}

// -----------------------------
// Render: Categories
// -----------------------------
function renderCategories() {
  const list = $("#categoryList");
  list.innerHTML = "";

  for (const c of state.meta.categories) {
    const el = document.createElement("div");
    el.className = `cat ${c.id === state.category ? "active" : ""}`;
    el.innerHTML = `
      <div class="label">${c.label}</div>
      <div class="pill">${c.id.toUpperCase()}</div>
    `;
    el.addEventListener("click", () => {
      state.category = c.id;
      localStorage.setItem("lf.category", state.category);
      $("#contentTitle").textContent = c.label;
      renderCategories();
      refreshNews();
    });
    list.appendChild(el);
  }

  const cur = state.meta.categories.find((x) => x.id === state.category);
  $("#contentTitle").textContent = cur ? cur.label : "전체";
}

// -----------------------------
// Render: Custom Location Select
// -----------------------------
function renderLocMenu() {
  const menu = $("#locMenu");
  menu.innerHTML = "";

  for (const l of state.meta.locations) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `opt ${l.id === state.loc ? "active" : ""}`;
    btn.textContent = l.label;

    btn.addEventListener("click", () => {
      state.loc = l.id;
      localStorage.setItem("lf.loc", state.loc);
      $("#locLabel").textContent = l.label;
      closeLocMenu();
      refreshWeather();
      renderLocMenu();
    });

    menu.appendChild(btn);
  }

  const cur = state.meta.locations.find((x) => x.id === state.loc);
  $("#locLabel").textContent = cur ? cur.label : "서울";
}

function openLocMenu() {
  $("#locMenu").classList.remove("hidden");
}
function closeLocMenu() {
  $("#locMenu").classList.add("hidden");
}

function wireLocSelect() {
  const btn = $("#locBtn");
  const menu = $("#locMenu");

  btn.addEventListener("click", () => {
    const isOpen = !menu.classList.contains("hidden");
    if (isOpen) closeLocMenu();
    else openLocMenu();
  });

  document.addEventListener("click", (e) => {
    const wrap = $("#locSelectWrap");
    if (!wrap.contains(e.target)) closeLocMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLocMenu();
  });
}

// -----------------------------
// Render: Weather
// -----------------------------
function renderWeather(data) {
  const box = $("#weatherBox");
  if (!data) {
    box.innerHTML = `<div class="muted">날씨 데이터를 불러오는 중…</div>`;
    return;
  }

  const emoji = weatherEmoji(data.current.code);
  const t = Math.round(data.current.tempC ?? 0);
  const feels = data.current.feelsC != null ? Math.round(data.current.feelsC) : null;

  const hum = data.current.humidityPct != null ? `${Math.round(data.current.humidityPct)}%` : "—";
  const prMm = data.current.precipMm != null ? `${Number(data.current.precipMm).toFixed(1)} mm` : "—";
  const prP = data.current.precipProbPct != null ? `${Math.round(data.current.precipProbPct)}%` : "—";
  const pm10 = data.current.pm10 != null ? `${Math.round(data.current.pm10)} µg/m³` : "—";
  const pm25 = data.current.pm2_5 != null ? `${Math.round(data.current.pm2_5)} µg/m³` : "—";

  box.innerHTML = `
    <div class="weather-main">
      <div>
        <div class="temp">
          <span class="wx-emoji">${emoji}</span>
          <span>${t}°</span>
        </div>
        <div class="wdesc">${data.loc.label} · ${data.current.text}</div>
        <div class="wdesc">체감 ${feels != null ? feels + "°" : "—"} · 풍속 ${Math.round(data.current.windMs ?? 0)} m/s</div>
      </div>
      <div class="wdesc">${new Date(data.asOf).toLocaleString("ko-KR")}</div>
    </div>

    <div class="weather-stats">
      <div class="stat"><div class="k">습도</div><div class="v">${hum}</div></div>
      <div class="stat"><div class="k">강수량</div><div class="v">${prMm}</div></div>
      <div class="stat"><div class="k">강수확률</div><div class="v">${prP}</div></div>
      <div class="stat"><div class="k">미세먼지(PM10)</div><div class="v">${pm10}</div></div>
      <div class="stat"><div class="k">초미세먼지(PM2.5)</div><div class="v">${pm25}</div></div>
      <div class="stat"><div class="k">AQ 기준 시각</div><div class="v">${data.current.aqAsOf ? new Date(data.current.aqAsOf).toLocaleTimeString("ko-KR") : "—"}</div></div>
    </div>

    <div class="weather-mini">
      ${data.daily
        .map((d) => {
          const dt = new Date(d.date);
          const mmdd = `${dt.getMonth() + 1}/${dt.getDate()}`;
          const e2 = weatherEmoji(d.code);
          return `
            <div class="day">
              <div class="d">${mmdd}</div>
              <div class="t">${e2} ${Math.round(d.tmin ?? 0)}° / ${Math.round(d.tmax ?? 0)}°</div>
              <div class="c" title="${d.text}">${d.text}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// -----------------------------
// Render: Stocks
// -----------------------------
function renderStocks(data) {
  const box = $("#stocksBox");
  $("#stocksAsOf").textContent = data?.asOf ? new Date(data.asOf).toLocaleString("ko-KR") : "";

  if (!data) {
    box.innerHTML = `<div class="muted">증권 데이터를 불러오는 중…</div>`;
    return;
  }

  state.fxUsdKrw = data?.fx?.usdKrw ?? null;
  $("#fxRateText").textContent =
    state.fxUsdKrw != null ? `USD/KRW ${Number(state.fxUsdKrw).toFixed(2)}` : "환율 로드 실패 (KRW 표시)";

  const usdKrw = state.fxUsdKrw;

  box.innerHTML = (data.items || [])
    .map((s) => {
      const dir = s.direction;
      const cls = dir === "상승" ? "up" : dir === "하락" ? "down" : "flat";
      const sign = dir === "상승" ? "+" : dir === "하락" ? "-" : "";

      const priceUsd = toUsd(s.priceKrw, usdKrw);
      const chgUsd = toUsd(s.changeKrw != null ? Math.abs(s.changeKrw) : null, usdKrw);

      const priceTxt =
        usdKrw != null
            ? (priceUsd != null ? usdFmt.format(priceUsd) : "—")
            : (s.priceKrw != null ? `₩${Number(s.priceKrw).toLocaleString("ko-KR")}` : "—");

        const chgTxt =
        usdKrw != null
            ? (chgUsd != null ? `${sign}${usdFmt.format(chgUsd)}` : "—")
            : (s.changeKrw != null ? `${sign}₩${Number(Math.abs(s.changeKrw)).toLocaleString("ko-KR")}` : "—");

      let pct = null;

      // 1) 서버에서 준 changePct 우선
      if (s.changePct != null && Number.isFinite(Number(s.changePct))) {
        pct = Math.abs(Number(s.changePct));
      }

      // 2) 폴백: change / price * 100 (KRW 기준)
      if (pct == null && s.changeKrw != null && s.priceKrw != null) {
        const ch = Math.abs(Number(s.changeKrw));
        const pr = Number(s.priceKrw);
        if (Number.isFinite(ch) && Number.isFinite(pr) && pr > 0) {
          pct = (ch / pr) * 100;
        }
      }

      const pctTxt = pct != null ? `${sign}${pct.toFixed(2)}%` : "—";


      return `
        <div class="stock">
          <a href="${s.link}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a>
          <div style="text-align:right">
            <div class="p">${priceTxt}</div>
            <div class="chg ${cls}">${chgTxt} · ${pctTxt}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// -----------------------------
// FX Converter
// -----------------------------
function wireFxConverter() {
  const usdEl = $("#fxUsd");
  const krwEl = $("#fxKrw");
  let lock = false;

  usdEl.addEventListener("input", () => {
    if (lock) return;
    const r = state.fxUsdKrw;
    if (!r) return;

    const usd = parseNumberInput(usdEl.value);
    lock = true;
    if (usd == null) krwEl.value = "";
    else krwEl.value = Math.round(usd * r).toLocaleString("ko-KR");
    lock = false;
  });

  krwEl.addEventListener("input", () => {
    if (lock) return;
    const r = state.fxUsdKrw;
    if (!r) return;

    const krw = parseNumberInput(krwEl.value);
    lock = true;
    if (krw == null) usdEl.value = "";
    else usdEl.value = (krw / r).toFixed(2);
    lock = false;
  });
}

// -----------------------------
// Render: News
// -----------------------------
function newsCard(it) {
  const img = it.image
    ? `<img src="${it.image}" alt="" loading="lazy" />`
    : `<div class="ph">NO IMG</div>`;

  const meta = `${it.source ? `<span class="badge">${escapeHtml(it.source)}</span>` : ""} <span>${relTime(
    it.publishedMs
  )}</span>`;

  return `
    <article class="news" role="button" tabindex="0" onclick="window.open('${escapeAttr(it.link)}','_blank')">
      <div class="thumb">${img}</div>
      <div>
        <h3 class="news-title">${escapeHtml(it.title)}</h3>
        <div class="news-meta">${meta}</div>
        <div class="news-desc">${escapeHtml(it.excerpt || "")}</div>
      </div>
    </article>
  `;
}

function renderNews(payload) {
  const list = $("#newsList");
  const empty = $("#emptyState");

  const items = payload?.items || [];
  const q = state.search.trim().toLowerCase();

  const filtered = q
    ? items.filter((x) => (x.title + " " + (x.excerpt || "")).toLowerCase().includes(q))
    : items;

  if (!filtered.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = filtered.map(newsCard).join("");
}

// -----------------------------
// Calendar / Schedule (localStorage)
// -----------------------------
const EVENTS_KEY = "lf.events.v1";

function loadEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

const cal = {
  cursor: new Date(),
  selected: new Date(),
  events: loadEvents()
};

function renderCalendar() {
  const box = $("#calendarBox");
  const cur = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), 1);
  const year = cur.getFullYear();
  const month = cur.getMonth();

  const firstDow = cur.getDay();
  const start = new Date(year, month, 1 - firstDow);
  const todayYmd = toYmd(new Date());
  const selectedYmd = toYmd(cal.selected);

  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  const header = `
    <div class="muted" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:950;color:rgba(255,255,255,.86)">${year}년 ${month + 1}월</div>
      <div style="font-size:12px">선택: ${selectedYmd}</div>
    </div>
  `;

  const dowRow = dows.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  const eventsByDate = new Map();
  for (const e of cal.events) {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
    eventsByDate.get(e.date).push(e);
  }

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    const ymd = toYmd(dt);
    const inMonth = dt.getMonth() === month;

    const cls = [
      "cal-cell",
      inMonth ? "" : "muted",
      ymd === todayYmd ? "today" : "",
      ymd === selectedYmd ? "selected" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const hasDot = eventsByDate.has(ymd) ? `<div class="dot2"></div>` : "";

    cells.push(`
      <div class="${cls}" data-ymd="${ymd}">
        ${dt.getDate()}
        ${hasDot}
      </div>
    `);
  }

  box.innerHTML = `
    ${header}
    <div class="cal-grid">
      ${dowRow}
      ${cells.join("")}
    </div>
  `;

  box.querySelectorAll(".cal-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const ymd = cell.getAttribute("data-ymd");
      cal.selected = new Date(ymd + "T00:00:00");
      renderCalendar();
      renderAgenda();
    });
  });
}

function renderAgenda() {
  const ymd = toYmd(cal.selected);
  $("#agendaTitle").textContent = `일정 · ${ymd}`;

  const list = $("#agendaList");
  const todays = cal.events
    .filter((e) => e.date === ymd)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  if (!todays.length) {
    list.innerHTML = `<div class="muted" style="font-size:12px">등록된 일정이 없습니다.</div>`;
    return;
  }

  list.innerHTML = todays
    .map(
      (e) => `
    <div class="ag">
      <div class="left">
        <div class="t">${escapeHtml(e.time || "시간 미지정")}</div>
        <div class="s" title="${escapeHtml(e.text)}">${escapeHtml(e.text)}</div>
      </div>
      <button class="x" data-id="${e.id}">삭제</button>
    </div>
  `
    )
    .join("");

  list.querySelectorAll("button.x").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      cal.events = cal.events.filter((x) => x.id !== id);
      saveEvents(cal.events);
      renderCalendar();
      renderAgenda();
    });
  });
}

function wireAgendaForm() {
  const form = $("#agendaForm");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const date = toYmd(cal.selected);
    const time = ($("#agendaTime").value || "").trim();
    const text = ($("#agendaText").value || "").trim();
    if (!text) return;

    const e = { id: crypto.randomUUID(), date, time, text };
    cal.events.push(e);
    saveEvents(cal.events);

    $("#agendaTime").value = "";
    $("#agendaText").value = "";

    renderCalendar();
    renderAgenda();
  });
}

function wireCalendarButtons() {
  $("#calPrev").addEventListener("click", () => {
    cal.cursor = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth() - 1, 1);
    renderCalendar();
  });
  $("#calNext").addEventListener("click", () => {
    cal.cursor = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth() + 1, 1);
    renderCalendar();
  });
  $("#calToday").addEventListener("click", () => {
    const t = new Date();
    cal.cursor = new Date(t.getFullYear(), t.getMonth(), 1);
    cal.selected = t;
    renderCalendar();
    renderAgenda();
  });
}

// -----------------------------
// Refresh
// -----------------------------
async function refreshNews() {
  setStatus("뉴스 업데이트 중…");
  $("#newsList").innerHTML = `<div class="muted">뉴스를 불러오는 중…</div>`;
  $("#emptyState").classList.add("hidden");

  const payload = await api(`/api/news?category=${encodeURIComponent(state.category)}`);
  state.newsPayload = payload;
  renderNews(payload);

  // ✅ 실패 카운트는 콘솔로만 남기고, 상단 상태 문구는 깔끔하게 유지
  const fail = payload?.meta?.failureCount || 0;
  if (fail) console.warn("Feed failures:", payload?.meta?.failures);
  setStatus("뉴스 업데이트 완료");
}

async function refreshWeather() {
  renderWeather(null);
  const data = await api(`/api/weather?loc=${encodeURIComponent(state.loc)}`);
  renderWeather(data);
}

async function refreshStocks() {
  renderStocks(null);
  const data = await api(`/api/stocks`);
  renderStocks(data);
}

async function refreshAll() {
  $("#refreshBtn").disabled = true;
  try {
    await Promise.all([refreshNews(), refreshWeather(), refreshStocks()]);
  } finally {
    $("#refreshBtn").disabled = false;
  }
}

// -----------------------------
// Init
// -----------------------------
async function init() {
  state.meta = await api("/api/meta");

  renderCategories();
  renderLocMenu();
  wireLocSelect();

  $("#refreshBtn").addEventListener("click", refreshAll);

  $("#searchInput").addEventListener("input", (e) => {
    state.search = e.target.value || "";
    if (state.newsPayload) renderNews(state.newsPayload);
  });

  wireFxConverter();

  wireCalendarButtons();
  wireAgendaForm();
  renderCalendar();
  renderAgenda();

  await refreshAll();
}

init().catch((e) => {
  console.error(e);
  setStatus("초기화 실패 (콘솔 확인)");
});
