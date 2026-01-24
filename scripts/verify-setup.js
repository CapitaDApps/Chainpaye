/**
 * Setup verification script for Reset PIN functionality
 * Run with: node scripts/verify-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Reset PIN Setup...\n');

// Check 1: Required files exist
const requiredFiles = [
  'webhooks/services/resetPinFlow.service.ts',
  'webhooks/reset_pin_flow.json',
  'commands/handlers/resetPinHandler.ts',
  'services/WhatsAppBusinessService.ts',
  'models/User.ts'
];

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
});

// Check 2: Environment variables
console.log('\n🔧 Checking environment setup:');
const envFile = '.env';
if (fs.existsSync(envFile)) {
  console.log('   ✅ .env file exists');
  const envContent = fs.readFileSync(envFile, 'utf8');
  
  const requiredEnvVars = [
    'GRAPH_API_TOKEN',
    'BUSINESS_PHONE_NUMBER_ID',
    'VERIFY_TOKEN',
    'APP_SECRET'
  ];
  
  requiredEnvVars.forEach(envVar => {
    const exists = envContent.includes(envVar);
    console.log(`   ${exists ? '✅' : '❌'} ${envVar}`);
  });
  
  const hasResetPinFlowId = envContent.includes('RESET_PIN_FLOW_ID');
  console.log(`   ${hasResetPinFlowId ? '✅' : '⚠️'} RESET_PIN_FLOW_ID ${hasResetPinFlowId ? '' : '(optional - needed for WhatsApp Flows)'}`);
} else {
  console.log('   ❌ .env file not found');
}

// Check 3: Package.json dependencies
console.log('\n📦 Checking dependencies:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['argon2', 'uuid', 'redis', 'mongoose', 'express', 'axios'];

requiredDeps.forEach(dep => {
  const exists = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
  console.log(`   ${exists ? '✅' : '❌'} ${dep} ${exists ? `(${exists})` : ''}`);
});

// Check 4: TypeScript configuration
console.log('\n⚙️ Checking TypeScript config:');
if (fs.existsSync('tsconfig.json')) {
  console.log('   ✅ tsconfig.json exists');
  const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  
  const hasNodeTypes = tsConfig.compilerOptions?.types?.includes('node');
  console.log(`   ${hasNodeTypes ? '✅' : '❌'} Node types configured`);
  
  const hasDomLib = tsConfig.compilerOptions?.lib?.includes('dom');
  console.log(`   ${hasDomLib ? '✅' : '❌'} DOM lib configured`);
} else {
  console.log('   ❌ tsconfig.json not found');
}

// Check 5: Flow JSON structure
console.log('\n🔄 Checking Flow JSON:');
if (fs.existsSync('webhooks/reset_pin_flow.json')) {
  try {
    const flowJson = JSON.parse(fs.readFileSync('webhooks/reset_pin_flow.json', 'utf8'));
    console.log('   ✅ Flow JSON is valid');
    
    const requiredScreens = ['REQUEST_RESET', 'VERIFY_OTP', 'SET_NEW_PIN', 'SUCCESS'];
    const screens = flowJson.screens?.map(s => s.id) || [];
    
    requiredScreens.forEach(screenId => {
      const exists = screens.includes(screenId);
      console.log(`   ${exists ? '✅' : '❌'} Screen: ${screenId}`);
    });
  } catch (error) {
    console.log('   ❌ Flow JSON is invalid:', error.message);
  }
} else {
  console.log('   ❌ reset_pin_flow.json not found');
}

// Check 6: Redis connection (if possible)
console.log('\n🔴 Redis connection:');
try {
  // This is a basic check - actual connection test would require running Redis
  const redisConfig = fs.readFileSync('services/redis.ts', 'utf8');
  if (redisConfig.includes('createClient')) {
    console.log('   ✅ Redis client configuration found');
  } else {
    console.log('   ❌ Redis client configuration not found');
  }
} catch (error) {
  console.log('   ❌ Could not check Redis configuration');
}

console.log('\n🚀 Setup verification complete!');
console.log('\n📋 Next steps:');
console.log('   1. Fix any ❌ issues above');
console.log('   2. Start your server: double-click start-dev.bat');
console.log('   3. Run tests: node scripts/test-reset-pin.js');
console.log('   4. Upload reset_pin_flow.json to Meta Business Suite');
console.log('   5. Update RESET_PIN_FLOW_ID in .env file');
console.log('   6. Test with WhatsApp messages');