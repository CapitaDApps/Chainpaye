#!/bin/bash

# Receipt Generation Setup Checker
# This script verifies all requirements for receipt generation

echo "======================================"
echo "Receipt Generation Setup Checker"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counter
ERRORS=0
WARNINGS=0

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        ((ERRORS++))
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

echo "1. Checking Chromium Installation..."
echo "-----------------------------------"

# Check for Chromium
CHROMIUM_PATH=""
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_PATH=$(which chromium-browser)
    print_status 0 "Chromium found at: $CHROMIUM_PATH"
    VERSION=$(chromium-browser --version 2>/dev/null)
    echo "   Version: $VERSION"
elif command -v chromium &> /dev/null; then
    CHROMIUM_PATH=$(which chromium)
    print_status 0 "Chromium found at: $CHROMIUM_PATH"
    VERSION=$(chromium --version 2>/dev/null)
    echo "   Version: $VERSION"
elif [ -f "/snap/bin/chromium" ]; then
    CHROMIUM_PATH="/snap/bin/chromium"
    print_status 0 "Chromium (Snap) found at: $CHROMIUM_PATH"
    VERSION=$(/snap/bin/chromium --version 2>/dev/null)
    echo "   Version: $VERSION"
elif command -v google-chrome &> /dev/null; then
    CHROMIUM_PATH=$(which google-chrome)
    print_status 0 "Google Chrome found at: $CHROMIUM_PATH"
    VERSION=$(google-chrome --version 2>/dev/null)
    echo "   Version: $VERSION"
else
    print_status 1 "Chromium not found"
    echo "   Install with: sudo apt-get install chromium-browser"
    echo "   Or with Snap: sudo snap install chromium"
fi

echo ""
echo "2. Checking Required Files..."
echo "-----------------------------------"

# Check logo files
if [ -f "public/logo.jpg" ]; then
    print_status 0 "Logo file exists: public/logo.jpg"
    ls -lh public/logo.jpg | awk '{print "   Size: " $5 ", Permissions: " $1}'
else
    print_status 1 "Logo file missing: public/logo.jpg"
fi

if [ -f "public/logo-icon.jpg" ]; then
    print_status 0 "Logo icon exists: public/logo-icon.jpg"
    ls -lh public/logo-icon.jpg | awk '{print "   Size: " $5 ", Permissions: " $1}'
else
    print_status 1 "Logo icon missing: public/logo-icon.jpg"
fi

# Check template file
if [ -f "templates/transactionReceipts.hbs" ]; then
    print_status 0 "Template file exists: templates/transactionReceipts.hbs"
    ls -lh templates/transactionReceipts.hbs | awk '{print "   Size: " $5 ", Permissions: " $1}'
else
    print_status 1 "Template file missing: templates/transactionReceipts.hbs"
fi

echo ""
echo "3. Checking Node.js Dependencies..."
echo "-----------------------------------"

# Check if node_modules exists
if [ -d "node_modules" ]; then
    print_status 0 "node_modules directory exists"
else
    print_status 1 "node_modules directory missing - run: pnpm install"
fi

# Check for puppeteer
if [ -d "node_modules/puppeteer" ]; then
    print_status 0 "Puppeteer installed"
    PUPPETEER_VERSION=$(node -e "console.log(require('./package.json').dependencies.puppeteer)" 2>/dev/null)
    echo "   Version: $PUPPETEER_VERSION"
else
    print_status 1 "Puppeteer not installed"
fi

# Check for handlebars
if [ -d "node_modules/handlebars" ]; then
    print_status 0 "Handlebars installed"
else
    print_status 1 "Handlebars not installed"
fi

# Check for fs-extra
if [ -d "node_modules/fs-extra" ]; then
    print_status 0 "fs-extra installed"
else
    print_status 1 "fs-extra not installed"
fi

echo ""
echo "4. Checking Environment Variables..."
echo "-----------------------------------"

if [ -f ".env" ]; then
    print_status 0 ".env file exists"
    
    # Check for required variables
    if grep -q "GRAPH_API_TOKEN=" .env; then
        if grep "GRAPH_API_TOKEN=" .env | grep -q "=.\+"; then
            print_status 0 "GRAPH_API_TOKEN is set"
        else
            print_warning "GRAPH_API_TOKEN is empty"
        fi
    else
        print_status 1 "GRAPH_API_TOKEN not found in .env"
    fi
    
    if grep -q "BUSINESS_PHONE_NUMBER_ID=" .env; then
        if grep "BUSINESS_PHONE_NUMBER_ID=" .env | grep -q "=.\+"; then
            print_status 0 "BUSINESS_PHONE_NUMBER_ID is set"
        else
            print_warning "BUSINESS_PHONE_NUMBER_ID is empty"
        fi
    else
        print_status 1 "BUSINESS_PHONE_NUMBER_ID not found in .env"
    fi
else
    print_status 1 ".env file missing"
fi

echo ""
echo "5. Checking System Resources..."
echo "-----------------------------------"

# Check memory
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
AVAILABLE_MEM=$(free -m | awk 'NR==2{print $7}')
echo "   Total Memory: ${TOTAL_MEM}MB"
echo "   Available Memory: ${AVAILABLE_MEM}MB"

if [ $AVAILABLE_MEM -lt 200 ]; then
    print_warning "Low available memory (${AVAILABLE_MEM}MB). Chromium needs ~200MB"
else
    print_status 0 "Sufficient memory available"
fi

# Check disk space
DISK_AVAILABLE=$(df -m . | awk 'NR==2{print $4}')
echo "   Available Disk Space: ${DISK_AVAILABLE}MB"

if [ $DISK_AVAILABLE -lt 500 ]; then
    print_warning "Low disk space (${DISK_AVAILABLE}MB)"
else
    print_status 0 "Sufficient disk space"
fi

echo ""
echo "6. Checking Permissions..."
echo "-----------------------------------"

# Check write permissions for logs
if [ -w "logs" ] || [ ! -d "logs" ]; then
    print_status 0 "Can write to logs directory"
else
    print_status 1 "Cannot write to logs directory"
fi

# Check write permissions for current directory (for test files)
if [ -w "." ]; then
    print_status 0 "Can write to current directory"
else
    print_status 1 "Cannot write to current directory"
fi

echo ""
echo "======================================"
echo "Summary"
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "You can now test receipt generation with:"
    echo "  tsx utils/testReceiptGeneration.ts"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ ${WARNINGS} warning(s) found${NC}"
    echo ""
    echo "Receipt generation should work, but review warnings above."
    exit 0
else
    echo -e "${RED}✗ ${ERRORS} error(s) found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ ${WARNINGS} warning(s) found${NC}"
    fi
    echo ""
    echo "Please fix the errors above before testing receipt generation."
    echo "See RECEIPT_TROUBLESHOOTING.md for detailed solutions."
    exit 1
fi
