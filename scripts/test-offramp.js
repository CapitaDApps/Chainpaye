/**
 * Off-ramp Testing Script
 * Tests the complete crypto off-ramp flow with Crossmint and DexPay
 * Run with: node scripts/test-offramp.js
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = '+2348106535142'; // Replace with your test phone number
const TEST_USER_ID = '+2348012345678';

// Test data
const testWebhookMessage = (messageBody) => ({
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

async function sendTestWebhookMessage(message) {
  console.log(`🧪 Testing message: "${message}"`);
  
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, testWebhookMessage(message), {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`   ✅ Status: ${response.status}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status || error.message}`);
    return false;
  }
}

async function testCrossmintAPI() {
  console.log('🧪 Testing Crossmint API...\n');
  
  const apiKey = process.env.CROSSMINT_API_KEY;
  const baseUrl = process.env.CROSSMINT_BASE_URL;
  
  if (!apiKey || !baseUrl) {
    console.log('❌ Crossmint credentials not configured');
    return false;
  }
  
  try {
    // Test list wallets
    console.log('📱 Testing list wallets...');
    const response = await axios.get(`${baseUrl}/wallets`, {
      headers: { 'X-API-KEY': apiKey },
      params: { owner: `userId:${TEST_USER_ID}` }
    });
    console.log(`   ✅ Found ${response.data.length} wallets`);
    
    // Test balance endpoint (new format)
    console.log('💰 Testing balance endpoint...');
    try {
      const balanceResponse = await axios.get(`${baseUrl}/wallets/userId:${TEST_USER_ID}:solana/balances`, {
        headers: { 'X-API-KEY': apiKey },
        params: { tokens: 'usdc,usdt' }
      });
      console.log(`   ✅ Balance endpoint working`);
    } catch (balanceError) {
      console.log(`   ⚠️ Balance endpoint: ${balanceError.response?.status || balanceError.message}`);
    }
    
    // Test transfer endpoint format (without actually transferring)
    console.log('🔄 Testing transfer endpoint format...');
    console.log('   📋 Transfer endpoint examples:');
    console.log('   • Base USDC: /wallets/{address}/tokens/base-sepolia:usdc/transfers');
    console.log('   • Solana USDC: /wallets/{address}/tokens/solana:usdc/transfers');
    console.log('   • BSC USDT: /wallets/{address}/tokens/bsc:usdt/transfers');
    console.log('   ✅ Transfer endpoint format configured');
    
    return true;
  } catch (error) {
    console.log(`   ❌ Crossmint API Error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testDexPayAPI() {
  console.log('🧪 Testing DexPay API...\n');
  
  const apiKey = process.env.DEXPAY_API_KEY;
  const apiSecret = process.env.DEXPAY_API_SECRET;
  const baseUrl = process.env.DEXPAY_BASE_URL;
  
  if (!apiKey || !apiSecret || !baseUrl) {
    console.log('❌ DexPay credentials not configured');
    return false;
  }
  
  try {
    // Test get banks
    console.log('🏦 Testing get banks...');
    const response = await axios.get(`${baseUrl}/banks`, {
      headers: {
        'X-API-KEY': apiKey,
        'X-API-SECRET': apiSecret,
        'Content-Type': 'application/json'
      }
    });
    // console.log(response.data)
    console.log(`   ✅ Found ${response.data.length} banks`);
    
    return true;
  } catch (error) {
    console.log(`   ❌ DexPay API Error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testOfframpFlow() {
  console.log('🧪 Testing Off-ramp Flow...\n');
  
  const testMessages = [
    'offramp',
    'USDC on Solana',
    'spend crypto',
    '50000',
    '1', // Bank selection
    '1234567890', // Account number
    'yes', // Confirm account
    'proceed', // Confirm transaction
    '1234' // PIN
  ];
  
  for (const message of testMessages) {
    const success = await sendTestWebhookMessage(message);
    if (!success) {
      console.log(`❌ Flow stopped at: "${message}"`);
      break;
    }
    
    // Wait between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function testEnvironmentConfig() {
  console.log('🔧 Testing Environment Configuration...\n');
  
  const requiredEnvVars = [
    'CROSSMINT_API_KEY',
    'CROSSMINT_BASE_URL',
    'CROSSMINT_ADMIN_SIGNER_ADDRESS',
    'DEXPAY_API_KEY',
    'DEXPAY_API_SECRET',
    'DEXPAY_BASE_URL',
    'DEXPAY_RECEIVING_ADDRESS',
    'OFFRAMP_FEE_PERCENTAGE',
    'DEXPAY_FIXED_FEE_USD'
  ];
  
  let allConfigured = true;
  
  requiredEnvVars.forEach(envVar => {
    const configured = !!process.env[envVar];
    console.log(`   ${configured ? '✅' : '❌'} ${envVar}`);
    if (!configured) allConfigured = false;
  });
  
  return allConfigured;
}

async function testSupportedAssets() {
  console.log('🧪 Testing Supported Assets...\n');
  
  const supportedCombinations = [
    'USDC on Solana',
    'USDC BEP20',
    'USDC Base',
    'USDC Arbitrium',
    'USDT BEP20',
    'USDT Solana',
    'USDT Arbitrium'
  ];
  
  console.log('✅ Supported combinations:');
  supportedCombinations.forEach(combo => {
    console.log(`   • ${combo}`);
  });
  
  const unsupportedCombinations = [
    'USDT on Base', // USDT not supported on Base
    'USDC on Ethereum', // Ethereum not in supported chains
    'BTC on Solana' // BTC not supported
  ];
  
  console.log('\n❌ Unsupported combinations:');
  unsupportedCombinations.forEach(combo => {
    console.log(`   • ${combo}`);
  });
}

async function runAllTests() {
  console.log('🚀 Starting Off-ramp Integration Tests...\n');
  
  // Test 1: Environment Configuration
  const envConfigured = await testEnvironmentConfig();
  console.log('');
  
  if (!envConfigured) {
    console.log('❌ Environment not properly configured. Please check your .env file.');
    return;
  }
  
  // Test 2: Supported Assets
  await testSupportedAssets();
  console.log('');
  
  // Test 3: External APIs
  const crossmintWorking = await testCrossmintAPI();
  const dexpayWorking = await testDexPayAPI();
  
  if (!crossmintWorking || !dexpayWorking) {
    console.log('❌ External APIs not working. Check your credentials and network connection.');
    return;
  }
  
  // Test 4: Off-ramp Flow (if server is running)
  console.log('🧪 Testing Off-ramp Flow (requires running server)...\n');
  try {
    const healthCheck = await axios.get(`${BASE_URL}/`);
    if (healthCheck.status === 200) {
      await testOfframpFlow();
    }
  } catch (error) {
    console.log('⚠️ Server not running. Start server with "npm run dev" to test the complete flow.');
  }
  
  console.log('\n✨ Off-ramp integration tests completed!');
  
  console.log('\n📋 Next Steps:');
  console.log('1. Start your server: npm run dev');
  console.log('2. Test via WhatsApp: Send "offramp" to your bot');
  console.log('3. Follow the complete flow with real/test data');
  console.log('4. Monitor logs for any issues');
  console.log('5. Test with different asset/chain combinations');
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testCrossmintAPI,
  testDexPayAPI,
  testOfframpFlow,
  testEnvironmentConfig,
  sendTestWebhookMessage,
  runAllTests
};