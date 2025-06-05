// fund.mjs

export async function generatePaymentLink(email, amount, telegramChatId, userId) {
  try {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amount * 100, // Paystack expects amount in kobo
        metadata: { 
          telegramID: telegramChatId,
          userId: userId,
          source: 'telegram_bot',
          purpose: 'wallet_funding'
        },
        callback_url: `https://t.me/TristarAI_bot?start=payment_${telegramChatId}`,
        cancel_url: `https://t.me/TristarAI_bot?start=cancelled_${telegramChatId}`,
      }),
    });

    const data = await response.json();

    if (data.status) return data.data.authorization_url;
    return null;
  } catch (error) {
    console.error('Failed to generate payment link:', error);
    return null;
  }
}
