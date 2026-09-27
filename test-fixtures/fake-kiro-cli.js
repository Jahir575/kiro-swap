#!/usr/bin/env node
// Minimal stand-in for kiro-cli: only implements `whoami` reading KIRO_API_KEY.
const KNOWN = { 'key-for-teammate2': 'teammate2@company.com' };
const [, , sub] = process.argv;
if (sub === 'whoami') {
  const key = process.env.KIRO_API_KEY;
  const email = KNOWN[key];
  if (email) {
    console.log(`Authenticated with API key\nEmail: ${email}`);
    process.exit(0);
  }
  console.log('Not logged in');
  process.exit(1);
}
process.exit(1);
