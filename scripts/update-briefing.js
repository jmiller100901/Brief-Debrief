const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'briefing.json');

const FUTURES_SYMBOLS = [
  { name: 'S&P 500', symbol: '^GSPC', url: 'https://finance.yahoo.com/quote/%5EGSPC/' },
  { name: 'Dow Jones', symbol: '^DJI', url: 'https://finance.yahoo.com/quote/%5EDJI/' },
  { name: 'Nasdaq', symbol: '^IXIC', url: 'https://finance.yahoo.com/quote/%5EIXIC/' },
  { name: '10Y Treasury', symbol: '^TNX', url: 'https://www.cnbc.com/quotes/US10Y' },
  { name: 'Crude Oil', symbol: 'CL=F', url: 'https://finance.yahoo.com/quote/CL%3DF/' },
  { name: 'Gold', symbol: 'GC=F', url: 'https://finance.yahoo.com/quote/GC%3DF/' },
];

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;

    return {
      value: symbol === '^TNX' ? price.toFixed(2) + '%' : (symbol.includes('=F') ? '$' : '') + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: (change >= 0 ? '+' : '') + change.toFixed(2),
      changePercent: (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%',
      direction: change >= 0 ? 'up' : 'down',
    };
  } catch (e) {
    console.error(`Failed to fetch ${symbol}:`, e.message);
    return null;
  }
}

async function fetchGoogleNewsRSS() {
  const categories = [
    { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', cat: 'business' },
    { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', cat: 'markets' },
    { url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', cat: 'world' },
  ];

  const articles = [];

  for (const { url, cat } of categories) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const xml = await res.text();

      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items.slice(0, 4)) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
        const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';

        if (title && !articles.find(a => a.title === title)) {
          articles.push({
            title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
            source: source.replace(/&amp;/g, '&'),
            summary: '',
            url: link,
            category: cat,
          });
        }
      }
    } catch (e) {
      console.error(`Failed to fetch news for ${cat}:`, e.message);
    }
  }

  return articles.slice(0, 8);
}

async function main() {
  console.log('Fetching market data...');

  // Fetch futures
  const futures = [];
  for (const f of FUTURES_SYMBOLS) {
    const quote = await fetchYahooQuote(f.symbol);
    if (quote) {
      futures.push({ name: f.name, ...quote, url: f.url });
      console.log(`  ${f.name}: ${quote.value} ${quote.change}`);
    } else {
      console.log(`  ${f.name}: FAILED`);
    }
  }

  // Fetch news
  console.log('Fetching news...');
  const news = await fetchGoogleNewsRSS();
  console.log(`  Got ${news.length} articles`);

  // Read existing data to preserve Outlook/calendar/priority sections
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.log('No existing briefing.json, creating fresh');
  }

  const now = new Date();
  const ctOffset = '-05:00'; // CDT; adjust to -06:00 for CST
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  const briefing = {
    ...existing,
    date: dateStr,
    generatedAt: new Date().toISOString(),
    futures: futures.length ? futures : (existing.futures || []),
    futuresLink: 'https://finance.yahoo.com/markets/',
    news: news.length ? news : (existing.news || []),
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(briefing, null, 2));
  console.log(`Written to ${DATA_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
