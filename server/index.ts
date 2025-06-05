import Fastify from 'fastify';
import fetch from 'node-fetch';

const fastify = Fastify();
const token = 'YOUR_BOT_TOKEN'; // Replace with your bot's token
const baseUrl = `https://api.telegram.org/bot${token}`;

fastify.post('/webhook', async (request, reply) => {
    const { message } = request.body as { message?: { chat: { id: number }, text: string } };
    if (!message) return reply.status(400).send({ error: 'Invalid message' });

    const { chat, text } = message;
    
    if (text === '/start') {
        // Send "All is working well" when the user presses 'Start'
        await sendMessage(chat.id, "All is working well");
        
        // Send the inline keyboard with the "Credits" button
        const keyboard = {
            inline_keyboard: [
                [{ text: "Credits", callback_data: "credits" }]
            ]
        };
        
        await sendMessage(chat.id, "Welcome! Click the button below:", keyboard);
    } else if (text === 'credits') {
        // Handle the "credits" request when user types 'credits'
        await sendMessage(chat.id, "Drexx made this");
    }
    
    return reply.status(200).send();
});

// Function to send a message to a chat
const sendMessage = async (chatId: number, text: string, replyMarkup?: object) => {
    const payload = {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup
    };
    await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
};

// Webhook endpoint to receive updates
fastify.post('/webhook', async (request, reply) => {
    const { message } = request.body as { message?: { chat: { id: number }, text: string } };
    if (message?.text === '/start') {
        await sendMessage(message.chat.id, 'All is working well!');
    }
    return { status: 'ok' };
});

// Start the Fastify server
fastify.listen({ port: 3000, host: '0.0.0.0' })
    .then((address) => {
        console.log(`Server listening at ${address}`);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
