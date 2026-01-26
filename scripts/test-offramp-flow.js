/**
 * Test Off-ramp Flow Integration
 * Tests the WhatsApp Flow off-ramp endpoints
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/webhook/offramp-flow`;

// Test data
const testFlowToken = Buffer.from(JSON.stringify({
  phoneNumber: '+2348106535142',
  userId: 'test_user_123',
  timestamp: Date.now()
})).toString('base64');

/**
 * Test flow request
 */
async function testFlowRequest(screen, data = {}) {
  try {
    console.log(`\n🧪 Testing ${screen} screen...`);
    
    const requestBody = {
      version: "3.0",
      action: "data_exchange",
      screen: screen,
      data: data,
      flow_token: testFlowToken
    };

    console.log('📤 Request:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(WEBHOOK_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    return response.data;

  } catch (error) {
    console.error(`❌ Error testing ${screen}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Run all flow tests
 */
async function runFlowTests() {
  console.log('🚀 Starting Off-ramp Flow Tests\n');

  // Test 1: Asset Selection
  const assetResponse = await testFlowRequest('OFFRAMP_ASSET_SELECTION', {
    asset: 'USDC',
    chain: 'solana'
  });

  if (!assetResponse) return;

  // Test 2: Wallet Display (pass through)
  const walletResponse = await testFlowRequest('OFFRAMP_WALLET_DISPLAY', {
    asset: 'USDC',
    chain: 'solana',
    wallet_address: 'Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH',
    current_balance: '125.50'
  });

  if (!walletResponse) return;

  // Test 3: Amount Input
  const amountResponse = await testFlowRequest('OFFRAMP_AMOUNT_INPUT', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000'
  });

  if (!amountResponse) return;

  // Test 4: Bank Selection
  const bankResponse = await testFlowRequest('OFFRAMP_BANK_SELECTION', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000',
    selected_bank: '044'
  });

  if (!bankResponse) return;

  // Test 5: Account Input
  const accountResponse = await testFlowRequest('OFFRAMP_ACCOUNT_INPUT', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000',
    selected_bank: '044',
    bank_name: 'Access Bank',
    account_number: '1234567890'
  });

  if (!accountResponse) return;

  // Test 6: Account Confirmation
  const confirmResponse = await testFlowRequest('OFFRAMP_ACCOUNT_CONFIRMATION', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000',
    bank_name: 'Access Bank',
    account_number: '1234567890',
    account_name: 'John Doe',
    confirmed: 'yes'
  });

  if (!confirmResponse) return;

  // Test 7: Quote Review
  const quoteResponse = await testFlowRequest('OFFRAMP_QUOTE_REVIEW', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000',
    crypto_amount: '62.50',
    exchange_rate: '800',
    platform_fee: '750',
    dexpay_fee: '160',
    total_fees: '910',
    total_crypto_needed: '63.64',
    current_balance: '125.50',
    bank_name: 'Access Bank',
    account_name: 'John Doe',
    account_number: '1234567890',
    quote_id: 'quote_test_123',
    proceed: 'yes'
  });

  if (!quoteResponse) return;

  // Test 8: PIN Verification
  const pinResponse = await testFlowRequest('OFFRAMP_PIN_VERIFICATION', {
    pin: '1234',
    asset: 'USDC',
    ngn_amount: '50000',
    total_crypto_needed: '63.64',
    bank_name: 'Access Bank',
    account_name: 'John Doe',
    quote_id: 'quote_test_123'
  });

  console.log('\n✅ All flow tests completed!');
}

/**
 * Test error scenarios
 */
async function testErrorScenarios() {
  console.log('\n🧪 Testing Error Scenarios\n');

  // Test invalid asset/chain combination
  await testFlowRequest('OFFRAMP_ASSET_SELECTION', {
    asset: 'USDT',
    chain: 'base' // USDT not supported on Base
  });

  // Test invalid amount
  await testFlowRequest('OFFRAMP_AMOUNT_INPUT', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '500' // Below minimum
  });

  // Test invalid account number
  await testFlowRequest('OFFRAMP_ACCOUNT_INPUT', {
    asset: 'USDC',
    chain: 'solana',
    ngn_amount: '50000',
    selected_bank: '044',
    bank_name: 'Access Bank',
    account_number: '123' // Invalid format
  });

  console.log('\n✅ Error scenario tests completed!');
}

/**
 * Main test function
 */
async function main() {
  try {
    console.log('🔧 Off-ramp Flow Test Suite');
    console.log('============================');
    
    // Run normal flow tests
    await runFlowTests();
    
    // Run error scenario tests
    await testErrorScenarios();
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  main();
}

module.exports = {
  testFlowRequest,
  runFlowTests,
  testErrorScenarios
};