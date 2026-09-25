import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useStore } from './store';

export function App() {
  const { auth, logout, cart } = useStore();
  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="app" data-testid="app-root" data-component="App">
      {/* Top Notification Announcement Bar */}
      <div className="announcement-bar" data-testid="announcement-bar">
        <span>⚡ <strong>NEW 2026 RELEASE:</strong> Trail Apex Carbon Pro v2 is now live with free express shipping on all orders over $150</span>
        <a href="#specs" className="announcement-link">Explore Specs →</a>
      </div>

      {/* Modern Global E-Commerce Navigation */}
      <header className="site-header" data-testid="site-header">
        <div className="header-left">
          <Link to="/" className="brand-logo" data-testid="brand-logo">
            <span className="brand-mark">▲</span>
            <span className="brand-name">ORCA<strong>APEX</strong></span>
          </Link>
          <nav className="header-categories" data-testid="header-categories">
            <Link to="/" className="nav-pill active" data-testid="nav-home">
              Trail Running
            </Link>
            <Link to="/products" className="nav-pill" data-testid="nav-products">
              Footwear
            </Link>
            <Link to="/products" className="nav-pill" data-testid="nav-apparel">
              Technical Apparel
            </Link>
            <Link to="/products" className="nav-pill" data-testid="nav-equipment">
              Packs & Vests
            </Link>
          </nav>
        </div>

        <div className="header-center">
          <div className="search-bar" data-testid="search-bar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" placeholder="Search technical footwear, specs, drops... (⌘K)" aria-label="Search" />
            <kbd>⌘K</kbd>
          </div>
        </div>

        <div className="header-right">
          <button className="icon-btn" aria-label="Wishlist" data-testid="wishlist-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span className="badge">3</span>
          </button>

          <Link to="/cart" className="icon-btn cart-btn" data-testid="nav-cart" aria-label="Shopping Cart">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span className="badge" data-testid="cart-badge">{cartCount}</span>
            <span className="cart-total-label">$189</span>
          </Link>

          {auth.isLoggedIn ? (
            <div className="user-profile-badge" data-testid="user-profile-badge">
              <div className="user-avatar">SG</div>
              <div className="user-info">
                <span className="user-email" data-testid="user-email">{auth.email}</span>
                <span className="user-tier">PRO ATHLETE</span>
              </div>
              <button onClick={logout} className="logout-btn" data-testid="logout-btn">
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="login-link" data-testid="login-link">
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main App Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/products" element={<Products />} />
          <Route path="/cart" element={<Cart />} />
        </Routes>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rich E-Commerce Product Detail Page (PDP) Component
// ---------------------------------------------------------------------------

const COLOR_VARIANTS = [
  { id: 'emerald', name: 'Obsidian / Emerald Peak', hex: '#10b981', ring: '#059669' },
  { id: 'obsidian', name: 'Stealth Carbon Black', hex: '#18181b', ring: '#27272a' },
  { id: 'arctic', name: 'Arctic Glacier White', hex: '#f8fafc', ring: '#cbd5e1' },
  { id: 'solar', name: 'Solar Apex Orange', hex: '#f97316', ring: '#ea580c' },
];

const SIZES = ['7.0', '8.0', '8.5', '9.0', '9.5', '10.0', '10.5', '11.0', '12.0', '13.0'];

export function Home() {
  const addToCart = useStore((s) => s.addToCart);
  const [selectedColor, setSelectedColor] = useState(COLOR_VARIANTS[0]);
  const [selectedSize, setSelectedSize] = useState('10.0');
  const [quantity, setQuantity] = useState(1);
  const [activeThumb, setActiveThumb] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'fit' | 'reviews'>('overview');
  const [addedToast, setAddedToast] = useState(false);

  const handleAddToCart = () => {
    addToCart({
      id: `apex-v2-${selectedColor.id}-${selectedSize}`,
      name: `Trail Apex Carbon Pro v2 (${selectedColor.name}, US ${selectedSize})`,
      price: 189.00,
    });
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2500);
  };

  return (
    <div
      className="pdp-container"
      data-testid="home-page"
      data-component="ProductDetailPage"
      data-source-file="apps/sample-react-app/src/App.tsx"
      data-source-line="110"
      data-feature="pdp-experience"
    >
      {/* Breadcrumb Navigation */}
      <nav className="breadcrumbs" aria-label="Breadcrumbs" data-testid="breadcrumbs">
        <Link to="/">Home</Link>
        <span className="separator">/</span>
        <Link to="/products">Trail Running</Link>
        <span className="separator">/</span>
        <Link to="/products">Technical Footwear</Link>
        <span className="separator">/</span>
        <span className="current-crumb">Trail Apex Carbon Pro v2</span>
      </nav>

      {/* Main PDP Grid: Gallery (Left) & Controls (Right) */}
      <section className="pdp-hero-grid">
        {/* Left: Media Gallery */}
        <div className="pdp-gallery" data-component="ProductGallery" data-testid="product-gallery">
          <div className="main-image-viewport" data-testid="main-image-viewport">
            <div className="image-badge-tag-wrap">
              <span className="badge-pill badge-primary">NEW 2026 EDITION</span>
              <span className="badge-pill badge-sale">SAVE 24%</span>
            </div>

            {/* SVG Visual Graphic of the Technical Trail Shoe */}
            <div className="shoe-visual-canvas" style={{ background: `radial-gradient(circle at 50% 60%, ${selectedColor.hex}22 0%, #09090b 85%)` }}>
              <svg viewBox="0 0 600 360" className="shoe-svg" width="100%" height="auto">
                <defs>
                  <linearGradient id="carbonPlate" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#27272a" />
                    <stop offset="50%" stopColor="#18181b" />
                    <stop offset="100%" stopColor="#09090b" />
                  </linearGradient>
                  <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={selectedColor.hex} />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                {/* Sole / Outsole Profile */}
                <path d="M 60,270 Q 140,290 280,285 Q 420,280 540,250 L 530,220 Q 390,240 260,230 Q 150,225 70,235 Z" fill="#18181b" />
                {/* Lugs */}
                <path d="M 80,280 L 95,295 L 110,282 L 130,297 L 150,283 L 180,298 L 220,285 L 260,296 L 310,283 L 360,292 L 420,280 L 480,285 L 530,255" stroke={selectedColor.hex} strokeWidth="6" strokeLinecap="round" fill="none" />
                {/* Midsole Cushion */}
                <path d="M 68,235 Q 160,240 270,235 Q 400,230 528,215 L 515,185 Q 380,195 250,185 Q 150,180 85,200 Z" fill="#27272a" />
                {/* Carbon Plate Inlay */}
                <path d="M 120,230 Q 260,225 460,205" stroke="url(#carbonPlate)" strokeWidth="8" strokeLinecap="round" />
                <path d="M 120,230 Q 260,225 460,205" stroke={selectedColor.hex} strokeWidth="2" strokeDasharray="6,4" />
                {/* Upper Body */}
                <path d="M 85,200 Q 120,130 210,120 Q 270,115 330,130 Q 380,80 430,90 Q 480,110 515,185 Z" fill="#09090b" stroke="#3f3f46" strokeWidth="2" />
                {/* Dynamic Accents & Lines */}
                <path d="M 180,185 Q 260,140 380,145 Q 440,150 490,180" fill="none" stroke="url(#accentGrad)" strokeWidth="6" strokeLinecap="round" />
                <path d="M 230,125 L 260,175 L 290,128 L 320,178 L 350,132" stroke="#52525b" strokeWidth="3" fill="none" />
                {/* Trail Apex Logo on Heel */}
                <circle cx="140" cy="170" r="14" fill="#18181b" stroke={selectedColor.hex} strokeWidth="2" />
                <text x="140" y="174" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">▲</text>
              </svg>
            </div>

            <div className="gallery-meta-bar">
              <span className="gallery-meta-pill">🔍 Click to zoom</span>
              <span className="gallery-meta-pill">🔄 360° Interactive Angle</span>
              <span className="gallery-meta-pill">📱 AR Preview</span>
            </div>
          </div>

          {/* Thumbnails strip */}
          <div className="thumbnail-strip" data-testid="thumbnail-strip">
            {['Side Profile', 'Outsole & Lugs', 'Carbon Plate', 'Anatomical Fit'].map((label, idx) => (
              <button
                key={label}
                className={`thumb-btn ${activeThumb === idx ? 'active' : ''}`}
                onClick={() => setActiveThumb(idx)}
                data-testid={`thumb-${idx}`}
              >
                <div className="thumb-mini-box" style={{ borderColor: activeThumb === idx ? selectedColor.hex : '#3f3f46' }}>
                  <span>{idx + 1}</span>
                </div>
                <span className="thumb-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Purchasing Controls & Specs */}
        <div className="pdp-details" data-component="ProductDetails" data-testid="product-details">
          <div className="pdp-header">
            <div className="pdp-brand-tag">ORCA TECHNICAL APEX SERIES</div>
            <h1 className="pdp-title" data-testid="pdp-title">
              Trail Apex Carbon Pro v2
            </h1>
            <p className="pdp-subtitle" data-testid="pdp-subtitle">
              All-Terrain Ultralight Competition Shoe with Integrated Carbon Propulsion
            </p>

            {/* Ratings & Social Proof */}
            <div className="rating-summary-row" data-testid="rating-summary">
              <div className="stars-strip">
                <span className="star">★</span>
                <span className="star">★</span>
                <span className="star">★</span>
                <span className="star">★</span>
                <span className="star">★</span>
              </div>
              <span className="rating-score">4.9</span>
              <span className="review-count">(1,248 verified athlete reviews)</span>
              <span className="dot-divider">•</span>
              <span className="stock-pill in-stock">● In Stock</span>
            </div>
          </div>

          {/* Price Box */}
          <div className="price-container" data-testid="price-container">
            <div className="price-row">
              <span className="current-price" data-testid="current-price">$189.00</span>
              <span className="original-price">$249.00</span>
              <span className="discount-tag">Save $60 (24%)</span>
            </div>
            <p className="price-note">
              Interest-free payments of $47.25 with <strong>Klarna</strong> or <strong>Afterpay</strong>.
            </p>
          </div>

          <hr className="pdp-divider" />

          {/* Color Variant Selector */}
          <div className="selector-group" data-testid="color-selector">
            <div className="selector-header">
              <span className="selector-label">Color:</span>
              <strong className="selector-current-value" data-testid="selected-color-name">
                {selectedColor.name}
              </strong>
            </div>
            <div className="color-swatches-grid">
              {COLOR_VARIANTS.map((c) => (
                <button
                  key={c.id}
                  className={`color-swatch-btn ${selectedColor.id === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedColor(c)}
                  data-testid={`swatch-${c.id}`}
                  style={{
                    backgroundColor: c.hex,
                    outlineColor: selectedColor.id === c.id ? c.ring : 'transparent',
                  }}
                  title={c.name}
                >
                  {selectedColor.id === c.id && <span className="swatch-check">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Size Picker */}
          <div className="selector-group" data-testid="size-selector">
            <div className="selector-header">
              <span className="selector-label">Select US Men's Size:</span>
              <button className="link-action-btn" data-testid="size-guide-btn">
                📏 Size & Fit Calculator
              </button>
            </div>
            <div className="sizes-grid">
              {SIZES.map((size) => (
                <button
                  key={size}
                  className={`size-btn ${selectedSize === size ? 'active' : ''}`}
                  onClick={() => setSelectedSize(size)}
                  data-testid={`size-${size}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="stock-alert-text">
              ⚡ <strong>Low Stock:</strong> Only 3 pairs remaining in size {selectedSize} at our London fulfillment hub.
            </div>
          </div>

          {/* Quantity Stepper & CTAs */}
          <div className="action-row" data-testid="cta-actions">
            <div className="quantity-stepper" data-testid="quantity-stepper">
              <button
                className="step-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="qty-value" data-testid="qty-display">{quantity}</span>
              <button
                className="step-btn"
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              className="btn-add-cart"
              onClick={handleAddToCart}
              data-testid="pdp-add-to-cart"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              <span>Add to Cart • ${(189 * quantity).toFixed(2)}</span>
            </button>

            <button className="btn-buy-now" data-testid="pdp-buy-now">
              ⚡ Buy with 1-Click
            </button>
          </div>

          {addedToast && (
            <div className="cart-toast" data-testid="cart-toast">
              ✓ Added {quantity}x Trail Apex ({selectedColor.name}, US {selectedSize}) to your cart!
            </div>
          )}

          {/* Guarantee Badges Grid */}
          <div className="guarantee-grid" data-testid="guarantee-grid">
            <div className="guarantee-card">
              <span className="g-icon">🚀</span>
              <div>
                <strong>Free Express Shipping</strong>
                <p>Delivered in 2 business days</p>
              </div>
            </div>
            <div className="guarantee-card">
              <span className="g-icon">🔄</span>
              <div>
                <strong>30-Day Trail Guarantee</strong>
                <p>Test on dirt, return if not satisfied</p>
              </div>
            </div>
            <div className="guarantee-card">
              <span className="g-icon">🛡️</span>
              <div>
                <strong>2-Year Durability Warranty</strong>
                <p>Covers lugs, stitching & plate</p>
              </div>
            </div>
            <div className="guarantee-card">
              <span className="g-icon">♻️</span>
              <div>
                <strong>100% Circular Design</strong>
                <p>Recycled ocean polymers</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Highlights & Key Technologies Grid */}
      <section className="tech-highlights-section" data-testid="tech-highlights">
        <div className="section-header">
          <span className="badge-pill">NEXT-GEN ENGINEERING</span>
          <h2>Precision Designed for Mountain Terrain</h2>
          <p>Every millimeter fine-tuned in the Austrian Alps for maximum grip and minimum weight.</p>
        </div>

        <div className="tech-cards-grid">
          <div className="tech-card" data-testid="tech-card-carbon">
            <div className="tech-icon-box">⚡</div>
            <h3>Propulsion Carbon Plate</h3>
            <p>
              Full-length 3D contoured carbon-composite plate returns 86% of ground kinetic energy, propelling you forward on steep climbs.
            </p>
            <span className="tech-metric">86% Kinetic Return</span>
          </div>

          <div className="tech-card" data-testid="tech-card-grip">
            <div className="tech-icon-box">🏔️</div>
            <h3>Vibram® Megagrip Outsole</h3>
            <p>
              Aggressive 5.0mm multidirectional chevron lugs bite into loose shale, deep mud, and wet rock with zero slip.
            </p>
            <span className="tech-metric">5.0mm Mud Lugs</span>
          </div>

          <div className="tech-card" data-testid="tech-card-cushion">
            <div className="tech-icon-box">☁️</div>
            <h3>Dual NitroFoam™ Midsole</h3>
            <p>
              Supercritical nitrogen-infused foam provides plush impact absorption without bottoming out over 100km ultramarathon distances.
            </p>
            <span className="tech-metric">248g Ultralight</span>
          </div>

          <div className="tech-card" data-testid="tech-card-upper">
            <div className="tech-icon-box">🛡️</div>
            <h3>Hydrophobic Matryx® Mesh</h3>
            <p>
              French-woven Kevlar and high-tenacity polyamide upper rejects water absorption while maintaining high breathability.
            </p>
            <span className="tech-metric">IPX5 Water Resistant</span>
          </div>
        </div>
      </section>

      {/* Technical Specifications Accordion / Tabs */}
      <section className="specs-section" id="specs" data-testid="specs-section">
        <div className="tabs-header">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            data-testid="tab-overview"
          >
            Overview & Design
          </button>
          <button
            className={`tab-btn ${activeTab === 'specs' ? 'active' : ''}`}
            onClick={() => setActiveTab('specs')}
            data-testid="tab-specs"
          >
            Technical Specifications
          </button>
          <button
            className={`tab-btn ${activeTab === 'fit' ? 'active' : ''}`}
            onClick={() => setActiveTab('fit')}
            data-testid="tab-fit"
          >
            Sizing & Fit Guide
          </button>
          <button
            className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
            data-testid="tab-reviews"
          >
            Athlete Reviews (1,248)
          </button>
        </div>

        <div className="tab-body" data-testid="tab-content">
          {activeTab === 'overview' && (
            <div className="tab-pane">
              <h3>Engineered for the World's Toughest Trails</h3>
              <p>
                The Trail Apex Carbon Pro v2 is our pinnacle race shoe, conceived for athletes demanding blistering speed on alpine ridgelines and loose scree. By pairing an anatomically curved carbon shank with our featherlight NitroFoam compound, the v2 delivers an unmatched balance of responsiveness, ground-feel, and trail stability.
              </p>
              <ul className="spec-bullets">
                <li>Best For: Trail Racing, Alpine Speed Ascents, Technical Ultra Marathons</li>
                <li>Gait: Neutral, Fast-Cadence Stride</li>
                <li>Stack Height: 32mm Heel / 26mm Forefoot (6mm Drop)</li>
                <li>Certified Trail Carbon Compliance (World Athletics Approved)</li>
              </ul>
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="tab-pane">
              <table className="specs-table" data-testid="specs-table">
                <tbody>
                  <tr>
                    <th>Shoe Weight</th>
                    <td>248 grams (Men's US 9.0)</td>
                  </tr>
                  <tr>
                    <th>Heel-to-Toe Drop</th>
                    <td>6.0 mm</td>
                  </tr>
                  <tr>
                    <th>Lug Depth</th>
                    <td>5.0 mm chevron multidirectional</td>
                  </tr>
                  <tr>
                    <th>Cushioning Density</th>
                    <td>Dual-density supercritical EVA + NitroFoam</td>
                  </tr>
                  <tr>
                    <th>Outsole Compound</th>
                    <td>Vibram® Megagrip Litebase with Traction Lug</td>
                  </tr>
                  <tr>
                    <th>Plate Technology</th>
                    <td>Full-length 3K carbon-fiber rocker with dual forefoot split</td>
                  </tr>
                  <tr>
                    <th>Upper Material</th>
                    <td>Matryx® Kevlar monofilament reinforced ripstop</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'fit' && (
            <div className="tab-pane">
              <h3>Fit Profile: Precision Athletic</h3>
              <p>
                The Trail Apex fits true to size for standard medium-width feet. If you run ultra-distances (50K+) where foot swelling occurs, we recommend sizing up a half size.
              </p>
              <div className="fit-meter">
                <span className="fit-meter-label">Width: Snug Heel • Generous Forefoot Toe Box</span>
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="tab-pane">
              <div className="reviews-summary-grid">
                <div className="score-big-box">
                  <span className="big-num">4.9</span>
                  <div className="stars-strip">★★★★★</div>
                  <span>Based on 1,248 athlete ratings</span>
                </div>
                <div className="rating-bars">
                  <div className="bar-row">
                    <span>5 Star</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: '92%' }}></div></div>
                    <span>92%</span>
                  </div>
                  <div className="bar-row">
                    <span>4 Star</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: '6%' }}></div></div>
                    <span>6%</span>
                  </div>
                  <div className="bar-row">
                    <span>3 Star</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: '1%' }}></div></div>
                    <span>1%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Customer Reviews Section */}
      <section className="reviews-section" data-testid="reviews-section">
        <div className="section-header">
          <h2>Verified Athlete Experiences</h2>
          <p>Real feedback from runners who tackled Mont Blanc, UTMB, and Western States.</p>
        </div>

        <div className="reviews-cards-grid">
          <div className="review-card" data-testid="review-card-1">
            <div className="review-user-row">
              <div className="review-avatar">MK</div>
              <div>
                <strong>Marcus K.</strong>
                <span className="verified-badge">✓ Verified Buyer • UTMB Finisher</span>
              </div>
              <span className="review-date">3 days ago</span>
            </div>
            <div className="stars-strip">★★★★★</div>
            <h4>Best technical trail shoe I've ever tested</h4>
            <p>
              "Took these straight out of the box for a 45K ridge run in Chamonix. The carbon plate provides incredible bounce on climbs, and the Vibram lugs saved me multiple times on wet granite."
            </p>
          </div>

          <div className="review-card" data-testid="review-card-2">
            <div className="review-user-row">
              <div className="review-avatar">SL</div>
              <div>
                <strong>Sarah L.</strong>
                <span className="verified-badge">✓ Verified Buyer • Skyrunner</span>
              </div>
              <span className="review-date">1 week ago</span>
            </div>
            <div className="stars-strip">★★★★★</div>
            <h4>Grip in wet conditions is unmatched</h4>
            <p>
              "The Matryx upper doesn't hold any water after stream crossings. Super light and breathable. The 24px heel collar locks down without any achilles friction."
            </p>
          </div>
        </div>
      </section>

      {/* Frequently Bought Together / Related Products */}
      <section className="related-products-section" data-testid="related-products">
        <div className="section-header">
          <h2>Complete Your Mountain Kit</h2>
          <p>Engineered to pair seamlessly with the Trail Apex Carbon Pro v2.</p>
        </div>

        <div className="related-grid">
          <div className="related-card" data-testid="related-card-1">
            <div className="related-img-placeholder">🎒</div>
            <h4>Apex 12L Hydration Race Vest</h4>
            <p className="related-price">$145.00</p>
            <button className="btn-quick-add">Quick Add</button>
          </div>

          <div className="related-card" data-testid="related-card-2">
            <div className="related-img-placeholder">🧦</div>
            <h4>Anti-Blister Merino Trail Socks (3-Pack)</h4>
            <p className="related-price">$38.00</p>
            <button className="btn-quick-add">Quick Add</button>
          </div>

          <div className="related-card" data-testid="related-card-3">
            <div className="related-img-placeholder">🦯</div>
            <h4>Carbon Pro Foldable Trekking Poles</h4>
            <p className="related-price">$120.00</p>
            <button className="btn-quick-add">Quick Add</button>
          </div>

          <div className="related-card" data-testid="related-card-4">
            <div className="related-img-placeholder">🧢</div>
            <h4>Ultralight Packable Trail Cap</h4>
            <p className="related-price">$32.00</p>
            <button className="btn-quick-add">Quick Add</button>
          </div>
        </div>
      </section>

      {/* Comprehensive E-Commerce Footer */}
      <footer className="site-footer" data-testid="site-footer">
        <div className="footer-top-grid">
          <div className="footer-col brand-col">
            <div className="brand-logo footer-logo">
              <span className="brand-mark">▲</span>
              <span>ORCA<strong>APEX</strong></span>
            </div>
            <p>Pioneering mountain technology and ultralight carbon performance footwear since 2018.</p>
            <div className="newsletter-box">
              <label htmlFor="newsletter-input">Subscribe for athlete drops & trail beta:</label>
              <div className="newsletter-input-wrap">
                <input id="newsletter-input" type="email" placeholder="Enter your email" />
                <button className="btn-newsletter">Subscribe</button>
              </div>
            </div>
          </div>

          <div className="footer-col">
            <h4>Footwear</h4>
            <a href="#trail">Trail Running</a>
            <a href="#sky">Skyrunning</a>
            <a href="#ultra">Ultramarathon</a>
            <a href="#carbon">Carbon Racing</a>
          </div>

          <div className="footer-col">
            <h4>Technology</h4>
            <a href="#carbon-plate">Propulsion Carbon</a>
            <a href="#nitrofoam">Supercritical Foam</a>
            <a href="#vibram">Vibram® Megagrip</a>
            <a href="#circular">Circular Recycling</a>
          </div>

          <div className="footer-col">
            <h4>Customer Support</h4>
            <a href="#shipping">Shipping & Tracking</a>
            <a href="#returns">30-Day Trail Guarantee</a>
            <a href="#warranty">Warranty Claim</a>
            <a href="#contact">Contact Athletes Desk</a>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <span>© 2026 ORCA APEX Athletic Corp. All rights reserved.</span>
          <div className="footer-legal-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#cookies">Cookie Preferences</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Sub-Pages (Login, Products, Cart)
// ---------------------------------------------------------------------------

function Login() {
  const login = useStore((s) => s.login);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    login(email);
  };

  return (
    <div
      data-testid="login-page"
      data-component="Login"
      data-source-file="apps/sample-react-app/src/App.tsx"
      data-source-line="48"
      data-feature="demo-auth"
      style={{ padding: '3rem 1rem', maxWidth: '400px', margin: '0 auto' }}
    >
      <h1>Sign In</h1>
      <form onSubmit={handleSubmit}>
        <input
          name="email"
          type="email"
          placeholder="Email address"
          data-testid="email-input"
          data-component="LoginEmailInput"
          data-source-file="apps/sample-react-app/src/App.tsx"
          data-source-line="63"
          data-feature="demo-auth"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          data-testid="password-input"
          required
        />
        <button type="submit" data-testid="submit-btn" style={{ background: '#10b981', color: '#fff', fontWeight: 'bold' }}>
          Sign In
        </button>
      </form>
    </div>
  );
}

const PRODUCTS = [
  { id: 'p1', name: 'Trail Apex Carbon Pro v2', price: 189.00 },
  { id: 'p2', name: 'Apex 12L Hydration Vest', price: 145.00 },
  { id: 'p3', name: 'Carbon Pro Trekking Poles', price: 120.00 },
  { id: 'p4', name: 'Anti-Blister Merino Socks (3-Pack)', price: 38.00 },
];

function Products() {
  const addToCart = useStore((s) => s.addToCart);

  return (
    <div
      data-testid="products-page"
      data-component="Products"
      data-source-file="apps/sample-react-app/src/App.tsx"
      data-source-line="94"
      data-feature="demo-products"
      style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      <h1>Outdoor & Technical Gear</h1>
      <div className="products">
        {PRODUCTS.map((p) => (
          <div
            key={p.id}
            className="product"
            data-testid={`product-${p.id}`}
            data-component="ProductCard"
            data-source-file="apps/sample-react-app/src/App.tsx"
            data-source-line="106"
            data-feature="demo-products"
          >
            <h3>{p.name}</h3>
            <p style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#10b981', margin: '0.5rem 0' }}>
              ${p.price.toFixed(2)}
            </p>
            <button onClick={() => addToCart(p)} data-testid={`add-${p.id}`} style={{ background: '#10b981' }}>
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cart() {
  const { cart, removeFromCart, clearCart } = useStore();
  const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div
      data-testid="cart-page"
      data-component="Cart"
      data-source-file="apps/sample-react-app/src/App.tsx"
      data-source-line="125"
      data-feature="demo-cart"
      style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}
    >
      <h1>Your Gear Cart</h1>
      {cart.items.length === 0 ? (
        <p data-testid="empty-cart">Your cart is currently empty. Explore the Trail Apex Carbon Pro v2 on the home page.</p>
      ) : (
        <>
          <ul style={{ margin: '1rem 0' }}>
            {cart.items.map((item) => (
              <li key={item.id} data-testid={`cart-item-${item.id}`} style={{ padding: '0.75rem 0', borderBottom: '1px solid #334155' }}>
                <div>
                  <strong>{item.name}</strong> x{item.qty}
                </div>
                <div>
                  <span style={{ fontWeight: 'bold', marginRight: '1rem' }}>${(item.price * item.qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} data-testid={`remove-${item.id}`} style={{ background: '#ef4444' }}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p data-testid="cart-total" style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '1.5rem 0' }}>
            Total: ${total.toFixed(2)}
          </p>
          <button onClick={clearCart} data-testid="clear-cart" style={{ background: '#64748b' }}>
            Clear Cart
          </button>
        </>
      )}
    </div>
  );
}
