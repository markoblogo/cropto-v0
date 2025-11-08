import onchainRoutes from './server/routes/onchain.js';

console.log('✅ Testing onchain routes module');
console.log('Routes exported:', typeof onchainRoutes);
console.log('Stack:', onchainRoutes.stack?.map(r => `${r.route?.path} [${Object.keys(r.route?.methods || {}).join(',')}]`).join('\n'));
