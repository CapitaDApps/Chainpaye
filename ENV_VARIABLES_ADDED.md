# Environment Variables Added for Referral Withdrawal System

## 📋 Variables Added to .env and .env.example

### 🔑 WhatsApp Flow Configuration
```bash
# WhatsApp Flow IDs for referral earnings withdrawal
WHATSAPP_REFERRAL_WITHDRAWAL_FLOW_ID=TBD_REFERRAL_WITHDRAWAL_PRODUCTION
WHATSAPP_STAGING_REFERRAL_WITHDRAWAL_FLOW_ID=TBD_REFERRAL_WITHDRAWAL_STAGING
```

### ⚙️ Referral Withdrawal Settings
```bash
# Referral withdrawal configuration
REFERRAL_WITHDRAWAL_MIN_AMOUNT=20
REFERRAL_WITHDRAWAL_FREQUENCY_DAYS=7
REFERRAL_WITHDRAWAL_CHAIN=base
REFERRAL_WITHDRAWAL_TOKEN=USDT
```

## 🚀 Next Steps for Deployment

### 1. Create WhatsApp Flows in Meta Business Suite
1. **Production Flow**: Create using `webhooks/referral_withdrawal_flow.json`
2. **Staging Flow**: Create a copy for staging environment
3. **Update Flow IDs**: Replace `TBD_REFERRAL_WITHDRAWAL_PRODUCTION` and `TBD_REFERRAL_WITHDRAWAL_STAGING` with actual flow IDs

### 2. Environment Variable Configuration

#### Production (.env)
```bash
WHATSAPP_REFERRAL_WITHDRAWAL_FLOW_ID=your_actual_production_flow_id
```

#### Staging (.env for staging)
```bash
WHATSAPP_STAGING_REFERRAL_WITHDRAWAL_FLOW_ID=your_actual_staging_flow_id
```

### 3. Optional Customization
You can modify these settings if needed:

- **REFERRAL_WITHDRAWAL_MIN_AMOUNT**: Minimum withdrawal amount (default: $20)
- **REFERRAL_WITHDRAWAL_FREQUENCY_DAYS**: Days between withdrawals (default: 7)
- **REFERRAL_WITHDRAWAL_CHAIN**: Blockchain network (default: base)
- **REFERRAL_WITHDRAWAL_TOKEN**: Token type (default: USDT)

## 📝 Usage in Code

These variables are used by:
- `config/whatsapp.ts` - Flow ID configuration
- `services/WithdrawalService.ts` - Withdrawal validation
- `services/WhatsAppBusinessService.ts` - Flow sending
- `webhooks/controllers/referralWithdrawalFlow.controller.ts` - Flow processing

## ✅ Status
- [x] Variables added to .env
- [x] Variables added to .env.example
- [x] Documentation created
- [ ] WhatsApp flows created in Meta Business Suite
- [ ] Flow IDs updated in environment files
- [ ] System tested end-to-end

## 🎯 Ready for Flow Creation
The system is now ready for you to create the WhatsApp flows and update the flow IDs!