# PayPal Payment Module Provider

This module implements PayPal as a payment provider for Medusa.

## Installation

Add the module to your Medusa configuration in `medusa-config.ts`:

```ts
transpileModules[Modules.PAYMENT] = {
  resolve: '@medusajs/medusa/payment',
  options: {
    providers: [
      {
        resolve: './src/modules/paypal',
        id: 'paypal',
        options: {
          client_id: process.env.PAYPAL_CLIENT_ID!,
          client_secret: process.env.PAYPAL_CLIENT_SECRET!,
          environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
          autoCapture: process.env.PAYPAL_AUTO_CAPTURE === 'true',
          webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        },
      },
    ],
  },
};
```

## Environment Variables

- `PAYPAL_CLIENT_ID`: Your PayPal Client ID
- `PAYPAL_CLIENT_SECRET`: Your PayPal Client Secret
- `PAYPAL_ENVIRONMENT`: PayPal environment (sandbox/production), defaults to 'sandbox'
- `PAYPAL_AUTO_CAPTURE`: Whether to auto-capture payments, defaults to 'false'
- `PAYPAL_WEBHOOK_ID`: PayPal webhook ID (optional)

## Usage

After adding the module to your configuration:

1. Start your Medusa application
2. Enable the PayPal payment provider in the regions where you want to offer PayPal payments
3. Configure your storefront to include PayPal payment options

## Note

This is a custom implementation of PayPal as a Payment Module Provider. It extends the `AbstractPaymentProvider` class and implements all required methods for PayPal payment processing.
