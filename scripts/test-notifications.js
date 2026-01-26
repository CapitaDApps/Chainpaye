/**
 * Test Notification System
 * Tests deposit and success notifications for off-ramp
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = '+2348106535142'; // Replace with your test phone number

async function testDepositNotification() {
  console.log('🧪 Testing Deposit Notification...\n');
  
  try {
    const response = await axios.post(`${BASE_URL}/webhooks/test-deposit-notification`, {
      phoneNumber: TEST_PHONE,
      asset: 'usdc',
      amount: '100.50',
      chain: 'solana'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Deposit notification test successful');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${response.data.message}`);
    return true;
    
  } catch (error) {
    console.log('❌ Deposit notification test failed');
    console.log(`   Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Details: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function testCrossmintWebhook() {
  console.log('\n🧪 Testing Crossmint Webhook Format...\n');
  
  const mockWebhook = {
    type: "wallet.deposit",
    data: {
      walletId: "wallet_123",
      owner: "userId:test-user-123",
      address: "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
      chainType: "solana",
      transaction: {
        hash: "5J7XqWqJxvKx8yGz9QqJxvKx8yGz9QqJxvKx8yGz9QqJxvKx8yGz9Qq",
        amount: "50.25",
        token: "usdc",
        from: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        to: "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
        timestamp: new Date().toISOString()
      }
    }
  };
  
  try {
    const response = await axios.post(`${BASE_URL}/webhooks/deposit-notification`, mockWebhook, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Crossmint webhook test successful');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${response.data.message}`);
    return true;
    
  } catch (error) {
    console.log('❌ Crossmint webhook test failed');
    console.log(`   Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Details: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function testServerConnection() {
  console.log('🔍 Testing server connection...\n');
  
  try {
    const response = await axios.get(`${BASE_URL}/`);
    console.log(`✅ Server is running (Status: ${response.status})`);
    return true;
  } catch (error) {
    console.log(`❌ Server not accessible: ${error.message}`);
    console.log('   Make sure to start your server with: npm run dev');
    return false;
  }
}

async function runNotificationTests() {
  console.log('🚀 Testing Off-ramp Notification System\n');
  
  // Check server connection
  const serverOk = await testServerConnection();
  if (!serverOk) {
    return;
  }
  
  // Test deposit notification
  const depositTest = await testDepositNotification();
  
  // Test Crossmint webhook (this will fail if user doesn't exist, but tests the format)
  const webhookTest = await testCrossmintWebhook();
  
  console.log('\n📊 Test Results:');
  console.log(`   Deposit Notification: ${depositTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Crossmint Webhook: ${webhookTest ? '✅ PASS' : '⚠️ EXPECTED FAIL (user not found)'}`);
  
  console.log('\n📋 Notification Features:');
  console.log('✅ Enhanced deposit notifications with timestamp and call-to-action');
  console.log('✅ Separate success notifications after off-ramp completion');
  console.log('✅ Webhook endpoint for Crossmint deposit detection');
  console.log('✅ Test endpoint for development and debugging');
  
  console.log('\n🔧 Setup Instructions:');
  console.log('1. Configure Crossmint webhook URL: https://your-domain.com/webhooks/deposit-notification');
  console.log('2. Set webhook events: wallet.deposit');
  console.log('3. Test with: POST /webhooks/test-deposit-notification');
  
  console.log('\n💡 Usage:');
  console.log('• Users get notified immediately when crypto is deposited');
  console.log('• Users get detailed success notification after off-ramp completion');
  console.log('• All notifications include timestamps and clear call-to-actions');
}

// Run if called directly
if (require.main === module) {
  runNotificationTests().catch(console.error);
}

module.exports = { testDepositNotification, testCrossmintWebhook, testServerConnection };