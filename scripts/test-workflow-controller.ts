/**
 * Manual test script for WorkflowController
 * This script validates the basic functionality of the WorkflowController
 * without requiring Jest or fast-check dependencies
 */

import { WorkflowController } from '../services/crypto-off-ramp/WorkflowController';
import { OffRampStep } from '../types/crypto-off-ramp.types';

async function testWorkflowController() {
  console.log('🧪 Testing WorkflowController...\n');
  
  const controller = new WorkflowController();
  let testsPassed = 0;
  let testsTotal = 0;

  // Helper function to run a test
  async function runTest(testName: string, testFn: () => Promise<boolean>) {
    testsTotal++;
    try {
      const result = await testFn();
      if (result) {
        console.log(`✅ ${testName}`);
        testsPassed++;
      } else {
        console.log(`❌ ${testName}`);
      }
    } catch (error) {
      console.log(`❌ ${testName} - Error: ${(error as Error).message}`);
    }
  }

  // Test 1: Workflow Initialization
  await runTest('Workflow Initialization', async () => {
    const workflow = await controller.initiateOffRamp('test-user-123');
    return workflow.id !== undefined &&
           workflow.userId === 'test-user-123' &&
           workflow.currentStep === OffRampStep.DISPLAY_WALLETS &&
           workflow.status === 'active';
  });

  // Test 2: Display Wallets Step
  await runTest('Display Wallets Step', async () => {
    const workflow = await controller.initiateOffRamp('test-user-wallets');
    const result = await controller.processStep(workflow.id, {
      wallets: [{ address: 'test-address', balance: 100 }]
    });
    return result.success && result.nextStep === OffRampStep.REQUEST_ASSET_CHAIN;
  });

  // Test 3: Asset-Chain Validation (Valid)
  await runTest('Asset-Chain Validation (Valid)', async () => {
    const workflow = await controller.initiateOffRamp('test-user-asset');
    await controller.processStep(workflow.id, { wallets: [{ address: 'test', balance: 100 }] });
    
    const result = await controller.processStep(workflow.id, {
      asset: 'USDC',
      chain: 'solana'
    });
    return result.success && result.nextStep === OffRampStep.WALLET_CREATION;
  });

  // Test 4: Asset-Chain Validation (Invalid)
  await runTest('Asset-Chain Validation (Invalid)', async () => {
    const workflow = await controller.initiateOffRamp('test-user-invalid');
    await controller.processStep(workflow.id, { wallets: [{ address: 'test', balance: 100 }] });
    
    const result = await controller.processStep(workflow.id, {
      asset: 'INVALID',
      chain: 'solana'
    });
    return !result.success && result.error?.includes('Unsupported asset');
  });

  // Test 5: Balance Validation (Insufficient)
  await runTest('Balance Validation (Insufficient)', async () => {
    const workflow = await controller.initiateOffRamp('test-user-balance');
    
    // Progress through steps to reach balance validation
    const steps = [
      { wallets: [{ address: 'test', balance: 100 }] },
      { asset: 'USDC', chain: 'solana' },
      { walletAddress: 'test-address', walletCreated: true },
      { depositConfirmed: true },
      { bankCode: 'TEST', accountNumber: '1234567890', amount: 1000 },
      { accountName: 'Test Account', exchangeRate: 1500, fees: { chainpaye: 15, dexpay: 300, total: 315 } }
    ];

    for (const stepData of steps) {
      await controller.processStep(workflow.id, stepData);
    }

    // Test insufficient balance
    const result = await controller.processStep(workflow.id, {
      amount: 1000,
      exchangeRate: 1500,
      walletBalance: 0.5 // Less than required
    });

    return !result.success && result.error === 'Insufficient Funds';
  });

  // Test 6: Balance Validation (Sufficient)
  await runTest('Balance Validation (Sufficient)', async () => {
    const workflow = await controller.initiateOffRamp('test-user-sufficient');
    
    // Progress through steps
    const steps = [
      { wallets: [{ address: 'test', balance: 100 }] },
      { asset: 'USDC', chain: 'solana' },
      { walletAddress: 'test-address', walletCreated: true },
      { depositConfirmed: true },
      { bankCode: 'TEST', accountNumber: '1234567890', amount: 1000 },
      { accountName: 'Test Account', exchangeRate: 1500, fees: { chainpaye: 15, dexpay: 300, total: 315 } }
    ];

    for (const stepData of steps) {
      await controller.processStep(workflow.id, stepData);
    }

    // Test sufficient balance
    const result = await controller.processStep(workflow.id, {
      amount: 1000,
      exchangeRate: 1500,
      walletBalance: 1.0 // More than required
    });

    return result.success && result.nextStep === OffRampStep.PIN_CONFIRMATION;
  });

  // Test 7: PIN Confirmation (Invalid)
  await runTest('PIN Confirmation (Invalid)', async () => {
    const workflow = await controller.initiateOffRamp('test-user-pin');
    
    // Progress to PIN step
    const steps = [
      { wallets: [{ address: 'test', balance: 100 }] },
      { asset: 'USDC', chain: 'solana' },
      { walletAddress: 'test-address', walletCreated: true },
      { depositConfirmed: true },
      { bankCode: 'TEST', accountNumber: '1234567890', amount: 1000 },
      { accountName: 'Test Account', exchangeRate: 1500, fees: { chainpaye: 15, dexpay: 300, total: 315 } },
      { amount: 1000, exchangeRate: 1500, walletBalance: 1.0 }
    ];

    for (const stepData of steps) {
      await controller.processStep(workflow.id, stepData);
    }

    // Test invalid PIN
    const result = await controller.processStep(workflow.id, {
      pin: '1234',
      pinValid: false
    });

    return !result.success && result.error?.includes('Incorrect PIN');
  });

  // Test 8: Sequential Step Progression
  await runTest('Sequential Step Progression', async () => {
    const workflow = await controller.initiateOffRamp('test-user-sequential');
    let currentStep = OffRampStep.DISPLAY_WALLETS;
    let stepsProgressed = 0;

    const stepDataSequence = [
      { wallets: [{ address: 'test', balance: 100 }] },
      { asset: 'USDC', chain: 'solana' },
      { walletAddress: 'test-address', walletCreated: true },
      { depositConfirmed: true },
      { bankCode: 'TEST', accountNumber: '1234567890', amount: 1000 },
      { accountName: 'Test Account', exchangeRate: 1500, fees: { chainpaye: 15, dexpay: 300, total: 315 } },
      { amount: 1000, exchangeRate: 1500, walletBalance: 1.0 },
      { pin: '1234', pinValid: true },
      { transferSuccess: true, transactionId: 'test-tx-123' },
      { quoteId: 'test-quote-123' },
      { orderId: 'test-order-123' },
      {}
    ];

    for (const stepData of stepDataSequence) {
      const result = await controller.processStep(workflow.id, stepData);
      if (result.success && result.nextStep) {
        if (result.nextStep > currentStep) {
          currentStep = result.nextStep;
          stepsProgressed++;
        } else {
          return false; // Non-sequential progression detected
        }
      }
    }

    return stepsProgressed >= 10; // Should progress through most steps
  });

  // Test 9: Workflow State Consistency
  await runTest('Workflow State Consistency', async () => {
    const workflow = await controller.initiateOffRamp('test-user-consistency');
    const originalId = workflow.id;
    const originalUserId = workflow.userId;

    // Process a step
    await controller.processStep(workflow.id, {
      wallets: [{ address: 'test', balance: 100 }]
    });

    // Check state consistency
    const updatedWorkflow = await controller.getWorkflowState(workflow.id);
    return updatedWorkflow.id === originalId &&
           updatedWorkflow.userId === originalUserId &&
           updatedWorkflow.updatedAt >= workflow.updatedAt;
  });

  // Test 10: Error Handling
  await runTest('Error Handling', async () => {
    // Test non-existent workflow
    const result = await controller.processStep('non-existent-id', {});
    return !result.success && result.error === 'Workflow not found';
  });

  // Print results
  console.log(`\n📊 Test Results: ${testsPassed}/${testsTotal} tests passed`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 All tests passed! WorkflowController is working correctly.');
    return true;
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
    return false;
  }
}

// Run the tests
testWorkflowController()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });