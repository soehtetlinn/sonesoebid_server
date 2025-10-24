import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Real second-hand product data
const realProducts = [
  {
    title: "iPhone 13 Pro Max 128GB - Space Gray",
    description: "Excellent condition iPhone 13 Pro Max. Screen protector applied since day one. Battery health 94%. Includes original box, charger, and lightning cable. Minor scuffs on the frame but screen is flawless. Perfect for photography and gaming.",
    seller: "TechEnthusiast",
    imageUrl: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=500",
    category: "Electronics",
    condition: "Excellent",
    location: "Yangon, Myanmar",
    listingType: "Auction",
    startingPrice: 850,
    currentPrice: 850,
    buyNowPrice: 1200,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    userId: 1
  },
  {
    title: "Samsung Galaxy S21 Ultra 256GB - Phantom Black",
    description: "Like new Samsung Galaxy S21 Ultra with S Pen included. All accessories in original packaging. Camera system is incredible for mobile photography. 5G capable. Selling due to upgrade to newer model.",
    seller: "MobileGuru",
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500",
    category: "Electronics",
    condition: "Like New",
    location: "Mandalay, Myanmar",
    listingType: "Buy Now",
    startingPrice: 750,
    currentPrice: 750,
    buyNowPrice: 750,
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "MacBook Air M1 8GB/256GB - Silver",
    description: "Perfect condition MacBook Air M1. Used for light office work and web browsing. Battery cycles under 100. Includes original charger and box. Fast, silent, and efficient. Great for students or professionals.",
    seller: "AppleFan",
    imageUrl: "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500",
    category: "Computers",
    condition: "Excellent",
    location: "Naypyidaw, Myanmar",
    listingType: "Auction",
    startingPrice: 950,
    currentPrice: 950,
    buyNowPrice: 1400,
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Nikon D750 DSLR Camera Body Only",
    description: "Professional full-frame DSLR in excellent condition. Shutter count under 25,000. Perfect for portrait and landscape photography. Includes battery, charger, and camera strap. No lens included.",
    seller: "PhotoPro",
    imageUrl: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=500",
    category: "Cameras",
    condition: "Very Good",
    location: "Yangon, Myanmar",
    listingType: "Auction",
    startingPrice: 1200,
    currentPrice: 1200,
    buyNowPrice: 1800,
    endDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Sony WH-1000XM4 Wireless Headphones",
    description: "Industry-leading noise-canceling headphones. Barely used, like new condition. Includes all original accessories and packaging. Perfect for travel and work from home. Battery life is excellent.",
    seller: "AudioLover",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    category: "Audio",
    condition: "Like New",
    location: "Mandalay, Myanmar",
    listingType: "Buy Now",
    startingPrice: 280,
    currentPrice: 280,
    buyNowPrice: 280,
    endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Canon EF 24-70mm f/2.8L II USM Lens",
    description: "Professional zoom lens in excellent condition. Sharp, fast autofocus, weather-sealed. Perfect for portraits, events, and general photography. Includes lens cap and hood. No scratches on glass.",
    seller: "LensMaster",
    imageUrl: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=500",
    category: "Cameras",
    condition: "Excellent",
    location: "Yangon, Myanmar",
    listingType: "Auction",
    startingPrice: 1800,
    currentPrice: 1800,
    buyNowPrice: 2200,
    endDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Gaming PC - RTX 3070, Ryzen 7 3700X",
    description: "High-performance gaming PC built in 2021. Runs all modern games at high settings. 16GB RAM, 1TB SSD, RTX 3070 graphics card. Clean build with good airflow. Includes Windows 10 license.",
    seller: "GameMaster",
    imageUrl: "https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=500",
    category: "Computers",
    condition: "Very Good",
    location: "Mandalay, Myanmar",
    listingType: "Auction",
    startingPrice: 1800,
    currentPrice: 1800,
    buyNowPrice: 2500,
    endDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "iPad Pro 12.9-inch 4th Gen 128GB",
    description: "Excellent condition iPad Pro with Apple Pencil support. Perfect for digital art, note-taking, and productivity. Includes original charger and box. Screen is flawless, no scratches.",
    seller: "TabletUser",
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500",
    category: "Tablets",
    condition: "Excellent",
    location: "Naypyidaw, Myanmar",
    listingType: "Buy Now",
    startingPrice: 650,
    currentPrice: 650,
    buyNowPrice: 650,
    endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Dyson V11 Cordless Vacuum Cleaner",
    description: "Powerful cordless vacuum in very good condition. Excellent suction power, multiple attachments included. Battery holds charge well. Perfect for apartments and small houses. Selling due to upgrade.",
    seller: "CleanFreak",
    imageUrl: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=500",
    category: "Home & Garden",
    condition: "Very Good",
    location: "Yangon, Myanmar",
    listingType: "Auction",
    startingPrice: 400,
    currentPrice: 400,
    buyNowPrice: 550,
    endDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Rolex Submariner Date 116610LN",
    description: "Authentic Rolex Submariner with box and papers. Serviced recently, keeps excellent time. Minor wear consistent with regular use. Investment piece that holds value well. Full set included.",
    seller: "WatchCollector",
    imageUrl: "https://images.unsplash.com/photo-1523170335258-f5b6c6e0e034?w=500",
    category: "Watches",
    condition: "Very Good",
    location: "Mandalay, Myanmar",
    listingType: "Auction",
    startingPrice: 12000,
    currentPrice: 12000,
    buyNowPrice: 15000,
    endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Tesla Model 3 Long Range 2019",
    description: "Well-maintained Tesla Model 3 with 45,000 miles. Full self-driving capability, premium interior, autopilot. Regular service at Tesla centers. Clean title, no accidents. Includes mobile charger.",
    seller: "EVOwner",
    imageUrl: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=500",
    category: "Vehicles",
    condition: "Very Good",
    location: "Yangon, Myanmar",
    listingType: "Auction",
    startingPrice: 35000,
    currentPrice: 35000,
    buyNowPrice: 42000,
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Louis Vuitton Neverfull MM Handbag",
    description: "Authentic LV Neverfull MM in Damier Ebene canvas. Comes with authenticity card and dust bag. Light wear on handles, canvas in excellent condition. Classic, versatile bag for daily use.",
    seller: "Fashionista",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500",
    category: "Fashion",
    condition: "Good",
    location: "Mandalay, Myanmar",
    listingType: "Buy Now",
    startingPrice: 1200,
    currentPrice: 1200,
    buyNowPrice: 1200,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "KitchenAid Stand Mixer - Empire Red",
    description: "Professional stand mixer in excellent condition. Includes dough hook, whisk, and paddle attachments. Barely used, stored in original box. Perfect for baking enthusiasts and professional kitchens.",
    seller: "BakerPro",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500",
    category: "Home & Garden",
    condition: "Excellent",
    location: "Naypyidaw, Myanmar",
    listingType: "Auction",
    startingPrice: 300,
    currentPrice: 300,
    buyNowPrice: 400,
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Nintendo Switch OLED Model with Games",
    description: "Nintendo Switch OLED in excellent condition. Includes 5 popular games: Zelda BOTW, Mario Odyssey, Animal Crossing, Pokemon Sword, and Mario Kart 8. All games in original cases.",
    seller: "GamePlayer",
    imageUrl: "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=500",
    category: "Gaming",
    condition: "Excellent",
    location: "Yangon, Myanmar",
    listingType: "Buy Now",
    startingPrice: 450,
    currentPrice: 450,
    buyNowPrice: 450,
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Herman Miller Aeron Chair - Size B",
    description: "Classic ergonomic office chair in very good condition. Adjustable lumbar support, armrests, and height. Mesh back and seat in excellent condition. Perfect for home office or gaming setup.",
    seller: "OfficePro",
    imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500",
    category: "Furniture",
    condition: "Very Good",
    location: "Mandalay, Myanmar",
    listingType: "Auction",
    startingPrice: 600,
    currentPrice: 600,
    buyNowPrice: 800,
    endDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "AirPods Pro 2nd Generation",
    description: "Latest AirPods Pro with active noise cancellation. Includes wireless charging case and all original accessories. Excellent sound quality and battery life. Selling due to upgrade to AirPods Max.",
    seller: "AppleUser",
    imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=500",
    category: "Audio",
    condition: "Like New",
    location: "Yangon, Myanmar",
    listingType: "Buy Now",
    startingPrice: 200,
    currentPrice: 200,
    buyNowPrice: 200,
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Gibson Les Paul Standard 2019",
    description: "Authentic Gibson Les Paul Standard in Heritage Cherry Sunburst. Excellent condition, no scratches or dings. Includes Gibson hard case and certificate of authenticity. Professional setup included.",
    seller: "GuitarPlayer",
    imageUrl: "https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=500",
    category: "Musical Instruments",
    condition: "Excellent",
    location: "Mandalay, Myanmar",
    listingType: "Auction",
    startingPrice: 2200,
    currentPrice: 2200,
    buyNowPrice: 2800,
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Dell XPS 15 9510 - 4K OLED Display",
    description: "Premium laptop with 4K OLED touchscreen. Intel i7-11800H, 16GB RAM, 512GB SSD, RTX 3050 Ti. Excellent for content creation and gaming. Light wear, screen perfect. Includes original charger.",
    seller: "LaptopGuru",
    imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500",
    category: "Computers",
    condition: "Very Good",
    location: "Naypyidaw, Myanmar",
    listingType: "Auction",
    startingPrice: 1400,
    currentPrice: 1400,
    buyNowPrice: 1800,
    endDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Breitling Navitimer B01 Chronograph",
    description: "Swiss-made chronograph watch in excellent condition. Automatic movement, sapphire crystal, leather strap. Includes box, papers, and warranty card. Recently serviced, keeps perfect time.",
    seller: "WatchExpert",
    imageUrl: "https://images.unsplash.com/photo-1523170335258-f5b6c6e0e034?w=500",
    category: "Watches",
    condition: "Excellent",
    location: "Yangon, Myanmar",
    listingType: "Buy Now",
    startingPrice: 4500,
    currentPrice: 4500,
    buyNowPrice: 4500,
    endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
    userId: 1
  },
  {
    title: "Peloton Bike+ with Membership",
    description: "Peloton Bike+ in excellent condition. Includes 3 months of Peloton membership. Rotating screen, automatic resistance adjustment. Barely used, perfect for home fitness. Includes shoes and accessories.",
    seller: "FitnessFan",
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500",
    category: "Sports & Fitness",
    condition: "Excellent",
    location: "Mandalay, Myanmar",
    listingType: "Auction",
    startingPrice: 1800,
    currentPrice: 1800,
    buyNowPrice: 2200,
    endDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    userId: 1
  }
];

async function seedProducts() {
  try {
    console.log('Starting product seeding...');
    
    // First, delete all existing products
    console.log('Deleting all existing products...');
    await prisma.product.deleteMany({});
    console.log('All existing products deleted.');
    
    // Create new products
    console.log('Creating new products...');
    for (const product of realProducts) {
      await prisma.product.create({
        data: product
      });
      console.log(`Created product: ${product.title}`);
    }
    
    console.log(`Successfully seeded ${realProducts.length} products!`);
  } catch (error) {
    console.error('Error seeding products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedProducts();
