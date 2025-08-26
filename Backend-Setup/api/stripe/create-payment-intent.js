// Vercel serverless function for creating Stripe payment intents
// Handles exact billing and global currency conversion

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    console.log('💳 Creating real payment intent for subscription...');
    
    // Add CORS headers for multiple origins (development & production)
    const allowedOrigins = [
        'https://www.gammapace.com',
        'https://gurukullam.github.io',
        'null' // For local file:// testing
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        // Allow requests with no origin (like from local files)
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { 
            amount, 
            currency, 
            payment_method_id,
            customer_name,
            customer_email,
            plan_type,
            user_country 
        } = req.body;
        
        // Validate required fields
        if (!amount || !currency || !payment_method_id || !customer_name || !customer_email || !plan_type) {
            return res.status(400).json({ 
                error: 'Missing required fields: amount, currency, payment_method_id, customer_name, customer_email, plan_type' 
            });
        }
        
        console.log('📋 Payment details:', {
            amount: amount,
            currency: currency.toUpperCase(),
            customer: customer_name,
            email: customer_email,
            plan: plan_type,
            country: user_country || 'Unknown'
        });
        
        // Create or retrieve customer
        console.log('👤 Creating/retrieving Stripe customer...');
        let customer;
        
        // Try to find existing customer by email
        const existingCustomers = await stripe.customers.list({
            email: customer_email,
            limit: 1
        });
        
        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
            console.log('✅ Found existing customer:', customer.id);
        } else {
            customer = await stripe.customers.create({
                name: customer_name,
                email: customer_email,
                metadata: {
                    plan_type: plan_type,
                    user_country: user_country || 'Unknown',
                    source: 'GammaPace IELTS'
                }
            });
            console.log('✅ Created new customer:', customer.id);
        }
        
        // Attach payment method to customer
        console.log('🔗 Attaching payment method to customer...');
        await stripe.paymentMethods.attach(payment_method_id, {
            customer: customer.id,
        });
        
        // Set as default payment method
        await stripe.customers.update(customer.id, {
            invoice_settings: {
                default_payment_method: payment_method_id,
            },
        });
        
        console.log('✅ Payment method attached and set as default');
        
        // Create payment intent with immediate confirmation
        console.log('💳 Creating payment intent for immediate payment...');
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency.toLowerCase(),
            customer: customer.id,
            payment_method: payment_method_id,
            confirmation_method: 'manual',
            confirm: true,
            return_url: 'https://www.gammapace.com/',
            metadata: {
                plan_type: plan_type,
                customer_name: customer_name,
                customer_email: customer_email,
                user_country: user_country || 'Unknown',
                subscription_type: 'one_time_subscription',
                exact_billing_guarantee: 'true'
            },
            description: `GammaPace IELTS ${plan_type} Plan Subscription`
        });
        
        console.log('✅ Payment intent created:', {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency.toUpperCase()
        });
        
        // Handle different payment intent statuses
        if (paymentIntent.status === 'succeeded') {
            console.log('🎉 Payment succeeded immediately!');
            
            // Calculate subscription end date
            const startDate = new Date();
            const endDate = new Date();
            
            switch (plan_type) {
                case 'weekly':
                    endDate.setDate(endDate.getDate() + 7);
                    break;
                case 'monthly':
                    endDate.setDate(endDate.getDate() + 30);
                    break;
                case 'quarterly':
                    endDate.setDate(endDate.getDate() + 90);
                    break;
                default:
                    endDate.setDate(endDate.getDate() + 30);
            }
            
            return res.status(200).json({
                success: true,
                payment_intent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency
                },
                customer: {
                    id: customer.id,
                    email: customer.email,
                    name: customer.name
                },
                subscription_data: {
                    plan_type: plan_type,
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    amount_paid: amount,
                    currency: currency
                }
            });
            
        } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
            console.log('🔐 Payment requires additional authentication (3D Secure)');
            
            return res.status(200).json({
                success: false,
                requires_action: true,
                payment_intent: {
                    id: paymentIntent.id,
                    client_secret: paymentIntent.client_secret,
                    status: paymentIntent.status
                }
            });
            
        } else if (paymentIntent.status === 'requires_payment_method') {
            console.log('❌ Payment failed - requires different payment method');
            
            return res.status(400).json({
                success: false,
                error: 'Payment failed. Please try a different payment method.',
                payment_intent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status
                }
            });
            
        } else {
            console.log('⚠️ Unexpected payment status:', paymentIntent.status);
            
            return res.status(400).json({
                success: false,
                error: `Unexpected payment status: ${paymentIntent.status}`,
                payment_intent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Payment intent creation failed:', error);
        
        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
            return res.status(400).json({
                success: false,
                error: error.message,
                decline_code: error.decline_code,
                type: 'card_error'
            });
        }
        
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment request. Please check your payment details.',
                type: 'invalid_request'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Payment processing failed. Please try again.',
            type: 'api_error'
        });
    }
}; 