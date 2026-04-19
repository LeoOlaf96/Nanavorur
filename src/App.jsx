import { useEffect, useMemo, useState } from "react";
import { storeContent } from "./data/store";

const SHOPIFY_DOMAIN = "nanavorur.myshopify.com";
const STOREFRONT_TOKEN = "2243ae64611d44af192356cc7fd6928e";

export default function App() {
  const [locale, setLocale] = useState("is");
  const [selectedId, setSelectedId] = useState(null);
  const [cart, setCart] = useState([]);
  const [shopifyProducts, setShopifyProducts] = useState([]);

  const t = storeContent[locale];

  // Shopify fetch
  useEffect(() => {
    async function getProducts() {
      const response = await fetch(
        `https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
          },
          body: JSON.stringify({
            query: `
              {
                products(first: 6) {
                  edges {
                    node {
                      id
                      title
                      images(first: 1) {
                        edges {
                          node {
                            url
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
          }),
        }
      );

      const data = await response.json();
      setShopifyProducts(data.data.products.edges);
    }

    getProducts();
  }, []);

  useEffect(() => {
    document.title = t.metaTitle;
  }, [t.metaTitle]);

  const formatISK = (value) =>
    `${new Intl.NumberFormat(locale === "is" ? "is-IS" : "en-US").format(value)} kr`;

  const cartItems = useMemo(() => {
    return cart.map((item) => {
      const product = shopifyProducts.find((p) => p.node.id === item.id);
      return product
        ? {
            ...product.node,
            image: product.node.images.edges[0]?.node.url,
            qty: item.qty,
          }
        : null;
    }).filter(Boolean);
  }, [cart, shopifyProducts]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.qty * 1000, 0); // fake price for now

  const addToCart = (id) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (existing) {
        return prev.map((item) =>
          item.id === id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { id, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id
            ? { ...item, qty: Math.max(0, item.qty + delta) }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  return (
    <div className="min-h-screen bg-pink-50 text-zinc-800">
      <header className="p-4 flex justify-between">
        <h1 className="text-2xl font-bold">Nanavörur</h1>
        <div>{cart.reduce((s, i) => s + i.qty, 0)} 🛒</div>
      </header>

      {/* PRODUCTS */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {shopifyProducts.map(({ node }) => (
          <div key={node.id} className="bg-white p-4 rounded-xl shadow">
            <img
              src={node.images.edges[0]?.node.url}
              alt={node.title}
              className="h-40 w-full object-cover rounded"
            />
            <h2 className="mt-2 font-bold">{node.title}</h2>

            <button
              onClick={() => addToCart(node.id)}
              className="mt-2 w-full bg-pink-500 text-white py-2 rounded"
            >
              Add to cart
            </button>
          </div>
        ))}
      </div>

      {/* CART */}
      <div className="p-4 bg-white mt-4">
        <h2 className="text-xl font-bold mb-2">Cart</h2>

        {cartItems.map((item) => (
          <div key={item.id} className="flex justify-between mb-2">
            <span>{item.title}</span>
            <div>
              <button onClick={() => updateQty(item.id, -1)}>-</button>
              {item.qty}
              <button onClick={() => updateQty(item.id, 1)}>+</button>
            </div>
          </div>
        ))}

        <div className="mt-4 font-bold">
          Total: {formatISK(subtotal)}
        </div>
      </div>
    </div>
  );
}
