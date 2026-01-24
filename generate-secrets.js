const crypto = require('crypto');

// Generate secure random secrets
const jwtSecret = crypto.randomBytes(64).toString('hex');
const cookieSecret = crypto.randomBytes(64).toString('hex');

console.log('Generated Secrets:');
console.log('==================');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`COOKIE_SECRET=${cookieSecret}`);
console.log('');
console.log('Please update your .env file with these values.');
