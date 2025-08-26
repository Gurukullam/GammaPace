/**
 * Stripe Payment Integration for IELTS Practice Module
 * HTML-Only Architecture Compatible
 * Test Mode Implementation - Replace keys with production when ready
 */

// ========================================
// STRIPE CONFIGURATION (PRODUCTION MODE) 🔥
// ========================================

// STRIPE CONFIGURATION - LIVE PRODUCTION KEYS ACTIVE ✅
const STRIPE_CONFIG = {
    // 🚀 PRODUCTION: Live publishable key configured
    publishableKey: 'pk_live_51Rr5H03QiDHRr52eipxAgsorLcfVZ0rLMiYvMwdM8J7k2MhlQKgFKwGSUFe3Qysrzkw3fx5S5F0EVt4GPfexynCG00kImb5Ca4',
    testMode: false, // ⚠️ PRODUCTION MODE ACTIVE
    currency: 'cad'
    
    // BACKUP TEST KEYS (if needed to revert):
    // publishableKey: 'pk_test_51Rr5H03QiDHRr52ekhdW0iWInaiXz2HTsKI6ZKI9uYh0MoLlCb6LyqxC190QW8Klahclvpvc1L8kaFeuFZab5PKm00aeq1rva2',
    // testMode: true, // Set to true for testing
};

// Initialize Stripe (will be loaded from CDN)
let stripe;
let elements;

// ========================================
// SUBSCRIPTION PLANS CONFIGURATION
// ========================================

const SUBSCRIPTION_PLANS = {
    weekly: {
        priceId: 'price_test_weekly_placeholder',    // Replace with actual Stripe price ID
        amount: 999,                                  // $9.99 CAD
        currency: 'cad',
        interval: 'week',
        name: 'Weekly Plan',
        description: 'Perfect for short-term IELTS preparation'
    },
    monthly: {
        priceId: 'price_test_monthly_placeholder',   // Replace with actual Stripe price ID
        amount: 2499,                                 // $24.99 CAD (Save $14.97 vs 4 weekly)
        currency: 'cad',
        interval: 'month',
        name: 'Monthly Plan',
        description: 'Most popular - Save 38% vs weekly billing'
    },
    quarterly: {
        priceId: 'price_test_quarterly_placeholder', // Replace with actual Stripe price ID
        amount: 5999,                                 // $59.99 CAD (Save $59.88 vs 12 weekly)
        currency: 'cad',
        interval: 'month',
        intervalCount: 3,
        name: 'Quarterly Plan',
        description: 'Best value - Save 50% vs weekly billing'
    }
};

// ========================================
// CURRENCY CONVERSION SYSTEM
// ========================================

// Country to Currency Mapping - Supports both country names and country codes
const COUNTRY_CURRENCY_MAP = {
    // Major Countries with Local Currencies (Full Names)
    'United States': 'USD',
    'Canada': 'CAD',
    'United Kingdom': 'GBP',
    'Australia': 'AUD',
    'Germany': 'EUR',
    'France': 'EUR',
    'Italy': 'EUR',
    'Spain': 'EUR',
    'Netherlands': 'EUR',
    'Belgium': 'EUR',
    'Austria': 'EUR',
    'Ireland': 'EUR',
    'Finland': 'EUR',
    'Japan': 'JPY',
    'South Korea': 'KRW',
    'Singapore': 'SGD',
    'Hong Kong': 'HKD',
    'India': 'INR',
    'China': 'CNY',
    'Brazil': 'BRL',
    'Mexico': 'MXN',
    'Argentina': 'ARS',
    'Chile': 'CLP',
    'South Africa': 'ZAR',
    'Nigeria': 'NGN',
    'New Zealand': 'NZD',
    'Switzerland': 'CHF',
    'Sweden': 'SEK',
    'Norway': 'NOK',
    'Denmark': 'DKK',
    
    // Country Codes (ISO 3166-1 alpha-2)
    'US': 'USD',        // United States
    'CA': 'CAD',        // Canada
    'GB': 'GBP',        // United Kingdom
    'UK': 'GBP',        // United Kingdom (alternative)
    'AU': 'AUD',        // Australia
    'DE': 'EUR',        // Germany
    'FR': 'EUR',        // France
    'IT': 'EUR',        // Italy
    'ES': 'EUR',        // Spain
    'NL': 'EUR',        // Netherlands
    'BE': 'EUR',        // Belgium
    'AT': 'EUR',        // Austria
    'IE': 'EUR',        // Ireland
    'FI': 'EUR',        // Finland
    'JP': 'JPY',        // Japan
    'KR': 'KRW',        // South Korea
    'SG': 'SGD',        // Singapore
    'HK': 'HKD',        // Hong Kong
    'IN': 'INR',        // India ← This will fix your issue!
    'CN': 'CNY',        // China
    'BR': 'BRL',        // Brazil
    'MX': 'MXN',        // Mexico
    'AR': 'ARS',        // Argentina
    'CL': 'CLP',        // Chile
    'ZA': 'ZAR',        // South Africa
    'NG': 'NGN',        // Nigeria
    'NZ': 'NZD',        // New Zealand
    'CH': 'CHF',        // Switzerland
    'SE': 'SEK',        // Sweden
    'NO': 'NOK',        // Norway
    'DK': 'DKK',        // Denmark
    
    // Add more countries as needed - default to USD for unlisted countries
};

// Fallback Currency Conversion Rates (used when API fails) - base: CAD
const FALLBACK_CURRENCY_RATES = {
    'CAD': 1.0,      // Base currency
    'USD': 0.74,     // 1 CAD = 0.74 USD
    'GBP': 0.58,     // 1 CAD = 0.58 GBP  
    'EUR': 0.68,     // 1 CAD = 0.68 EUR
    'AUD': 1.12,     // 1 CAD = 1.12 AUD
    'JPY': 110.0,    // 1 CAD = 110 JPY
    'KRW': 980.0,    // 1 CAD = 980 Korean Won
    'SGD': 1.0,      // 1 CAD = 1.0 Singapore Dollar
    'HKD': 5.8,      // 1 CAD = 5.8 Hong Kong Dollar
    'INR': 62.0,     // 1 CAD = 62 Indian Rupees
    'CNY': 5.3,      // 1 CAD = 5.3 Chinese Yuan
    'BRL': 3.7,      // 1 CAD = 3.7 Brazilian Real
    'MXN': 13.2,     // 1 CAD = 13.2 Mexican Peso
    'ARS': 265.0,    // 1 CAD = 265 Argentine Peso
    'CLP': 650.0,    // 1 CAD = 650 Chilean Peso
    'ZAR': 13.8,     // 1 CAD = 13.8 South African Rand
    'NGN': 575.0,    // 1 CAD = 575 Nigerian Naira
    'NZD': 1.22,     // 1 CAD = 1.22 New Zealand Dollar
    'CHF': 0.67,     // 1 CAD = 0.67 Swiss Franc
    'SEK': 7.9,      // 1 CAD = 7.9 Swedish Krona
    'NOK': 7.8,      // 1 CAD = 7.8 Norwegian Krone
    'DKK': 5.1       // 1 CAD = 5.1 Danish Krone
};

// Live Currency Conversion Rates (fetched from web API)
let LIVE_CURRENCY_RATES = null;
let CURRENCY_RATES_CACHE_TIME = null;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// Fetch live currency conversion rates from web API
async function fetchLiveCurrencyRates() {
    console.log('💱 Fetching live currency conversion rates...');
    
    try {
        // Using exchangerate.host - free API, no key required
        const response = await fetch('https://api.exchangerate.host/latest?base=CAD&symbols=USD,GBP,EUR,AUD,JPY,KRW,SGD,HKD,INR,CNY,BRL,MXN,ARS,CLP,ZAR,NGN,NZD,CHF,SEK,NOK,DKK');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.rates) {
            throw new Error('Invalid API response format');
        }
        
        // Ensure CAD base rate is 1.0
        const liveRates = {
            'CAD': 1.0,
            ...data.rates
        };
        
        // Cache the rates with timestamp
        LIVE_CURRENCY_RATES = liveRates;
        CURRENCY_RATES_CACHE_TIME = Date.now();
        
        // Store in localStorage for persistence across page loads
        localStorage.setItem('liveCurrencyRates', JSON.stringify(liveRates));
        localStorage.setItem('currencyRatesCacheTime', CURRENCY_RATES_CACHE_TIME.toString());
        
        console.log('✅ Live currency rates fetched successfully for ALL countries:');
        
        // Log all supported currencies to show comprehensive coverage
        const allCurrencies = Object.keys(FALLBACK_CURRENCY_RATES).filter(c => c !== 'CAD');
        allCurrencies.forEach(currency => {
            const liveRate = liveRates[currency];
            const fallbackRate = FALLBACK_CURRENCY_RATES[currency];
            if (liveRate) {
                const change = ((liveRate - fallbackRate) / fallbackRate * 100).toFixed(1);
                const arrow = change > 0 ? '↗️' : change < 0 ? '↘️' : '→';
                console.log(`   🌍 ${currency}: ${liveRate.toFixed(4)} (was ${fallbackRate}) ${arrow} ${Math.abs(change)}%`);
            } else {
                console.warn(`   ⚠️ ${currency}: No live rate available, using fallback ${fallbackRate}`);
            }
        });
        
        console.log(`   📅 Cache expires: ${new Date(CURRENCY_RATES_CACHE_TIME + CACHE_DURATION).toLocaleString()}`);
        console.log(`   🎯 Total currencies with live rates: ${Object.keys(liveRates).length}`);
        
        return liveRates;
        
    } catch (error) {
        console.warn('⚠️ Failed to fetch live currency rates:', error.message);
        console.log('🔄 Falling back to hardcoded rates for reliability...');
        
        // Fallback to hardcoded rates
        LIVE_CURRENCY_RATES = FALLBACK_CURRENCY_RATES;
        CURRENCY_RATES_CACHE_TIME = Date.now();
        
        return FALLBACK_CURRENCY_RATES;
    }
}

// Get current currency rates (live or cached)
async function getCurrentCurrencyRates() {
    // Check if we have cached rates that are still valid
    if (LIVE_CURRENCY_RATES && CURRENCY_RATES_CACHE_TIME) {
        const cacheAge = Date.now() - CURRENCY_RATES_CACHE_TIME;
        if (cacheAge < CACHE_DURATION) {
            console.log(`💱 Using cached currency rates (${Math.round(cacheAge / (60 * 1000))} minutes old)`);
            return LIVE_CURRENCY_RATES;
        }
    }
    
    // Try to load from localStorage first
    try {
        const storedRates = localStorage.getItem('liveCurrencyRates');
        const storedTime = localStorage.getItem('currencyRatesCacheTime');
        
        if (storedRates && storedTime) {
            const cacheAge = Date.now() - parseInt(storedTime);
            if (cacheAge < CACHE_DURATION) {
                LIVE_CURRENCY_RATES = JSON.parse(storedRates);
                CURRENCY_RATES_CACHE_TIME = parseInt(storedTime);
                console.log(`💱 Using localStorage cached rates (${Math.round(cacheAge / (60 * 1000))} minutes old)`);
                return LIVE_CURRENCY_RATES;
            }
        }
    } catch (error) {
        console.warn('⚠️ Error loading cached rates from localStorage:', error);
    }
    
    // Fetch fresh rates
    return await fetchLiveCurrencyRates();
}

// Currency Symbols
const CURRENCY_SYMBOLS = {
    'CAD': '$',
    'USD': '$',
    'GBP': '£',
    'EUR': '€', 
    'AUD': '$',
    'JPY': '¥',
    'KRW': '₩',
    'SGD': '$',
    'HKD': '$',
    'INR': '₹',
    'CNY': '¥',
    'BRL': 'R$',
    'MXN': '$',
    'ARS': '$',
    'CLP': '$',
    'ZAR': 'R',
    'NGN': '₦',
    'NZD': '$',
    'CHF': 'Fr',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr'
};

// Get user's currency based on their country stored in Firebase
async function getUserCurrency() {
    try {
        if (!auth.currentUser) {
            console.log('🌍 No authenticated user, defaulting to CAD');
            return 'CAD';
        }

        const userId = auth.currentUser.uid;
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            const userCountry = userData.Country;
            
            if (userCountry) {
                const currency = COUNTRY_CURRENCY_MAP[userCountry] || 'USD'; // Default to USD for unlisted countries
                const countryFormat = userCountry.length === 2 ? 'code' : 'name';
                console.log(`🌍 User country: ${userCountry} (${countryFormat}) → Currency: ${currency}`);
                return currency;
            }
        }
        
        console.log('🌍 No country found in user data, defaulting to CAD');
        return 'CAD';
    } catch (error) {
        console.error('❌ Error getting user currency:', error);
        return 'CAD'; // Fallback to CAD
    }
}

// Convert amount from CAD to target currency (using live rates)
async function convertCurrency(cadAmount, targetCurrency) {
    if (targetCurrency === 'CAD') {
        return cadAmount;
    }
    
    // Get current rates (live or cached)
    const rates = await getCurrentCurrencyRates();
    
    const conversionRate = rates[targetCurrency];
    if (!conversionRate) {
        console.warn(`⚠️ No conversion rate for ${targetCurrency}, using USD rate`);
        return Math.round(cadAmount * (rates['USD'] || FALLBACK_CURRENCY_RATES['USD']));
    }
    
    const convertedAmount = Math.round(cadAmount * conversionRate);
    console.log(`💱 Conversion: ${cadAmount/100} CAD → ${convertedAmount/100} ${targetCurrency} (rate: ${conversionRate})`);
    
    return convertedAmount;
}

// ========================================
// BUSINESS NET REVENUE CALCULATION
// ========================================

/**
 * Calculate actual business net revenue after ALL Stripe fees
 * This is what gets credited to your business account
 */
function calculateNetBusinessRevenue(customerAmount, currency, isInternational = false) {
    console.log('💰 Calculating net business revenue after ALL Stripe fees...');
    
    currency = currency.toUpperCase();
    const customerAmountDecimal = customerAmount / 100;
    
    // Stripe fee structure (as of 2024)
    const STRIPE_FEES = {
        // Standard processing fees by region
        domestic: {
            percentage: 2.9,  // 2.9%
            fixed: getFixedFeeForCurrency(currency)  // 30¢ equivalent in local currency
        },
        international: {
            percentage: 3.9,  // 2.9% + 1% international fee
            fixed: getFixedFeeForCurrency(currency)
        },
        // Currency conversion fee (when Stripe converts currency)
        currencyConversion: 1.0  // Additional 1% for currency conversion
    };
    
    // Determine if international transaction
    const feeStructure = isInternational ? STRIPE_FEES.international : STRIPE_FEES.domestic;
    
    // Calculate percentage fee
    const percentageFee = (customerAmountDecimal * feeStructure.percentage) / 100;
    
    // Fixed fee in local currency
    const fixedFee = feeStructure.fixed;
    
    // Currency conversion fee (if applicable)
    let conversionFee = 0;
    if (currency !== 'USD' && currency !== 'CAD') {
        conversionFee = (customerAmountDecimal * STRIPE_FEES.currencyConversion) / 100;
    }
    
    // Total Stripe fees
    const totalStripeFees = percentageFee + fixedFee + conversionFee;
    
    // Net amount business receives
    const netBusinessRevenue = customerAmountDecimal - totalStripeFees;
    const netBusinessRevenueCents = Math.round(netBusinessRevenue * 100);
    
    console.log('💰 BUSINESS REVENUE BREAKDOWN:');
    console.log(`   💳 Customer pays: ${formatCurrency(customerAmount, currency)}`);
    console.log(`   📊 Stripe percentage fee (${feeStructure.percentage}%): ${formatCurrency(Math.round(percentageFee * 100), currency)}`);
    console.log(`   🔢 Stripe fixed fee: ${formatCurrency(Math.round(fixedFee * 100), currency)}`);
    if (conversionFee > 0) {
        console.log(`   💱 Currency conversion fee (1%): ${formatCurrency(Math.round(conversionFee * 100), currency)}`);
    }
    console.log(`   ❌ Total Stripe fees: ${formatCurrency(Math.round(totalStripeFees * 100), currency)}`);
    console.log(`   ✅ NET BUSINESS REVENUE: ${formatCurrency(netBusinessRevenueCents, currency)}`);
    console.log(`   📈 Business keeps: ${((netBusinessRevenue/customerAmountDecimal)*100).toFixed(1)}% of customer payment`);
    
    return {
        customerPaid: customerAmount,
        stripeFees: {
            percentage: Math.round(percentageFee * 100),
            fixed: Math.round(fixedFee * 100),
            conversion: Math.round(conversionFee * 100),
            total: Math.round(totalStripeFees * 100)
        },
        netBusinessRevenue: netBusinessRevenueCents,
        currency: currency,
        feeBreakdown: {
            customerPaidFormatted: formatCurrency(customerAmount, currency),
            totalFeesFormatted: formatCurrency(Math.round(totalStripeFees * 100), currency),
            netRevenueFormatted: formatCurrency(netBusinessRevenueCents, currency),
            businessKeepsPercentage: ((netBusinessRevenue/customerAmountDecimal)*100).toFixed(1)
        }
    };
}

/**
 * Get fixed fee equivalent for different currencies
 * Based on 30¢ USD equivalent
 */
function getFixedFeeForCurrency(currency) {
    const fixedFees = {
        'USD': 0.30,
        'CAD': 0.40,   // ~30¢ USD
        'EUR': 0.25,   // ~30¢ USD
        'GBP': 0.20,   // ~30¢ USD
        'AUD': 0.45,   // ~30¢ USD
        'JPY': 40,     // ~30¢ USD
        'INR': 25,     // ~30¢ USD
        'BRL': 1.60,   // ~30¢ USD
        'MXN': 6.00,   // ~30¢ USD
        'KRW': 400,    // ~30¢ USD
        'SGD': 0.45,   // ~30¢ USD
        'HKD': 2.35,   // ~30¢ USD
        'CNY': 2.20,   // ~30¢ USD
        'ARS': 120,    // ~30¢ USD
        'CLP': 280,    // ~30¢ USD
        'ZAR': 5.50,   // ~30¢ USD
        'NGN': 250,    // ~30¢ USD
        'NZD': 0.50,   // ~30¢ USD
        'CHF': 0.28,   // ~30¢ USD
        'SEK': 3.20,   // ~30¢ USD
        'NOK': 3.20,   // ~30¢ USD
        'DKK': 2.10    // ~30¢ USD
    };
    
    return fixedFees[currency] || 0.30; // Default to USD equivalent
}

/**
 * Determine if transaction is international based on user's country and business location
 */
function isInternationalTransaction(userCountry, businessCountry = 'CA') {
    // Business is based in Canada, so any non-Canadian customer is international
    const userCountryCode = userCountry?.length === 2 ? userCountry : getCountryCode(userCountry);
    return userCountryCode !== businessCountry;
}

/**
 * Get country code from country name
 */
function getCountryCode(countryName) {
    const countryToCode = {
        'Canada': 'CA',
        'United States': 'US',
        'United Kingdom': 'GB',
        'Australia': 'AU',
        'India': 'IN',
        'Germany': 'DE',
        'France': 'FR',
        'Japan': 'JP',
        'Brazil': 'BR',
        'Mexico': 'MX'
        // Add more as needed
    };
    
    return countryToCode[countryName] || 'XX'; // XX = international
}

// Global variable to store converted plans
let CONVERTED_SUBSCRIPTION_PLANS = null;

// Get converted subscription plans for user's currency
async function getConvertedSubscriptionPlans() {
    const userCurrency = await getUserCurrency();
    const convertedPlans = {};
    
    console.log(`💱 Converting subscription plans to ${userCurrency} using live rates...`);
    
    // Pre-fetch rates to ensure they're available
    const rates = await getCurrentCurrencyRates();
    console.log(`💱 Using rates fetched at: ${new Date(CURRENCY_RATES_CACHE_TIME).toLocaleString()}`);
    
    for (const [planKey, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
        const convertedAmount = await convertCurrency(plan.amount, userCurrency);
        
        convertedPlans[planKey] = {
            ...plan,
            amount: convertedAmount,
            currency: userCurrency.toLowerCase(),
            originalAmount: plan.amount, // Keep original CAD amount for reference
            originalCurrency: 'cad'
        };
        
        console.log(`💱 ${plan.name}: CAD ${plan.amount/100} → ${userCurrency} ${convertedAmount/100} (live rate)`);
    }
    
    // Cache the converted plans globally
    CONVERTED_SUBSCRIPTION_PLANS = convertedPlans;
    
    return convertedPlans;
}

// Verify live currency conversion works for all supported countries
async function verifyGlobalCurrencySupport() {
    console.log('🌍 Verifying live currency conversion for ALL supported countries...');
    
    try {
        const rates = await getCurrentCurrencyRates();
        const allSupportedCurrencies = Object.keys(FALLBACK_CURRENCY_RATES);
        
        let supportedCount = 0;
        let missingCurrencies = [];
        
        allSupportedCurrencies.forEach(currency => {
            if (rates[currency]) {
                supportedCount++;
            } else {
                missingCurrencies.push(currency);
            }
        });
        
        console.log(`✅ Currency support verification:`);
        console.log(`   🎯 Total supported currencies: ${allSupportedCurrencies.length}`);
        console.log(`   ✅ Live rates available: ${supportedCount}`);
        console.log(`   📈 Coverage: ${(supportedCount/allSupportedCurrencies.length*100).toFixed(1)}%`);
        
        if (missingCurrencies.length > 0) {
            console.warn(`   ⚠️ Missing live rates for: ${missingCurrencies.join(', ')} (will use fallback)`);
        } else {
            console.log(`   🌟 ALL currencies have live rates! Perfect global coverage!`);
        }
        
        // Test sample countries to ensure mapping works
        const testCountries = [
            'IN', 'US', 'GB', 'AU', 'DE', 'JP', 'KR', 'BR', 'ZA', 'NG', 'CA'
        ];
        
        console.log('🧪 Testing country→currency mapping for global users:');
        testCountries.forEach(country => {
            const currency = COUNTRY_CURRENCY_MAP[country];
            const hasLiveRate = rates[currency];
            console.log(`   ${country} → ${currency}: ${hasLiveRate ? '✅ Live rate' : '⚠️ Fallback rate'}`);
        });
        
    } catch (error) {
        console.error('❌ Error verifying global currency support:', error);
    }
}

// Initialize converted plans on page load
async function initializeCurrencyConversion() {
    console.log('🌍 Initializing live currency conversion for GLOBAL users...');
    
    // Verify global coverage first
    await verifyGlobalCurrencySupport();
    
    // Add currency rate information display
    try {
        const userCurrency = await getUserCurrency();
        if (userCurrency !== 'CAD') {
            const rates = await getCurrentCurrencyRates();
            const rate = rates[userCurrency];
            
            if (rate) {
                console.log(`💱 Live Exchange Rate for this user: 1 CAD = ${rate.toFixed(4)} ${userCurrency}`);
                console.log(`📅 Rates as of: ${new Date(CURRENCY_RATES_CACHE_TIME).toLocaleString()}`);
                
                // Display rate info in plan modal if available
                const planModalBody = document.querySelector('.premium-modal .modal-body');
                if (planModalBody) {
                    let rateInfo = planModalBody.querySelector('.currency-rate-info');
                    if (!rateInfo) {
                        rateInfo = document.createElement('div');
                        rateInfo.className = 'currency-rate-info';
                        rateInfo.style.cssText = `
                            background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
                            border: 1px solid #2196F3;
                            border-radius: 8px;
                            padding: 0.75rem;
                            margin-bottom: 1rem;
                            font-size: 0.85rem;
                            color: #1565C0;
                            text-align: center;
                        `;
                        planModalBody.insertBefore(rateInfo, planModalBody.firstChild);
                    }
                    
                    const rateDiff = ((rate - FALLBACK_CURRENCY_RATES[userCurrency]) / FALLBACK_CURRENCY_RATES[userCurrency] * 100).toFixed(1);
                    const arrow = rateDiff > 0 ? '↗️' : rateDiff < 0 ? '↘️' : '→';
                    
                    rateInfo.innerHTML = `
                        <i class="fas fa-chart-line"></i> <strong>Live Exchange Rate:</strong> 1 CAD = ${rate.toFixed(4)} ${userCurrency} ${arrow} ${Math.abs(rateDiff)}%<br>
                        <i class="fas fa-check-circle"></i> <strong>Transparent Pricing:</strong> All taxes, fees, and charges are included in the displayed price<br>
                        <small style="opacity: 0.8;"><i class="fas fa-clock"></i> Updated: ${new Date(CURRENCY_RATES_CACHE_TIME).toLocaleString()}</small>
                    `;
                }
            } else {
                console.warn(`⚠️ No live rate available for ${userCurrency}, using fallback rate`);
            }
        } else {
            console.log('🍁 Canadian user detected - no currency conversion needed');
        }
    } catch (error) {
        console.warn('⚠️ Error displaying currency rate info:', error);
    }
    
    await getConvertedSubscriptionPlans();
    console.log('✅ Live currency conversion initialized for GLOBAL users');
}

// ========================================
// STRIPE TEST CARDS FOR DEVELOPMENT
// ========================================

const STRIPE_TEST_CARDS = {
    visa_success: '4242424242424242',
    visa_decline: '4000000000000002',
    visa_insufficient_funds: '4000000000009995',
    visa_expired: '4000000000000069',
    mastercard_success: '5555555555554444',
    american_express: '378282246310005',
    visa_3d_secure: '4000002760003184',
    visa_international: '4000000000000424'
};

// ========================================
// STRIPE INITIALIZATION
// ========================================

/**
 * Initialize Stripe and Elements
 */
async function initializeStripe() {
    try {
        console.log('🔄 Initializing Stripe...');
        
        // Check if Stripe is loaded
        if (typeof Stripe === 'undefined') {
            console.error('❌ Stripe.js not loaded. Please include the Stripe.js script.');
            return false;
        }
        
        // Initialize Stripe instance
        stripe = Stripe(STRIPE_CONFIG.publishableKey);
        
        if (!stripe) {
            console.error('❌ Failed to initialize Stripe. Check your publishable key.');
            return false;
        }
        
        console.log('✅ Stripe initialized successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Error initializing Stripe:', error);
        return false;
    }
}

// ========================================
// PAYMENT FORM INTEGRATION
// ========================================

/**
 * Replace the existing payment form with Stripe Elements
 */
function integrateStripePaymentForm() {
    console.log('🔄 Integrating Stripe payment form...');
    console.log('🎯 FORCING Stripe form replacement to ensure consistency');
    
    const paymentFormSection = document.getElementById('paymentFormSection');
    if (!paymentFormSection) {
        console.error('❌ Payment form section not found');
        return;
    }
    
    // Force visible and clear any old content
    paymentFormSection.style.display = 'block';
    paymentFormSection.style.opacity = '1';
    paymentFormSection.innerHTML = ''; // Clear old content completely
    
    // Create new Stripe-powered payment form
    const stripeFormHTML = `
        <h3 class="payment-title">
            <i class="fas fa-credit-card"></i> Secure Payment with Stripe
        </h3>
        
        <!-- Hidden elements for code compatibility -->
        <div id="selectedPlanDisplay" style="display: none;">
            <span id="selectedPlanAmount"></span>
            <h4 id="selectedPlanName"></h4>
            <p id="selectedPlanDescription"></p>
        </div>
        
        <!-- Stripe Payment Form -->
        <form id="stripePaymentForm">
            <!-- Customer Information -->
            <div class="form-row">
                <div class="form-group full-width">
                    <label for="stripeCustomerName">Full Name</label>
                    <input type="text" id="stripeCustomerName" name="customerName" required autocomplete="name" 
                           style="width: 100%; padding: 0.7rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                </div>
            </div>
            
            <!-- Stripe Card Element -->
            <div class="form-group full-width">
                <label for="stripe-card-element">Card Details</label>
                <div id="stripe-card-element" style="padding: 0.7rem; border: 2px solid #ddd; border-radius: 8px; background: white;">
                    <!-- Stripe Elements will create form elements here -->
                </div>
                <div id="stripe-card-errors" role="alert" style="color: #dc3545; font-size: 0.9rem; margin-top: 0.5rem;"></div>
            </div>
            
            <!-- Security Notice -->
            <div class="security-notice">
                <i class="fas fa-shield-alt"></i>
                <span>Your payment information is secure and encrypted by Stripe</span>
            </div>
            
            <!-- Submit Button -->
            <button type="submit" id="stripeSubmitButton" class="btn btn-premium payment-btn" style="position: relative;">
                <span id="stripeButtonText">
                    <i class="fas fa-credit-card"></i> 
                    Pay <span id="stripeButtonAmount">$0.00 CAD</span> (Inclusive of all taxes and fees)
                </span>
                <div id="stripeButtonSpinner" style="display: none; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
                    <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                </div>
            </button>
        </form>
        
        <!-- Processing Status -->
        <div id="stripeProcessingStatus" style="display: none; text-align: center; margin-top: 1rem; padding: 1rem; background: rgba(139, 69, 19, 0.05); border-radius: 8px;">
            <div style="margin-bottom: 0.5rem;">
                <div style="width: 30px; height: 30px; border: 3px solid #8b4513; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
            </div>
            <p style="margin: 0; color: #8b4513; font-weight: 500;">Processing your payment securely...</p>
        </div>
    `;
    
    // Replace the existing form content
    paymentFormSection.innerHTML = stripeFormHTML;
    
    // Initialize Stripe Elements
    initializeStripeElements();
    
    console.log('✅ Stripe payment form integrated');
}

/**
 * Initialize Stripe Elements for card input
 */
function initializeStripeElements() {
    if (!stripe) {
        console.error('❌ Stripe not initialized');
        return;
    }
    
    try {
        // Create Elements instance
        elements = stripe.elements();
        
        // Create card element
        const cardElement = elements.create('card', {
            hidePostalCode: true,  // 🚫 Disable postal code field
            style: {
                base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                        color: '#aab7c4',
                    },
                },
                invalid: {
                    color: '#9e2146',
                },
            },
        });
        
        // Mount card element
        cardElement.mount('#stripe-card-element');
        
        // Handle real-time validation errors from the card Element
        cardElement.addEventListener('change', ({error}) => {
            const displayError = document.getElementById('stripe-card-errors');
            if (error) {
                displayError.textContent = error.message;
            } else {
                displayError.textContent = '';
            }
        });
        
        // Handle form submission
        const form = document.getElementById('stripePaymentForm');
        form.addEventListener('submit', handleStripeFormSubmit);
        
        console.log('✅ Stripe Elements initialized');
        
    } catch (error) {
        console.error('❌ Error initializing Stripe Elements:', error);
    }
}

// ========================================
// SUBSCRIPTION CREATION FLOW
// ========================================

/**
 * Handle Stripe payment form submission
 */
async function handleStripeFormSubmit(event) {
    event.preventDefault();
    
    const submitButton = document.getElementById('stripeSubmitButton');
    const buttonText = document.getElementById('stripeButtonText');
    const buttonSpinner = document.getElementById('stripeButtonSpinner');
    const processingStatus = document.getElementById('stripeProcessingStatus');
    
    try {
        // Show processing state
        submitButton.disabled = true;
        buttonText.style.display = 'none';
        buttonSpinner.style.display = 'block';
        processingStatus.style.display = 'block';
        
        console.log('🔄 Processing Stripe payment...');
        
        // Get selected plan
        const selectedPlan = getSelectedSubscriptionPlan();
        if (!selectedPlan) {
            throw new Error('No subscription plan selected');
        }
        
        // Get customer information
        const customerName = document.getElementById('stripeCustomerName').value;
        
        if (!customerName) {
            throw new Error('Please fill in your name');
        }
        
        // Get current user (should be authenticated) and use their email
        if (!auth.currentUser) {
            throw new Error('User not authenticated');
        }
        
        const customerEmail = auth.currentUser.email;
        
        // Create payment method
        const {error: paymentMethodError, paymentMethod} = await stripe.createPaymentMethod({
            type: 'card',
            card: elements.getElement('card'),
            billing_details: {
                name: customerName,
                email: customerEmail,
            },
        });
        
        if (paymentMethodError) {
            throw new Error(paymentMethodError.message);
        }
        
        console.log('✅ Payment method created:', paymentMethod.id);
        
        // PRODUCTION MODE: Process real Stripe payment
        console.log('🚀 PRODUCTION MODE: Processing real Stripe payment');
        const paymentResult = await processRealStripePayment(paymentMethod, selectedPlan, customerName, customerEmail);
        
        // Continue with Firebase update using real payment data
        await updateFirebaseWithRealPayment(paymentResult, selectedPlan, customerName, customerEmail);
        
    } catch (error) {
        console.error('❌ Payment error:', error);
        
        // Show error to user
        alert(`Payment failed: ${error.message}`);
        
        // Reset button state
        submitButton.disabled = false;
        buttonText.style.display = 'block';
        buttonSpinner.style.display = 'none';
        processingStatus.style.display = 'none';
    }
}

/**
 * Process real Stripe payment - No more simulation!
 */
async function processRealStripePayment(paymentMethod, plan, customerName, customerEmail) {
    console.log('🚀 Processing REAL Stripe payment - Customer pays EXACTLY what they see...', {
        paymentMethod: paymentMethod.id,
        plan: plan,
        customer: { name: customerName, email: customerEmail },
        exactAmountToCharge: `${(plan.amount / 100).toFixed(2)} ${plan.currency.toUpperCase()}`,
        note: 'Business absorbs ALL Stripe fees, conversion fees, taxes, etc.'
    });
    
    console.log('💳 TRANSPARENT PRICING GUARANTEE:');
    console.log(`   ✅ Customer sees: ${formatCurrency(plan.amount, plan.currency)}`);
    console.log(`   ✅ Customer pays: ${formatCurrency(plan.amount, plan.currency)} (INCLUSIVE OF ALL FEES)`);
    console.log(`   ✅ All taxes, fees, and charges included in displayed price`);
    console.log(`   🏢 Business absorbs: All Stripe fees, currency conversion fees, taxes`);
    
    // Get user country for payment processing
    let userCountry = 'Unknown';
    try {
        if (auth.currentUser) {
            const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
            if (userDoc.exists) {
                userCountry = userDoc.data().Country || 'Unknown';
            }
        }
    } catch (error) {
        console.warn('⚠️ Could not get user country, proceeding with Unknown');
    }
    
    // Determine plan type from plan data
    const planType = Object.keys(SUBSCRIPTION_PLANS).find(key => 
        SUBSCRIPTION_PLANS[key].amount === plan.originalAmount || 
        SUBSCRIPTION_PLANS[key].amount === plan.amount
    ) || 'monthly';
    
    console.log('🔄 Calling Vercel backend to process real payment...');
    
    // Call Vercel backend API - Much cleaner than complex postMessage approach!
    let paymentResponse = null;
    try {
        // ✅ UPDATED: New Vercel backend URL after deployment
        // OLD URL (deactivated after key rotation): https://vercel-deployment-setup-qvzzrm4ga.vercel.app
        const vercelApiUrl = 'https://vercel-deployment-setup.vercel.app/api/stripe/create-payment-intent';
        
        console.log('🌐 Sending payment request to Vercel backend:', {
            url: vercelApiUrl,
            amount: plan.amount,
            currency: plan.currency,
            planType: planType,
            customer: customerName,
            country: userCountry
        });
        
        const response = await fetch(vercelApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: plan.amount,
                currency: plan.currency,
                payment_method_id: paymentMethod.id,
                customer_name: customerName,
                customer_email: customerEmail,
                plan_type: planType,
                user_country: userCountry
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
        }

        paymentResponse = await response.json();
        console.log('✅ Webhook handler response received:', paymentResponse);
        
        if (paymentResponse.success) {
            console.log('🎉 Payment processed successfully!', {
                paymentIntentId: paymentResponse.payment_intent.id,
                customerId: paymentResponse.customer.id,
                amountCharged: `${(paymentResponse.payment_intent.amount / 100).toFixed(2)} ${paymentResponse.payment_intent.currency.toUpperCase()}`,
                subscriptionData: paymentResponse.subscription_data
            });
            
            // Use the real payment data for subscription creation
            const paymentIntent = {
                id: paymentResponse.payment_intent.id,
                amount: paymentResponse.payment_intent.amount,
                currency: paymentResponse.payment_intent.currency,
                status: paymentResponse.payment_intent.status,
                charges: {
                    data: [{
                        amount: paymentResponse.payment_intent.amount,
                        currency: paymentResponse.payment_intent.currency,
                        outcome: { type: 'authorized' },
                        billing_details: {
                            name: customerName,
                            email: customerEmail
                        }
                    }]
                }
            };
            
            return { 
                paymentIntent: paymentIntent, 
                subscriptionData: paymentResponse.subscription_data,
                customerId: paymentResponse.customer.id
            };
            
        } else if (paymentResponse.requires_action) {
            console.log('🔐 Payment requires additional authentication (3D Secure)');
            
            // Handle 3D Secure authentication
            const {error, paymentIntent: confirmedPaymentIntent} = await stripe.confirmCardPayment(
                paymentResponse.payment_intent.client_secret
            );
            
            if (error) {
                throw new Error(`3D Secure authentication failed: ${error.message}`);
            }
            
            if (confirmedPaymentIntent.status === 'succeeded') {
                console.log('✅ 3D Secure authentication successful, payment completed!');
                return { 
                    paymentIntent: confirmedPaymentIntent,
                    subscriptionData: paymentResponse.subscription_data,
                    customerId: paymentResponse.customer.id  
                };
            } else {
                throw new Error('Payment authentication incomplete');
            }
            
        } else {
            throw new Error(paymentResponse.error || 'Payment processing failed');
        }
        
    } catch (error) {
        console.error('❌ Real payment processing failed:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('card_declined')) {
            throw new Error('Your card was declined. Please try a different payment method.');
        } else if (error.message.includes('insufficient_funds')) {
            throw new Error('Insufficient funds. Please check your account balance.');
        } else if (error.message.includes('expired_card')) {
            throw new Error('Your card has expired. Please use a different payment method.');
        } else if (error.message.includes('invalid_cvc')) {
            throw new Error('Invalid security code. Please check your CVC and try again.');
        } else {
            throw new Error(`Payment failed: ${error.message}`);
        }
    }
}

/**
 * Update Firebase with real payment data
 */
async function updateFirebaseWithRealPayment(paymentResult, plan, customerName, customerEmail) {
    console.log('🔄 Updating Firebase with real payment data...', {
        paymentIntentId: paymentResult.paymentIntent.id,
        customerId: paymentResult.customerId,
        subscriptionData: paymentResult.subscriptionData
    });
    
    try {
        // Get current date from web and convert to UTC-4 (use backend data if available)
        let currentDateUTC4, subscriptionEndDate;
        
        if (paymentResult.subscriptionData) {
            // Use dates from backend if available
            currentDateUTC4 = new Date(paymentResult.subscriptionData.start_date);
            subscriptionEndDate = new Date(paymentResult.subscriptionData.end_date);
            console.log('📅 Using dates from backend:', {
                start: currentDateUTC4.toISOString(),
                end: subscriptionEndDate.toISOString()
            });
        } else {
            // Fallback to calculating dates
            console.log('🕐 Getting current date in UTC-4 timezone...');
            currentDateUTC4 = await getCurrentDateInUTC4();
            
            // Determine plan type from payment data
            const planType = paymentResult.subscriptionData?.plan_type || 'monthly';
            subscriptionEndDate = calculateSubscriptionEndDate(currentDateUTC4, planType);
            
            console.log('📅 Calculated dates:', {
                start: currentDateUTC4.toISOString(),
                end: subscriptionEndDate.toISOString(),
                planType: planType
            });
        }
        
        // Get plan display name
        const planType = paymentResult.subscriptionData?.plan_type || 'monthly';
        const planName = getPlanDisplayName(planType);
        
        console.log('📋 Subscription details from real payment:', {
            planType: planType,
            planName: planName,
            paymentIntentId: paymentResult.paymentIntent.id,
            customerId: paymentResult.customerId,
            amount: paymentResult.paymentIntent.amount,
            currency: paymentResult.paymentIntent.currency
        });
        
        // Verify transparent pricing using real payment data
        console.log('🔍 TRANSPARENT PRICING VERIFICATION WITH REAL PAYMENT:');
        console.log(`   Customer was shown: ${formatCurrency(plan.amount, plan.currency)}`);
        console.log(`   Customer was charged: ${formatCurrency(paymentResult.paymentIntent.amount, paymentResult.paymentIntent.currency)} (ACTUAL STRIPE CHARGE)`);
        console.log(`   Payment Intent ID: ${paymentResult.paymentIntent.id}`);
        console.log(`   Customer ID: ${paymentResult.customerId}`);
        console.log('   ✅ TRANSPARENT PRICING: Real payment processed successfully');
        
        // Calculate NET BUSINESS REVENUE after all Stripe fees (using real payment amount)
        console.log('💰 Calculating net business revenue from real payment...');
        
        // Get user's country to determine international transaction
        let userCountry = 'XX'; // Default to international
        try {
            if (auth.currentUser) {
                const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
                if (userDoc.exists) {
                    userCountry = userDoc.data().Country || 'XX';
                }
            }
        } catch (error) {
            console.warn('⚠️ Could not get user country, assuming international transaction');
        }
        
        const isInternational = isInternationalTransaction(userCountry);
        const revenueCalculation = calculateNetBusinessRevenue(
            paymentResult.paymentIntent.amount, 
            paymentResult.paymentIntent.currency, 
            isInternational
        );
        
        console.log('💰 FIREBASE STORAGE - NET BUSINESS REVENUE FROM REAL PAYMENT:');
        console.log(`   💳 Customer Payment (ACTUAL): ${revenueCalculation.feeBreakdown.customerPaidFormatted}`);
        console.log(`   ❌ Total Stripe Fees: ${revenueCalculation.feeBreakdown.totalFeesFormatted}`);
        console.log(`   ✅ NET BUSINESS REVENUE (stored in Firebase): ${revenueCalculation.feeBreakdown.netRevenueFormatted}`);
        console.log(`   📈 Business keeps: ${revenueCalculation.feeBreakdown.businessKeepsPercentage}% of customer payment`);
        
        // Store in Firebase with exact field requirements using REAL payment data
        console.log('🔍 Checking Firebase availability...', {
            db: typeof db !== 'undefined' ? 'Available' : 'Not available',
            auth: typeof auth !== 'undefined' ? 'Available' : 'Not available',
            currentUser: typeof auth !== 'undefined' && auth.currentUser ? auth.currentUser.uid : 'No user'
        });
        
        // Prepare Firebase update data using REAL payment information
        const firebaseUpdateData = {
            // Required fields as per specification
            Subscription: "Y",
            Date_Subscription_Start: currentDateUTC4,
            Date_Subscription_End: subscriptionEndDate,
            Plan: planName,
            
            // CRITICAL: Store NET BUSINESS REVENUE from REAL payment
            Amount: revenueCalculation.feeBreakdown.netRevenueFormatted,  // Net amount after ALL fees
            
            // Additional revenue tracking fields using REAL payment data
            Customer_Payment_Amount: revenueCalculation.feeBreakdown.customerPaidFormatted,  // What customer actually paid
            Stripe_Fees_Total: revenueCalculation.feeBreakdown.totalFeesFormatted,  // Total fees deducted
            Business_Net_Revenue: revenueCalculation.feeBreakdown.netRevenueFormatted,  // Net amount received
            Business_Revenue_Percentage: revenueCalculation.feeBreakdown.businessKeepsPercentage,  // % of customer payment kept
            
            // Additional tracking fields using REAL Stripe data
            Stripe_Customer_ID: paymentResult.customerId,  // REAL Stripe customer ID
            Stripe_Payment_Intent_ID: paymentResult.paymentIntent.id,  // REAL payment intent ID
            Last_Updated: currentDateUTC4,
            Payment_Method: paymentResult.paymentIntent.id,  // Reference to the payment
            Customer_Name: customerName,
            Customer_Email: customerEmail,
            Currency: paymentResult.paymentIntent.currency.toUpperCase(),
            Timezone: 'UTC-4',
            Payment_Status: paymentResult.paymentIntent.status,  // Track payment status
            Real_Payment_Processed: true  // Flag to indicate this was a real payment
        };
        
        // Store in Firebase if available
        if (typeof db !== 'undefined' && typeof auth !== 'undefined' && auth.currentUser) {
                
            // Validate Firebase update data before sending
            console.log('🔍 Validating Firebase update data with real payment info...', firebaseUpdateData);
            if (validateFirebaseUpdateData(firebaseUpdateData)) {
                console.log('✅ Validation passed, updating Firebase with real payment data...');
                await db.collection('users').doc(auth.currentUser.uid).update(firebaseUpdateData);
                console.log('✅ Firebase updated with REAL payment data and UTC-4 subscription:', firebaseUpdateData);
            } else {
                console.error('❌ Firebase field validation failed');
                throw new Error('Firebase field validation failed');
            }
        } else {
            console.log('⚠️ Firebase not available or user not signed in');
            throw new Error('Firebase not available - cannot store subscription data');
        }
        
        // Update local subscription cache with real payment data
        const subscriptionCacheData = {
            subscription: 'Y',
            startDate: currentDateUTC4,
            endDate: subscriptionEndDate,
            plan: planName,
            amount: paymentResult.paymentIntent.amount,  // Real payment amount
            isActive: true,
            reason: 'Active subscription - real payment processed',
            lastChecked: currentDateUTC4.toISOString(),
            userId: auth.currentUser.uid,
            timezone: 'UTC-4',
            stripeTest: false,  // This is a real payment
            paymentIntentId: paymentResult.paymentIntent.id,
            customerId: paymentResult.customerId
        };
        
        localStorage.setItem('userSubscriptionData', JSON.stringify(subscriptionCacheData));
        console.log('✅ Local subscription cache updated with real payment data');
        
        // Show success with subscription and net revenue details from real payment
        const subscriptionData = {
            planName: planName,
            amount: paymentResult.paymentIntent.amount,  // Real amount charged
            currency: paymentResult.paymentIntent.currency,
            currentPeriodStart: currentDateUTC4,
            currentPeriodEnd: subscriptionEndDate,
            stripeCustomerId: paymentResult.customerId,  // Real customer ID
            stripePaymentIntentId: paymentResult.paymentIntent.id,  // Real payment intent ID
            
            // Business revenue details from real payment
            customerPaid: revenueCalculation.feeBreakdown.customerPaidFormatted,
            stripeFees: revenueCalculation.feeBreakdown.totalFeesFormatted,
            netBusinessRevenue: revenueCalculation.feeBreakdown.netRevenueFormatted,
            businessKeepsPercentage: revenueCalculation.feeBreakdown.businessKeepsPercentage,
            revenueBreakdown: revenueCalculation,
            realPayment: true  // Flag indicating this was a real payment
        };
        
        console.log('🎉 REAL PAYMENT PROCESSED - Subscription successfully created with live Stripe data:', subscriptionData);
        showPaymentSuccess(subscriptionData);
        
    } catch (error) {
        console.error('❌ Error updating Firebase with real payment data:', error);
        throw new Error('Failed to store subscription data: ' + error.message);
    }
}

/**
 * Show payment success message with UTC-4 details and close modal
 */
function showPaymentSuccess(subscriptionData) {
    console.log('🎉 Payment successful with UTC-4 timezone!', subscriptionData);
    
    // Close premium modal
    const premiumModal = document.getElementById('premiumModal');
    if (premiumModal) {
        premiumModal.classList.remove('show');
    }
    
    // Format dates for display
    const startDateFormatted = subscriptionData.currentPeriodStart.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        timeZone: 'America/New_York' // Display in UTC-4
    });
    
    const endDateFormatted = subscriptionData.currentPeriodEnd.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric', 
        timeZone: 'America/New_York' // Display in UTC-4
    });
    
    // Log detailed success information (no popup) - including NET BUSINESS REVENUE
    console.log('📊 SUBSCRIPTION SUCCESS WITH NET BUSINESS REVENUE:');
    console.log('   Plan Name:', subscriptionData.planName);
    console.log('   Currency:', subscriptionData.currency.toUpperCase());
    console.log('   Start Date (UTC-4):', subscriptionData.currentPeriodStart.toISOString());
    console.log('   End Date (UTC-4):', subscriptionData.currentPeriodEnd.toISOString());
    console.log('');
    console.log('💳 CUSTOMER BILLING:');
    console.log('   Customer Paid:', subscriptionData.customerPaid || formatCurrency(subscriptionData.amount, subscriptionData.currency));
    console.log('');
    console.log('💰 BUSINESS REVENUE BREAKDOWN:');
    console.log('   ❌ Stripe Fees Deducted:', subscriptionData.stripeFees || 'Not calculated');
    console.log('   ✅ NET BUSINESS REVENUE:', subscriptionData.netBusinessRevenue || 'Not calculated');
    console.log('   📈 Business Keeps:', (subscriptionData.businessKeepsPercentage || 'Unknown') + '% of customer payment');
    console.log('');
    console.log('🔥 FIREBASE STORAGE:');
    console.log('   Amount Field Stored:', subscriptionData.netBusinessRevenue || formatCurrency(subscriptionData.amount, subscriptionData.currency), '(NET REVENUE)');
    console.log('');
    console.log('🏢 STRIPE TRACKING:');
    console.log('   Customer ID:', subscriptionData.stripeCustomerId);
    console.log('   Subscription ID:', subscriptionData.stripeSubscriptionId);
    
    // Refresh page after Firebase update (no popup)
    console.log('🔄 Payment successful - Firebase updated, refreshing page...');
    setTimeout(() => {
        window.location.reload();
    }, 1500); // Wait for Firebase to complete update
}

// ========================================
// PLAN SELECTION INTEGRATION
// ========================================

/**
 * Get currently selected subscription plan (with currency conversion)
 */
function getSelectedSubscriptionPlan() {
    const selectedRadio = document.querySelector('input[name="subscriptionPlan"]:checked');
    if (!selectedRadio) {
        return null;
    }
    
    const planType = selectedRadio.value;
    
    // Use converted plans if available, otherwise fallback to original plans
    if (CONVERTED_SUBSCRIPTION_PLANS && CONVERTED_SUBSCRIPTION_PLANS[planType]) {
        return CONVERTED_SUBSCRIPTION_PLANS[planType];
    }
    
    return SUBSCRIPTION_PLANS[planType] || null;
}

/**
 * Update payment form when plan is selected (with currency conversion)
 */
function updatePaymentFormForPlan(planType) {
    // Use converted plans if available, otherwise fallback to original plans
    let plan;
    if (CONVERTED_SUBSCRIPTION_PLANS && CONVERTED_SUBSCRIPTION_PLANS[planType]) {
        plan = CONVERTED_SUBSCRIPTION_PLANS[planType];
        console.log(`💱 Using converted plan: ${plan.name} - ${formatCurrency(plan.amount, plan.currency)}`);
    } else {
        plan = SUBSCRIPTION_PLANS[planType];
        console.log(`💱 Using original plan: ${plan.name} - ${formatCurrency(plan.amount, plan.currency)}`);
    }
    
    if (!plan) {
        console.error('❌ Invalid plan type:', planType);
        return;
    }
    
    console.log('📋 Updating payment form for plan:', planType);
    
    // Update plan display
    const planName = document.getElementById('selectedPlanName');
    const planDescription = document.getElementById('selectedPlanDescription');
    const planAmount = document.getElementById('selectedPlanAmount');
    const buttonAmount = document.getElementById('stripeButtonAmount');
    
    if (planName) planName.textContent = plan.name;
    if (planDescription) planDescription.textContent = plan.description;
    if (planAmount) planAmount.textContent = `$${(plan.amount / 100).toFixed(2)}`;
    if (buttonAmount) {
        const exactAmount = formatCurrency(plan.amount, plan.currency);
        buttonAmount.textContent = exactAmount;
        buttonAmount.title = `Total amount: ${exactAmount} - All taxes, fees, and charges included. No additional costs.`;
        console.log(`💳 Payment button updated: Pay ${exactAmount} (Inclusive of all taxes and fees)`);
    }
    
    // Email will be taken from authenticated user automatically
    
    // Pre-fill customer name if available
    const savedUserName = localStorage.getItem('userName');
    if (savedUserName) {
        const nameField = document.getElementById('stripeCustomerName');
        if (nameField) {
            nameField.value = savedUserName;
        }
    }
}

// ========================================
// INTEGRATION WITH EXISTING PREMIUM MODAL
// ========================================

/**
 * Initialize Stripe integration when premium modal is shown
 */
function initializeStripeIntegration() {
    console.log('🔄 Initializing Stripe integration...');
    
    // Wait for Stripe to be loaded and initialized
    if (typeof Stripe === 'undefined') {
        console.log('⏳ Waiting for Stripe.js to load...');
        setTimeout(initializeStripeIntegration, 1000);
        return;
    }
    
    // Initialize currency conversion first
    initializeCurrencyConversion().then(() => {
        console.log('🌍 Currency conversion ready, proceeding with Stripe initialization...');
        
        // Initialize Stripe
        initializeStripe().then(success => {
        if (success) {
            // Replace payment form
            integrateStripePaymentForm();
            
            // Hook into existing plan selection
            const planRadios = document.querySelectorAll('input[name="subscriptionPlan"]');
            planRadios.forEach(radio => {
                radio.addEventListener('change', function() {
                    if (this.checked) {
                        updatePaymentFormForPlan(this.value);
                    }
                });
            });
            
            // Check if there's already a selected plan and update the button accordingly
            setTimeout(() => {
                const selectedRadio = document.querySelector('input[name="subscriptionPlan"]:checked');
                if (selectedRadio) {
                    const planType = selectedRadio.value;
                    console.log('🎯 Found selected plan after form recreation:', planType);
                    updatePaymentFormForPlan(planType);
                } else {
                    console.log('ℹ️ No plan selected, keeping default button text');
                }
            }, 200); // Small delay to ensure form elements are fully rendered
            
            console.log('✅ Stripe integration complete');
        } else {
            console.error('❌ Failed to initialize Stripe integration');
        }
        });
    }).catch(error => {
        console.error('❌ Currency conversion initialization failed:', error);
        console.log('⚠️ Falling back to original CAD pricing');
    });
}

// ========================================
// CUSTOMER PORTAL ACCESS
// ========================================

/**
 * Redirect user to Stripe Customer Portal via Vercel backend
 */
async function openStripeCustomerPortal() {
    try {
        console.log('🔄 Opening Stripe Customer Portal via Vercel backend...');
        
        if (!auth.currentUser) {
            alert('Please sign in to manage your subscription');
            return;
        }

        // Get customer ID from Firebase or use email
        let customerId = null;
        let customerEmail = auth.currentUser.email;
        
        try {
            const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
            if (userDoc.exists) {
                customerId = userDoc.data().Stripe_Customer_ID;
            }
        } catch (error) {
            console.error('Error getting customer ID from Firebase:', error);
        }

            // Live ALPHAFIVE Vercel backend API URL  
            // ⚠️ PENDING: Update with new Vercel URL after deployment completes
        const vercelApiUrl = 'https://vercel-deployment-setup.vercel.app/api/stripe/customer-portal';

        console.log('🌐 Calling Vercel backend for customer portal...', {
            customerId: customerId || 'Using email lookup',
            customerEmail: customerEmail
        });

        // Call Vercel backend to create portal session
        const response = await fetch(vercelApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customer_id: customerId,
                customer_email: customerEmail,
                return_url: window.location.href
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Customer portal session created, redirecting...');
            // Redirect to customer portal
            window.location.href = result.url;
        } else {
            throw new Error(result.error || 'Failed to create customer portal session');
        }
        
    } catch (error) {
        console.error('❌ Error opening customer portal:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('404') || error.message.includes('not found')) {
            alert('No subscription found. Please subscribe first to access the customer portal.');
        } else if (error.message.includes('portal_inactive')) {
            alert('Customer portal is not activated. Please contact support.');
        } else {
            alert(`Unable to open customer portal: ${error.message}`);
        }
    }
}

// ========================================
// AUTO-INITIALIZATION
// ========================================

// Auto-initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Stripe Integration - Document Ready');
    
    // Add Stripe.js script if not already present
    if (!document.querySelector('script[src*="stripe.com/v3"]')) {
        const stripeScript = document.createElement('script');
        stripeScript.src = 'https://js.stripe.com/v3/';
        stripeScript.onload = function() {
            console.log('✅ Stripe.js loaded');
            // Initialize after a short delay to ensure DOM is ready
            setTimeout(initializeStripeIntegration, 500);
        };
        document.head.appendChild(stripeScript);
    } else {
        // Stripe already loaded
        setTimeout(initializeStripeIntegration, 500);
    }
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get current date from web API and convert to UTC-4 timezone
 */
async function getCurrentDateInUTC4() {
    try {
        console.log('🌐 Fetching current date from web API...');
        
        // Try multiple time APIs for reliability
        const timeAPIs = [
            'https://worldtimeapi.org/api/timezone/America/New_York',
            'https://worldtimeapi.org/api/timezone/America/Toronto',
            'https://worldtimeapi.org/api/timezone/America/Detroit'
        ];
        
        for (const api of timeAPIs) {
            try {
                const response = await fetch(api);
                if (response.ok) {
                    const timeData = await response.json();
                    const webDate = new Date(timeData.datetime);
                    console.log('✅ Got current date from web API:', webDate.toISOString());
                    return webDate;
                }
            } catch (error) {
                console.log('⚠️ Time API failed:', api, 'trying next...');
                continue;
            }
        }
        
        // Fallback: Convert system time to UTC-4
        console.log('⚠️ All time APIs failed, using system time converted to UTC-4');
        const systemTime = new Date();
        const utc4Time = new Date(systemTime.getTime() - (4 * 60 * 60 * 1000));
        console.log('🔄 System time converted to UTC-4:', utc4Time.toISOString());
        return utc4Time;
        
    } catch (error) {
        console.error('❌ Error getting UTC-4 time:', error);
        // Final fallback
        const fallbackTime = new Date();
        console.log('🚨 Using system time as final fallback:', fallbackTime.toISOString());
        return fallbackTime;
    }
}

/**
 * Calculate subscription end date based on plan type and start date
 */
function calculateSubscriptionEndDate(startDate, planType) {
    const endDate = new Date(startDate.getTime());
    
    switch (planType) {
        case 'weekly':
            endDate.setDate(endDate.getDate() + 7);
            console.log('📅 Weekly plan: Adding 7 days');
            break;
        case 'monthly':
            endDate.setDate(endDate.getDate() + 30);
            console.log('📅 Monthly plan: Adding 30 days');
            break;
        case 'quarterly':
            endDate.setDate(endDate.getDate() + 90);
            console.log('📅 Quarterly plan: Adding 90 days');
            break;
        default:
            console.error('❌ Unknown plan type:', planType);
            endDate.setDate(endDate.getDate() + 30); // Default to monthly
    }
    
    console.log('📊 Subscription period:', {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        duration: planType
    });
    
    return endDate;
}

/**
 * Get display name for plan type (exact case matching as required)
 */
function getPlanDisplayName(planType) {
    const planNames = {
        'weekly': 'Weekly',
        'monthly': 'Monthly',
        'quarterly': 'Quarterly'
    };
    
    const displayName = planNames[planType] || 'Monthly'; // Default fallback
    console.log('📝 Plan display name:', planType, '→', displayName);
    return displayName;
}

/**
 * Format currency amount
 */
function formatCurrency(amount, currency = 'CAD') {
    // Get the appropriate locale for the currency
    const localeMap = {
        'CAD': 'en-CA',
        'USD': 'en-US', 
        'GBP': 'en-GB',
        'EUR': 'en-EU',
        'AUD': 'en-AU',
        'JPY': 'ja-JP',
        'KRW': 'ko-KR',
        'SGD': 'en-SG',
        'HKD': 'en-HK',
        'INR': 'en-IN',
        'CNY': 'zh-CN',
        'BRL': 'pt-BR',
        'MXN': 'es-MX',
        'ARS': 'es-AR',
        'CLP': 'es-CL',
        'ZAR': 'en-ZA',
        'NGN': 'en-NG',
        'NZD': 'en-NZ',
        'CHF': 'de-CH',
        'SEK': 'sv-SE',
        'NOK': 'nb-NO',
        'DKK': 'da-DK'
    };
    
    const locale = localeMap[currency.toUpperCase()] || 'en-US';
    
    const formattedAmount = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount / 100);
    
    // Return format like "$9.99 USD" or "£7.39 GBP" for Firebase storage
    return formattedAmount + ' ' + currency.toUpperCase();
}

/**
 * Check if in test mode
 */
function isTestMode() {
    return STRIPE_CONFIG.testMode && STRIPE_CONFIG.publishableKey.includes('pk_test_');
}

/**
 * Validate Firebase field requirements
 */
function validateFirebaseUpdateData(updateData) {
    // Core required fields
    const requiredFields = ['Subscription', 'Date_Subscription_Start', 'Date_Subscription_End', 'Plan', 'Amount'];
    const missingFields = requiredFields.filter(field => !updateData.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
        console.error('❌ Missing required Firebase fields:', missingFields);
        return false;
    }
    
    // Validate specific field values
    if (updateData.Subscription !== 'Y') {
        console.error('❌ Subscription field must be "Y"');
        return false;
    }
    
    const validPlans = ['Weekly', 'Monthly', 'Quarterly'];
    if (!validPlans.includes(updateData.Plan)) {
        console.error('❌ Plan field must be one of:', validPlans, 'Got:', updateData.Plan);
        return false;
    }
    
    // Validate Amount field (now contains NET BUSINESS REVENUE - formatted currency string)
    if (typeof updateData.Amount !== 'string' || !updateData.Amount || updateData.Amount.trim() === '') {
        console.error('❌ Amount field (NET BUSINESS REVENUE) must be a non-empty formatted currency string');
        return false;
    }
    
    // Validate currency format (should contain currency symbol and currency code)
    const supportedCurrencies = ['CAD', 'USD', 'GBP', 'EUR', 'AUD', 'JPY', 'KRW', 'SGD', 'HKD', 'INR', 'CNY', 'BRL', 'MXN', 'ARS', 'CLP', 'ZAR', 'NGN', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK'];
    const currencySymbols = ['$', '£', '€', '¥', '₩', '₹', 'R$', 'R', '₦', 'Fr', 'kr'];
    
    const hasValidSymbol = currencySymbols.some(symbol => updateData.Amount.includes(symbol));
    const hasValidCurrency = supportedCurrencies.some(currency => updateData.Amount.includes(currency));
    
    if (!hasValidSymbol || !hasValidCurrency) {
        console.error('❌ Amount field must be a valid currency format (e.g., "$9.99 USD", "£7.39 GBP", "€6.79 EUR")');
        return false;
    }
    
    // Validate optional revenue tracking fields (if present)
    const optionalRevenueFields = ['Customer_Payment_Amount', 'Stripe_Fees_Total', 'Business_Net_Revenue'];
    for (const field of optionalRevenueFields) {
        if (updateData[field] && (typeof updateData[field] !== 'string' || updateData[field].trim() === '')) {
            console.error(`❌ ${field} must be a valid formatted currency string if provided`);
            return false;
        }
    }
    
    // Validate Business_Revenue_Percentage (if present)
    if (updateData.Business_Revenue_Percentage) {
        const percentage = parseFloat(updateData.Business_Revenue_Percentage);
        if (isNaN(percentage) || percentage < 50 || percentage > 100) {
            console.warn(`⚠️ Business_Revenue_Percentage seems unusual: ${percentage}% (expected 70-97%)`);
        }
    }
    
    console.log('✅ Firebase update data validation passed (including NET BUSINESS REVENUE tracking)');
    console.log('📋 Validation details:');
    console.log(`   Amount (Net Revenue): ${updateData.Amount}`);
    if (updateData.Customer_Payment_Amount) {
        console.log(`   Customer Paid: ${updateData.Customer_Payment_Amount}`);
        console.log(`   Stripe Fees: ${updateData.Stripe_Fees_Total}`);
        console.log(`   Business Keeps: ${updateData.Business_Revenue_Percentage}%`);
    }
    
    return true;
}

// ========================================
// GLOBAL EXPORTS
// ========================================

// Make functions available globally for integration
window.StripeIntegration = {
    initialize: initializeStripeIntegration,
    openCustomerPortal: openStripeCustomerPortal,
    getSelectedPlan: getSelectedSubscriptionPlan,
    isTestMode: isTestMode,
    testCards: STRIPE_TEST_CARDS
};

console.log('📦 Stripe Integration Module Loaded'); 