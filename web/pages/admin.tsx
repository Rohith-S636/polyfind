import React, { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { authFetch, clearSession, readApiError } from "../lib/auth";
import type { AuthPrincipal } from "../lib/auth-types";
import type { Product } from "../../src/contracts/types";

interface Seller { id: string; name: string; slug: string; status: string }
interface Offer { id: string; productId: string; sellerId: string; currency: string; price: number; stockQuantity: number | null; availability: string; version: number }
interface HistoryEntry { id: number; offerId: string; sellerId: string; currency: string; price: number; offerVersion: number; recordedAt: string; changeReason: string | null }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(url, init);
  if (!response.ok) throw new Error(await readApiError(response, `Request failed (HTTP ${response.status}).`));
  return response.json() as Promise<T>;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthPrincipal | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyProductId, setHistoryProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [productData, sellerData, offerData] = await Promise.all([
      api<{ items: Product[] }>("/api/products?page=1&limit=100"),
      api<{ items: Seller[] }>("/api/sellers?page=1&limit=100"),
      api<{ items: Offer[] }>("/api/offers?page=1&limit=100"),
    ]);
    setProducts(productData.items);
    setSellers(sellerData.items);
    setOffers(offerData.items);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api<{ user: AuthPrincipal }>("/api/auth/me");
        if (!me.user.roles.includes("admin")) {
          await router.replace("/");
          return;
        }
        if (active) {
          setUser(me.user);
          await refresh();
        }
      } catch {
        clearSession();
        await router.replace("/login");
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function submitJson(event: FormEvent<HTMLFormElement>, url: string, build: (data: FormData) => unknown, label: string) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(build(new FormData(form))) });
      form.reset();
      await refresh();
      setNotice(label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ items: HistoryEntry[] }>(`/api/price-history?productId=${encodeURIComponent(historyProductId)}&page=1&limit=100`);
      setHistory(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load price history.");
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* session may already be expired */ }
    clearSession();
    await router.replace("/");
  }

  if (!user) return <main className="container" style={{ padding: "3rem 1rem" }}>Checking administrator session…</main>;

  const panel: React.CSSProperties = { background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 12, padding: "1rem", display: "grid", gap: "0.8rem" };
  const field: React.CSSProperties = { width: "100%", padding: "0.65rem", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" };
  const button: React.CSSProperties = { padding: "0.7rem 1rem", borderRadius: 8, border: 0, background: "var(--accent-color, #2563eb)", color: "white", cursor: "pointer", fontWeight: 700 };

  return (
    <main className="container" style={{ padding: "2rem 1rem 4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: "2rem", fontWeight: 800 }}>Administrator workspace</h1><p style={{ color: "var(--text-secondary)" }}>Signed in as {user.email}. Shared catalogue changes are audited.</p></div>
        <div style={{ display: "flex", gap: "1rem" }}><Link href="/">View catalogue</Link><button onClick={logout} style={button}>Sign out</button></div>
      </div>
      {error && <p role="alert" style={{ color: "var(--error-text)", margin: "1rem 0" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "var(--success-text)", margin: "1rem 0" }}>{notice}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        <form style={panel} onSubmit={(e) => submitJson(e, "/api/products", (d) => ({ id: d.get("id"), name: d.get("name"), description: d.get("description"), categoryId: d.get("categoryId"), price: Number(d.get("price")), stock: Number(d.get("stock")) }), "Product created.")}>
          <h2 style={{ fontWeight: 750 }}>Create product</h2>
          <input name="id" placeholder="Product ID" required style={field} />
          <input name="name" placeholder="Product name" required style={field} />
          <textarea name="description" placeholder="Description" required style={field} />
          <input name="categoryId" placeholder="Category ID (e.g. cat-outdoors)" required style={field} />
          <input name="price" type="number" min="0" step="0.01" placeholder="Base price" required style={field} />
          <input name="stock" type="number" min="0" step="1" placeholder="Stock" required style={field} />
          <button disabled={busy} style={button}>Create product</button>
        </form>
        <form style={panel} onSubmit={(e) => submitJson(e, "/api/brands", (d) => ({ id: d.get("id"), name: d.get("name"), slug: d.get("slug"), description: d.get("description") }), "Brand created.")}>
          <h2 style={{ fontWeight: 750 }}>Create brand</h2>
          <input name="id" placeholder="Brand ID" required style={field} />
          <input name="name" placeholder="Brand name" required style={field} />
          <input name="slug" placeholder="Slug" required style={field} />
          <textarea name="description" placeholder="Description (optional)" style={field} />
          <button disabled={busy} style={button}>Create brand</button>
        </form>
        <form style={panel} onSubmit={(e) => submitJson(e, "/api/sellers", (d) => ({ id: d.get("id"), name: d.get("name"), slug: d.get("slug") }), "Seller created.")}>
          <h2 style={{ fontWeight: 750 }}>Create seller</h2>
          <input name="id" placeholder="Seller ID" required style={field} />
          <input name="name" placeholder="Seller name" required style={field} />
          <input name="slug" placeholder="Slug" required style={field} />
          <button disabled={busy} style={button}>Create seller</button>
        </form>
        <form style={panel} onSubmit={(e) => submitJson(e, "/api/products/" + String(new FormData(e.currentTarget).get("productId")) + "/variants", (d) => ({ id: d.get("id"), variantKey: d.get("variantKey"), sku: d.get("sku"), attributes: { option: d.get("attributeValue") } }), "Variant created.")}>
          <h2 style={{ fontWeight: 750 }}>Create product variant</h2>
          <input name="productId" placeholder="Product ID" required style={field} />
          <input name="id" placeholder="Variant ID" required style={field} />
          <input name="variantKey" placeholder="Variant key (e.g. colour)" required style={field} />
          <input name="sku" placeholder="SKU (optional)" style={field} />
          <input name="attributeValue" placeholder="Attribute value" required style={field} />
          <button disabled={busy} style={button}>Create variant</button>
        </form>
        <form style={panel} onSubmit={(e) => submitJson(e, "/api/offers", (d) => {
          const stock = Number(d.get("stockQuantity"));
          return { id: d.get("id"), productId: d.get("productId"), sellerId: d.get("sellerId"), currency: d.get("currency"), price: Number(d.get("price")), stockQuantity: stock, availability: stock > 0 ? "available" : "unavailable", changeReason: "admin_catalogue_entry" };
        }, "Offer created.")}>
          <h2 style={{ fontWeight: 750 }}>Create seller offer</h2>
          <input name="id" placeholder="Offer ID" required style={field} />
          <input name="productId" placeholder="Product ID" required style={field} />
          <input name="sellerId" placeholder="Seller ID" required style={field} />
          <input name="currency" defaultValue="INR" maxLength={3} required style={field} />
          <input name="price" type="number" min="0" step="0.01" placeholder="Offer price" required style={field} />
          <input name="stockQuantity" type="number" min="0" step="1" defaultValue="1" required style={field} />
          <button disabled={busy} style={button}>Create offer</button>
        </form>
      </div>
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 800 }}>Catalogue and seller data</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem", marginTop: "0.8rem" }}>
          <div style={panel}><h3>Products ({products.length})</h3>{products.slice(0,12).map((p) => <p key={p.id}>{p.name} <small>· {p.id} · v{p.version}</small></p>)}</div>
          <div style={panel}><h3>Sellers ({sellers.length})</h3>{sellers.map((s) => <p key={s.id}>{s.name} <small>· {s.id}</small></p>)}</div>
          <div style={panel}><h3>Offers ({offers.length})</h3>{offers.slice(0,15).map((o) => <p key={o.id}>{o.currency} {o.price.toFixed(2)} <small>· {o.productId} · {o.sellerId}</small></p>)}</div>
        </div>
      </section>
      <section style={{ ...panel, marginTop: "1rem" }}>
        <h2 style={{ fontWeight: 750 }}>Price history</h2>
        <form onSubmit={loadHistory} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <input value={historyProductId} onChange={(e) => setHistoryProductId(e.target.value)} placeholder="Product ID" required style={{ ...field, maxWidth: 320 }} />
          <button style={button}>Load history</button>
        </form>
        {history.map((item) => <p key={item.id}>{new Date(item.recordedAt).toLocaleString()} · {item.currency} {item.price.toFixed(2)} · offer v{item.offerVersion} · {item.sellerId}</p>)}
      </section>
    </main>
  );
}
