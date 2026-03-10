# Referral Earnings Validation Script

## Overview
This script validates the new 1% referral earnings calculation model and helps you verify the implementation is working correctly.

## Features
- ✅ Test earnings calculation with sample transaction amounts
- ✅ Compare old flat fee model vs new 1% model
- ✅ Validate against actual database transactions
- ✅ Check points balance integrity
- ✅ Generate CSV reports for analysis
- ✅ Identify break-even point between models

## Usage

### 1. Test with Sample Data (No Database Required)
```bash
npm run validate-referral
# or
npm run ts-node scripts/validate-referral-earnings.ts
```

This will:
- Test various transaction amounts ($0.50 to $5,000)
- Show earnings comparison between old and new models
- Calculate break-even point ($25)
- Test the EarningsService methods

### 2. Compare Models
```bash
npm run validate-referral -- --mode=compare
```

Shows side-by-side comparison of old vs new earnings model.

### 3. Validate Against Live Database
```bash
npm run validate-referral -- --mode=live
```

This will:
- Connect to your MongoDB database
- Analyze recent earnings transactions
- Compare what earnings would have been under each model
- Validate points balance integrity
- Generate a CSV report in `output/` directory

### 4. Validate Specific Number of Transactions
```bash
npm run validate-referral -- --mode=live --limit=100
```

Analyzes the most recent 100 transactions.

## Output Examples

### Sample Transaction Test
```
Transaction | Old Model | New Model | Difference | Better For
------------|-----------|-----------|------------|------------
$0.50       | $0.2500   | $0.0050   | -0.2450    | Old ($0.25)
$1.00       | $0.2500   | $0.0100   | -0.2400    | Old ($0.25)
$10.00      | $0.2500   | $0.1000   | -0.1500    | Old ($0.25)
$25.00      | $0.2500   | $0.2500   | +0.0000    | Equal
$50.00      | $0.2500   | $0.5000   | +0.2500    | New (1%)
$100.00     | $0.2500   | $1.0000   | +0.7500    | New (1%)
$500.00     | $0.2500   | $5.0000   | +4.7500    | New (1%)
$1000.00    | $0.2500   | $10.0000  | +9.7500    | New (1%)

📊 Break-even point: $25.00
   - Transactions < $25.00: Old model better
   - Transactions > $25.00: New model better
```

### Validation Summary
```
=== Validation Summary ===

Total Transactions Analyzed: 50

Old Model (Flat $0.25):
  Total Earnings: $12.50
  Average per Transaction: $0.2500

New Model (1% of Volume):
  Total Earnings: $45.30
  Average per Transaction: $0.9060

Difference:
  Total: +$32.80
  Percentage: +262.40%

Transaction Distribution:
  Higher Earnings (New Model): 38 (76.0%)
  Lower Earnings (New Model): 12 (24.0%)
  Equal Earnings: 0
```

## Key Insights

### Break-Even Point
- **$25.00** is the break-even point
- Transactions below $25: Old model ($0.25) pays more
- Transactions above $25: New model (1%) pays more

### Model Comparison

| Transaction Volume | Old Earnings | New Earnings | Winner |
|-------------------|--------------|--------------|--------|
| $10 | $0.25 | $0.10 | Old |
| $25 | $0.25 | $0.25 | Equal |
| $50 | $0.25 | $0.50 | New (2x) |
| $100 | $0.25 | $1.00 | New (4x) |
| $500 | $0.25 | $5.00 | New (20x) |
| $1,000 | $0.25 | $10.00 | New (40x) |

### Expected Impact
- **Small transactions (<$25)**: Referrers earn less
- **Medium transactions ($25-$100)**: Referrers earn 1-4x more
- **Large transactions (>$100)**: Referrers earn significantly more

## CSV Report

When running in `live` mode, a CSV report is generated in `output/referral-validation-report.csv`:

```csv
Transaction ID,User ID,Referrer ID,Volume (USD),Old Earnings,New Earnings,Difference,% Difference
txn_123,user_456,user_789,100.00,0.2500,1.0000,0.7500,300.00
txn_124,user_457,user_789,50.00,0.2500,0.5000,0.2500,100.00
...
```

## Validation Checks

The script performs several validation checks:

1. **Calculation Accuracy**: Verifies earnings = volume × 0.01
2. **Balance Integrity**: Ensures totalEarned ≥ currentBalance
3. **Consistency**: Compares expected vs actual earnings
4. **Edge Cases**: Tests very small and very large amounts

## Troubleshooting

### Database Connection Issues
```bash
# Set MongoDB URI explicitly
MONGODB_URI=mongodb://localhost:27017/chainpaye npm run validate-referral -- --mode=live
```

### No Transactions Found
If you see "No earnings transactions found", it means:
- Database is empty (expected in development)
- Wrong database connection
- No referral earnings have been processed yet

### Invalid Balances
If you see "Invalid balance" warnings:
- totalEarned < currentBalance (data integrity issue)
- May indicate a bug in balance updates
- Should be investigated and fixed

## Integration with CI/CD

You can add this to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Validate Referral Calculations
  run: npm run validate-referral -- --mode=sample
```

## Next Steps After Validation

1. ✅ Review the break-even point ($25)
2. ✅ Analyze transaction distribution
3. ✅ Verify calculations are correct
4. ✅ Check for any data integrity issues
5. ✅ Review CSV report for anomalies
6. ✅ Test in staging environment
7. ✅ Monitor first few live transactions

## Notes

- The script is safe to run - it only reads data, never writes
- Sample mode works without database connection
- Live mode requires MongoDB connection
- CSV reports are saved to `output/` directory
- All monetary values are in USD

## Support

If you encounter issues:
1. Check MongoDB connection string
2. Verify database has transaction data
3. Review error messages in console
4. Check `output/` directory for CSV reports
5. Ensure all dependencies are installed
