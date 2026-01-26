/**
 * Manual Off-ramp Testing Script
 * Step-by-step testing for off-ramp functionality
 * Run with: node scripts/manual-test-offramp.js
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = '+2348106535142'; // Replace with your test phone number

// Create webhook message format
const createWebhookMessage = (messageBody) => ({
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'test-msg-' + Date.now(),
          from: TEST_PHONE.replace('+', ''),
          type: 'text',
          text: {
            body: messageBody
          }
        }],
        contacts: [{
          wa_id: TEST_PHONE.replace('+', ''),
          profile: {
            name: 'Test User'
          }
        }]
      }
    }]
  }]
});

async function sendMessage(message) {
  console.log(`\n📤 Sending: "${message}"`);
  
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, createWebhookMessage(message), {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`✅ Response: ${response.status}`);
    return true;
  } catch (error) {
    console.log(`❌ Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Details: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function testServerConnection() {
  console.log('🔍 Testing server connection...');
  
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

async function testEnvironment() {
  console.log('\n🔧 Checking environment configuration...');
  
  const required = [
    'CROSSMINT_API_KEY',
    'CROSSMINT_BASE_URL', 
    'DEXPAY_API_KEY',
    'DEXPAY_API_SECRET',
    'DEXPAY_BASE_URL'
  ];
  
  let allGood = true;
  required.forEach(key => {
    const exists = !!process.env[key];
    console.log(`   ${exists ? '✅' : '❌'} ${key}`);
    if (!exists) allGood = false;
  });
  
  return allGood;
}

async function runManualTest() {
  console.log('🚀 Manual Off-ramp Testing\n');
  
  // Check environment
  const envOk = await testEnvironment();
  if (!envOk) {
    console.log('\n❌ Environment not configured properly');
    return;
  }
  
  // Check server
  const serverOk = await testServerConnection();
  if (!serverOk) {
    return;
  }
  
  console.log('\n🧪 Starting manual test flow...');
  console.log('📱 Test phone number:', TEST_PHONE);
  
  // Test messages in sequence
  const testFlow = [
    {
      message: 'offramp',
      description: 'Start off-ramp flow',
      expected: 'Should show wallets and supported assets'
    },
    {
      message: 'USDC on Solana',
      description: 'Select asset and chain',
      expected: 'Should create/show wallet and deposit instructions'
    },
    {
      message: 'spend crypto',
      description: 'Start spend crypto flow',
      expected: 'Should ask for NGN amount'
    },
    {
      message: '50000',
      description: 'Enter withdrawal amount',
      expected: 'Should show bank selection'
    },
    {
      message: '1',
      description: 'Select first bank',
      expected: 'Should ask for account number'
    },
    {
      message: '1234567890',
      description: 'Enter account number',
      expected: 'Should resolve account details'
    },
    {
      message: 'yes',
      description: 'Confirm account details',
      expected: 'Should generate quote and show fees'
    },
    {
      message: 'proceed',
      description: 'Confirm transaction',
      expected: 'Should ask for PIN'
    },
    {
      message: '1234',
      description: 'Enter PIN',
      expected: 'Should process transaction (may fail in sandbox)'
    }
  ];
  
  for (let i = 0; i < testFlow.length; i++) {
    const step = testFlow[i];
    console.log(`\n--- Step ${i + 1}: ${step.description} ---`);
    console.log(`Expected: ${step.expected}`);
    
    const success = await sendMessage(step.message);
    
    if (!success) {
      console.log(`❌ Test failed at step ${i + 1}`);
      break;
    }
    
    // Wait between steps
    console.log('⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✨ Manual test completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Check your WhatsApp for responses');
  console.log('2. Verify each step worked as expected');
  console.log('3. Test error scenarios (invalid amounts, unsupported assets)');
  console.log('4. Monitor server logs for any issues');
}

// Run if called directly
if (require.main === module) {
  runManualTest().catch(console.error);
}

module.exports = { sendMessage, testServerConnection, testEnvironment };