import { Routes, Route, Link } from 'react-router-dom';
import { useStore } from './store';

export function App() {
  const { auth, logout, cart } = useStore();

  return (
    <div className="app">
      <header>
        <nav>
          <Link to="/" data-testid="nav-home">
            Home
          </Link>
          <Link to="/products" data-testid="nav-products">
            Products
          </Link>
          <Link to="/cart" data-testid="nav-cart">
            Cart ({cart.items.reduce((s, i) => s + i.qty, 0)})
          </Link>
        </nav>
        <div>
          {auth.isLoggedIn ? (
            <>
              <span data-testid="user-email">{auth.email}</span>
              <button onClick={logout} data-testid="logout-btn">
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" data-testid="login-link">
              Login
            </Link>
          )}
        </div>
      </header>
      <main>
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

function Home() {
  return (
    <div data-testid="home-page">
      <h1>Welcome to Debug Bridge Demo</h1>
      <p>Use the navigation to explore the app.</p>
    </div>
  );
}

function Login() {
  const login = useStore((s) => s.login);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    console.log('Login:', email);
    login(email);
  };

  return (
    <div data-testid="login-page">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          name="email"
          type="email"
          placeholder="Email"
          data-testid="email-input"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          data-testid="password-input"
          required
        />
        <button type="submit" data-testid="submit-btn">
          Sign In
        </button>
      </form>
    </div>
  );
}

const PRODUCTS = [
  { id: 'p1', name: 'Widget A', price: 19.99 },
  { id: 'p2', name: 'Widget B', price: 29.99 },
  { id: 'p3', name: 'Gadget X', price: 49.99 },
];

function Products() {
  const addToCart = useStore((s) => s.addToCart);

  return (
    <div data-testid="products-page">
      <h1>Products</h1>
      <div className="products">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="product" data-testid={`product-${p.id}`}>
            <h3>{p.name}</h3>
            <p>${p.price}</p>
            <button onClick={() => addToCart(p)} data-testid={`add-${p.id}`}>
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
    <div data-testid="cart-page">
      <h1>Cart</h1>
      {cart.items.length === 0 ? (
        <p data-testid="empty-cart">Your cart is empty.</p>
      ) : (
        <>
          <ul>
            {cart.items.map((item) => (
              <li key={item.id} data-testid={`cart-item-${item.id}`}>
                {item.name} x{item.qty} - ${(item.price * item.qty).toFixed(2)}
                <button onClick={() => removeFromCart(item.id)} data-testid={`remove-${item.id}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p data-testid="cart-total">Total: ${total.toFixed(2)}</p>
          <button onClick={clearCart} data-testid="clear-cart">
            Clear Cart
          </button>
        </>
      )}
    </div>
  );
}
