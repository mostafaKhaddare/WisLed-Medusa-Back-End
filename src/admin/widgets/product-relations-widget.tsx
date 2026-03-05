/**
 * Product Relations Widget
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds a widget to the product detail page in Medusa Admin that lets editors
 * manage two metadata fields:
 *
 *  • included_products  – items physically bundled/included with this product
 *  • related_products   – curated companion / compatible products
 *
 * The values are stored as comma-separated Product-ID strings in the product's
 * metadata object, e.g.:
 *   metadata.included_products = "prod_01J...,prod_01K..."
 *   metadata.related_products  = "prod_01L...,prod_01M..."
 *
 * Usage in the dashboard:
 *   1. Open any product in Medusa Admin → scroll to the bottom.
 *   2. You will see the "Product Relations" card.
 *   3. Use the search boxes to find products and click "Add" to attach them.
 *   4. Click the ✕ on any chip to remove a product.
 *   5. Press "Save Changes" – this calls PATCH /admin/products/:id with the
 *      updated metadata object.
 */

import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sdk } from "../lib/sdk";

// ── Types ──────────────────────────────────────────────────────────────────────

type AdminProductSummary = {
    id: string;
    title: string;
    thumbnail: string | null;
    handle: string | null;
};

type ProductListResponse = {
    products: AdminProductSummary[];
    count: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIds(raw: unknown): string[] {
    if (typeof raw === "string") {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
        return (raw as string[]).map((s) => String(s).trim()).filter(Boolean);
    }
    return [];
}

function idsToString(ids: string[]): string {
    return ids.join(",");
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A small chip representing a selected product */
function ProductChip({
    product,
    onRemove,
}: {
    product: AdminProductSummary;
    onRemove: () => void;
}) {
    return (
        <div style={chipStyle}>
            {product.thumbnail ? (
                <img
                    src={product.thumbnail}
                    alt={product.title}
                    style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                />
            ) : (
                <div style={placeholderThumb} />
            )}
            <span style={{ fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {product.title}
            </span>
            <button onClick={onRemove} style={removeBtn} title="Remove">
                ✕
            </button>
        </div>
    );
}

/** A search-enabled product picker for a single relation group */
function ProductPicker({
    label,
    description,
    selectedIds,
    onAdd,
    onRemove,
    currentProductId,
    allProducts,
}: {
    label: string;
    description: string;
    selectedIds: string[];
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    currentProductId: string;
    allProducts: AdminProductSummary[];
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const selectedProducts = allProducts.filter((p) => selectedIds.includes(p.id));

    const filtered = allProducts.filter(
        (p) =>
            p.id !== currentProductId &&
            !selectedIds.includes(p.id) &&
            (p.title.toLowerCase().includes(query.toLowerCase()) ||
                (p.handle || "").toLowerCase().includes(query.toLowerCase()))
    );

    return (
        <div style={{ marginBottom: 24 }}>
            {/* Header */}
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{label}</p>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{description}</p>
            </div>

            {/* Selected chips */}
            {selectedProducts.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {selectedProducts.map((p) => (
                        <ProductChip key={p.id} product={p} onRemove={() => onRemove(p.id)} />
                    ))}
                </div>
            ) : (
                <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>No products selected</p>
            )}

            {/* Search box */}
            <div ref={wrapperRef} style={{ position: "relative", maxWidth: 400 }}>
                <input
                    type="text"
                    value={query}
                    placeholder="Search products to add…"
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={inputStyle}
                />
                {open && filtered.length > 0 && (
                    <ul style={dropdownStyle}>
                        {filtered.slice(0, 10).map((p) => (
                            <li
                                key={p.id}
                                style={dropdownItemStyle}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                            >
                                {p.thumbnail ? (
                                    <img
                                        src={p.thumbnail}
                                        alt={p.title}
                                        style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                                    />
                                ) : (
                                    <div style={{ ...placeholderThumb, width: 32, height: 32 }} />
                                )}
                                <span style={{ flex: 1, fontSize: 13 }}>{p.title}</span>
                                <button
                                    onClick={() => { onAdd(p.id); setQuery(""); setOpen(false); }}
                                    style={addBtnStyle}
                                >
                                    + Add
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {open && query.length > 1 && filtered.length === 0 && (
                    <div style={{ ...dropdownStyle, padding: "12px 16px", color: "#9ca3af", fontSize: 13 }}>
                        No products found
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Widget ───────────────────────────────────────────────────────────────

const ProductRelationsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
    const queryClient = useQueryClient();

    // Fetch all products for the picker (paginated — fetches up to 200)
    const { data: productsData, isLoading: loadingProducts } = useQuery<ProductListResponse>({
        queryKey: ["admin-all-products"],
        queryFn: () =>
            sdk.client.fetch<ProductListResponse>("/admin/products?limit=200&fields=id,title,thumbnail,handle"),
        staleTime: 60_000,
    });

    const allProducts: AdminProductSummary[] = productsData?.products ?? [];

    // Local state — initialised from product metadata
    const [includedIds, setIncludedIds] = useState<string[]>(() =>
        parseIds(product.metadata?.included_products)
    );
    const [relatedIds, setRelatedIds] = useState<string[]>(() =>
        parseIds(product.metadata?.related_products)
    );

    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    // PATCH mutation
    const { mutate: saveRelations } = useMutation({
        mutationFn: () =>
            sdk.client.fetch(`/admin/products/${product.id}`, {
                method: "POST",
                body: {
                    metadata: {
                        ...((product.metadata as Record<string, unknown>) ?? {}),
                        included_products: idsToString(includedIds),
                        related_products: idsToString(relatedIds),
                    },
                },
            }),
        onMutate: () => setSaveStatus("saving"),
        onSuccess: () => {
            setSaveStatus("saved");
            queryClient.invalidateQueries({ queryKey: ["products", product.id] });
            setTimeout(() => setSaveStatus("idle"), 2500);
        },
        onError: () => {
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 3000);
        },
    });

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div style={cardStyle}>
            {/* Card header */}
            <div style={cardHeaderStyle}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Product Relations</h2>
                    <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                        Manage products displayed in the "Included" and "Related" carousels on the storefront.
                    </p>
                </div>
                <button
                    onClick={() => saveRelations()}
                    disabled={saveStatus === "saving"}
                    style={{
                        ...saveBtnStyle,
                        background: saveStatus === "saved"
                            ? "#16a34a"
                            : saveStatus === "error"
                                ? "#dc2626"
                                : "#111827",
                        opacity: saveStatus === "saving" ? 0.6 : 1,
                        cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
                    }}
                >
                    {saveStatus === "saving"
                        ? "Saving…"
                        : saveStatus === "saved"
                            ? "✓ Saved"
                            : saveStatus === "error"
                                ? "Error – retry"
                                : "Save Changes"}
                </button>
            </div>

            <div style={dividerStyle} />

            {loadingProducts ? (
                <p style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>Loading products…</p>
            ) : (
                <>
                    {/* ── Included Products ─────────────────────────────────────── */}
                    <ProductPicker
                        label="📦 Included Products"
                        description='Items physically bundled with this product. Stored as metadata key "included_products".'
                        selectedIds={includedIds}
                        onAdd={(id) => setIncludedIds((prev) => [...prev, id])}
                        onRemove={(id) => setIncludedIds((prev) => prev.filter((x) => x !== id))}
                        currentProductId={product.id}
                        allProducts={allProducts}
                    />

                    <div style={dividerStyle} />

                    {/* ── Related Products ──────────────────────────────────────── */}
                    <ProductPicker
                        label="🔗 Related Products"
                        description='Curated compatible / companion products. Stored as metadata key "related_products". Falls back to same-collection products on the storefront if left empty.'
                        selectedIds={relatedIds}
                        onAdd={(id) => setRelatedIds((prev) => [...prev, id])}
                        onRemove={(id) => setRelatedIds((prev) => prev.filter((x) => x !== id))}
                        currentProductId={product.id}
                        allProducts={allProducts}
                    />
                </>
            )}

            {/* Metadata preview (for reference) */}
            <div style={dividerStyle} />
            <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#9ca3af", userSelect: "none" }}>
                    Raw metadata preview
                </summary>
                <pre style={preStyle}>
                    {JSON.stringify(
                        {
                            included_products: idsToString(includedIds) || "(empty)",
                            related_products: idsToString(relatedIds) || "(empty)",
                        },
                        null,
                        2
                    )}
                </pre>
            </details>
        </div>
    );
};

// ── Widget registration ───────────────────────────────────────────────────────

export const config = defineWidgetConfig({
    zone: "product.details.after",
});

export default ProductRelationsWidget;

// ── Inline styles (avoids any Tailwind / CSS-module dependency) ───────────────

const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "24px 28px",
    marginTop: 16,
};

const cardHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
};

const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "#f3f4f6",
    margin: "16px 0",
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
};

const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
    zIndex: 99,
    listStyle: "none",
    margin: 0,
    padding: "4px 0",
    maxHeight: 280,
    overflowY: "auto",
};

const dropdownItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    cursor: "pointer",
    transition: "background 0.12s",
};

const addBtnStyle: React.CSSProperties = {
    padding: "4px 10px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
};

const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    maxWidth: 220,
};

const removeBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
};

const saveBtnStyle: React.CSSProperties = {
    padding: "8px 20px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    transition: "background 0.2s",
    flexShrink: 0,
};

const placeholderThumb: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 4,
    background: "#e5e7eb",
    flexShrink: 0,
};

const preStyle: React.CSSProperties = {
    marginTop: 8,
    padding: "10px 14px",
    background: "#f9fafb",
    borderRadius: 8,
    fontSize: 12,
    color: "#374151",
    overflowX: "auto",
};
