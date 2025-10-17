// Yes, replace the same upper part that defines how the WhatsApp client is created.
// The updated section below includes both the correct import method and the headless Puppeteer config that works on Railway.

import 'dotenv/config';
import qrcode from 'qrcode-terminal';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MOCK_MODE = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';

// ✅ This is the part that fixes your Railway crash
const puppeteerArgs = {
  headless: true,
  executablePath: '/usr/bin/google-chrome-stable', // Path used in Railway
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
};

// ✅ Create WhatsApp client with safer Puppeteer options
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: puppeteerArgs
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR with WhatsApp linked devices');
});

client.on('ready', () => {
  console.log('WhatsApp connected');
});

client.on('disconnected', reason => {
  console.log('WhatsApp disconnected:', reason);
});

// ✅ Keep this line at the bottom of this section
client.initialize();



client.on('message', async msg => {
  try {
    const text = msg.body?.trim() || '';
    if (!text) return;

    // Ask OpenAI to extract intent using a plain chat approach
    // This uses a descriptive system message and expects the model to return
    // a JSON object. We keep it simple to avoid function call complexity.
    const system = `You are a Shopify assistant router. Read the user's message and return a single valid JSON object only. 
Return fields:
action one of update_price, create_discount, sales_summary, unknown
product_title if applicable
new_price if applicable as number
currency if applicable e.g. USD
discount_code if applicable
discount_type percentage or amount
discount_value number
start_date and end_date iso if provided
period for sales_summary like last_7_days or last_30_days

If you cannot determine the action return action as unknown.
Do not include any extra text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text }
      ],
      max_tokens: 400
    });

    const replyText = completion.choices?.[0]?.message?.content?.trim() || '';
    let args = {};
    try {
      args = JSON.parse(replyText);
    } catch (e) {
      // fallback if no valid JSON returned
      args = { action: 'unknown' };
    }

    // Route actions
    if (args.action === 'update_price') {
      if (!args.product_title || typeof args.new_price !== 'number') {
        await msg.reply("I need the product name and new price. Example. Update price of Blue Shirt to 499");
        return;
      }
      const res = MOCK_MODE
        ? mockUpdatePrice(args.product_title, args.new_price, args.currency)
        : await updateProductPriceByTitle(args.product_title, args.new_price);
      await msg.reply(res);
      return;
    }

    if (args.action === 'create_discount') {
      if (!args.discount_code || !args.discount_type || typeof args.discount_value !== 'number') {
        await msg.reply("I need a code and a discount. Example. Create discount code SAVE10 for 10 percent");
        return;
      }
      const res = MOCK_MODE
        ? mockCreateDiscountCode(args.discount_code, args.discount_type, args.discount_value, args.start_date, args.end_date)
        : await createDiscountCode(args.discount_code, args.discount_type, args.discount_value, args.start_date, args.end_date);
      await msg.reply(res);
      return;
    }

    if (args.action === 'sales_summary') {
      const period = args.period || 'last_7_days';
      const res = MOCK_MODE
        ? mockSalesSummary(period)
        : await salesSummary(period);
      await msg.reply(res);
      return;
    }

    // Simple keyword hints
    if (/price|cost/i.test(text)) {
      await msg.reply("Try this. Update price of Exact Product Title to 499");
      return;
    }
    if (/discount|coupon|code/i.test(text)) {
      await msg.reply("Try this. Create discount code SAVE10 for 10 percent");
      return;
    }
    if (/sales|revenue|summary|report/i.test(text)) {
      await msg.reply("Try this. Show sales summary for last 7 days");
      return;
    }

    await msg.reply("I can update product prices, create discounts, or show sales. Try one of those.");
  } catch (e) {
    console.error('Handler error', e);
    await msg.reply("Sorry something went wrong. Try again");
  }
});

// -------------- Shopify helpers --------------

async function shopify(path, method = 'GET', body) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-07/${path}`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    'Content-Type': 'application/json'
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify error ${res.status} ${text}`);
  }
  return res.json();
}

async function findProductByTitle(title) {
  if (MOCK_MODE) return mockFindProductByTitle(title);
  const data = await shopify(`products.json?title=${encodeURIComponent(title)}&limit=5`);
  return data.products?.[0] || null;
}

async function updateProductPriceByTitle(title, newPrice) {
  const product = await findProductByTitle(title);
  if (!product) return `Could not find a product named ${title}`;

  const variantId = product.variants?.[0]?.id;
  if (!variantId) return `No variants found for ${product.title}`;

  await shopify(`variants/${variantId}.json`, 'PUT', { variant: { id: variantId, price: newPrice } });
  return `Done. ${product.title} price is now ${newPrice}`;
}

async function createDiscountCode(code, type, value, startISO, endISO) {
  const ruleBody = {
    price_rule: {
      title: `Rule-${code}`,
      target_type: "line_item",
      target_selection: "all",
      allocation_method: "across",
      value_type: type === 'percentage' ? "percentage" : "fixed_amount",
      value: type === 'percentage' ? `-${value}` : `-${value}`,
      customer_selection: "all",
      starts_at: startISO || new Date().toISOString(),
      ends_at: endISO || null
    }
  };
  const rule = await shopify('price_rules.json', 'POST', ruleBody);
  const ruleId = rule.price_rule?.id;
  if (!ruleId) return "Could not create discount rule";

  await shopify(`price_rules/${ruleId}/discount_codes.json`, 'POST', { discount_code: { code } });
  return `Discount code ${code} created`;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function salesSummary(period) {
  let days = 7;
  if (/30/.test(period)) days = 30;
  const since = isoDaysAgo(days);
  const data = await shopify(`orders.json?status=any&created_at_min=${encodeURIComponent(since)}&limit=250`);
  const orders = data.orders || [];
  const total = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  const count = orders.length;
  return `Sales last ${days} days. Orders ${count}. Revenue ${total.toFixed(2)}`;
}

// -------------- Mock implementations --------------

function mockFindProductByTitle(title) {
  // pretend we have a product list
  const products = [
    { title: 'Blue Shirt', id: 1111, variants: [{ id: 1001, price: '399.00' }] },
    { title: 'Red Hoodie', id: 1112, variants: [{ id: 1002, price: '799.00' }] },
    { title: 'Green Cap', id: 1113, variants: [{ id: 1003, price: '199.00' }] }
  ];
  const exact = products.find(p => p.title.toLowerCase() === title.toLowerCase());
  if (exact) return exact;
  // fallback fuzzy
  return products.find(p => p.title.toLowerCase().includes(title.toLowerCase())) || null;
}

function mockUpdatePrice(productTitle, newPrice) {
  const p = mockFindProductByTitle(productTitle);
  if (!p) return `Could not find a product named ${productTitle}`;
  p.variants[0].price = String(newPrice);
  return `Done. ${p.title} price is now ${newPrice}`;
}

function mockCreateDiscountCode(code, type, value, startISO, endISO) {
  const now = new Date();
  const start = startISO || now.toISOString();
  const end = endISO || new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
  return `Mock created discount ${code}. Type ${type}. Value ${value}. Starts ${start}. Ends ${end}`;
}

function mockSalesSummary(period) {
  let days = 7;
  if (/30/.test(period)) days = 30;
  // generate some believable numbers
  const orders = Math.floor(Math.random() * 30) + 5;
  const revenue = (orders * (Math.random() * 100 + 50)).toFixed(2);
  return `Mock sales for last ${days} days. Orders ${orders}. Revenue ${revenue}`;
}

// Initialize
client.initialize();
