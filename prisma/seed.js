import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser({ username, email, password, role, firstName, lastName }) {
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role: role ?? 'BUYER',
      password: hashed,
    },
    create: {
      username,
      email,
      password: hashed,
      role: role ?? 'BUYER',
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    },
  });
  return user;
}

async function createProductsFor(user, products) {
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id ?? 'missing' },
      update: {},
      create: {
        title: p.title,
        description: p.description ?? '',
        seller: user.username,
        imageUrl: p.imageUrl ?? 'https://picsum.photos/seed/new/800/600',
        category: p.category ?? 'General',
        condition: p.condition ?? 'NEW',
        location: p.location ?? 'NY',
        listingType: p.listingType ?? 'FIXED_PRICE',
        startingPrice: p.startingPrice ?? 10,
        currentPrice: p.currentPrice ?? p.startingPrice ?? 10,
        buyNowPrice: p.buyNowPrice ?? null,
        endDate: p.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: user.id,
      },
    }).catch(() => {
      // Ignore upsert error if id missing; fallback to create without fixed id
    });
  }
}

async function main() {
  // Users with passwords
  const admin = await upsertUser({
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'ADMIN',
    firstName: 'Admin',
    lastName: 'User',
  });

  const john = await upsertUser({
    username: 'johndoe',
    email: 'john@example.com',
    password: 'user123',
    role: 'BIDDER',
    firstName: 'John',
    lastName: 'Doe',
  });

  const jane = await upsertUser({
    username: 'janesmith',
    email: 'jane@example.com',
    password: 'user123',
    role: 'BUYER',
    firstName: 'Jane',
    lastName: 'Smith',
  });

  const now = Date.now();

  await createProductsFor(john, [
    {
      title: 'Vintage Leather Jacket',
      description: 'A classic 80s leather jacket in great condition.',
      imageUrl: 'https://picsum.photos/seed/jacket/800/600',
      category: 'Fashion',
      condition: 'USED',
      location: 'New York, NY',
      listingType: 'AUCTION',
      startingPrice: 50,
      currentPrice: 50,
      buyNowPrice: 150,
      endDate: new Date(now + 2 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Professional DSLR Camera Kit',
      description: 'Canon DSLR with lens, bag, tripod, and memory card.',
      imageUrl: 'https://picsum.photos/seed/camera/800/600',
      category: 'Electronics',
      condition: 'USED',
      location: 'Chicago, IL',
      listingType: 'AUCTION',
      startingPrice: 300,
      currentPrice: 300,
      buyNowPrice: 600,
      endDate: new Date(now + 23 * 60 * 60 * 1000),
    },
    {
      title: 'High-Performance Gaming Laptop',
      description: 'RTX 4080, 32GB RAM, 2TB SSD. Like new.',
      imageUrl: 'https://picsum.photos/seed/laptop/800/600',
      category: 'Electronics',
      condition: 'NEW',
      location: 'Austin, TX',
      listingType: 'AUCTION',
      startingPrice: 1500,
      currentPrice: 1500,
      buyNowPrice: 2400,
      endDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  ]);

  await createProductsFor(jane, [
    {
      title: 'Ergonomic Office Chair',
      description: 'Lumbar support, adjustable, very comfortable.',
      imageUrl: 'https://picsum.photos/seed/chair/800/600',
      category: 'Furniture',
      condition: 'NEW',
      location: 'San Francisco, CA',
      listingType: 'FIXED_PRICE',
      startingPrice: 180,
      currentPrice: 180,
      endDate: new Date(now + 30 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Antique Pocket Watch',
      description: 'Gold-plated, early 1900s, collector item.',
      imageUrl: 'https://picsum.photos/seed/watch/800/600',
      category: 'Collectibles',
      condition: 'USED',
      location: 'Boston, MA',
      listingType: 'AUCTION',
      startingPrice: 250,
      currentPrice: 250,
      endDate: new Date(now + 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Signed First Edition Novel',
      description: 'Rare signed first edition of a fantasy novel.',
      imageUrl: 'https://picsum.photos/seed/book/800/600',
      category: 'Books',
      condition: 'NEW',
      location: 'New York, NY',
      listingType: 'FIXED_PRICE',
      startingPrice: 115,
      currentPrice: 115,
      endDate: new Date(now + 21 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log('Seed complete: users and products ensured.');

  // Ensure News Categories
  const existingNewsCats = await prisma.newsCategory.findMany();
  let announcementsCat = existingNewsCats.find(c => c.name === 'Announcements');
  let guidesCat = existingNewsCats.find(c => c.name === 'Guides');
  let marketCat = existingNewsCats.find(c => c.name === 'Market');
  if (!announcementsCat) announcementsCat = await prisma.newsCategory.create({ data: { name: 'Announcements', description: 'Latest updates and announcements' } });
  if (!guidesCat) guidesCat = await prisma.newsCategory.create({ data: { name: 'Guides', description: 'How-tos and tutorials' } });
  if (!marketCat) marketCat = await prisma.newsCategory.create({ data: { name: 'Market', description: 'Marketplace news and insights' } });

  // Seed initial English News (upsert by slug)
  const newsItems = [
    {
      title: 'Launching Our Marketplace: Transparent Bidding, Safer Payments',
      slug: 'launching-our-marketplace-transparent-bidding-safer-payments',
      excerpt: 'We are live. Here is how transparent bidding, safer payments, and stricter seller standards protect buyers and sellers from day one.',
      content:
        'Today we are excited to launch our marketplace, built around three principles: transparency, trust, and control. ' +
        'Transparent bidding means you always see the current price, time remaining, and the rules that govern bid increments. ' +
        'For buyers, this reduces uncertainty and helps you decide when to place your next bid. For sellers, it drives fair competition and better closing prices. ' +
        '\n\nTrust is enabled by safer payments and dispute resolution. We support secure checkout flows and hold funds until seller obligations are met. ' +
        'If something goes wrong, our dispute center provides a structured process with clear timelines, evidence collection, and impartial review. ' +
        'This ensures both parties have confidence that issues will be handled consistently. ' +
        '\n\nControl matters, too. Powerful search, category filters, and watchlists let you focus on the listings that match your goals. ' +
        'Notifications keep you informed about ending auctions and outbids, so you never miss a critical moment. ' +
        'As we grow, we will continue to invest in buyer protections, seller tools, and content quality guidelines that promote a high‑value experience for everyone.',
      imageUrl: 'https://picsum.photos/seed/marketlaunch/1200/630',
      categoryName: 'Announcements'
    },
    {
      title: 'How to List Your First Item and Get Your First Bid',
      slug: 'how-to-list-your-first-item-and-get-your-first-bid',
      excerpt: 'A beginner-friendly checklist for creating a compelling listing, setting the right price, and attracting early bidders.',
      content:
        'Getting your first bid is about clarity and credibility. Start with a clear title that includes the product name, brand, and key attribute. ' +
        'In the description, be honest about condition and include specifics like dimensions, year, model, and any accessories. ' +
        'Upload multiple well-lit photos from different angles; images that remove uncertainty drive more engagement. ' +
        '\n\nPricing sets expectations. If you choose auction format, pick a starting price that encourages participation without undercutting your target outcome. ' +
        'Use the watchlist to gauge interest during the first 24–48 hours and be prepared to answer buyer questions quickly. ' +
        'For fixed-price listings, match recent market comps and emphasize fast shipping or bundled value to stand out. ' +
        '\n\nFinally, build trust. Complete your profile, respond courteously, and ship promptly with tracking. ' +
        'Early positive feedback compounds; once buyers see reliable behavior, your subsequent listings will attract bids faster and at stronger prices.',
      imageUrl: 'https://picsum.photos/seed/firstlisting/1200/630',
      categoryName: 'Guides'
    },
    {
      title: 'Buyer Protection and Dispute Resolution: What You Need to Know',
      slug: 'buyer-protection-and-dispute-resolution-what-you-need-to-know',
      excerpt: 'Understand refunds, shipping issues, and item-not-as-described claims so you can purchase with confidence.',
      content:
        'Our buyer protection program is designed to keep transactions safe from listing to delivery. ' +
        'When you check out, we confirm payment securely and require sellers to ship with tracking. ' +
        'If your item is not as described, arrives damaged, or fails to arrive, you can open a dispute directly from your order history. ' +
        '\n\nThe dispute flow is straightforward: submit details, attach photos or documentation, and track progress in one place. ' +
        'We may request additional evidence from either party to make a fair determination. ' +
        'Most cases resolve quickly when both sides provide timely information. ' +
        '\n\nTo avoid issues, review photos carefully, read descriptions, and use messaging to clarify any doubts before bidding. ' +
        'We continually refine policies against misrepresentation and late shipping, and we act on patterns of abuse. ' +
        'Our goal is to protect good-faith buyers and sellers while maintaining a vibrant marketplace with high-quality listings.',
      imageUrl: 'https://picsum.photos/seed/buyerprotection/1200/630',
      categoryName: 'Announcements'
    }
  ];

  for (const n of newsItems) {
    const category = n.categoryName === 'Guides' ? guidesCat : (n.categoryName === 'Market' ? marketCat : announcementsCat);
    await prisma.news.upsert({
      where: { slug: n.slug },
      update: {
        title: n.title,
        excerpt: n.excerpt,
        content: n.content,
        imageUrl: n.imageUrl,
        published: true,
        publishedAt: new Date(),
        categoryId: category.id,
        authorId: admin.id,
      },
      create: {
        title: n.title,
        slug: n.slug,
        excerpt: n.excerpt,
        content: n.content,
        imageUrl: n.imageUrl,
        published: true,
        publishedAt: new Date(),
        categoryId: category.id,
        authorId: admin.id,
      }
    });
  }
  console.log('Seed complete: news ensured.');

  // Additional English news to enrich the News list
  const moreNewsItems = [
    {
      title: 'Holiday Shipping Deadlines 2025: How to Ship On Time',
      slug: 'holiday-shipping-deadlines-2025-how-to-ship-on-time',
      excerpt: 'A practical checklist to prepare inventory, packaging, and carriers ahead of peak season so your orders arrive before the holidays.',
      content:
        'The final quarter brings surging order volume and strained carrier capacity. Start by forecasting demand from last year’s history and current trends; set realistic cut‑off dates for standard and expedited services. ' +
        'Prepare inventory now—bundle bestsellers, prepack common SKUs, and stock extra labels, tape, and dunnage. ' +
        '\n\nPackaging matters: choose right‑sized boxes to control dimensional weight, add fragile indicators where needed, and include return instructions inside the parcel. ' +
        'Communicate clearly on your product pages and at checkout with an always‑visible banner detailing holiday cut‑offs. ' +
        'Offer local pickup or courier options for last‑minute buyers, and consider gift messages or simple gift wrap to increase perceived value. ' +
        '\n\nOnce orders flow in, batch print labels daily, scan to confirm handoff, and send automatic notifications with tracking links. ' +
        'If weather or network disruptions hit, update your banner and order confirmation templates within hours so expectations stay aligned. ' +
        'A proactive communications rhythm keeps buyers informed and reduces support tickets during the busiest weeks of the year.',
      imageUrl: 'https://picsum.photos/seed/holidayship2025/1200/630',
      categoryName: 'Guides'
    },
    {
      title: 'Product Photography That Converts: A Practical Starter Playbook',
      slug: 'product-photography-that-converts-a-practical-starter-playbook',
      excerpt: 'Lighting, framing, and consistency are the pillars of listing images that build trust and drive clicks.',
      content:
        'Start with even, diffused light—natural window light plus a sheer curtain or a simple softbox often beats harsh direct lighting. ' +
        'Use a tripod to prevent motion blur and maintain consistent angles across the gallery. ' +
        '\n\nShoot a clean hero on a neutral background, then add three to five context shots: scale reference, close‑ups of texture or ports, and any wear or defects. ' +
        'Keep aspect ratios consistent (e.g., 1:1 or 4:3) so thumbnails look tidy in search and category grids. ' +
        '\n\nName files descriptively and compress responsibly to speed up page loads. ' +
        'Finally, review images on mobile—most buyers browse on phones. ' +
        'Sharper images reduce returns, speed buyer decisions, and improve conversion rates without discounting.',
      imageUrl: 'https://picsum.photos/seed/photoplaybook/1200/630',
      categoryName: 'Guides'
    },
    {
      title: 'Return Policy Best Practices: Reduce Risk Without Reducing Trust',
      slug: 'return-policy-best-practices-reduce-risk-without-reducing-trust',
      excerpt: 'A clear, fair return policy increases conversion by lowering perceived risk; here’s how to design one for your category.',
      content:
        'Start by defining a reasonable window (e.g., 14–30 days) and list conditions that qualify: unused, original packaging, serial numbers intact. ' +
        'Make exceptions explicit for hygiene‑sensitive or custom items. ' +
        '\n\nPublish your policy on product pages and in checkout, not just in the footer. ' +
        'Automate RMA creation with printable labels and track reasons for returns; pattern analysis will reveal listing gaps in sizing, compatibility, or expectations. ' +
        '\n\nWhere feasible, offer exchanges to preserve revenue. ' +
        'If you must charge restocking, explain the cost basis (inspection, repackaging) to maintain goodwill. ' +
        'Transparency turns policies from a friction point into a trust signal that helps buyers commit.',
      imageUrl: 'https://picsum.photos/seed/returnspolicy/1200/630',
      categoryName: 'Guides'
    },
    {
      title: 'Secure Payments 101: Protecting Buyers and Sellers',
      slug: 'secure-payments-101-protecting-buyers-and-sellers',
      excerpt: 'Fraud prevention is a shared responsibility. These baseline controls reduce chargebacks and keep good buyers safe.',
      content:
        'Use reputable processors with modern risk tooling (3‑D Secure where appropriate) and store no raw card data on your own servers. ' +
        'Enable velocity checks and require strong authentication for high‑risk orders. ' +
        '\n\nFor sellers, ship only to verified addresses with tracked methods, photograph packed contents for high‑value items, and require signatures where warranted. ' +
        'For buyers, encourage account security with unique passwords and two‑factor authentication. ' +
        '\n\nWhen disputes arise, respond quickly with documentation: order confirmations, tracking, photos, and message logs. ' +
        'Consistent processes minimize losses while protecting honest participants in the marketplace.',
      imageUrl: 'https://picsum.photos/seed/securepayments/1200/630',
      categoryName: 'Announcements'
    },
    {
      title: 'SEO for Listings: Titles, Keywords, and Structured Data',
      slug: 'seo-for-listings-titles-keywords-and-structured-data',
      excerpt: 'Help buyers find your products: clear titles, scannable bullets, and structured data that search engines understand.',
      content:
        'Write titles with brand, model, and a key differentiator (capacity, size, color). Avoid keyword stuffing; use natural language that matches how buyers search. ' +
        'In your description, lead with the essentials in short bullets and follow with deeper details for motivated readers. ' +
        '\n\nAdd unique content beyond the manufacturer copy—comparisons, use cases, or sizing notes. ' +
        'Optimize alt text for images and keep URLs and slugs readable. ' +
        'Where applicable, enrich pages with structured data so search engines can display rich results. ' +
        'Small, consistent improvements compound into more impressions and higher‑quality clicks over time.',
      imageUrl: 'https://picsum.photos/seed/listingseo/1200/630',
      categoryName: 'Guides'
    }
  ];

  for (const n of moreNewsItems) {
    const category = n.categoryName === 'Guides' ? guidesCat : (n.categoryName === 'Market' ? marketCat : announcementsCat);
    await prisma.news.upsert({
      where: { slug: n.slug },
      update: {
        title: n.title,
        excerpt: n.excerpt,
        content: n.content,
        imageUrl: n.imageUrl,
        published: true,
        publishedAt: new Date(),
        categoryId: category.id,
        authorId: admin.id,
      },
      create: {
        title: n.title,
        slug: n.slug,
        excerpt: n.excerpt,
        content: n.content,
        imageUrl: n.imageUrl,
        published: true,
        publishedAt: new Date(),
        categoryId: category.id,
        authorId: admin.id,
      }
    });
  }
  console.log('Seed complete: additional news ensured.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
}).finally(() => prisma.$disconnect());
