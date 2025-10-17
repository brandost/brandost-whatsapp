# Brandost WhatsApp Bot

## Overview
This is a WhatsApp bot that uses OpenAI to act as an ecommerce assistant for managing a Shopify store. The bot can understand natural language requests and perform actions like updating product prices, creating discounts, and generating sales summaries.

## Current State
- **Status**: Running and ready to use
- **Framework**: Node.js with WhatsApp Web.js
- **AI Model**: OpenAI (gpt-4o-mini)
- **Features**: Product price updates, discount creation, sales summaries (mock mode)

## Project Structure
- `index.js` - Main bot application
- `package.json` - Node.js dependencies

## Dependencies
- **whatsapp-web.js**: WhatsApp Web API integration
- **openai**: OpenAI API client
- **qrcode-terminal**: QR code generation for WhatsApp authentication
- **chromium** (system): Required for Puppeteer/WhatsApp Web automation

## Environment Variables
- `OPENAI_API_KEY`: Your OpenAI API key (configured in Replit Secrets)
- `MOCK_MODE`: Set to 'true' to enable mock responses (optional)

## How to Use
1. The bot is already running - check the console for the QR code
2. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
3. Scan the QR code displayed in the console
4. Once connected, you'll see "✅ WhatsApp connected. Bot is live!"
5. Send messages to interact with the bot

## Example Commands
- "Change price of blue t-shirt to 25"
- "Create a discount code for 10% off"
- "Show me sales summary for last 7 days"

## Technical Setup (Replit-specific)
- Uses system Chromium instead of Puppeteer's bundled version
- Configured with necessary Chrome flags for headless operation
- LocalAuth strategy for persistent WhatsApp sessions

## Recent Changes
- October 17, 2025: Initial setup on Replit
  - Installed Node.js and dependencies
  - Configured system Chromium for WhatsApp Web.js
  - Set up OpenAI integration with API key
  - Bot successfully running and displaying QR code
