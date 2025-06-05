import admin from 'firebase-admin';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';   
import mailjet from 'node-mailjet';

// Initialize Mailjet client
const mailjetClient = mailjet.apiConnect(
  process.env.MJ_APIKEY_PUBLIC,
  process.env.MJ_APIKEY_PRIVATE,
  {
    config: {},
    options: {}
  }
);

const db = admin.firestore();

// Generate transaction ID with the same pattern as wallet-fund component
const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `wallet-fund-${timestamp}-${random}`;
};

// Send transaction email notification
async function sendTransactionEmail(userEmail, userName, transactionData) {
  try {
    const request = mailjetClient
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [
          {
            From: {
              Email: "iwss@spotix.com.ng",
              Name: "Spotix IWSS"
            },
            To: [
              {
                Email: userEmail,
                Name: userName || "User"
              }
            ],
            TemplateID: 7049109,
            TemplateLanguage: true,
            Subject: "A transaction occurred on your account",
            Variables: {
              year: "2025",
              status: transactionData.status,
              tag: "credit",
              tx_name: "Wallet Funding",
              amount: transactionData.amount.toString(),
              tx_id: transactionData.transactionId,
              tx_date: transactionData.transactionDate,
              username: userName || "User"
            }
          }
        ]
      });

    const result = await request;
    console.log('✅ Transaction email sent successfully:', result.body);
    return true;
  } catch (error) {
    console.error('❌ Error sending transaction email:', error.statusCode || error.message);
    return false;
  }
}

// Verify Paystack transaction
export async function verifyTransaction(reference) {
  try {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (data.status && data.data.status === 'success') {
      return {
        success: true,
        data: data.data
      };
    }
    
    return {
      success: false,
      message: data.message || 'Transaction verification failed'
    };
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return {
      success: false,
      message: 'Failed to verify transaction'
    };
  }
}

// Process successful wallet funding
export async function processWalletFunding(transactionData, telegramChatId) {
  try {
    const { amount, reference, customer, paid_at, metadata } = transactionData;
    const fundAmount = amount / 100; // Convert from kobo to naira
    
    // Find user by telegram chat ID
    const telegramDoc = await db.collection('TelegramID').doc(String(telegramChatId)).get();
    
    if (!telegramDoc.exists) {
      throw new Error('User not found in TelegramID collection');
    }
    
    const telegramData = telegramDoc.data();
    const userId = telegramData.uid;
    
    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error('User not found in users collection');
    }
    
    const userData = userDoc.data();
    
    // Generate transaction details
    const transactionId = generateTransactionId();
    const now = new Date(paid_at);
    const transactionDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const transactionTime = now.toLocaleTimeString();
    
    // Get current wallet balance
    const currentWalletBalance = userData.wallet || 0;
    const newWalletBalance = currentWalletBalance + fundAmount;
    
    // Create wallet-pay entry
    await db.collection('users').doc(userId).collection('wallet-pay').add({
      transactionId,
      transactionDate,
      transactionTime,
      tx_name: "Wallet Funding",
      amount: fundAmount,
      tag: "credit",
      status: "Successful",
      reference: reference,
      paystackReference: reference,
      telegramChatId: String(telegramChatId),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      previousBalance: currentWalletBalance,
      newBalance: newWalletBalance,
      userEmail: userData.email,
      userFullName: userData.fullName,
      paymentMethod: "Paystack",
      source: "Telegram Bot"
    });
    
    // Update user's wallet balance
    await db.collection('users').doc(userId).update({
      wallet: newWalletBalance
    });
    
    // Send transaction email
    try {
      await sendTransactionEmail(
        userData.email,
        userData.fullName,
        {
          status: "Successful",
          amount: fundAmount,
          transactionId: transactionId,
          transactionDate: transactionDate
        }
      );
      console.log(`📧 Transaction email sent to ${userData.email}`);
    } catch (emailError) {
      console.error('Email sending failed, but transaction was processed:', emailError);
    }
    
    console.log(`💰 Wallet funded successfully for user ${userId}: ₦${fundAmount}`);
    
    return {
      success: true,
      transactionId,
      amount: fundAmount,
      newBalance: newWalletBalance,
      userFullName: userData.fullName,
      userEmail: userData.email
    };
    
  } catch (error) {
    console.error('Error processing wallet funding:', error);
    throw error;
  }
}

// Handle transaction cancellation
export async function handleTransactionCancellation(telegramChatId, reference) {
  try {
    // Find user by telegram chat ID
    const telegramDoc = await db.collection('TelegramID').doc(String(telegramChatId)).get();
    
    if (!telegramDoc.exists) {
      console.log('User not found for cancelled transaction');
      return;
    }
    
    const telegramData = telegramDoc.data();
    const userId = telegramData.uid;
    
    // Log the cancellation (optional)
    await db.collection('users').doc(userId).collection('wallet-pay').add({
      transactionId: `cancelled-${Date.now()}`,
      transactionDate: new Date().toLocaleDateString(),
      transactionTime: new Date().toLocaleTimeString(),
      tx_name: "Wallet Funding",
      amount: 0,
      tag: "cancelled",
      status: "Cancelled",
      reference: reference || 'N/A',
      telegramChatId: String(telegramChatId),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "Telegram Bot",
      note: "Transaction was cancelled by user"
    });
    
    console.log(`❌ Transaction cancelled for user ${userId}`);
    
    return {
      success: true,
      message: 'Transaction cancellation logged'
    };
    
  } catch (error) { 
    console.error('Error handling transaction cancellation:', error);
    return {
      success: false,
      message: 'Failed to log transaction cancellation'
    };
  }
}
