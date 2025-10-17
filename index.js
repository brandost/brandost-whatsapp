import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import pkg from 'whatsapp-web.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const { Client, LocalAuth } = pkg;
const execAsync = promisify(exec);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MOCK_MODE = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';

const { stdout: chromiumPath } = await execAsync('which chromium');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: chromiumPath.trim(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan this QR using WhatsApp → Linked Devices → Link a device');
});

client.on('ready', () => {
  console.log('✅ WhatsApp connected. Bot is live!');
});

client.on('message', async msg => {
  try {
    const text = msg.body?.trim() || '';
    if (!text) return;

    const systemPrompt = `You are Brandost, an ecommerce assistant that helps manage a Shopify store.
Understand user requests like updating product prices, creating discounts, or checking sales.
Always respond with JSON like:
{
  "action": "update_price | create_discount | sales_summary | unknown",
  "product": "string or null",
  "new_price": "number or null",
  "discount_code": "string or null",
  "discount_value": "number or null"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      max_tokens: 200
    });

    const response = completion.choices?.[0]?.message?.content;
    let intent = {};
    try { intent = JSON.parse(response); } catch { intent = { action: 'unknown' }; }

    if (intent.action === 'update_price') {
      await msg.reply(`✅ Mock: Price for ${intent.product || 'product'} updated to ${intent.new_price || 'unknown'} successfully.`);
    } else if (intent.action === 'create_discount') {
      await msg.reply(`🎉 Mock: Discount code ${intent.discount_code || 'CODE10'} created for ${intent.discount_value || 10}% off.`);
    } else if (intent.action === 'sales_summary') {
      const mockSales = (Math.random() * 5000 + 2000).toFixed(2);
      await msg.reply(`📊 Mock: Total sales last 7 days: $${mockSales}.`);
    } else {
      await msg.reply("I'm ready to help with product updates, discounts, or sales reports. Try something like 'change price of blue t-shirt to 25'.");
    }

  } catch (err) {
    console.error('Error:', err);
    await msg.reply('⚠️ Something went wrong, please try again.');
  }
});

client.initialize();
