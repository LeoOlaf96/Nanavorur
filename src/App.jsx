import { useEffect, useMemo, useState } from "react";
import { storeContent } from "./data/store";

const SHOPIFY_DOMAIN = "nanavorur.myshopify.com";
const STOREFRONT_TOKEN = "2243ae64611d44af192356cc7fd6928e";
const SHOPIFY_API_VERSION = "2024-01";

export default function App() {
  const [locale, setLocale] = useState("is");
  const [selectedId, setSelectedId] = useState(null);
  const [cart, setCart] = useState([]);
  const [shopifyProducts, setShopifyProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const t = storeContent[locale];

  useEffect(() => {
    document.title = t.metaTitle;
  }, [t.metaTitle]);

  useEffect(() => {
    async function getProducts() {
      try {
        setIsLoadingProducts(true);

        const response = await fetch(
          `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
            },
            body: JSON.stringify({
              query: `
                {
                  products(first: 8) {
                    edges {
                      node {
                        id
                        title
                        handle
                        description
                        productType
                        featuredImage {
                          url
                        }
                        images(first: 1) {
                          edges {
                            node {
                              url
                            }
                          }
                        }
                        variants(first: 1) {
                          edges {
                            node {
                              id
                              price {
                                amount
                                currencyCode
                              }
                            }
                          }
                        }
                        priceRange {
                          minVariantPrice {
                            amount
                            currencyCode
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

        const result = await response.json();

        if (result.errors) {
          console.error("Shopify GraphQL errors:", result.errors);
          return;
        }

        const products =
          result?.data?.products?.edges?.map(({ node }, index) => {
            const variant = node?.variants?.edges?.[0]?.node;
            const priceInfo = variant?.price || node?.priceRange?.minVariantPrice;
            const amount = Number(priceInfo?.amount || 0);
            const image =
              node?.featuredImage?.url ||
              node?.images?.edges?.[0]?.node?.url ||
              "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=1200&q=80"

            const fallbackBadge =
              locale === "is"
                ? ["Nýtt", "Vinsælt", "Glow", "Sæt vara"][index % 4]
                : ["New", "Best seller", "Glow", "Cute pick"][index % 4];

            return {
              id: node.id,
              variantId: variant?.id || null,
              name: node.title,
              title: node.title,
              handle: node.handle,
              desc:
                node.description ||
                (locale === "is"
                  ? "Falleg snyrtivara frá Nanavörur."
                  : "A lovely beauty product from Nanavörur."),
              category:
                node.productType ||
                (locale === "is" ? "Snyrtivörur" : "Beauty"),
              badge: fallbackBadge,
              image,
              price: amount,
              currencyCode: priceInfo?.currencyCode || "ISK",
            };
          }) || [];

        setShopifyProducts(products);
        if (products.length > 0) {
          setSelectedId(products[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch Shopify products:", error);
      } finally {
        setIsLoadingProducts(false);
      }
    }

    getProducts();
  }, [locale]);

  const selectedProduct =
    shopifyProducts.find((p) => p.id === selectedId) || shopifyProducts[0] || null;

  const formatMoney = (value, currencyCode = "ISK") => {
    try {
      return new Intl.NumberFormat(locale === "is" ? "is-IS" : "en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: currencyCode === "ISK" ? 0 : 2,
      }).format(value);
    } catch {
      return `${new Intl.NumberFormat(locale === "is" ? "is-IS" : "en-US").format(
        value
      )} kr`;
    }
  };

  const addToCart = (product) => {
    if (!product?.variantId) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          variantId: product.variantId,
          qty: 1,
        },
      ];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const cartItems = useMemo(() => {
    return cart
      .map((item) => {
        const product = shopifyProducts.find((p) => p.id === item.id);
        return product ? { ...product, qty: item.qty } : null;
      })
      .filter(Boolean);
  }, [cart, shopifyProducts]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const startCheckout = async () => {
    if (cartItems.length === 0) return;

    try {
      setIsCheckingOut(true);

      const lines = cartItems.map((item) => ({
        merchandiseId: item.variantId,
        quantity: item.qty,
      }));

      const response = await fetch(
        `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
          },
          body: JSON.stringify({
            query: `
              mutation cartCreate($input: CartInput) {
                cartCreate(input: $input) {
                  cart {
                    checkoutUrl
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              input: {
                lines,
              },
            },
          }),
        }
      );

      const result = await response.json();

      const userErrors = result?.data?.cartCreate?.userErrors || [];
      if (userErrors.length > 0) {
        console.error("Checkout errors:", userErrors);
        alert(
          locale === "is"
            ? "Ekki tókst að hefja greiðsluferli."
            : "Could not start checkout."
        );
        return;
      }

      const checkoutUrl = result?.data?.cartCreate?.cart?.checkoutUrl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        alert(
          locale === "is"
            ? "Greiðsluslóð fannst ekki."
            : "Checkout URL was not found."
        );
      }
    } catch (error) {
      console.error("Failed to create Shopify checkout cart:", error);
      alert(
        locale === "is"
          ? "Villa kom upp við að opna greiðslu."
          : "An error occurred while opening checkout."
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-rose-50 to-white text-zinc-800">
      <div className="bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 px-4 py-3 text-center text-sm font-semibold text-white">
        {t.announcement}
      </div>

      <header className="sticky top-0 z-50 border-b border-pink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <a href="#top" className="block">
            <div className="text-2xl font-black tracking-tight text-pink-500 md:text-3xl">
              {t.brand}
            </div>
            <div className="text-xs tracking-[0.2em] text-pink-300">{t.subtitle}</div>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#shop" className="transition hover:text-pink-500">
              {t.nav.shop}
            </a>
            <a href="#featured" className="transition hover:text-pink-500">
              {t.nav.featured}
            </a>
            <a href="#about" className="transition hover:text-pink-500">
              {t.nav.about}
            </a>
            <a href="#faq" className="transition hover:text-pink-500">
              {t.nav.faq}
            </a>
            <a href="#contact" className="transition hover:text-pink-500">
              {t.nav.contact}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocale(locale === "is" ? "en" : "is")}
              className="rounded-full border border-pink-200 bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-600 transition hover:bg-pink-200"
            >
              {locale === "is" ? "EN" : "ÍS"}
            </button>
            <div className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white">
              {cart.reduce((sum, item) => sum + item.qty, 0)} 🛒
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,207,232,0.9),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(254,205,211,0.7),_transparent_30%)]" />
          <div className="absolute left-8 top-12 text-4xl opacity-60">✨</div>
          <div className="absolute right-12 top-24 text-5xl opacity-60">💖</div>
          <div className="absolute bottom-12 left-1/3 text-4xl opacity-50">🎀</div>

          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
            <div className="flex flex-col justify-center">
              <div className="mb-4 inline-flex w-fit rounded-full bg-white px-4 py-2 text-sm font-semibold text-pink-500 shadow-sm ring-1 ring-pink-100">
                {t.heroTag}
              </div>
              <h1 className="max-w-2xl text-4xl font-black leading-tight text-zinc-900 md:text-6xl">
                {t.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600 md:text-lg">
                {t.heroDesc}
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#featured"
                  className="rounded-2xl bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5"
                >
                  {t.heroPrimary}
                </a>
                <a
                  href="#featured"
                  className="rounded-2xl border border-pink-200 bg-white px-6 py-3 font-semibold text-pink-600 transition hover:bg-pink-50"
                >
                  {t.heroSecondary}
                </a>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute -right-10 top-6 h-32 w-32 rounded-full bg-pink-200 blur-3xl" />
              <div className="absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-rose-200 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] bg-white p-3 shadow-2xl ring-1 ring-pink-100">
                <img
                  src="https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=1200&q=80"
                  alt="Cosmetics display"
                  className="h-[520px] w-full max-w-md rounded-[1.5rem] object-cover"
                />
                <div className="absolute bottom-6 left-6 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-pink-500 shadow">
                  {t.shippingNote}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-3 md:px-8">
          {t.trustBar.map((item) => (
            <div
              key={item}
              className="rounded-2xl bg-white p-4 text-center text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-pink-100"
            >
              {item}
            </div>
          ))}
        </section>

        <section id="shop" className="mx-auto max-w-7xl px-4 py-16 md:px-8">
          <h2 className="mb-8 text-3xl font-black text-zinc-900">
            {t.categoriesTitle}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="group rounded-[2rem] bg-white p-6 text-left shadow-sm ring-1 ring-pink-100 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-100 text-2xl">
                  {category.emoji}
                </div>
                <h3 className="text-lg font-bold text-zinc-900">{category.name}</h3>
                <p className="mt-2 text-sm text-zinc-500">{category.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section id="featured" className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <h2 className="mb-8 text-3xl font-black text-zinc-900">
              {t.featuredTitle}
            </h2>
            
            <div className="p-4 text-sm text-red-500">
  Products loaded: {shopifyProducts.length}
</div>
            
            {isLoadingProducts ? (
              <div className="rounded-[2rem] bg-pink-50 p-8 text-center text-zinc-500 ring-1 ring-pink-100">
                {locale === "is" ? "Hleð inn vörum..." : "Loading products..."}
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {shopifyProducts.map((product) => (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-[2rem] bg-pink-50 shadow-sm ring-1 ring-pink-100 transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="relative">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-72 w-full object-cover"
                      />
                      <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-bold text-pink-500 shadow">
                        {product.badge}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-pink-400">
                        {product.category}
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-zinc-900">
                        {product.name}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">
                        {product.desc}
                      </p>
                      <div className="mt-3 text-base font-extrabold text-pink-600">
                        {formatMoney(product.price, product.currencyCode)}
                      </div>
                      <div className="mt-5 flex gap-3">
                        <button
                          onClick={() => addToCart(product)}
                          className="flex-1 rounded-2xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-600"
                        >
                          {t.addToCart}
                        </button>
                        <button
                          onClick={() => setSelectedId(product.id)}
                          className="rounded-2xl border border-pink-200 bg-white px-4 py-3 font-semibold text-pink-600 transition hover:bg-pink-50"
                        >
                          {t.viewDetails}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-pink-100">
              {selectedProduct ? (
                <div className="grid md:grid-cols-2">
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="h-full min-h-[340px] w-full object-cover"
                  />
                  <div className="p-8">
                    <div className="inline-flex rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-600">
                      {selectedProduct.badge}
                    </div>
                    <h2 className="mt-4 text-3xl font-black text-zinc-900">
                      {selectedProduct.name}
                    </h2>
                    <div className="mt-2 text-sm font-semibold uppercase tracking-wide text-pink-400">
                      {selectedProduct.category}
                    </div>
                    <p className="mt-4 text-base leading-7 text-zinc-600">
                      {selectedProduct.desc}
                    </p>
                    <div className="mt-6 text-2xl font-extrabold text-pink-600">
                      {formatMoney(
                        selectedProduct.price,
                        selectedProduct.currencyCode
                      )}
                    </div>
                    <button
                      onClick={() => addToCart(selectedProduct)}
                      className="mt-8 rounded-2xl bg-pink-500 px-6 py-3 font-semibold text-white transition hover:bg-pink-600"
                    >
                      {t.addToCart}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-zinc-500">
                  {locale === "is"
                    ? "Engin vara valin."
                    : "No product selected."}
                </div>
              )}
            </article>

            <aside className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-pink-100">
              <h3 className="text-2xl font-black text-zinc-900">{t.cartTitle}</h3>
              <p className="mt-2 text-sm text-zinc-500">{t.shippingNote}</p>
              <div className="mt-6 space-y-4">
                {cartItems.length === 0 ? (
                  <div className="rounded-2xl bg-pink-50 p-4 text-sm text-zinc-500">
                    {t.emptyCart}
                  </div>
                ) : (
                  cartItems.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-pink-50 p-3">
                      <div className="flex items-center gap-4">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-zinc-900">
                            {item.name}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {formatMoney(item.price, item.currencyCode)}
                          </div>
                        </div>
                        <div className="text-sm font-bold text-pink-600">
                          {formatMoney(item.price * item.qty, item.currencyCode)}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs font-semibold text-zinc-500">
                          {t.quantity}: {item.qty}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm font-bold text-pink-600"
                          >
                            −
                          </button>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            className="rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm font-bold text-pink-600"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-pink-100 pt-6">
                <div className="text-sm font-semibold text-zinc-500">
                  {t.subtotal}
                </div>
                <div className="text-xl font-black text-zinc-900">
                  {formatMoney(subtotal, "ISK")}
                </div>
              </div>
              <button
                onClick={startCheckout}
                disabled={cartItems.length === 0 || isCheckingOut}
                className="mt-6 w-full rounded-2xl bg-pink-500 px-4 py-4 font-bold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingOut
                  ? locale === "is"
                    ? "Opna greiðslu..."
                    : "Opening checkout..."
                  : t.checkout}
              </button>
              <button
                className="mt-3 w-full rounded-2xl border border-pink-200 bg-white px-4 py-4 font-bold text-pink-600 transition hover:bg-pink-50"
                onClick={() => {
                  window.location.href = "#featured";
                }}
              >
                {t.continueShopping}
              </button>
            </aside>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-16 md:px-8">
          <h2 className="mb-8 text-3xl font-black text-zinc-900">
            {t.aboutTitle}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {t.aboutCards.map((item, i) => (
              <div
                key={item}
                className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-pink-100"
              >
                <div className="mb-4 text-3xl">{["🌸", "💖", "✨"][i]}</div>
                <h3 className="text-lg font-bold text-zinc-900">{item}</h3>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="bg-white py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-8 text-center text-3xl font-black text-zinc-900">
              {t.faqTitle}
            </h2>
            <div className="space-y-4">
              {t.faqs.map((item) => (
                <details
                  key={item.q}
                  className="rounded-[2rem] bg-pink-50 p-6 ring-1 ring-pink-100"
                >
                  <summary className="cursor-pointer list-none text-lg font-bold text-zinc-900">
                    {item.q}
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-r from-pink-400 to-rose-300 py-16 text-white">
          <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
            <h2 className="text-3xl font-black md:text-4xl">
              {t.newsletterTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-pink-50 md:text-lg">
              {t.newsletterDesc}
            </p>
            <form
              className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder={t.emailPlaceholder}
                className="w-full rounded-2xl border-0 px-5 py-4 text-zinc-800 outline-none"
              />
              <button className="rounded-2xl bg-white px-6 py-4 font-bold text-pink-500 transition hover:bg-pink-50">
                {t.newsletterButton}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-pink-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-zinc-500 md:grid-cols-3 md:px-8">
          <div>
            <div className="text-lg font-black text-pink-500">{t.brand}</div>
            <div className="mt-2">{t.footer}</div>
          </div>
          <div>
            <div className="font-bold text-zinc-800">Contact</div>
            <div className="mt-2">{t.contactEmail}</div>
            <div>{t.contactInstagram}</div>
          </div>
          <div>
            <div className="font-bold text-zinc-800">Links</div>
            <div className="mt-2 flex flex-col gap-2">
              <a href="#shop" className="hover:text-pink-500">
                {t.nav.shop}
              </a>
              <a href="#faq" className="hover:text-pink-500">
                {t.nav.faq}
              </a>
              <a href="#about" className="hover:text-pink-500">
                {t.nav.about}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
