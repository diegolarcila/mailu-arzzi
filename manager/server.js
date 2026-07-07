const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DOCKER_SOCKET = '/var/run/docker.sock';
const CONFIG_DIR = '/config';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to make requests to Docker API over UNIX socket
function dockerRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: DOCKER_SOCKET,
      path: urlPath,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : null);
        } else {
          reject(new Error(`Docker API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Find the mailserver container ID dynamically
async function getMailserverContainerId() {
  try {
    const containers = await dockerRequest('GET', '/containers/json');
    const mailserver = containers.find(c => 
      c.Image.includes('docker-mailserver') || 
      c.Names.some(n => n.includes('mailserver'))
    );
    if (!mailserver) throw new Error('Docker Mailserver container not found.');
    return mailserver.Id;
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Execute setup command inside mailserver container
async function execInMailserver(args) {
  const containerId = await getMailserverContainerId();
  if (!containerId) throw new Error('Mailserver container is offline.');

  const execSetup = await dockerRequest('POST', `/containers/${containerId}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ['setup', ...args]
  });

  const output = await dockerRequest('POST', `/exec/${execSetup.Id}/start`, {
    Detach: false,
    Tty: false
  });
  return output;
}

// Route to get list of accounts and their DNS details
app.get('/api/data', async (req, res) => {
  try {
    const accountsPath = path.join(CONFIG_DIR, 'postfix-accounts.cf');
    let accounts = [];
    let domains = new Set();

    if (fs.existsSync(accountsPath)) {
      const content = fs.readFileSync(accountsPath, 'utf8');
      accounts = content.split('\n')
        .filter(line => line.includes('|'))
        .map(line => {
          const [email] = line.split('|');
          const domain = email.split('@')[1];
          domains.add(domain);
          return { email, domain };
        });
    }

    const dnsData = {};
    for (const domain of domains) {
      // 1. Read DKIM Key
      let dkim = 'No generated. Create an account for this domain to generate.';
      const dkimPath = path.join(CONFIG_DIR, `opendkim/keys/${domain}/mail.txt`);
      if (fs.existsSync(dkimPath)) {
        const dkimRaw = fs.readFileSync(dkimPath, 'utf8');
        // Extract string inside parentheses
        const match = dkimRaw.match(/\(([^)]+)\)/);
        if (match) {
          dkim = match[1].replace(/[\s"]/g, '');
        } else {
          dkim = dkimRaw.replace(/[\s"]/g, '');
        }
      }

      dnsData[domain] = {
        mx: `mail.arzzi.xyz (Priority: 10)`,
        spf: `v=spf1 mx ip4:173.212.255.14 ~all`,
        dkim: dkim,
        dmarc: `v=DMARC1; p=none; pct=100; rua=mailto:postmaster@${domain}`
      };
    }

    res.json({ accounts, dnsData: Object.entries(dnsData).map(([domain, records]) => ({ domain, ...records })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to create a new mail account
app.post('/api/accounts', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // 1. Add email account
    await execInMailserver(['email', 'add', email, password]);
    
    // 2. Trigger DKIM config regeneration
    await execInMailserver(['config', 'dkim']);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DMS Manager running on port ${PORT}`);
});
