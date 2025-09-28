import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import { exec as _exec } from 'child_process';
import util from 'util';

const exec = util.promisify(_exec);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*'} });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
io.on('connection', (socket) => {
  socket.on('joinConvo', (convoId) => socket.join(`convo:${convoId}`));
  socket.on('leaveConvo', (convoId) => socket.leave(`convo:${convoId}`));
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Auth utils
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-dev';
function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

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
    
    // Generate JWT token
    const token = signToken({ 
      id: user.id, 
      email: user.email, 
      username: user.username,
      role: user.role 
    });
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

app.patch('/api/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = req.body;
  const user = await prisma.user.update({ where: { id }, data });
  res.json(user);
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
  const list = await prisma.news.findMany({ where: { published: true }, orderBy: { publishedAt: 'desc' } });
  res.json(list);
});
app.get('/api/news/:slug', async (req, res) => {
  const item = await prisma.news.findUnique({ where: { slug: req.params.slug } });
  if (!item || !item.published) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// News (admin CRUD)
app.get('/api/admin/news', auth, requireAdmin, async (req, res) => {
  const list = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(list);
});
app.post('/api/admin/news', auth, requireAdmin, async (req, res) => {
  const { title, slug, excerpt, content, imageUrl, published } = req.body;
  const item = await prisma.news.create({ data: {
    title, slug, excerpt, content, imageUrl, published: !!published,
    publishedAt: published ? new Date() : null,
    authorId: req.user.id
  }});
  res.status(201).json(item);
});
app.patch('/api/admin/news/:id', auth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  if (data.published && !data.publishedAt) data.publishedAt = new Date();
  const item = await prisma.news.update({ where: { id }, data });
  res.json(item);
});
app.delete('/api/admin/news/:id', auth, requireAdmin, async (req, res) => {
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


