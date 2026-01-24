/**
 * Test script for Reset PIN functionality
 * Run with: node scripts/test-reset-pin.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = '+1234567890';

// Test data
const testWebhookMessage = {
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'test-msg-' + Date.now(),
          from: TEST_PHONE.replace('+', ''),
          type: 'text',
          text: {
            body: 'reset pin'
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
};

const testFlowMessage = {
  screen: 'REQUEST_RESET',
  data: {},
  version: '6.0',
  action: 'INIT',
  flow_token: 'test-token-' + Date.now()
};

async function testWebhook() {
  console.log('🧪 Testing Webhook Message Handler...');
  
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, testWebhookMessage, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Webhook Response:', response.status);
    console.log('📝 Response Data:', response.data);
  } catch (error) {
    console.error('❌ Webhook Test Failed:', error.response?.data || error.message);
  }
}

async function testFlowEndpoint() {
  console.log('🧪 Testing Flow Endpoint...');
  
  try {
    const response = await axios.post(`${BASE_URL}/flow/resetPinFlow`, testFlowMessage, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Flow Response:', response.status);
    console.log('📝 Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Flow Test Failed:', error.response?.data || error.message);
  }
}

async function testHealthCheck() {
  console.log('🧪 Testing Health Check...');
  
  try {
    const response = await axios.get(`${BASE_URL}/`);
    console.log('✅ Health Check:', response.data);
  } catch (error) {
    console.error('❌ Health Check Failed:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Reset PIN Tests...\n');
  
  // Test 1: Health Check
  await testHealthCheck();
  console.log('');
  
  // Test 2: Webhook Message
  await testWebhookMessage();
  console.log('');
  
  // Test 3: Flow Endpoint
  await testFlowEndpoint();
  console.log('');
  
  console.log('✨ Tests completed!');
}

// Helper function to test different message types
async function testWebhookMessage() {
  const messages = [
    'reset pin',
    'forgot my pin',
    'change pin',
    '/resetpin',
    'cancel reset'
  ];
  
  for (const message of messages) {
    console.log(`🧪 Testing message: "${message}"`);
    
    const testData = {
      ...testWebhookMessage,
      entry: [{
        ...testWebhookMessage.entry[0],
        changes: [{
          ...testWebhookMessage.entry[0].changes[0],
          value: {
            ...testWebhookMessage.entry[0].changes[0].value,
            messages: [{
              ...testWebhookMessage.entry[0].changes[0].value.messages[0],
              text: { body: message }
            }]
          }
        }]
      }]
    };
    
    try {
      const response = await axios.post(`${BASE_URL}/webhook`, testData, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`   ✅ "${message}" - Status: ${response.status}`);
    } catch (error) {
      console.log(`   ❌ "${message}" - Error: ${error.response?.status || error.message}`);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testWebhook,
  testFlowEndpoint,
  testHealthCheck,
  runTests
};