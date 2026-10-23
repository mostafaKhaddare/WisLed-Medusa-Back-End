const fs = require('fs');
let c = fs.readFileSync('medusa-config.ts', 'utf8');
if (c.includes('payment-manual')) {
  console.log('exists');
  process.exit(0);
}
const target = "        providers: [\n          {\n            resolve: '@medusajs/medusa/payment-stripe',\n            id: 'stripe',\n            options: {\n              apiKey: stripeApiKey,\n              webhookSecret: stripeWebhookSecret,\n            },\n          },\n        ],\n      },\n    };\n  }\n";
const replacement = "        providers: [\n          {\n            resolve: '@medusajs/medusa/payment-stripe',\n            id: 'stripe',\n            options: {\n              apiKey: stripeApiKey,\n              webhookSecret: stripeWebhookSecret,\n            },\n          },\n          {\n            resolve: '@medusajs/medusa/payment-manual',\n            id: 'manual',\n          },\n        ],\n      },\n    };\n  }\n";
if (c.includes(target)) {
  c = c.replace(target, replacement);
  fs.writeFileSync('medusa-config.ts', c);
  console.log('ok');
} else {
  console.log('notfound');
}
