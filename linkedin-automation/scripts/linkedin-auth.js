/**
 * LinkedIn OAuth 2.0 authentication helper.
 * Run once to get your access token and Person URN.
 *
 * Usage:
 *   node scripts/linkedin-auth.js            — start OAuth flow (opens browser)
 *   node scripts/linkedin-auth.js --whoami   — print profile using stored token
 *
 * Prerequisites:
 *   - LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET set in .env
 *   - Redirect URI http://localhost:3001/callback added in your LinkedIn app settings
 */

import 'dotenv/config';
import http from 'http';
import { exec } from 'child_process';
import axios from 'axios';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, '..', '.linkedin_token');
const REDIRECT_URI = 'http://localhost:3001/callback';
const SCOPES = ['openid', 'profile', 'w_member_social'].join(' ');

async function startOAuthFlow() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    console.error('❌  LINKEDIN_CLIENT_ID not set in .env');
    process.exit(1);
  }

  const state = Math.random().toString(36).slice(2);
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${state}`;

  console.log('\n📋  LinkedIn OAuth Setup');
  console.log('────────────────────────────────────────────');
  console.log('1. Opening your browser to LinkedIn login...');
  console.log('2. After you approve, the token is saved automatically.\n');
  console.log('Auth URL (open manually if browser does not open):');
  console.log(authUrl + '\n');

  exec(`xdg-open "${authUrl}" 2>/dev/null || open "${authUrl}" 2>/dev/null || echo "Please open the URL manually"`);

  await waitForCallback(state);
}

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3001');
      if (url.pathname !== '/callback') return;

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>❌ Auth failed: ' + error + '</h2><p>Close this tab and check the terminal.</p>');
        server.close();
        reject(new Error('OAuth error: ' + error));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400);
        res.end('State mismatch — possible CSRF');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>✅ Authorised!</h2><p>Close this tab and return to your terminal.</p>');
      server.close();

      try {
        await exchangeCode(code);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3001, () => console.log('⏳  Waiting for LinkedIn callback on http://localhost:3001/callback ...'));
    server.on('error', reject);
    setTimeout(() => { server.close(); reject(new Error('Timeout waiting for OAuth callback')); }, 120000);
  });
}

async function exchangeCode(code) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  console.log('\n🔄  Exchanging code for access token...');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const { access_token, expires_in } = response.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  writeFileSync(TOKEN_FILE, JSON.stringify({ access_token, expires_in, expiresAt }, null, 2));
  console.log(`✅  Access token saved to ${TOKEN_FILE}`);
  console.log(`⚠️   Token expires: ${expiresAt} (${Math.round(expires_in / 86400)} days)`);
  console.log('\n📝  Add this to your .env file:');
  console.log(`LINKEDIN_ACCESS_TOKEN=${access_token}\n`);

  await fetchAndPrintProfile(access_token);
}

async function fetchAndPrintProfile(token) {
  if (!token) {
    if (!existsSync(TOKEN_FILE)) { console.error('No token file found. Run without --whoami first.'); process.exit(1); }
    const stored = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    token = stored.access_token;
    console.log(`Token expires: ${stored.expiresAt}`);
  }

  const response = await axios.get('https://api.linkedin.com/v2/me', {
    headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
  });

  const profile = response.data;
  const personUrn = `urn:li:person:${profile.id}`;
  console.log('\n👤  LinkedIn Profile:');
  console.log(`   Name: ${profile.localizedFirstName} ${profile.localizedLastName}`);
  console.log(`   ID:   ${profile.id}`);
  console.log(`   URN:  ${personUrn}`);
  console.log('\n📝  Add this to your .env file:');
  console.log(`LINKEDIN_PERSON_URN=${personUrn}\n`);
}

const args = process.argv.slice(2);
if (args.includes('--whoami')) {
  fetchAndPrintProfile(process.env.LINKEDIN_ACCESS_TOKEN).catch(console.error);
} else {
  startOAuthFlow().catch((err) => { console.error('❌ OAuth failed:', err.message); process.exit(1); });
}
