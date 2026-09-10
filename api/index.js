const crypto = require('crypto');
const fetch = require('node-fetch');

// 1. In-memory Token Cache (Vercel container jab tak active hai token reuse hoga)
let cachedToken = null;
let tokenExpiresAt = 0;

// Signature Generation Helper (YaarWin Algorithm)
function generateSignature(payload) {
  const filtered = {};
  Object.keys(payload).sort().forEach(k => {
    const val = payload[k];
    if (val !== null && val !== '' && k !== 'signature' && k !== 'timestamp') {
      filtered[k] = val;
    }
  });
  const rawStr = JSON.stringify(filtered);
  return crypto.createHash('md5').update(rawStr).digest('hex').toUpperCase();
}

// 2. Auto-Login Function (Jab bhi token expire hoga ye naya token nikalega)
async function getValidToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiresAt - 60) {
    return cachedToken;
  }

  const username = process.env.YAARWIN_USERNAME || "917724909400";
  const pwd = process.env.YAARWIN_PASSWORD || "Ganesh9090";
  const deviceId = process.env.YAARWIN_DEVICE_ID || "de0c5c05075e5d779fe10abedd2bbcf0";

  const randomStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  const loginBody = {
    deviceId: deviceId,
    language: 0,
    logintype: "mobile",
    phonetype: 1,
    pwd: pwd,
    random: randomStr,
    username: username
  };

  loginBody.signature = generateSignature(loginBody);
  loginBody.timestamp = timestamp;

  const res = await fetch('https://api.yaarwapi62in.com/api/webapi/Login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'origin': 'https://19yaarwin.com',
      'referer': 'https://19yaarwin.com/',
      'ar-origin': 'https://19yaarwin.com',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
    },
    body: JSON.stringify(loginBody)
  });

  const json = await res.json();
  if (json.code === 0 && json.data && json.data.token) {
    cachedToken = json.data.token;
    tokenExpiresAt = json.data.expiresIn || (now + 1800);
    return cachedToken;
  }

  throw new Error(`Login Failed: ${json.msg || JSON.stringify(json)}`);
}

// 3. Single Page Fetcher
async function fetchPage(token, pageNo, pageSize = 10, typeId = 30) {
  const randomStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  const body = {
    language: 0,
    pageNo: pageNo,
    pageSize: pageSize,
    random: randomStr,
    typeId: typeId // 30 = WinGo 30S
  };

  body.signature = generateSignature(body);
  body.timestamp = timestamp;

  const res = await fetch('https://api.yaarwapi62in.com/api/webapi/GetNoaverageEmerdList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Authorization': `Bearer ${token}`,
      'origin': 'https://19yaarwin.com',
      'referer': 'https://19yaarwin.com/',
      'ar-origin': 'https://19yaarwin.com',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.code === 0 && json.data && json.data.list) {
    return json.data.list;
  }
  return [];
}

// 4. Main Handler (Vercel Serverless Function)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const requestedLimit = parseInt(req.query.limit || '500', 10);
  const totalPages = Math.min(50, Math.ceil(requestedLimit / 10)); // 50 pages = 500 records

  try {
    // Step A: Get fresh or cached Bearer Token
    let token = await getValidToken();

    // Step B: Parallel Batch Fetch (10 pages per batch for super-fast speed)
    let allRecords = [];
    const batchSize = 10;

    for (let i = 1; i <= totalPages; i += batchSize) {
      const pagePromises = [];
      for (let p = i; p < i + batchSize && p <= totalPages; p++) {
        pagePromises.push(fetchPage(token, p, 10, 30));
      }

      const batchResults = await Promise.all(pagePromises);
      batchResults.forEach(list => allRecords.push(...list));
    }

    // Step C: Format Output like k3-proxy (clean & ready for any other site)
    const formatted = allRecords.map((item, idx) => {
      const num = parseInt(item.number || item.premium || '0', 10);
      return {
        id: idx + 1,
        issue: item.issueNumber,
        number: num,
        colour: item.colour,
        result: num >= 5 ? 'BIG' : 'SMALL',
        premium: item.premium
      };
    });

    return res.status(200).json({
      code: 200,
      message: 'Success',
      total: formatted.length,
      data: formatted
    });

  } catch (err) {
    // Agar token invalid ho gaya to cache clear karke retry error dikhayega
    cachedToken = null;
    return res.status(500).json({
      code: 500,
      message: err.message || 'Internal Server Error'
    });
  }
};
