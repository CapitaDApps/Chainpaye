/**
 * Manual test script for WebhookHandler
 * This script demonstrates the webhook handler functionality
 * and integration with the WorkflowController.
 */

import { WebhookHandler, CrossmintDepositWebhookEvent } from '../services/crypto-off-ramp/WebhookHandler';
import { WorkflowController } from '../services/crypto-off-ramp/WorkflowController';
import { CrossmintService } from '../services/CrossmintService';
import { ValidationService } from '../services/crypto-off-ramp/ValidationService';
import { OffRampStep } from '../types/crypto-off-ramp.types';

async function testWebhookHandler() {
  console.log('🧪 Testing WebhookHandler Integration...\n');

  // Initialize services
  const workflowController = new WorkflowController();
  const crossmintService = new CrossmintService();
  const validationService = new ValidationService();

  const webhookHandler = new WebhookHandler(
    workflowController,
    crossmintService,
    validationService,
    {
      apiKey: 'test-api-key',
      baseUrl: 'https://test.crossmint.com',
      webhookSecret: 'test-webhook-secret'
    }
  );

  let testsPassed = 0;
  let testsTotal = 0;

  function test(name: string, testFn: () => Promise<boolean>) {
    return async () => {
      testsTotal++;
      try {
        console.log(`🔍 ${name}...`);
        const result = await testFn();
        if (result) {
          console.log(`✅ ${name} - PASSED\n`);
          testsPassed++;
        } else {
          console.log(`❌ ${name} - FAILED\n`);
        }
      } catch (error) {
        console.log(`❌ ${name} - ERROR: ${(error as Error).message}\n`);
      }
    };
  }

  // Test 1: Basic workflow creation and deposit confirmation
  await test('Basic deposit confirmation workflow', async () => {
    const userId = 'test-user-123';
    const asset = 'USDC';
    const chain = 'solana';
    const walletAddress = '0x1234567890abcdef';

    // Create and progress workflow to deposit confirmation
    const workflow = await workflowController.initiateOffRamp(userId);
    
    // Progress through initial steps
    await workflowController.processStep(workflow.id, {
      wallets: [{ address: walletAddress, chainType: chain, balance: 0, balances: [] }]
    });
    
    await workflowController.processStep(workflow.id, { asset, chain });
    
    await workflowController.processStep(workflow.id, { 
      walletAddress, 
      existingWallet: null 
    });

    // Verify we're at deposit confirmation step
    const state = await workflowController.getWorkflowState(workflow.id);
    if (state.currentStep !== OffRampStep.DEPOSIT_CONFIRMATION) {
      console.log(`Expected step ${OffRampStep.DEPOSIT_CONFIRMATION}, got ${state.currentStep}`);
      return false;
    }

    // Create test webhook event
    const webhookEvent: CrossmintDepositWebhookEvent = {
      type: 'wallet.deposit',
      data: {
        walletId: 'test-wallet-123',
        owner: `userId:${userId}`,
        address: walletAddress,
        chainType: chain,
        transaction: {
          hash: '0xabcdef123456',
          amount: '100.5',
          token: asset.toLowerCase(),
          from: '0xsender',
          to: walletAddress,
          timestamp: new Date().toISOString(),
          status: 'confirmed'
        }
      },
      timestamp: new Date().toISOString(),
      eventId: 'test-event-123'
    };

    // Process deposit confirmation
    const result = await (webhookHandler as any).processDepositConfirmation(webhookEvent);
    
    if (!result.success) {
      console.log(`Deposit confirmation failed: ${result.error}`);
      return false;
    }

    if (result.workflowsUpdated !== 1) {
      console.log(`Expected 1 workflow updated, got ${result.workflowsUpdated}`);
      return false;
    }

    // Verify workflow progressed
    const finalState = await workflowController.getWorkflowState(workflow.id);
    if (finalState.currentStep !== OffRampStep.SPEND_FORM) {
      console.log(`Expected step ${OffRampStep.SPEND_FORM}, got ${finalState.currentStep}`);
      return false;
    }

    if (!finalState.stepData.depositConfirmed) {
      console.log('Deposit confirmation flag not set');
      return false;
    }

    console.log(`   ✓ Workflow progressed from step ${OffRampStep.DEPOSIT_CONFIRMATION} to ${OffRampStep.SPEND_FORM}`);
    console.log(`   ✓ Deposit amount: ${finalState.stepData.depositAmount} ${asset}`);
    console.log(`   ✓ Spend CTA enabled: ${finalState.stepData.spendCTAEnabled}`);

    return true;
  })();

  // Test 2: Webhook validation
  await test('Webhook event validation', async () => {
    const validEvent: CrossmintDepositWebhookEvent = {
      type: 'wallet.deposit',
      data: {
        walletId: 'test-wallet',
        owner: 'userId:test-user',
        address: '0xtest',
        chainType: 'solana',
        transaction: {
          hash: '0xtest',
          amount: '50.0',
          token: 'usdc',
          from: '0xfrom',
          to: '0xto',
          timestamp: new Date().toISOString(),
          status: 'confirmed'
        }
      },
      timestamp: new Date().toISOString(),
      eventId: 'test-event'
    };

    const validResult = (webhookHandler as any).validateWebhookEvent(validEvent);
    if (!validResult.isValid) {
      console.log(`Valid event failed validation: ${validResult.errors.join(', ')}`);
      return false;
    }

    // Test invalid event
    const invalidEvent = {
      type: 'invalid.type',
      data: null
    };

    const invalidResult = (webhookHandler as any).validateWebhookEvent(invalidEvent);
    if (invalidResult.isValid) {
      console.log('Invalid event passed validation');
      return false;
    }

    console.log(`   ✓ Valid event passed validation`);
    console.log(`   ✓ Invalid event rejected with ${invalidResult.errors.length} errors`);

    return true;
  })();

  // Test 3: User ID extraction
  await test('User ID extraction from owner field', async () => {
    const validOwner = 'userId:user-123-abc';
    const extractedId = (webhookHandler as any).extractUserIdFromOwner(validOwner);
    
    if (extractedId !== 'user-123-abc') {
      console.log(`Expected 'user-123-abc', got '${extractedId}'`);
      return false;
    }

    const invalidOwner = 'invalid-format';
    const nullResult = (webhookHandler as any).extractUserIdFromOwner(invalidOwner);
    
    if (nullResult !== null) {
      console.log(`Expected null for invalid format, got '${nullResult}'`);
      return false;
    }

    console.log(`   ✓ Valid owner format extracted correctly`);
    console.log(`   ✓ Invalid owner format returned null`);

    return true;
  })();

  // Test 4: Chain type mapping
  await test('Chain type mapping', async () => {
    const mappings = [
      ['solana', 'solana'],
      ['bsc', 'bep20'],
      ['arbitrum', 'arbitrum'],
      ['base', 'base'],
      ['unknown', 'unknown']
    ];

    for (const [input, expected] of mappings) {
      const result = (webhookHandler as any).mapChainTypeToSupportedChain(input);
      if (result !== expected) {
        console.log(`Chain mapping failed: ${input} -> ${result}, expected ${expected}`);
        return false;
      }
    }

    console.log(`   ✓ All chain type mappings correct`);
    return true;
  })();

  // Test 5: Multiple workflows handling
  await test('Multiple workflows for same deposit', async () => {
    const userId = 'multi-user-456';
    const asset = 'USDT';
    const chain = 'arbitrum';
    const walletAddress = '0xmulti123';

    // Create two workflows
    const workflow1 = await workflowController.initiateOffRamp(userId);
    const workflow2 = await workflowController.initiateOffRamp(userId);

    // Progress both to deposit confirmation
    for (const workflow of [workflow1, workflow2]) {
      await workflowController.processStep(workflow.id, {
        wallets: [{ address: walletAddress, chainType: chain, balance: 0, balances: [] }]
      });
      await workflowController.processStep(workflow.id, { asset, chain });
      await workflowController.processStep(workflow.id, { walletAddress, existingWallet: null });
    }

    // Create webhook event
    const webhookEvent: CrossmintDepositWebhookEvent = {
      type: 'wallet.deposit',
      data: {
        walletId: 'multi-wallet',
        owner: `userId:${userId}`,
        address: walletAddress,
        chainType: chain,
        transaction: {
          hash: '0xmulti456',
          amount: '75.25',
          token: asset.toLowerCase(),
          from: '0xsender',
          to: walletAddress,
          timestamp: new Date().toISOString(),
          status: 'confirmed'
        }
      },
      timestamp: new Date().toISOString(),
      eventId: 'multi-event'
    };

    // Process deposit
    const result = await (webhookHandler as any).processDepositConfirmation(webhookEvent);
    
    if (!result.success) {
      console.log(`Multi-workflow deposit failed: ${result.error}`);
      return false;
    }

    if (result.workflowsUpdated !== 2) {
      console.log(`Expected 2 workflows updated, got ${result.workflowsUpdated}`);
      return false;
    }

    // Verify both workflows progressed
    const state1 = await workflowController.getWorkflowState(workflow1.id);
    const state2 = await workflowController.getWorkflowState(workflow2.id);

    if (state1.currentStep !== OffRampStep.SPEND_FORM || state2.currentStep !== OffRampStep.SPEND_FORM) {
      console.log('Not all workflows progressed to spend form');
      return false;
    }

    console.log(`   ✓ Both workflows updated successfully`);
    console.log(`   ✓ Both workflows progressed to spend form step`);

    return true;
  })();

  // Summary
  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${testsPassed}/${testsTotal}`);
  console.log(`❌ Failed: ${testsTotal - testsPassed}/${testsTotal}`);

  if (testsPassed === testsTotal) {
    console.log('\n🎉 All tests passed! WebhookHandler is working correctly.');
    return true;
  } else {
    console.log('\n❌ Some tests failed. Please check the implementation.');
    return false;
  }
}

// Run the tests
testWebhookHandler()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });