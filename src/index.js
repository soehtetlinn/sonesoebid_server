import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import { exec as _exec } from 'child_process';
import util from 'util';

const exec = util.promisify(_exec);

const app = express();
const server = http.createServer(app);

// CORS allowlist (comma-separated in env) with sensible default
const allowedOrigins = (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : ['https://www.shltechent.com']);

const io = new SocketIOServer(server, { cors: { origin: allowedOrigins, methods: ['GET','POST'] } });
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });

// Trust proxy for correct rate-limit IPs (useful behind reverse proxies)
app.set('trust proxy', 1);

// Security headers (keep CSP off for now to avoid breaking inline scripts/importmap)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Restrictive CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow same-origin/no-origin (curl, mobile apps)
    return allowedOrigins.includes(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PATCH','DELETE'],
  credentials: true,
}));
app.use(express.json());
io.on('connection', (socket) => {
  socket.on('joinConvo', (convoId) => socket.join(`convo:${convoId}`));
  socket.on('leaveConvo', (convoId) => socket.leave(`convo:${convoId}`));
});

app.get('/health', (req, res) => res.json({ ok: true }));

// =========================
// Currex Admin Authentication
// =========================
app.post('/api/currex/admin/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    const expectedPassword = process.env.CURREX_ADMIN_PASSWORD;
    
    if (!password || password !== expectedPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    
    // Generate a simple admin session token (in production, use proper JWT)
    const adminToken = Buffer.from(`currex_admin_${Date.now()}_${Math.random().toString(36).slice(2)}`).toString('base64');
    
    res.json({ 
      success: true, 
      token: adminToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });
  } catch (e) {
    console.error('[currex-admin-login] error', e);
    res.status(500).json({ error: 'login_failed' });
  }
});

app.post('/api/currex/admin/verify', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(401).json({ valid: false });
    }
    
    // Simple token validation (in production, use proper JWT verification)
    const isValid = token.startsWith('currex_admin_');
    res.json({ valid: isValid });
  } catch (e) {
    res.status(500).json({ valid: false });
  }
});

// Structured rate submission endpoint
app.post('/api/currex/admin/rates', async (req, res) => {
  try {
    const { date, paymentMethod, sellingRates, buyingRates, notes } = req.body || {};
    
    if (!sellingRates?.below1M_MMK || !sellingRates?.above1M_MMK || !buyingRates?.base) {
      return res.status(400).json({ error: 'Missing required rate fields' });
    }

    // Create structured source text for consistency
    const sourceText = `${date}\n\n${paymentMethod}\n\nSelling (အရောင်း)\nမြန်မာငွေ10သိန်းအထက် ${sellingRates.above1M_MMK}\n\nမြန်မာငွေ10သိန်းအောက် ${sellingRates.below1M_MMK}\n\nBuying (အဝယ်) ${buyingRates.base}${buyingRates.above1M_MMK ? `\n\n10သိန်းအထက်${buyingRates.above1M_MMK}` : ''}${notes?.length ? `\n\n${notes.join('\n')}` : ''}`;

    const rateData = {
      base: 'THB',
      quote: 'MMK',
      sourceText,
      sellRate: sellingRates.below1M_MMK,
      buyRate: buyingRates.base,
      sellBelow1mPer100k: sellingRates.below1M_MMK,
      sellAbove1mPer100k: sellingRates.above1M_MMK,
      buyBelow1mPer100k: buyingRates.base,
      buyAbove1mPer100k: buyingRates.above1M_MMK || null,
      sellSpecial100to500: null,
      paymentMethod,
      dateText: date,
      notes: notes || [],
      createdById: 1
    };

    const saved = await prisma.exchangeRate.create({ data: rateData });
    res.json({ success: true, id: saved.id });
  } catch (e) {
    console.error('[currex-admin-rates] error', e);
    res.status(500).json({ error: 'Failed to save rates' });
  }
});

// =========================
// Telegram helper and endpoint
// =========================
async function sendTelegramMessage(text, chatIdOverride) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = chatIdOverride || process.env.TELEGRAM_DEFAULT_CHAT_ID || '';
  if (!token || !chatId) {
    throw new Error('missing_telegram_token_or_chat_id');
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text || '').slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => String(resp.status));
    throw new Error(`telegram_send_failed:${resp.status}:${t.slice(0,256)}`);
  }
  return await resp.json().catch(() => ({}));
}

// Protected by shared header secret (separate from JWT until FE auth integrates)
app.post('/api/admin/telegram/send', async (req, res) => {
  try {
    const adminKeyHeader = String(req.headers['x-currex-admin-key'] || '');
    const expected = process.env.CURREX_ADMIN_KEY || '';
    if (!expected || adminKeyHeader !== expected) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { text, chatId } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text_required' });
    await sendTelegramMessage(text, chatId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[telegram] send error', e);
    res.status(500).json({ error: 'send_failed' });
  }
});

// Telegram bot webhook removed from main backend to avoid conflicts. The
// dedicated telegram-bot-server handles /api/telegram/* via Nginx routing.

// =========================
// Currex WebChat (lightweight website chat)
// =========================
app.post('/api/webchat/session', async (req, res) => {
  try {
    const sessionKey = String(req.body?.sessionKey || '').slice(0, 128);
    const useKey = sessionKey || ('anon_' + Math.random().toString(36).slice(2));
    let sess = await prisma.webChatSession.findUnique({ where: { sessionKey: useKey } }).catch(() => null);
    if (!sess) {
      sess = await prisma.webChatSession.create({ data: { sessionKey: useKey } });
    }
    res.json({ id: sess.id, sessionKey: useKey });
  } catch (e) {
    res.status(500).json({ error: 'session_failed' });
  }
});

app.get('/api/webchat/messages', async (req, res) => {
  try {
    const sessionKey = String(req.query?.sessionKey || '').slice(0, 128);
    if (!sessionKey) return res.status(400).json({ error: 'sessionKey_required' });
    const since = req.query?.since ? new Date(String(req.query.since)) : null;
    const sess = await prisma.webChatSession.findUnique({ where: { sessionKey } });
    if (!sess) return res.json([]);
    const where = { sessionId: sess.id };
    const list = await prisma.webChatMessage.findMany({ where, orderBy: { timestamp: 'asc' } });
    const filtered = since ? list.filter(m => new Date(m.timestamp) > since) : list;
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: 'fetch_failed' });
  }
});

app.post('/api/webchat/messages', async (req, res) => {
  try {
    const { sessionKey, text } = req.body || {};
    if (!sessionKey || !text) return res.status(400).json({ error: 'sessionKey_and_text_required' });
    const sess = await prisma.webChatSession.findUnique({ where: { sessionKey } });
    if (!sess) return res.status(404).json({ error: 'session_not_found' });
    const msg = await prisma.webChatMessage.create({ data: { sessionId: sess.id, author: 'client', text: String(text).slice(0, 2000) } });
    res.status(201).json(msg);
  } catch (e) {
    res.status(500).json({ error: 'send_failed' });
  }
});
// Helper: convert News to DTO with imageIds
async function newsToDTOWithImages(news) {
  const images = await prisma.newsImage.findMany({
    where: { newsId: news.id },
    select: { id: true, position: true },
    orderBy: { position: 'asc' }
  });
  const imageIds = images.map(i => i.id);
  const videos = await prisma.newsVideo.findMany({
    where: { newsId: news.id },
    select: { id: true, youtubeId: true, position: true },
    orderBy: { position: 'asc' }
  });
  const videoIds = videos.map(v => v.youtubeId);
  const videosSimple = videos.map(v => ({ id: v.id, youtubeId: v.youtubeId }));
  let category = null;
  if (news.categoryId) {
    const c = await prisma.newsCategory.findUnique({ where: { id: news.categoryId }, select: { id: true, name: true } });
    category = c;
  }
  // Get author information
  const author = await prisma.user.findUnique({ 
    where: { id: news.authorId }, 
    select: { id: true, username: true, firstName: true, lastName: true } 
  });
  return { ...news, imageIds, videoIds, videos: videosSimple, category, author };
}


// Auth utils
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-dev';
function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// Helper function to get user roles (primary + assigned roles)
async function getUserRoles(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        where: { isActive: true },
        select: { role: true }
      }
    }
  });
  
  if (!user) return [];
  
  const roles = [user.role]; // Primary role
  user.roleAssignments.forEach(assignment => {
    if (!roles.includes(assignment.role)) {
      roles.push(assignment.role);
    }
  });
  
  return roles;
}

// Helper function to check if user has specific role
async function hasRole(userId, role) {
  const roles = await getUserRoles(userId);
  return roles.includes(role);
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

async function requireModeratorOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const isAdmin = await hasRole(req.user.id, 'ADMIN');
    const isModerator = await hasRole(req.user.id, 'MODERATOR');
    if (isAdmin || isModerator) return next();
    return res.status(403).json({ error: 'Moderator or Admin access required' });
  } catch {
    return res.status(403).json({ error: 'Moderator or Admin access required' });
  }
}

function requireSelfOrAdmin(req, res, next) {
  try {
    const paramId = Number(req.params.id);
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'ADMIN' || req.user.id === paramId) return next();
    return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Login with email/username and password
app.post('/api/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    console.log('Login attempt:', { email, username, hasPassword: !!password });
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    if (!email && !username) {
      return res.status(400).json({ error: 'Email or username is required' });
    }
    
    // Find user by email or username
    const whereClause = {
      OR: [
        email ? { email: email.toLowerCase() } : {},
        username ? { username: username.toLowerCase() } : {}
      ]
    };
    console.log('Searching for user with:', whereClause);
    
    const user = await prisma.user.findFirst({
      where: whereClause
    });
    
    console.log('User found:', user ? { id: user.id, email: user.email, username: user.username } : 'No user found');
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Get all user roles (primary + assigned)
    const userRoles = await getUserRoles(user.id);
    
    // Generate JWT token
    const token = signToken({ 
      id: user.id, 
      email: user.email, 
      username: user.username,
      role: user.role, // Primary role for backward compatibility
      roles: userRoles // All roles
    });
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: { ...userWithoutPassword, roles: userRoles } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google Sign-In (ID token) authentication
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
    if (!idToken || !GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'missing_token_or_client_id' });

    // Verify ID token with Google tokeninfo endpoint
    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const resp = await fetch(verifyUrl);
    if (!resp.ok) {
      const text = await resp.text().catch(() => String(resp.status));
      console.warn('[google-auth] tokeninfo error', resp.status, text);
      return res.status(401).json({ error: 'invalid_google_token', detail: String(text).slice(0, 256) });
    }
    const payload = await resp.json();
    // Basic checks
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      console.warn('[google-auth] aud mismatch', { expected: GOOGLE_CLIENT_ID, got: payload.aud });
      return res.status(401).json({ error: 'audience_mismatch' });
    }
    const email = String(payload.email || '').toLowerCase();
    const emailVerified = String(payload.email_verified || 'false') === 'true';
    const sub = String(payload.sub || '');
    const givenName = payload.given_name || null;
    const familyName = payload.family_name || null;
    if (!email || !emailVerified || !sub) {
      console.warn('[google-auth] unverified_or_missing_claims', { email, emailVerified, hasSub: !!sub });
      return res.status(401).json({ error: 'unverified_account' });
    }

    // Upsert user by email
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const usernameBase = email.split('@')[0] || `google_${sub.slice(-6)}`;
      let username = usernameBase.toLowerCase();
      // Ensure unique username
      let counter = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const exists = await prisma.user.findFirst({ where: { username } });
        if (!exists) break;
        counter += 1;
        username = `${usernameBase}${counter}`.toLowerCase();
      }
      // Create with random password
      const randomPw = await bcrypt.hash(`google_${sub}_${Date.now()}`, 10);
      user = await prisma.user.create({
        data: {
          email,
          username,
          password: randomPw,
          firstName: givenName,
          lastName: familyName,
          role: 'BUYER'
        }
      });
    }

    const userRoles = await getUserRoles(user.id);
    const token = signToken({ id: user.id, email: user.email, username: user.username, role: user.role, roles: userRoles });
    const { password: _pw, ...userWithoutPassword } = user;
    res.json({ token, user: { ...userWithoutPassword, roles: userRoles } });
  } catch (e) {
    console.error('[google-auth] unexpected', e);
    res.status(500).json({ error: 'google_auth_failed' });
  }
});

// Register new user
app.post('/api/register', async (req, res) => {
  try {
    const { email, username, password, firstName, lastName, phone } = req.body;
    
    // Validation
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        role: 'BUYER'
      }
    });
    
    // Generate JWT token
    const token = signToken({ 
      id: user.id, 
      email: user.email, 
      username: user.username,
      role: user.role 
    });
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Helpers
const convoToDTO = async (convo) => {
  const users = await prisma.user.findMany({ where: { id: { in: convo.participantIds } } });
  const participantUsernames = users.reduce((acc, u) => { acc[u.id] = u.username; return acc; }, {});
  const lastMessage = convo.lastMessageId
    ? await prisma.message.findUnique({ where: { id: convo.lastMessageId } })
    : null;
  return {
    id: convo.id,
    participantIds: convo.participantIds,
    participantUsernames,
    lastMessage: lastMessage || { id: '', senderId: 0, text: '', timestamp: new Date().toISOString(), isRead: true },
    productId: convo.productId,
    productTitle: convo.productTitle,
  };
};

// Users
app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.get('/api/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// User dashboard stats
app.get('/api/users/:id/stats', auth, requireSelfOrAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const now = new Date();
  const bids = await prisma.bid.findMany({
    where: { userId, product: { endDate: { gt: now } } },
    select: { productId: true }
  });
  const activeBids = new Set(bids.map(b => b.productId)).size;
  const itemsWon = await prisma.order.count({ where: { buyerId: userId } });
  const watching = await prisma.watchlist.count({ where: { userId } });
  res.json({ activeBids, itemsWon, watching });
});

app.patch('/api/users/:id', auth, requireSelfOrAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const data = { ...req.body };
  // Never allow raw password updates here; use dedicated password routes
  if (data.password) delete data.password;
  const user = await prisma.user.update({ where: { id }, data });
  res.json(user);
});

// Self/admin password change for a user
app.patch('/api/users/:id/password', auth, requireSelfOrAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const isAdminUser = req.user && req.user.role === 'ADMIN';
    if (!isAdminUser) {
      // Verify current password for self-service change
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'User not found' });
      const ok = await bcrypt.compare(String(currentPassword || ''), existing.password);
      if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Admin reset password for any user (no current password required)
app.patch('/api/admin/users/:id/password', auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, email, role, firstName, lastName, phone, address } = req.body;
  try {
    const user = await prisma.user.create({ data: { username, email, role, firstName, lastName, phone, address } });
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: 'Unable to create user', detail: String(e) });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.user.delete({ where: { id } });
    res.json(true);
  } catch (e) {
    res.status(400).json({ error: 'Unable to delete user (has related data)', detail: String(e) });
  }
});

// Products (basic list/detail)
app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// Get products by user ID
app.get('/api/users/:id/products', async (req, res) => {
  const userId = Number(req.params.id);
  const products = await prisma.product.findMany({ 
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  try {
    const d = req.body || {};
    const product = await prisma.product.create({
      data: {
        title: String(d.title || 'Untitled Product'),
        description: String(d.description ?? ''),
        seller: String(d.seller ?? ''),
        imageUrl: String(d.imageUrl || 'https://picsum.photos/seed/new/800/600'),
        category: String(d.category || 'General'),
        condition: String(d.condition ?? 'NEW'),
        location: String(d.location ?? ''),
        listingType: String(d.listingType || 'FIXED_PRICE'),
        startingPrice: Number(d.startingPrice ?? 0),
        currentPrice: Number(d.currentPrice ?? d.startingPrice ?? 0),
        buyNowPrice: d.buyNowPrice == null ? null : Number(d.buyNowPrice),
        endDate: d.endDate ? new Date(d.endDate) : new Date(Date.now() + 7*24*60*60*1000),
        userId: Number(d.userId ?? 0),
      }
    });
    res.json(product);
  } catch (e) {
    res.status(400).json({ error: 'Unable to create product', detail: String(e) });
  }
});

app.patch('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const product = await prisma.product.update({ where: { id }, data: req.body });
    res.json(product);
  } catch (e) {
    res.status(400).json({ error: 'Unable to update product', detail: String(e) });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await prisma.bid.deleteMany({ where: { productId: id } });
    await prisma.watchlist.deleteMany({ where: { productId: id } });
    await prisma.cartItem.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    res.json(true);
  } catch (e) {
    res.status(400).json({ error: 'Unable to delete product', detail: String(e) });
  }
});

// Bids (place bid)
app.post('/api/products/:id/bids', async (req, res) => {
  const productId = req.params.id;
  const { userId, maxBid } = req.body;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const bid = await prisma.bid.create({ data: { userId, productId, maxBid } });
  // Update currentPrice naively (for demo)
  const top = await prisma.bid.findMany({ where: { productId }, orderBy: { maxBid: 'desc' }, take: 2 });
  const second = top[1]?.maxBid ?? product.startingPrice;
  const newCurrent = Math.min(top[0].maxBid, second + 1);
  await prisma.product.update({ where: { id: productId }, data: { currentPrice: newCurrent } });
  res.json(bid);
});

// Messages (create/fetch)
app.get('/api/conversations/:id/messages', async (req, res) => {
  const messages = await prisma.message.findMany({ where: { conversationId: req.params.id }, orderBy: { timestamp: 'asc' } });
  res.json(messages);
});

app.get('/api/users/:id/conversations', async (req, res) => {
  const userId = Number(req.params.id);
  const conversations = await prisma.conversation.findMany({ where: { participantIds: { has: userId } }, orderBy: { updatedAt: 'desc' } });
  const dtos = await Promise.all(conversations.map(convoToDTO));
  res.json(dtos);
});

app.get('/api/conversations/:id', async (req, res) => {
  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  res.json(await convoToDTO(convo));
});

app.post('/api/messages', async (req, res) => {
  const { conversationId, senderId, text, recipientId, productId } = req.body;
  let convo;
  if (conversationId) {
    convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  } else if (productId) {
    convo = await prisma.conversation.findFirst({ where: { productId, participantIds: { hasEvery: [senderId, recipientId] } } });
  } else {
    const dmKey = `dm-${[senderId, recipientId].sort().join('-')}`;
    convo = await prisma.conversation.findFirst({ where: { productId: dmKey, participantIds: { hasEvery: [senderId, recipientId] } } });
  }

  if (!convo) {
    const productTitle = productId ? (await prisma.product.findUnique({ where: { id: productId } }))?.title ?? 'Direct message' : 'Direct message';
    convo = await prisma.conversation.create({
      data: {
        participantIds: [senderId, recipientId],
        productId: productId || `dm-${[senderId, recipientId].sort().join('-')}`,
        productTitle,
      }
    });
  }

  const message = await prisma.message.create({ data: { conversationId: convo.id, senderId, text } });
  await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageId: message.id } });

  await prisma.notification.create({ data: {
    userId: recipientId,
    type: 'NEW_MESSAGE',
    message: productId ? `You have a new message` : `You have a new direct message`,
    relatedId: convo.id,
    title: 'New Message'
  }});

  // Realtime: notify room
  io.to(`convo:${convo.id}`).emit('message:new', { conversationId: convo.id, message });
  res.json(await convoToDTO(await prisma.conversation.findUnique({ where: { id: convo.id } })));
});

// Watchlist
app.get('/api/users/:id/watchlist', async (req, res) => {
  const userId = Number(req.params.id);
  const items = await prisma.watchlist.findMany({ where: { userId } });
  res.json(items.map(i => i.productId));
});
app.post('/api/users/:id/watchlist', async (req, res) => {
  const userId = Number(req.params.id);
  const { productId } = req.body;
  await prisma.watchlist.upsert({ where: { userId_productId: { userId, productId } }, update: {}, create: { userId, productId } });
  res.json(true);
});
app.delete('/api/users/:id/watchlist/:productId', async (req, res) => {
  const userId = Number(req.params.id);
  const productId = req.params.productId;
  await prisma.watchlist.deleteMany({ where: { userId, productId } });
  res.json(true);
});

// Cart
app.get('/api/users/:id/cart', async (req, res) => {
  const userId = Number(req.params.id);
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { product: true } });
  res.json(items.map(i => ({ product: i.product, quantity: i.quantity })));
});
app.post('/api/users/:id/cart', async (req, res) => {
  const userId = Number(req.params.id);
  const { productId, quantity } = req.body;
  const existing = await prisma.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
  if (existing) {
    await prisma.cartItem.update({ where: { userId_productId: { userId, productId } }, data: { quantity: existing.quantity + (quantity ?? 1) } });
  } else {
    await prisma.cartItem.create({ data: { userId, productId, quantity: quantity ?? 1 } });
  }
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { product: true } });
  res.json(items.map(i => ({ product: i.product, quantity: i.quantity })));
});
app.delete('/api/users/:id/cart/:productId', async (req, res) => {
  const userId = Number(req.params.id);
  const productId = req.params.productId;
  await prisma.cartItem.deleteMany({ where: { userId, productId } });
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { product: true } });
  res.json(items.map(i => ({ product: i.product, quantity: i.quantity })));
});
app.post('/api/users/:id/checkout', async (req, res) => {
  const userId = Number(req.params.id);
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { product: true } });
  const orders = await Promise.all(items.map(i => prisma.order.create({ data: {
    productId: i.productId,
    productTitle: i.product.title,
    sellerId: i.product.userId,
    buyerId: userId,
    finalPrice: i.product.currentPrice * i.quantity,
    status: 'COMPLETED'
  }})));
  await prisma.cartItem.deleteMany({ where: { userId } });
  res.json(orders);
});

// Notifications
app.get('/api/users/:id/notifications', async (req, res) => {
  const userId = Number(req.params.id);
  const list = await prisma.notification.findMany({ where: { userId }, orderBy: { timestamp: 'desc' } });
  res.json(list);
});
app.post('/api/notifications/:id/read', async (req, res) => {
  await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json(true);
});
app.post('/api/users/:id/notifications/read-all', async (req, res) => {
  const userId = Number(req.params.id);
  await prisma.notification.updateMany({ where: { userId }, data: { isRead: true } });
  res.json(true);
});

// Categories
app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(categories);
});

// News categories (admin-only CRUD, public list)
app.get('/api/news-categories', async (req, res) => {
  const list = await prisma.newsCategory.findMany({ orderBy: { name: 'asc' } });
  res.json(list);
});
app.post('/api/admin/news-categories', auth, requireModeratorOrAdmin, async (req, res) => {
  const { name, description } = req.body;
  const cat = await prisma.newsCategory.create({ data: { name, description } });
  res.status(201).json(cat);
});
app.patch('/api/admin/news-categories/:id', auth, requireModeratorOrAdmin, async (req, res) => {
  const { name, description } = req.body;
  const cat = await prisma.newsCategory.update({ where: { id: req.params.id }, data: { name, description } });
  res.json(cat);
});
app.delete('/api/admin/news-categories/:id', auth, requireModeratorOrAdmin, async (req, res) => {
  await prisma.newsCategory.delete({ where: { id: req.params.id } });
  res.json(true);
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await prisma.category.create({
      data: { name, description }
    });
    res.json(category);
  } catch (e) {
    res.status(400).json({ error: 'Unable to create category', detail: String(e) });
  }
});

app.patch('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description } = req.body;
    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });
    res.json(category);
  } catch (e) {
    res.status(400).json({ error: 'Unable to update category', detail: String(e) });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.category.delete({ where: { id } });
    res.json(true);
  } catch (e) {
    res.status(400).json({ error: 'Unable to delete category', detail: String(e) });
  }
});

// Disputes
app.post('/api/disputes', async (req, res) => {
  const { orderId, userId, reason } = req.body;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const dispute = await prisma.dispute.create({ data: {
    orderId,
    userId,
    reason,
    productTitle: order.productTitle,
  }});
  await prisma.order.update({ where: { id: orderId }, data: { status: 'DISPUTED' } });
  res.json(dispute);
});
app.get('/api/users/:id/disputes', async (req, res) => {
  const userId = Number(req.params.id);
  const disputes = await prisma.dispute.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  res.json(disputes);
});

// News (public read)
app.get('/api/news', async (req, res) => {
  const { q, categoryId } = req.query;
  const where = { published: true };
  if (categoryId) where.categoryId = String(categoryId);
  if (q) {
    where.OR = [
      { title: { contains: String(q), mode: 'insensitive' } },
      { excerpt: { contains: String(q), mode: 'insensitive' } },
      { content: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const list = await prisma.news.findMany({ where, orderBy: { publishedAt: 'desc' } });
  const withImages = await Promise.all(list.map(newsToDTOWithImages));
  res.json(withImages);
});
app.get('/api/news/:slug', async (req, res) => {
  const item = await prisma.news.findUnique({ where: { slug: req.params.slug } });
  if (!item || !item.published) return res.status(404).json({ error: 'Not found' });
  const dto = await newsToDTOWithImages(item);
  res.json(dto);
});

// News (admin CRUD)
app.get('/api/admin/news', auth, requireModeratorOrAdmin, async (req, res) => {
  const list = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } });
  const withImages = await Promise.all(list.map(newsToDTOWithImages));
  res.json(withImages);
});
app.post('/api/admin/news', auth, requireModeratorOrAdmin, async (req, res) => {
  const { title, slug, excerpt, content, imageUrl, published, categoryId } = req.body;
  const item = await prisma.news.create({ data: {
    title, slug, excerpt, content, imageUrl, published: !!published,
    publishedAt: published ? new Date() : null,
    authorId: req.user.id,
    categoryId: categoryId || null
  }});
  const dto = await newsToDTOWithImages(item);
  res.status(201).json(dto);
});
app.patch('/api/admin/news/:id', auth, requireModeratorOrAdmin, async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  if (data.published && !data.publishedAt) data.publishedAt = new Date();
  const item = await prisma.news.update({ where: { id }, data });
  const dto = await newsToDTOWithImages(item);
  res.json(dto);
});
app.delete('/api/admin/news/:id', auth, requireModeratorOrAdmin, async (req, res) => {
  await prisma.news.delete({ where: { id: req.params.id } });
  res.json(true);
});

// Ads
app.get('/api/ads', async (req, res) => {
  const now = new Date();
  const list = await prisma.ad.findMany({
    where: {
      isActive: true,
      OR: [
        { startDate: null },
        { startDate: { lte: now } }
      ],
      OR: [
        { endDate: null },
        { endDate: { gte: now } }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(list);
});
app.post('/api/ads/:id/impression', async (req, res) => {
  const ad = await prisma.ad.update({ where: { id: req.params.id }, data: { impressions: { increment: 1 } } });
  res.json({ ok: true, impressions: ad.impressions });
});
app.post('/api/ads/:id/click', async (req, res) => {
  const ad = await prisma.ad.update({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } });
  res.json({ ok: true, clicks: ad.clicks });
});

// Ads (admin CRUD)
app.get('/api/admin/ads', auth, requireAdmin, async (req, res) => {
  res.json(await prisma.ad.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/admin/ads', auth, requireAdmin, async (req, res) => {
  const ad = await prisma.ad.create({ data: req.body });
  res.status(201).json(ad);
});
app.patch('/api/admin/ads/:id', auth, requireAdmin, async (req, res) => {
  const ad = await prisma.ad.update({ where: { id: req.params.id }, data: req.body });
  res.json(ad);
});
app.delete('/api/admin/ads/:id', auth, requireAdmin, async (req, res) => {
  await prisma.ad.delete({ where: { id: req.params.id } });
  res.json(true);
});

// Admin metrics
app.get('/api/admin/metrics', auth, requireAdmin, async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  try {
    const [totalUsers, activeListings, totalBidsToday, salesAgg] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { endDate: { gt: now } } }),
      prisma.bid.count({ where: { timestamp: { gte: startOfToday } } }),
      prisma.order.aggregate({ _sum: { finalPrice: true }, where: { purchaseDate: { gte: since24h } } })
    ]);
    const sales24h = salesAgg._sum.finalPrice || 0;
    // Fallback guards in case of unexpected zeros
    let ensuredUsers = totalUsers;
    if (ensuredUsers === 0) {
      const probe = await prisma.user.findMany({ select: { id: true }, take: 1 });
      if (probe.length > 0) {
        ensuredUsers = (await prisma.user.findMany({ select: { id: true } })).length;
      }
    }
    res.json({ totalUsers: ensuredUsers, activeListings, totalBidsToday, sales24h });
  } catch (e) {
    console.error('[metrics] error', e);
    res.status(500).json({ totalUsers: 0, activeListings: 0, totalBidsToday: 0, sales24h: 0 });
  }
});

// News images: stream by id
app.get('/api/news-images/:id', async (req, res) => {
  try {
    const img = await prisma.newsImage.findUnique({ where: { id: req.params.id } });
    if (!img) return res.status(404).end();
    res.setHeader('Content-Type', img.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(img.data));
  } catch (e) {
    res.status(500).json({ error: 'Failed to load image' });
  }
});

// Admin: upload up to 5 images for a news item
app.post('/api/admin/news/:id/images', auth, requireModeratorOrAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const newsId = req.params.id;
    const news = await prisma.news.findUnique({ where: { id: newsId } });
    if (!news) return res.status(404).json({ error: 'News not found' });

    const existing = await prisma.newsImage.count({ where: { newsId } });
    const toUpload = Array.isArray(req.files) ? req.files : [];
    if (existing + toUpload.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 images per news' });
    }

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    let positionBase = existing;
    const created = [];
    for (const f of toUpload) {
      if (!allowed.has(f.mimetype)) {
        return res.status(400).json({ error: `Unsupported mime type: ${f.mimetype}` });
      }
      const rec = await prisma.newsImage.create({ data: {
        newsId,
        data: f.buffer,
        mimeType: f.mimetype,
        position: positionBase++
      }});
      created.push(rec);
    }

    const dto = await newsToDTOWithImages(news);
    res.status(201).json(dto);
  } catch (e) {
    console.error('Upload images error:', e);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Admin: delete an image from a news item
app.delete('/api/admin/news/:id/images/:imageId', auth, requireModeratorOrAdmin, async (req, res) => {
  try {
    const newsId = req.params.id;
    const imageId = req.params.imageId;
    const img = await prisma.newsImage.findUnique({ where: { id: imageId } });
    if (!img || img.newsId !== newsId) return res.status(404).json({ error: 'Image not found' });

    await prisma.newsImage.delete({ where: { id: imageId } });

    // Normalize positions after deletion
    const remaining = await prisma.newsImage.findMany({ where: { newsId }, orderBy: { position: 'asc' } });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await prisma.newsImage.update({ where: { id: remaining[i].id }, data: { position: i } });
      }
    }

    const news = await prisma.news.findUnique({ where: { id: newsId } });
    const dto = await newsToDTOWithImages(news);
    res.json(dto);
  } catch (e) {
    console.error('Delete image error:', e);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Admin: reorder images by array of imageIds
app.patch('/api/admin/news/:id/images/reorder', auth, requireModeratorOrAdmin, async (req, res) => {
  try {
    const newsId = req.params.id;
    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds : [];
    if (imageIds.length === 0) return res.status(400).json({ error: 'imageIds array required' });
    const images = await prisma.newsImage.findMany({ where: { newsId } });
    const setIds = new Set(images.map(i => i.id));
    for (const id of imageIds) {
      if (!setIds.has(id)) return res.status(400).json({ error: `Image ${id} does not belong to this news` });
    }
    for (let i = 0; i < imageIds.length; i++) {
      await prisma.newsImage.update({ where: { id: imageIds[i] }, data: { position: i } });
    }
    const news = await prisma.news.findUnique({ where: { id: newsId } });
    const dto = await newsToDTOWithImages(news);
    res.json(dto);
  } catch (e) {
    console.error('Reorder images error:', e);
    res.status(500).json({ error: 'Failed to reorder images' });
  }
});

// Admin: add YouTube videos (array of youtubeIds)
app.post('/api/admin/news/:id/videos', auth, requireModeratorOrAdmin, async (req, res) => {
  try {
    const newsId = req.params.id;
    const news = await prisma.news.findUnique({ where: { id: newsId } });
    if (!news) return res.status(404).json({ error: 'News not found' });

    const ids = Array.isArray(req.body?.youtubeIds) ? req.body.youtubeIds : [];
    if (ids.length === 0) return res.status(400).json({ error: 'youtubeIds array required' });

    const existing = await prisma.newsVideo.count({ where: { newsId } });
    let pos = existing;
    const validate = (s) => /^[A-Za-z0-9_-]{6,}$/.test(s);
    for (const yid of ids) {
      if (!validate(String(yid))) return res.status(400).json({ error: `Invalid YouTube id: ${yid}` });
      await prisma.newsVideo.create({ data: { newsId, youtubeId: String(yid), position: pos++ } });
    }

    const dto = await newsToDTOWithImages(news);
    res.status(201).json(dto);
  } catch (e) {
    console.error('Add videos error:', e);
    res.status(500).json({ error: 'Failed to add videos' });
  }
});

// Admin: delete one YouTube video by its DB id
app.delete('/api/admin/news/:id/videos/:videoDbId', auth, requireModeratorOrAdmin, async (req, res) => {
  try {
    const newsId = req.params.id;
    const videoDbId = req.params.videoDbId;
    const v = await prisma.newsVideo.findUnique({ where: { id: videoDbId } });
    if (!v || v.newsId !== newsId) return res.status(404).json({ error: 'Video not found' });
    await prisma.newsVideo.delete({ where: { id: videoDbId } });

    // Re-order
    const remaining = await prisma.newsVideo.findMany({ where: { newsId }, orderBy: { position: 'asc' } });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await prisma.newsVideo.update({ where: { id: remaining[i].id }, data: { position: i } });
      }
    }

    const news = await prisma.news.findUnique({ where: { id: newsId } });
    const dto = await newsToDTOWithImages(news);
    res.json(dto);
  } catch (e) {
    console.error('Delete video error:', e);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Admin: reorder videos by array of videoDbIds
app.patch('/api/admin/news/:id/videos/reorder', auth, requireModeratorOrAdmin, async (req, res) => {
  try {
    const newsId = req.params.id;
    const videoDbIds = Array.isArray(req.body?.videoDbIds) ? req.body.videoDbIds : [];
    if (videoDbIds.length === 0) return res.status(400).json({ error: 'videoDbIds array required' });
    const videos = await prisma.newsVideo.findMany({ where: { newsId } });
    const setIds = new Set(videos.map(v => v.id));
    for (const id of videoDbIds) {
      if (!setIds.has(id)) return res.status(400).json({ error: `Video ${id} does not belong to this news` });
    }
    for (let i = 0; i < videoDbIds.length; i++) {
      await prisma.newsVideo.update({ where: { id: videoDbIds[i] }, data: { position: i } });
    }
    const news = await prisma.news.findUnique({ where: { id: newsId } });
    const dto = await newsToDTOWithImages(news);
    res.json(dto);
  } catch (e) {
    console.error('Reorder videos error:', e);
    res.status(500).json({ error: 'Failed to reorder videos' });
  }
});

// =========================
// FX parsing and endpoints (stored in News.content JSON)
// =========================

function parseFxFromText(text) {
  const sourceText = String(text || '');
  // Identify Selling and Buying blocks
  const sellingBlock = sourceText.match(/Selling[\s\S]*?(?=Buying|$)/i)?.[0] || '';
  const buyingBlock = sourceText.match(/Buying[\s\S]*?$/i)?.[0] || '';

  const pickFirstNumber = (s) => {
    const m = s.match(/(\d{3,4})(?:\/(\d{3,4}))?/);
    return m ? parseInt(m[1], 10) : null;
  };

  // Selling tiers (anchor on 10 သိန်း to avoid matching special 100-500 line)
  const sellAboveMatch = sellingBlock.match(/(10\s*သိန်း|၁၀\s*သိန်း)[^\n]*?အထက်[^\d]*(\d{3,4})(?:[\/\-](\d{3,4}))?/);
  const sellBelowMatch = sellingBlock.match(/(10\s*သိန်း|၁၀\s*သိန်း)[^\n]*?အောက်[^\d]*(\d{3,4})/);
  const sellAbove1m = sellAboveMatch ? parseInt((sellAboveMatch[3] || sellAboveMatch[2]), 10) : null;
  const sellBelow1m = sellBelowMatch ? parseInt(sellBelowMatch[2], 10) : null;

  // Buying tiers
  // Base is the first number on the Buying line
  const buyBase = pickFirstNumber(buyingBlock);
  // Above 1M on the line mentioning 10 သိန်း and 'အထက်'
  const buyAboveMatch = buyingBlock.match(/(10\s*သိန်း|၁၀\s*သိန်း)[^\n]*?အထက်[^\d]*(\d{3,4})(?:[\/\-](\d{3,4}))?/);
  const buyAbove1m = buyAboveMatch ? parseInt((buyAboveMatch[3] || buyAboveMatch[2]), 10) : null;

  // Special line e.g., 100-500အထက်-809/810
  const specialMatch = sourceText.match(/100\s*[-–—]\s*500[^\n]*?(\d{3,4})\s*[\/-]\s*(\d{3,4})/i);
  const sellSpecial100to500 = specialMatch ? `${specialMatch[1]}/${specialMatch[2]}` : null;
  const specialHigh = specialMatch ? Math.max(parseInt(specialMatch[1], 10), parseInt(specialMatch[2], 10)) : null;

  // Payment method
  const paymentMethod = /bank\s*transfer/i.test(sourceText) ? 'Bank Transfer' : (/kpay|wave/i.test(sourceText) ? 'Mobile Wallet' : undefined);
  // Date text like 19-Oct-2025 or 19 Oct 2025
  const dateTextMatch = sourceText.match(/\b(\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4})\b/i);
  const dateText = dateTextMatch ? dateTextMatch[1] : undefined;

  // Fallbacks: if tiered not found, use first numbers in each block
  const sellSamples = [];
  const buySamples = [];
  sellingBlock.replace(/(\d{3,4})/g, (_, n) => { const x = parseInt(n, 10); if (!isNaN(x)) sellSamples.push(x); return ''; });
  buyingBlock.replace(/(\d{3,4})/g, (_, n) => { const x = parseInt(n, 10); if (!isNaN(x)) buySamples.push(x); return ''; });
  const sellRateFallback = sellSamples.length ? sellSamples[0] : null;
  const buyRateFallback = buySamples.length ? buySamples[0] : null;

  // Business rule (per user spec):
  // - Selling <1M uses the higher of the two tier lines (often the "အထက်" value)
  // - Selling >1M uses the higher between the explicit >1M line and the special range high (e.g., 809/810 -> 810)
  const finalSellBelow1m = (Math.max(sellBelow1m || 0, sellAbove1m || 0) || sellBelow1m || sellAbove1m || sellRateFallback);
  const finalSellAbove1m = (Math.max(sellAbove1m || 0, specialHigh || 0) || sellAbove1m || specialHigh || sellRateFallback);

  // Ensure primary sellRate/buyRate align with tiered/base values
  const finalSellRate = finalSellBelow1m ?? sellRateFallback;
  const finalBuyRate = (buyBase ?? buyAbove1m ?? buyRateFallback);

  return {
    sourceText,
    sellRate: finalSellRate,
    buyRate: finalBuyRate,
    sellSamples,
    buySamples,
    allSamples: [...sellSamples, ...buySamples],
    parsedAt: new Date().toISOString(),
    buyAbove1mPer100k: buyAbove1m ?? finalBuyRate ?? null,
    buyBelow1mPer100k: buyBase ?? finalBuyRate ?? null,
    sellAbove1mPer100k: finalSellAbove1m ?? finalSellRate ?? null,
    sellBelow1mPer100k: finalSellBelow1m ?? finalSellRate ?? null,
    sellSpecial100to500,
    paymentMethod,
    dateText,
  };
}

// Create from text and store as ExchangeRate (admin/moderator or with admin key)
app.post('/api/admin/fx/parse', async (req, res) => {
  try {
    // Check admin key header first (for currency exchanger frontend)
    const adminKeyHeader = String(req.headers['x-currex-admin-key'] || '');
    const expected = process.env.CURREX_ADMIN_KEY || '';
    const hasValidKey = expected && adminKeyHeader === expected;
    
    // If no valid key, check JWT auth
    if (!hasValidKey) {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      try { 
        const user = jwt.verify(token, JWT_SECRET);
        if (!user || user.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch { 
        return res.status(401).json({ error: 'Invalid token' }); 
      }
    }
    
    const { text, base = 'THB', quote = 'MMK' } = req.body || {};
    if (!(String(base).toUpperCase() === 'THB' && String(quote).toUpperCase() === 'MMK')) {
      return res.status(400).json({ error: 'pair_not_allowed', allowed: 'THB/MMK' });
    }
    if (!text) return res.status(400).json({ error: 'text_required' });
    const parsed = parseFxFromText(text);

    // Normalize: enforce tiers and primary rates deterministically
    const normSellBelow = parsed.sellBelow1mPer100k ?? parsed.sellRate ?? null;
    const normSellAbove = parsed.sellAbove1mPer100k ?? parsed.sellRate ?? null;
    const normBuyBase = parsed.buyBelow1mPer100k ?? parsed.buyRate ?? null;
    const normBuyAbove = parsed.buyAbove1mPer100k ?? parsed.buyRate ?? null;

    const normalized = {
      sellBelow1mPer100k: normSellBelow,
      sellAbove1mPer100k: normSellAbove,
      buyBelow1mPer100k: normBuyBase,
      buyAbove1mPer100k: normBuyAbove,
      sellRate: normSellBelow, // store <1M as primary sellRate
      buyRate: normBuyBase,    // store base as primary buyRate
    };

    // Use admin user ID (1) when using admin key, otherwise use authenticated user ID
    const createdById = hasValidKey ? 1 : (req.user ? req.user.id : 1);
    const item = await prisma.exchangeRate.create({ data: { base, quote,
      buyRate: normalized.buyRate,
      sellRate: normalized.sellRate,
      buyBelow1mPer100k: normalized.buyBelow1mPer100k,
      buyAbove1mPer100k: normalized.buyAbove1mPer100k,
      sellBelow1mPer100k: normalized.sellBelow1mPer100k,
      sellAbove1mPer100k: normalized.sellAbove1mPer100k,
      sellSpecial100to500: parsed.sellSpecial100to500 ?? null,
      paymentMethod: parsed.paymentMethod,
      dateText: parsed.dateText,
      sourceText: parsed.sourceText,
      sellSamples: parsed.sellSamples,
      buySamples: parsed.buySamples,
      allSamples: parsed.allSamples,
      parsedAt: new Date(parsed.parsedAt),
      createdById } });
    res.status(201).json({ id: item.id, base: item.base, quote: item.quote, buyRate: item.buyRate, sellRate: item.sellRate, parsedAt: item.parsedAt, createdAt: item.createdAt });
  } catch (e) {
    console.error('[fx/parse] error', e);
    res.status(500).json({ error: 'fx_parse_failed' });
  }
});

// List recent FX entries (admin or with admin key)
app.get('/api/admin/fx', async (req, res) => {
  try {
    // Check admin key header first
    const adminKeyHeader = String(req.headers['x-currex-admin-key'] || '');
    const expected = process.env.CURREX_ADMIN_KEY || '';
    const hasValidKey = expected && adminKeyHeader === expected;
    
    // If no valid key, check JWT auth
    if (!hasValidKey) {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      try { 
        const user = jwt.verify(token, JWT_SECRET);
        if (!user || user.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch { 
        return res.status(401).json({ error: 'Invalid token' }); 
      }
    }
    
    const list = await prisma.exchangeRate.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    // Re-parse any rows missing tiered fields
    const healed = await Promise.all(list.map(async (item) => {
      if (item.sellBelow1mPer100k && item.sellAbove1mPer100k && item.buyBelow1mPer100k && item.buyAbove1mPer100k) return item;
      try {
        const re = parseFxFromText(item.sourceText);
        const data = {
          buyRate: re.buyRate ?? item.buyRate,
          sellRate: re.sellRate ?? item.sellRate,
          buyBelow1mPer100k: re.buyBelow1mPer100k ?? item.buyBelow1mPer100k,
          buyAbove1mPer100k: re.buyAbove1mPer100k ?? item.buyAbove1mPer100k,
          sellBelow1mPer100k: re.sellBelow1mPer100k ?? item.sellBelow1mPer100k,
          sellAbove1mPer100k: re.sellAbove1mPer100k ?? item.sellAbove1mPer100k,
          sellSpecial100to500: re.sellSpecial100to500 ?? item.sellSpecial100to500,
          paymentMethod: re.paymentMethod ?? item.paymentMethod,
          dateText: re.dateText ?? item.dateText,
        };
        await prisma.exchangeRate.update({ where: { id: item.id }, data });
        return { ...item, ...data };
      } catch {
        return item;
      }
    }));
    res.json(healed);
  } catch (e) {
    console.error('[fx/list] error', e);
    res.status(500).json({ error: 'fx_list_failed' });
  }
});

// Public: latest FX for a pair
app.get('/api/fx/latest', async (req, res) => {
  const base = 'THB';
  const quote = 'MMK';
  const item = await prisma.exchangeRate.findFirst({ where: { base, quote }, orderBy: { createdAt: 'desc' } });
  if (!item) return res.status(404).json({ error: 'not_found' });
  // Heal records missing tiered fields by re-parsing sourceText
  let patched = { ...item };
  if (!item.sellBelow1mPer100k || !item.sellAbove1mPer100k || !item.buyBelow1mPer100k || !item.buyAbove1mPer100k) {
    try {
      const re = parseFxFromText(item.sourceText);
      const data = {
        buyRate: re.buyRate ?? item.buyRate,
        sellRate: re.sellRate ?? item.sellRate,
        buyBelow1mPer100k: re.buyBelow1mPer100k ?? item.buyBelow1mPer100k,
        buyAbove1mPer100k: re.buyAbove1mPer100k ?? item.buyAbove1mPer100k,
        sellBelow1mPer100k: re.sellBelow1mPer100k ?? item.sellBelow1mPer100k,
        sellAbove1mPer100k: re.sellAbove1mPer100k ?? item.sellAbove1mPer100k,
        sellSpecial100to500: re.sellSpecial100to500 ?? item.sellSpecial100to500,
        paymentMethod: re.paymentMethod ?? item.paymentMethod,
        dateText: re.dateText ?? item.dateText,
      };
      patched = { ...patched, ...data };
      // Persist correction to DB (best-effort)
      await prisma.exchangeRate.update({ where: { id: item.id }, data });
    } catch (e) {
      console.warn('[fx/latest] reparse failed, returning stored values');
    }
  }
  res.json({
    id: patched.id,
    base: patched.base,
    quote: patched.quote,
    buyRate: patched.buyRate,
    sellRate: patched.sellRate,
    buyBelow1mPer100k: patched.buyBelow1mPer100k,
    buyAbove1mPer100k: patched.buyAbove1mPer100k,
    sellBelow1mPer100k: patched.sellBelow1mPer100k,
    sellAbove1mPer100k: patched.sellAbove1mPer100k,
    sellSpecial100to500: patched.sellSpecial100to500,
    paymentMethod: patched.paymentMethod,
    dateText: patched.dateText,
    sourceText: patched.sourceText,
    createdAt: patched.createdAt,
    parsedAt: patched.parsedAt
  });
});

async function initializeAndStart() {
  try {
    const runMigrations = process.env.RUN_MIGRATIONS_ON_BOOT !== 'false';
    if (runMigrations) {
      console.log('[startup] Applying Prisma migrations (deploy)...');
      try {
        const { stdout, stderr } = await exec('npx prisma migrate deploy');
        if (stdout) console.log('[prisma:migrate:stdout]\n' + stdout);
        if (stderr) console.warn('[prisma:migrate:stderr]\n' + stderr);
        console.log('[startup] Migrations applied.');
      } catch (err) {
        console.error('[startup] Prisma migrate deploy failed:', err?.stderr || err?.message || err);
      }
    } else {
      console.log('[startup] Skipping migrations (RUN_MIGRATIONS_ON_BOOT=false)');
    }

    if (process.env.RUN_SEED_ON_BOOT === 'true') {
      console.log('[startup] Seeding database...');
      try {
        const res1 = await exec('node create-test-users.js');
        if (res1.stdout) console.log('[seed:create-test-users:stdout]\n' + res1.stdout);
        if (res1.stderr) console.warn('[seed:create-test-users:stderr]\n' + res1.stderr);
      } catch (e) {
        console.error('[startup] create-test-users failed:', e?.stderr || e?.message || e);
      }
      try {
        const res2 = await exec('node prisma/seed.js');
        if (res2.stdout) console.log('[seed:prisma-seed:stdout]\n' + res2.stdout);
        if (res2.stderr) console.warn('[seed:prisma-seed:stderr]\n' + res2.stderr);
      } catch (e) {
        console.error('[startup] prisma/seed failed:', e?.stderr || e?.message || e);
      }
      console.log('[startup] Seed complete.');
    }
    // Telegram webhook is managed by the dedicated telegram-bot-server
    // Seed default news categories if none exist
    const newsCatCount = await prisma.newsCategory.count();
    if (newsCatCount === 0) {
      const created = await prisma.$transaction([
        prisma.newsCategory.create({ data: { name: 'Announcements', description: 'Latest updates and announcements' } }),
        prisma.newsCategory.create({ data: { name: 'Guides', description: 'How-tos and tutorials' } }),
        prisma.newsCategory.create({ data: { name: 'Market', description: 'Marketplace news and insights' } })
      ]);
      // Bind existing news to categories round-robin
      const allNews = await prisma.news.findMany();
      for (let i = 0; i < allNews.length; i++) {
        const c = created[i % created.length];
        await prisma.news.update({ where: { id: allNews[i].id }, data: { categoryId: c.id } });
      }
      console.log('[startup] Seeded news categories and bound to existing news.');
    }
    // Ensure webchat tables exist even if migrations haven't run yet
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "WebChatSession" (
          "id" TEXT PRIMARY KEY,
          "sessionKey" TEXT NOT NULL UNIQUE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "WebChatMessage" (
          "id" TEXT PRIMARY KEY,
          "sessionId" TEXT NOT NULL,
          "author" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "WebChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WebChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
    } catch (e) {
      console.warn('[startup] webchat tables ensure failed (will rely on migrations)', e?.message || e);
    }
  } catch (e) {
    console.error('[startup] Initialization error:', e);
  } finally {
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`API listening on :${PORT}`);
    });
  }
}

initializeAndStart();


