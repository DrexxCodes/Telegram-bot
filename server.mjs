import Fastify from 'fastify';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { generatePaymentLink } from './fund.mjs'; 

dotenv.config();

const fastify = Fastify();
await fastify.register(cors, {
  origin: true,
  credentials: true
});

// === Firebase Setup ===
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
});
const db = admin.firestore();

// === Telegram Setup ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const knownCommands = ['/start', '/viewTicket', '/help', '/profile', '/credits', '/fund', '/disconnect'];
const userStates = {}; // For tracking fund input stage
const serverStartTime = Date.now(); // Track server start time for uptime monitoring

// === Helper Functions ===
async function findUserByChatId(chatId) {
  try {
    const userSnap = await db.collection('users').where('telegramChatId', '==', String(chatId)).get();
    if (userSnap.empty) return null;
    return {
      id: userSnap.docs[0].id,
      data: userSnap.docs[0].data()
    };
  } catch (error) {
    console.error('Error finding user by chat ID:', error);
    return null;
  }
}

async function sendAuthRequiredMessage(chatId) {
  await sendMessage(chatId, '🔐 *Authentication Required*\n\nTo use this feature, you need to connect your Telegram account to your Spotix profile first.\n\n👆 Click the button below to go to your profile page and connect your account.', {
    inline_keyboard: [
      [
        { text: '🔗 Connect Account', url: 'https://spotix.com.ng/profile' }
      ],
      [
        { text: '❓ Help', callback_data: 'show_commands' }
      ]
    ]
  });
}

// === Webhook Handler ===
fastify.post('/webhook', async (request, reply) => {
  const body = request.body;
  const message = body.message;
  const callbackQuery = body.callback_query;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const username = message?.from?.username;
  const firstName = message?.from?.first_name;
  const lastName = message?.from?.last_name;

  // Handle /start command with potential connection token
  if (text?.startsWith('/start')) {
    const parts = text.split(' ');
    
    // First check if user is already connected
    const existingUser = await findUserByChatId(chatId);
    
    if (parts.length > 1) {
      // Connection token provided
      const connectionToken = parts[1];
      
      if (existingUser) {
        await sendMessage(chatId, `👋 Welcome back, ${existingUser.data.fullName || 'User'}!\n\nYour Telegram account is already connected to your Spotix profile.\n\nUse /help to see available commands.`);
        return reply.send({ status: 'ok' });
      }
      
      // Check if this is a valid connection token
      try {
        const tokenDoc = await db.collection('telegramTokens').doc(connectionToken).get();
        
        if (tokenDoc.exists) {
          const tokenData = tokenDoc.data();
          const userId = tokenData.uid;
          
          // Check if token is still valid (not expired)
          const now = new Date();
          const expiresAt = tokenData.expiresAt.toDate();
          
          if (expiresAt < now) {
            await sendMessage(chatId, '❌ Connection token has expired. Please generate a new one from your Spotix profile.\n\n🔗 Go to: https://spotix.com.ng/profile');
            return reply.send({ status: 'ok' });
          }
          
          // Check if token hasn't been used
          if (tokenData.used) {
            await sendMessage(chatId, '❌ This connection token has already been used. Please generate a new one from your Spotix profile.\n\n🔗 Go to: https://spotix.com.ng/profile');
            return reply.send({ status: 'ok' });
          }
          
          // Get user details from users collection
          const userDoc = await db.collection('users').doc(userId).get();
          if (!userDoc.exists) {
            await sendMessage(chatId, '❌ User account not found. Please try again.\n\n🔗 Go to: https://spotix.com.ng/profile');
            return reply.send({ status: 'ok' });
          }
          
          const userData = userDoc.data();
          
          // Show connection confirmation with user details
          await sendMessage(chatId, `🔗 *Connect to Spotix Account*\n\n👤 Name: ${userData.fullName || 'Not set'}\n📧 Email: ${userData.email}\n🆔 Username: ${userData.username || 'Not set'}\n\nWould you like to connect your Telegram account (@${username || 'unknown'}) to this Spotix profile?\n\n⚠️ By connecting, you agree to our Terms of Service and Privacy Policy.`, {
            inline_keyboard: [
              [
                { text: '✅ Connect Account', callback_data: `connect_${connectionToken}` },
                { text: '❌ Cancel', callback_data: 'cancel_connection' }
              ]
            ]
          });
          
          return reply.send({ status: 'ok' });
        } else {
          await sendMessage(chatId, '❌ Invalid connection token. Please generate a new one from your Spotix profile.\n\n🔗 Go to: https://spotix.com.ng/profile');
        }
      } catch (error) {
        console.error('Error checking connection token:', error);
        await sendMessage(chatId, '❌ Error processing connection. Please try again.\n\n🔗 Go to: https://spotix.com.ng/profile');
      }
    } else {
      // Regular start command - check if already connected
      if (existingUser) {
        await sendMessage(chatId, `👋 Welcome back, ${existingUser.data.fullName || 'User'}!\n\nYour Telegram account is already connected to your Spotix profile.\n\nUse /help to see available commands.`, {
          inline_keyboard: [
            [
              { text: '📘 Show Commands', callback_data: 'show_commands' },
              { text: '👤 Profile', callback_data: 'show_profile' }
            ]
          ]
        });
      } else {
        // Not connected - show welcome and connection instructions
        await sendMessage(chatId, '🎉 *Welcome to Spotix Bot!*\n\nTo access your account features, you need to connect your Telegram account through your Spotix profile page.\n\n🔗 Visit your profile page and click "Connect Telegram Bot" to get started.', {
          inline_keyboard: [
            [
              { text: '🔗 Go to Profile Page', url: 'https://spotix.com.ng/profile' }
            ],
            [
              { text: '📘 Show Commands', callback_data: 'show_commands' }
            ]
          ]
        });
      }
    }
  }

  else if (text === '/viewTicket') {
    const user = await findUserByChatId(chatId);
    
    if (!user) {
      await sendAuthRequiredMessage(chatId);
      return reply.send({ status: 'ok' });
    }

    await sendMessage(chatId, '⏳ Just a moment...');
    
    try {
      const ticketsSnap = await db.collection(`TicketHistory/${user.id}/tickets`).get();

      if (ticketsSnap.empty) {
        await sendMessage(chatId, '🎟 You have no tickets yet.\n\nVisit Spotix to book your first event!', {
          inline_keyboard: [
            [{ text: '🎫 Browse Events', url: 'https://spotix.com.ng' }]
          ]
        });
        return reply.send({ status: 'ok' });
      }

      for (const doc of ticketsSnap.docs) {
        const ticket = doc.data();
        const ticketId = ticket.ticketId || 'Unavailable';

        const ticketText = `🎟 *Event:* ${ticket.eventName}
📅 *Date:* ${ticket.eventDate}
📍 *Venue:* ${ticket.eventVenue}
🎫 *Type:* ${ticket.ticketType}
✅ *Verified:* ${ticket.verified ? 'Yes' : 'No'}
||🆔 Ticket ID: ${ticketId}||`;

        await sendMessage(chatId, ticketText, {
          inline_keyboard: [[{ text: 'Get QR Code', callback_data: `qr_${ticketId}` }]]
        });
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      await sendMessage(chatId, '❌ Error fetching your tickets. Please try again later.');
    }
  }

  else if (text === '/help' || callbackQuery?.data === 'show_commands') {
    const cbChatId = callbackQuery?.message?.chat?.id || chatId;
    await sendMessage(cbChatId, '📘 *Spotix Bot Commands:*\n\n' +
      '`/start` - Initialize the bot\n' +
      '`/viewTicket` - View your purchased tickets\n' +
      '`/profile` - View your user profile\n' +
      '`/credits` - View credits and project info\n' +
      '`/fund` - Fund your wallet\n' +
      '`/disconnect` - Disconnect your Telegram account\n' +
      '`/help` - Show this help message\n\n' +
      '💡 *Note:* Connect your account through your Spotix profile to access all features!\n\n' +
      'Thank you for choosing *Spotix*! 💜', {
      inline_keyboard: [
        [{ text: '🔗 Connect Account', url: 'https://spotix.com.ng/profile' }]
      ]
    });
  }

  else if (text === '/profile' || callbackQuery?.data === 'show_profile') {
    const cbChatId = callbackQuery?.message?.chat?.id || chatId;
    const user = await findUserByChatId(cbChatId);
    
    if (!user) {
      await sendAuthRequiredMessage(cbChatId);
      return reply.send({ status: 'ok' });
    }

    await sendMessage(cbChatId, '🔍 Just a moment...');
    
    const profileText = `👤 *Profile Details:*
🧑 Full Name: ${user.data.fullName || 'N/A'}
📧 Email: ${user.data.email || 'N/A'}
💬 Telegram: @${user.data.telegramUsername || 'N/A'}
||🆔 UID: ${user.id}||

Thank you for choosing *Spotix*! 💜`;
    
    await sendMessage(cbChatId, profileText, {
      inline_keyboard: [
        [
          { text: '🌐 View Full Profile', url: 'https://spotix.com.ng/profile' },
          { text: '🔌 Disconnect', callback_data: 'confirm_disconnect' }
        ]
      ]
    });
  }

  else if (text === '/credits') {
    await sendMessage(chatId, `🎖 *Spotix Bot Credits*:
👨‍💻 Dev: Drexx
🧪 Tester: David
💾 D.B.A: Alexis
📆 Prod Year: 2025

Thank you for choosing *Spotix*! 💜`);
  }

  else if (text === '/fund') {
    const user = await findUserByChatId(chatId);
    
    if (!user) {
      await sendAuthRequiredMessage(chatId);
      return reply.send({ status: 'ok' });
    }
    
    await sendMessage(chatId, '💰 How much would you like to fund your wallet? (Enter amount in Naira)');
    userStates[chatId] = { awaitingFundAmount: true };
  }

  else if (text === '/disconnect') {
    const user = await findUserByChatId(chatId);
    
    if (!user) {
      await sendMessage(chatId, '❌ Your Telegram account is not connected to any Spotix profile.');
      return reply.send({ status: 'ok' });
    }
    
    await sendMessage(chatId, `🔌 *Disconnect Telegram Account*\n\nAre you sure you want to disconnect your Telegram account from your Spotix profile?\n\n⚠️ You will lose access to all bot features until you reconnect.`, {
      inline_keyboard: [
        [
          { text: '✅ Yes, Disconnect', callback_data: 'confirm_disconnect' },
          { text: '❌ Cancel', callback_data: 'cancel_disconnect' }
        ]
      ]
    });
  }

  else if (userStates[chatId]?.awaitingFundAmount) {
    const user = await findUserByChatId(chatId);
    
    if (!user) {
      delete userStates[chatId];
      await sendAuthRequiredMessage(chatId);
      return reply.send({ status: 'ok' });
    }

    const amount = parseInt(text.trim());

    if (isNaN(amount) || amount <= 0) {
      await sendMessage(chatId, '⚠️ Please enter a valid amount.');
      return reply.send({ status: 'ok' });
    }

    delete userStates[chatId];

    await sendMessage(chatId, '🔎 Generating your payment link...');

    try {
      const paymentLink = await generatePaymentLink(user.data.email, amount, chatId);
      if (!paymentLink) {
        await sendMessage(chatId, '❌ Failed to create payment link. Try again later.');
      } else {
        await sendMessage(chatId, `✅ Please complete your payment:\n\n${paymentLink}`);
      }
    } catch (error) {
      console.error('Error generating payment link:', error);
      await sendMessage(chatId, '❌ Failed to create payment link. Try again later.');
    }
  }

  else if (text?.startsWith('/') && !knownCommands.includes(text)) {
    await sendMessage(chatId, `❌ Sorry, Spotix bot isn't programmed with that command.\nUse /help to see available commands.`);
  }

  // Handle callback queries
  if (callbackQuery) {
    const cbChatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data?.startsWith('connect_')) {
      const connectionToken = data.split('connect_')[1];
      
      try {
        const tokenDoc = await db.collection('telegramTokens').doc(connectionToken).get();
        
        if (tokenDoc.exists) {
          const tokenData = tokenDoc.data();
          const userId = tokenData.uid;
          
          // Check if token is still valid
          const now = new Date();
          const expiresAt = tokenData.expiresAt.toDate();
          
          if (expiresAt < now) {
            await sendMessage(cbChatId, '❌ Connection token has expired. Please try again.\n\n🔗 Go to: https://spotix.com.ng/profile');
            return reply.send({ status: 'ok' });
          }
          
          // Check if token hasn't been used
          if (tokenData.used) {
            await sendMessage(cbChatId, '❌ This connection token has already been used.');
            return reply.send({ status: 'ok' });
          }
          
          // Update user document with Telegram info
          await db.collection('users').doc(userId).update({
            telegramChatId: String(cbChatId),
            telegramUsername: username || '',
            telegramFirstName: firstName || '',
            telegramLastName: lastName || '',
            telegramConnected: true,
            telegramConnectedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Mark token as used instead of deleting it (for audit purposes)
          await db.collection('telegramTokens').doc(connectionToken).update({
            used: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            telegramChatId: String(cbChatId),
            telegramUsername: username || '',
            telegramFirstName: firstName || '',
            telegramLastName: lastName || ''
          });
          
          await sendMessage(cbChatId, `🎉 *Connection Successful!*\n\nYour Telegram account (@${username || 'unknown'}) has been successfully connected to your Spotix profile.\n\n✅ **Connected Details:**\n👤 Name: ${firstName || ''} ${lastName || ''}\n💬 Username: @${username || 'Not set'}\n🆔 Chat ID: ${cbChatId}\n\nYou can now use all bot features! Try \`/profile\` to see your connected account details.`, {
            inline_keyboard: [
              [
                { text: '👤 View Profile', callback_data: 'show_profile' },
                { text: '📘 Show Commands', callback_data: 'show_commands' }
              ]
            ]
          });
          
          console.log(`✅ Telegram account connected for user ${userId}:`, {
            telegramChatId: cbChatId,
            telegramUsername: username,
            telegramFirstName: firstName,
            telegramLastName: lastName
          });
        } else {
          await sendMessage(cbChatId, '❌ Invalid or expired connection token.\n\n🔗 Go to: https://spotix.com.ng/profile');
        }
      } catch (error) {
        console.error('Error connecting account:', error);
        await sendMessage(cbChatId, '❌ Failed to connect account. Please try again.\n\n🔗 Go to: https://spotix.com.ng/profile');
      }
    }
    
    else if (data === 'cancel_connection') {
      await sendMessage(cbChatId, '❌ Connection cancelled. You can try connecting again anytime from your Spotix profile.\n\n🔗 Go to: https://spotix.com.ng/profile');
    }
    
    else if (data === 'confirm_disconnect') {
      const user = await findUserByChatId(cbChatId);
      
      if (!user) {
        await sendMessage(cbChatId, '❌ Your account is not connected.');
        return reply.send({ status: 'ok' });
      }
      
      try {
        // Remove Telegram data from user document
        await db.collection('users').doc(user.id).update({
          telegramConnected: false,
          telegramChatId: admin.firestore.FieldValue.delete(),
          telegramUsername: admin.firestore.FieldValue.delete(),
          telegramFirstName: admin.firestore.FieldValue.delete(),
          telegramLastName: admin.firestore.FieldValue.delete(),
          telegramConnectedAt: admin.firestore.FieldValue.delete()
        });
        
        await sendMessage(cbChatId, `✅ *Disconnected Successfully*\n\nYour Telegram account has been disconnected from your Spotix profile.\n\nTo reconnect, visit your profile page and click "Connect Telegram Bot".`, {
          inline_keyboard: [
            [{ text: '🔗 Reconnect', url: 'https://spotix.com.ng/profile' }]
          ]
        });
        
        console.log(`🔌 Telegram account disconnected for user ${user.id}`);
      } catch (error) {
        console.error('Error disconnecting account:', error);
        await sendMessage(cbChatId, '❌ Failed to disconnect account. Please try again.');
      }
    }
    
    else if (data === 'cancel_disconnect') {
      await sendMessage(cbChatId, '✅ Disconnect cancelled. Your account remains connected.');
    }
    
    else if (data?.startsWith('qr_')) {
      const user = await findUserByChatId(cbChatId);
      
      if (!user) {
        await sendAuthRequiredMessage(cbChatId);
        return reply.send({ status: 'ok' });
      }

      const ticketId = data.split('qr_')[1];

      if (!ticketId || ticketId === 'Unavailable') {
        await sendMessage(cbChatId, '❌ Ticket ID is missing.');
        return reply.send({ status: 'ok' });
      }

      await sendMessage(cbChatId, '🎨 Generating QR code...');
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketId)}&size=300x300&color=107-47-165`;

      try {
        await fetch(`${TELEGRAM_API}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: cbChatId, photo: qrUrl })
        });
      } catch (error) {
        console.error('Error sending QR code:', error);
        await sendMessage(cbChatId, '❌ Failed to generate QR code. Please try again.');
      }
    }
  }

  reply.send({ status: 'ok' });
});

// === Fund Payment Webhook Handler ===
fastify.post('/paystack-webhook', async (request, reply) => {
  const { event, data } = request.body;

  if (event === 'charge.success') {
    const { metadata, amount, reference, customer, paid_at } = data;
    const telegramChatId = metadata.telegramID;

    const user = await findUserByChatId(telegramChatId);
    if (!user) return reply.send({ received: true });

    const fundDoc = {
      amount: amount / 100,
      date: new Date(paid_at).toLocaleDateString(),
      time: new Date(paid_at).toLocaleTimeString(),
      reference,
    };

    try {
      await db.collection('users').doc(user.id).collection('fund').add(fundDoc);
      console.log(`💰 Fund record saved for ${user.id}`);
      
      // Notify user of successful payment
      await sendMessage(telegramChatId, `✅ *Payment Successful!*\n\n💰 Amount: ₦${fundDoc.amount}\n🆔 Reference: ${reference}\n📅 Date: ${fundDoc.date} ${fundDoc.time}\n\nYour wallet has been funded successfully!`);
    } catch (error) {
      console.error('Error saving fund record:', error);
    }

    return reply.send({ received: true });
  }

  reply.send({ received: true });
});

// === API endpoint to create connection tokens ===
fastify.post('/api/telegram/create-token', async (request, reply) => {
  try {
    const { userId, userEmail } = request.body;
    
    if (!userId || !userEmail) {
      return reply.status(400).send({ error: 'Missing userId or userEmail' });
    }
    
    // Generate unique token
    const token = `spotix_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Store token with 10 minute expiration
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000)); // 10 minutes
    
    await db.collection('telegramTokens').doc(token).set({
      uid: userId,
      userEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      used: false
    });
    
    reply.send({ token });
  } catch (error) {
    console.error('Error creating connection token:', error);
    reply.status(500).send({ error: 'Failed to create connection token' });
  }
});

// === API endpoint to check connection status ===
fastify.get('/api/telegram/connection-status/:userId', async (request, reply) => {
  try {
    const { userId } = request.params;
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    reply.send({
      connected: userData.telegramConnected || false,
      telegramUsername: userData.telegramUsername || null,
      telegramFirstName: userData.telegramFirstName || null,
      telegramLastName: userData.telegramLastName || null,
      telegramChatId: userData.telegramChatId || null,
      connectedAt: userData.telegramConnectedAt || null
    });
  } catch (error) {
    console.error('Error checking connection status:', error);
    reply.status(500).send({ error: 'Failed to check connection status' });
  }
});

// === Ping Route for Cold Start Prevention ===
fastify.get('/ping', async (request, reply) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  
  return reply.code(200).send({
    status: 'alive',
    service: 'spotix-telegram-bot',
    timestamp: new Date().toISOString(),
    uptime: `${uptime}s`,
    version: '1.0.0'
  });
});

// === Health Check Route ===
fastify.get('/health', async (request, reply) => {
  try {
    // Quick health check - verify Firebase connection
    const healthCheck = await db.collection('_health').limit(1).get();
    
    return reply.code(200).send({
      status: 'healthy',
      service: 'spotix-telegram-bot',
      firebase: 'connected',
      telegram: BOT_TOKEN ? 'configured' : 'not-configured',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      service: 'spotix-telegram-bot',
      firebase: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// === Root Route ===
fastify.get('/', async (request, reply) => {
  return reply.code(200).send({
    message: 'Spotix Telegram Bot Server',
    status: 'running',
    endpoints: [
      'GET /ping - Keep-alive endpoint',
      'GET /health - Health check',
      'POST /webhook - Telegram webhook',
      'POST /paystack-webhook - Payment webhook',
      'POST /api/telegram/create-token - Create connection token',
      'GET /api/telegram/connection-status/:userId - Check connection status'
    ],
    timestamp: new Date().toISOString()
  });
});

// === Send Telegram Messages ===
async function sendMessage(chatId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  };

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// === Start Server ===
const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 Fastify server running at ${address}`);
});
