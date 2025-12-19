/* eslint-disable no-console */
const path = require("path");
const express = require("express");
const RSSParser = require("rss-parser");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const app = express();
const PORT = 3000;

// -----------------------------
// Config
// -----------------------------

const CATEGORIES = [
  { id: "all", label: "전체" },
  { id: "politics", label: "정치" },
  { id: "economy", label: "경제" },
  { id: "society", label: "사회" },
  { id: "culture", label: "생활/문화" },
  { id: "sports", label: "스포츠" },
  { id: "it", label: "IT/과학" },
  { id: "world", label: "세계" }
];

const LOCATIONS = [
  { id: "seoul", label: "서울", lat: 37.5665, lon: 126.9780 },
  { id: "busan", label: "부산", lat: 35.1796, lon: 129.0756 },
  { id: "daegu", label: "대구", lat: 35.8714, lon: 128.6014 },
  { id: "incheon", label: "인천", lat: 37.4563, lon: 126.7052 },
  { id: "gwangju", label: "광주", lat: 35.1595, lon: 126.8526 },
  { id: "daejeon", label: "대전", lat: 36.3504, lon: 127.3845 },
  { id: "ulsan", label: "울산", lat: 35.5384, lon: 129.3114 },
  { id: "sejong", label: "세종", lat: 36.4800, lon: 127.2890 },
  { id: "suwon", label: "수원", lat: 37.2636, lon: 127.0286 },
  { id: "chuncheon", label: "춘천", lat: 37.8813, lon: 127.7298 },
  { id: "cheongju", label: "청주", lat: 36.6424, lon: 127.4890 },
  { id: "jeonju", label: "전주", lat: 35.8242, lon: 127.1480 },
  { id: "changwon", label: "창원", lat: 35.2270, lon: 128.6811 },
  { id: "jeju", label: "제주", lat: 33.4996, lon: 126.5312 }
];

const GOOGLE = {
  base: "https://news.google.com/rss",
  regionParams: "hl=ko&gl=KR&ceid=KR:ko",
  topic: (t) =>
    `https://news.google.com/rss/headlines/section/topic/${t}?hl=ko&gl=KR&ceid=KR:ko`,
  search: (q) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`
};

// 국내 RSS는 제공 정책이 자주 바뀜(차단/리다이렉트/HTML 반환 등)
// 실패해도 전체 서비스가 죽지 않도록 "부분 실패 허용" 구조로 구성
const FEEDS_BY_CATEGORY = {
  all: [
    `${GOOGLE.base}?${GOOGLE.regionParams}`,
    "https://www.mk.co.kr/rss/40300001/",
    "https://www.khan.co.kr/rss/rssdata/total_news.xml",
    "http://www.hani.co.kr/rss/",
    "http://rss.donga.com/total.xml",
    "http://rss.joins.com/joins_news_list.xml"
  ],
  politics: [
    GOOGLE.search("정치"),
    "https://www.mk.co.kr/rss/30200030/",
    "https://www.khan.co.kr/rss/rssdata/politic_news.xml",
    "http://www.hani.co.kr/rss/politics/",
    "http://rss.donga.com/politics.xml",
    "http://rss.joins.com/joins_politics_list.xml"
  ],
  economy: [
    GOOGLE.topic("BUSINESS"),
    "https://www.mk.co.kr/rss/30100041/",
    "https://www.khan.co.kr/rss/rssdata/economy_news.xml",
    "http://www.hani.co.kr/rss/economy/",
    "http://rss.donga.com/economy.xml",
    "http://rss.joins.com/joins_money_list.xml"
  ],
  society: [
    GOOGLE.search("사회"),
    "https://www.mk.co.kr/rss/50400012/",
    "https://www.khan.co.kr/rss/rssdata/society_news.xml",
    "http://www.hani.co.kr/rss/society/",
    "http://rss.donga.com/national.xml",
    "http://rss.joins.com/joins_life_list.xml"
  ],
  culture: [
    GOOGLE.search("생활 문화"),
    "https://www.khan.co.kr/rss/rssdata/culture_news.xml",
    "http://www.hani.co.kr/rss/culture/",
    "http://rss.donga.com/culture.xml",
    "http://rss.joins.com/joins_culture_list.xml"
  ],
  sports: [
    GOOGLE.topic("SPORTS"),
    "http://www.hani.co.kr/rss/sports/",
    "http://rss.donga.com/sportsdonga/sports_total.xml"
  ],
  it: [
    GOOGLE.topic("TECHNOLOGY"),
    GOOGLE.topic("SCIENCE"),
    "https://www.khan.co.kr/rss/rssdata/science_news.xml",
    "http://www.hani.co.kr/rss/science/",
    "http://rss.joins.com/joins_it_list.xml",
    "http://rss.etnews.co.kr/Section901.xml"
  ],
  world: [
    GOOGLE.topic("WORLD"),
    "https://www.khan.co.kr/rss/rssdata/kh_world.xml",
    "http://www.hani.co.kr/rss/international/",
    "http://rss.donga.com/international.xml",
    "http://rss.joins.com/joins_world_list.xml"
  ]
};

// -----------------------------
// RSS parser
// -----------------------------

const parser = new RSSParser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

// -----------------------------
// Utils: cache + fetch with charset decode
// -----------------------------

const cache = new Map();

function nowMs() {
  return Date.now();
}

async function cached(key, ttlMs, factory) {
  const hit = cache.get(key);
  const t = nowMs();
  if (hit && t < hit.expireAt) return hit.value;
  const value = await factory();
  cache.set(key, { value, expireAt: t + ttlMs });
  return value;
}

function normalizeCharset(cs) {
  if (!cs) return null;
  const c = String(cs).toLowerCase().trim();
  if (c === "euc-kr" || c === "ks_c_5601-1987" || c === "cp949") return "euc-kr";
  if (c === "utf8") return "utf-8";
  return c;
}

async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) local-feed/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": "https://finance.naver.com/"
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} | ${url}`);

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    let charset = null;

    const m1 = ctype.match(/charset=([^;]+)/i);
    if (m1 && m1[1]) charset = m1[1].trim();

    if (!charset) {
      const head = buf.slice(0, 4096).toString("latin1").toLowerCase();
      const m2 = head.match(/charset=["']?([a-z0-9\-_]+)/i);
      if (m2 && m2[1]) charset = m2[1].trim();
    }

    charset = normalizeCharset(charset);

    try {
      return iconv.decode(buf, charset || "utf-8");
    } catch {
      return iconv.decode(buf, "utf-8");
    }
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateToMs(d) {
  const dt = d ? new Date(d) : null;
  const ms = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
  return ms;
}

function extractImageUrl(item) {
  if (item?.enclosure?.url) return item.enclosure.url;

  const mc = item?.mediaContent?.[0];
  if (mc?.$?.url) return mc.$.url;
  if (typeof mc === "string") return mc;

  const mt = item?.mediaThumbnail?.[0];
  if (mt?.$?.url) return mt.$.url;
  if (typeof mt === "string") return mt;

  const candidates = [
    item?.contentEncoded,
    item?.content,
    item?.summary,
    item?.contentSnippet
  ].filter(Boolean);

  for (const c of candidates) {
    const m = String(c).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) return m[1];
  }

  return null;
}

function inferSourceTitle(item, feedTitle) {
  if (item?.source?.title) return item.source.title;
  if (item?.creator) return String(item.creator);
  if (feedTitle) return feedTitle;
  return "뉴스";
}

function parseKrwNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------
// FX (USD/KRW) - Naver scrape (no external FX API dependency)
// -----------------------------

async function getFxUsdKrw() {
  return cached("fx:usdkrw", 10 * 60 * 1000, async () => {
    // 1) NAVER 우선
    try {
      const url = "https://finance.naver.com/marketindex/exchangeDetail.naver?code=FX_USDKRW";
      const html = await fetchText(url, 9000);
      const $ = cheerio.load(html);

      const raw =
        $(".no_today .blind").toArray().map((el) => $(el).text().trim())
          .find((t) => /[\d,]+\.\d+|[\d,]+/.test(t)) ||
        $(".no_today").first().text().trim();

      const rate = Number(String(raw).replace(/,/g, "").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`NAVER FX parse failed: "${raw}"`);

      return { base: "USD", quote: "KRW", usdKrw: rate, asOf: new Date().toISOString(), source: "NAVER" };
    } catch (e1) {
      // 2) 폴백: ER-API
      const txt = await fetchText("https://open.er-api.com/v6/latest/USD", 9000);
      const j = JSON.parse(txt);
      const rate = j?.rates?.KRW;

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`FX fallback failed | NAVER: ${String(e1?.message || e1)} | ER-API invalid`);
      }

      return { base: "USD", quote: "KRW", usdKrw: rate, asOf: new Date().toISOString(), source: "ER-API" };
    }
  });
}


// -----------------------------
// Weather (Open-Meteo + Air Quality)
// -----------------------------

function weatherCodeToText(code) {
  const map = new Map([
    [0, "맑음"],
    [1, "대체로 맑음"],
    [2, "부분적으로 흐림"],
    [3, "흐림"],
    [45, "안개"],
    [48, "서리 안개"],
    [51, "약한 이슬비"],
    [53, "이슬비"],
    [55, "강한 이슬비"],
    [61, "약한 비"],
    [63, "비"],
    [65, "강한 비"],
    [71, "약한 눈"],
    [73, "눈"],
    [75, "강한 눈"],
    [80, "약한 소나기"],
    [81, "소나기"],
    [82, "강한 소나기"],
    [95, "뇌우"],
    [96, "뇌우(우박 가능)"],
    [99, "강한 뇌우(우박 가능)"]
  ]);
  return map.get(code) ?? `코드 ${code}`;
}

function nearestIndexByTime(times, targetIso) {
  if (!Array.isArray(times) || !times.length) return 0;
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return 0;

  let best = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

async function getAirQuality(lat, lon) {
  const url =
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=pm10,pm2_5" +
    "&timezone=Asia%2FSeoul";

  const txt = await fetchText(url, 9000);
  const json = JSON.parse(txt);
  const cur = json?.current || {};

  return {
    asOf: cur?.time || null,
    pm10: cur?.pm10 ?? null,
    pm2_5: cur?.pm2_5 ?? null
  };
}

async function getWeather(locId) {
  const loc = LOCATIONS.find((x) => x.id === locId) || LOCATIONS[0];

  return cached(`weather:${loc.id}`, 3 * 60 * 1000, async () => {
    const wxUrl =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${loc.lat}&longitude=${loc.lon}` +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation" +
      "&hourly=precipitation_probability" +
      "&daily=temperature_2m_max,temperature_2m_min,weather_code" +
      "&timezone=Asia%2FSeoul";

    const wxText = await fetchText(wxUrl, 9000);
    const wx = JSON.parse(wxText);

    const current = wx?.current || {};
    const daily = wx?.daily || {};
    const hourly = wx?.hourly || {};

    const idx = nearestIndexByTime(hourly?.time, current?.time);
    const precipProb = Array.isArray(hourly?.precipitation_probability)
      ? hourly.precipitation_probability[idx]
      : null;

    let aq = { asOf: null, pm10: null, pm2_5: null };
    try {
      aq = await getAirQuality(loc.lat, loc.lon);
    } catch {
      // AQ 실패해도 계속 진행
    }

    return {
      loc: { id: loc.id, label: loc.label },
      asOf: current?.time || new Date().toISOString(),
      current: {
        tempC: current?.temperature_2m,
        feelsC: current?.apparent_temperature,
        windMs: current?.wind_speed_10m,
        humidityPct: current?.relative_humidity_2m,
        precipMm: current?.precipitation,
        precipProbPct: precipProb,
        code: current?.weather_code,
        text: weatherCodeToText(current?.weather_code),
        pm10: aq?.pm10 ?? null,
        pm2_5: aq?.pm2_5 ?? null,
        aqAsOf: aq?.asOf ?? null
      },
      daily: Array.isArray(daily?.time)
        ? daily.time.slice(0, 5).map((t, i) => ({
            date: t,
            tmax: daily.temperature_2m_max?.[i],
            tmin: daily.temperature_2m_min?.[i],
            code: daily.weather_code?.[i],
            text: weatherCodeToText(daily.weather_code?.[i])
          }))
        : []
    };
  });
}

// -----------------------------
// Stocks (Top "거래대금" + Naver quote)
// -----------------------------

function extractStockFromTextFallback(htmlText) {
  const t = stripHtml(htmlText);

  const priceMatch = t.match(/현재가\s*([\d,]+)/);
  const price = priceMatch ? parseKrwNumber(priceMatch[1]) : null;

  const changeMatch = t.match(/전일대비\s*(상승|하락|보합)\s*([\d,]+)/);
  const direction = changeMatch ? changeMatch[1] : null;
  const change = changeMatch ? parseKrwNumber(changeMatch[2]) : null;

  const pctMatch = t.match(/([\d.]+)\s*퍼센트/);
  const pct = pctMatch ? Number(pctMatch[1]) : null;

  return { price, direction, change, pct };
}

function pickFirstNumber(texts) {
  for (const t of texts) {
    const m = String(t).match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)/);
    if (m) return m[1];
  }
  return null;
}

function pickPercent(texts) {
  for (const t of texts) {
    const m = String(t).match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (m) return Number(m[1]);
  }
  // 접근성 텍스트에 "퍼센트"로 들어오는 경우 폴백
  for (const t of texts) {
    const m = String(t).match(/([+-]?\d+(?:\.\d+)?)\s*퍼센트/);
    if (m) return Number(m[1]);
  }
  return null;
}

async function fetchNaverQuote(code) {
  const url = `https://finance.naver.com/item/main.naver?code=${code}`;
  const html = await fetchText(url, 9000);
  const $ = cheerio.load(html);

  // 현재가: .no_today 내부 blind 중 숫자 찾기
  const todayBlinds = $(".no_today .blind").toArray().map((el) => $(el).text().trim());
  let price = parseKrwNumber(pickFirstNumber(todayBlinds));

  // 전일대비: .no_exday 내부 blind에서 방향/변동/퍼센트 추출
  const exBlinds = $(".no_exday .blind").toArray().map((el) => $(el).text().trim());

  let direction = null;
  if (exBlinds.some((t) => t.includes("상승"))) direction = "상승";
  else if (exBlinds.some((t) => t.includes("하락"))) direction = "하락";
  else if (exBlinds.some((t) => t.includes("보합"))) direction = "보합";

  // 변동폭(원): blind 중 숫자(%) 아닌 것 우선
  let change = null;
  for (const t of exBlinds) {
    if (String(t).includes("%") || String(t).includes("퍼센트")) continue;
    const n = parseKrwNumber(t);
    if (n != null) {
      change = n;
      break;
    }
  }

  // 등락률(%)
  let pctSigned = pickPercent(exBlinds);
  if (pctSigned != null && !direction) {
    if (pctSigned > 0) direction = "상승";
    else if (pctSigned < 0) direction = "하락";
    else direction = "보합";
  }
  const pct = pctSigned != null ? Math.abs(pctSigned) : null;

  // 폴백: selector가 바뀐 경우 대비 (기존 텍스트 기반)
  if (price == null || change == null || pct == null) {
    const fallback = extractStockFromTextFallback(html);
    price = price ?? fallback.price;
    direction = direction ?? fallback.direction;
    change = change ?? fallback.change;
    // fallback.pct는 이미 숫자일 수 있음
    const fp = fallback.pct;
    if (pct == null && fp != null) pctSigned = fp, (pctSigned > 0 ? (direction ??= "상승") : pctSigned < 0 ? (direction ??= "하락") : (direction ??= "보합"));
    if (pct == null && fp != null) pctSigned = fp;
  }

  return { price, direction, change, pct, url };
}


async function getTopDealStocks(limit = 6) {
  return cached(`stocks:topdeal:${limit}`, 5 * 60 * 1000, async () => {
    const FALLBACK = [
      { code: "005930", name: "삼성전자" },
      { code: "000660", name: "SK하이닉스" },
      { code: "373220", name: "LG에너지솔루션" },
      { code: "005380", name: "현대차" },
      { code: "035420", name: "NAVER" },
      { code: "035720", name: "카카오" }
    ].slice(0, limit);

    // ✅ KOSPI(0) + KOSDAQ(1) 둘 다
    const urls = [
      "https://finance.naver.com/sise/sise_amount.naver?sosok=0&page=1",
      "https://finance.naver.com/sise/sise_amount.naver?sosok=1&page=1",
      // 폴백(거래량 페이지에서도 거래대금 컬럼이 있으면 사용)
      "https://finance.naver.com/sise/sise_quant.naver?sosok=0&page=1",
      "https://finance.naver.com/sise/sise_quant.naver?sosok=1&page=1"
    ];

    const bestByCode = new Map();
    const failures = [];

    for (const url of urls) {
      try {
        const html = await fetchText(url, 9000);
        const $ = cheerio.load(html);

        const table = $("table.type_2").first();
        if (!table.length) throw new Error("type_2 table not found");

        // 헤더에서 '거래대금' 컬럼 인덱스 탐색
        const headers = [];
        table.find("thead tr").last().find("th").each((_, th) => {
          headers.push($(th).text().trim());
        });

        let dealIdx = headers.findIndex((h) => h.includes("거래대금"));
        if (dealIdx < 0) dealIdx = 6; // 안전 폴백

        let any = false;

        table.find("tbody tr").each((_, tr) => {
          const a = $(tr).find('a[href*="code="]').first();
          if (!a.length) return;

          const href = a.attr("href") || "";
          const m = href.match(/code=(\d{6})/);
          if (!m) return;

          const code = m[1];
          const name = a.text().trim();
          if (!name) return;

          const tds = $(tr).find("td").toArray().map((td) => $(td).text().trim());
          const dealText = tds[dealIdx] || "";
          const deal = parseKrwNumber(dealText);

          if (deal == null) return;

          any = true;

          const prev = bestByCode.get(code);
          if (!prev || deal > prev.deal) {
            bestByCode.set(code, { code, name, deal });
          }
        });

        if (!any) throw new Error("no parsable rows (maybe blocked/empty)");
      } catch (e) {
        failures.push({ url, error: String(e?.message || e) });
      }
    }

    const arr = Array.from(bestByCode.values()).sort((a, b) => b.deal - a.deal);
    if (arr.length >= 1) {
      return arr.slice(0, limit).map(({ code, name }) => ({ code, name }));
    }

    // ✅ 여기서 throw 안 하고 폴백으로 살린다 (UI 무한 로딩/전체 실패 방지)
    console.warn("[stocks] deal ranking parse failed:", failures.slice(0, 4));
    return FALLBACK;
  });
}


async function getStocks() {
  return cached("stocks:kr:topdeal", 2 * 60 * 1000, async () => {
    // 환율 실패해도 주식 탭은 살려두기
    let fx;
    try {
      fx = await getFxUsdKrw();
    } catch (e) {
      fx = {
        base: "USD",
        quote: "KRW",
        usdKrw: null,
        asOf: new Date().toISOString(),
        error: String(e?.message || e)
      };
    }

    const top = await getTopDealStocks(6);

    const items = [];
    for (const s of top) {
      try {
        const q = await fetchNaverQuote(s.code);
        items.push({
          code: s.code,
          name: s.name,
          priceKrw: q.price,
          changeKrw: q.change,
          changePct: q.pct,
          direction: q.direction,
          link: q.url
        });
      } catch (e) {
        items.push({
          code: s.code,
          name: s.name,
          priceKrw: null,
          changeKrw: null,
          changePct: null,
          direction: null,
          link: `https://finance.naver.com/item/main.naver?code=${s.code}`,
          error: String(e?.message || e)
        });
      }
    }

    return {
      asOf: new Date().toISOString(),
      fx,
      items
    };
  });
}

// -----------------------------
// News aggregation
// -----------------------------

async function parseFeed(url) {
  const xml = await fetchText(url, 9000);
  // HTML이 오는 경우(차단/리다이렉트/본문페이지) RSSParser가 터질 수 있으므로 여기서 빠른 가드
  const head = String(xml).slice(0, 400).toLowerCase();
  const looksLikeXml = head.includes("<rss") || head.includes("<feed") || head.includes("<?xml");
  if (!looksLikeXml) throw new Error("Not an RSS/Atom XML");
  return await parser.parseString(xml);
}

async function getNews(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
  const feeds = FEEDS_BY_CATEGORY[cat.id] || FEEDS_BY_CATEGORY.all;

  return cached(`news:${cat.id}`, 2 * 60 * 1000, async () => {
    const items = [];
    const failures = [];

    for (const url of feeds) {
      try {
        const feed = await parseFeed(url);
        const feedTitle = feed?.title;

        for (const it of feed?.items || []) {
          const title = (it?.title || "").trim();
          const link = (it?.link || it?.guid || "").trim();
          if (!title || !link) continue;

          const publishedMs = parseDateToMs(it?.isoDate || it?.pubDate);
          const desc = stripHtml(
            it?.contentSnippet || it?.content || it?.summary || ""
          );
          const image = extractImageUrl(it);

          items.push({
            title,
            link,
            publishedMs,
            publishedIso: it?.isoDate || it?.pubDate || null,
            source: inferSourceTitle(it, feedTitle),
            excerpt: desc,
            image
          });
        }
      } catch (e) {
        failures.push({ url, error: String(e?.message || e) });
      }
    }

    const seen = new Set();
    const deduped = [];
    for (const it of items) {
      const key = it.link || `${it.source}:${it.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(it);
    }

    deduped.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));

    return {
      category: cat,
      asOf: new Date().toISOString(),
      items: deduped.slice(0, 60),
      meta: {
        feedCount: feeds.length,
        failureCount: failures.length,
        failures: failures.slice(0, 5)
      }
    };
  });
}

// -----------------------------
// Routes
// -----------------------------

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/meta", (req, res) => {
  res.json({
    categories: CATEGORIES,
    locations: LOCATIONS.map(({ id, label }) => ({ id, label }))
  });
});

app.get("/api/news", async (req, res) => {
  const category = String(req.query.category || "all");
  try {
    const data = await getNews(category);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/weather", async (req, res) => {
  const loc = String(req.query.loc || "seoul");
  try {
    const data = await getWeather(loc);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/stocks", async (req, res) => {
  try {
    const data = await getStocks();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/fx", async (req, res) => {
  try {
    const fx = await getFxUsdKrw();
    res.json(fx);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Express v5 계열 라우팅 파서 호환 (path-to-regexp 이슈 회피)
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ local-feed running: http://localhost:${PORT}`);
});
