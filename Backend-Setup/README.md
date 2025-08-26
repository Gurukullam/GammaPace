# Backend-Setup

This folder contains backend deployment files and configurations for hosting and server-side functionality.

## Purpose

- **Vercel deployment files** (vercel.json, api routes, etc.)
- **Server configuration files**
- **Environment setup scripts**
- **Database migration files**
- **API endpoint definitions**
- **Backend security configurations**

## Note

The main application follows **HTML-only architecture** where all frontend code is embedded within HTML files. This folder is specifically for backend/deployment files that cannot be embedded in HTML.

## Structure

```
Backend-Setup/
├── README.md (this file)
├── vercel.json (Vercel deployment configuration) ✅
├── package.json (Dependencies for Vercel deployment) ✅
├── api/ (Serverless API routes for Vercel) ✅
│   ├── health.js (Health check endpoint) ✅
│   └── stripe/
│       ├── webhook.js (Secure webhook processing) ✅
│       └── create-payment-intent.js (Payment processing) ✅
├── stripe-webhook-handler.html (Legacy - replaced by Vercel)
├── stripe-products-setup.md (Product setup guide)
└── EMBED_LIBRARIES_GUIDE.md (Integration guide)
```

## 🚀 **Vercel Deployment Ready**

This backend is now configured for **secure Vercel deployment** with:
- ✅ **Serverless functions** for Stripe integration
- ✅ **Environment variables** for secret key security
- ✅ **GitHub integration** for automatic deployments
- ✅ **Global edge network** for performance
- ✅ **Real-time monitoring** and logging

**Deploy URL:** `https://gammapace-backend.vercel.app`

All files in this folder are for backend deployment and server-side functionality only. 