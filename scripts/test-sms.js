/**
 * SMS Service Testing Script
 * Run with: node scripts/test-sms.js
 */

const { smsService } = require('../services/SmsService');

const TEST_PHONE = '+1234567890'; // Replace with your test phone number

async function testSmsService() {
  console.log('🧪 Testing SMS Service...\n');
  
  // Test 1: Check provider
  console.log(`📡 Current SMS Provider: ${smsService.getProviderName()}`);
  console.log('');
  
  // Test 2: Send basic SMS
  console.log('📱 Testing basic SMS...');
  const basicSmsResult = await smsService.sendSms(
    TEST_PHONE, 
    'Hello from ChainPaye! This is a test message.'
  );
  console.log(`   Result: ${basicSmsResult ? '✅ Success' : '❌ Failed'}`);
  console.log('');
  
  // Test 3: Send OTP SMS
  console.log('🔐 Testing OTP SMS...');
  const testOtp = '123456';
  const otpResult = await smsService.sendOtp(TEST_PHONE, testOtp, 10);
  console.log(`   OTP: ${testOtp}`);
  console.log(`   Result: ${otpResult ? '✅ Success' : '❌ Failed'}`);
  console.log('');
  
  // Test 4: Send PIN reset confirmation
  console.log('✅ Testing PIN reset confirmation SMS...');
  const confirmationResult = await smsService.sendPinResetConfirmation(TEST_PHONE);
  console.log(`   Result: ${confirmationResult ? '✅ Success' : '❌ Failed'}`);
  console.log('');
  
  // Test 5: Invalid phone number
  console.log('❌ Testing invalid phone number...');
  const invalidResult = await smsService.sendSms('invalid-number', 'Test message');
  console.log(`   Result: ${invalidResult ? '✅ Success' : '❌ Failed (Expected)'}`);
  console.log('');
  
  console.log('✨ SMS testing completed!');
  
  if (smsService.getProviderName() === 'Mock SMS') {
    console.log('\n💡 Note: Currently using Mock SMS provider.');
    console.log('   To test with real SMS:');
    console.log('   1. Configure SMS provider in .env file');
    console.log('   2. Set SMS_PROVIDER=twilio (or termii/aws)');
    console.log('   3. Add provider credentials');
    console.log('   4. Run this test again');
  }
}

// Test different providers
async function testProviderConfiguration() {
  console.log('🔧 Testing Provider Configuration...\n');
  
  const providers = [
    { name: 'Twilio', envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'] },
    { name: 'Termii', envVars: ['TERMII_API_KEY'] },
    { name: 'AWS SNS', envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] }
  ];
  
  providers.forEach(provider => {
    console.log(`📡 ${provider.name}:`);
    provider.envVars.forEach(envVar => {
      const configured = !!process.env[envVar];
      console.log(`   ${configured ? '✅' : '❌'} ${envVar}`);
    });
    console.log('');
  });
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting SMS Service Tests...\n');
  
  await testProviderConfiguration();
  await testSmsService();
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testSmsService,
  testProviderConfiguration,
  runAllTests
};