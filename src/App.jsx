import { useEffect } from "react";

const SHOPIFY_DOMAIN = "nanavorur.myshopify.com";
const STOREFRONT_TOKEN = "2243ae64611d44af192356cc7fd6928e";

function App() {
  useEffect(() => {
    async function getProducts() {
      const response = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
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
      });

      const data = await response.json();
      console.log("SHOPIFY DATA:", data);
    }

    getProducts();
  }, []);

  return (
    <div>
      <h1>Nanavörur Store</h1>
      <p>Check console for products 👀</p>
    </div>
  );
}

export default App;
