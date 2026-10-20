import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Button, toast, Badge, Input, Label } from "@medusajs/ui";
import { useState } from "react";
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { sdk } from "../lib/sdk";
import { extractFromProduct, mergeSpecs, SpecExtraction } from "../lib/specs-extractor";

const ProductSpecsAutoWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [proposed, setProposed] = useState<SpecExtraction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const generate = async () => {
    try {
      setLoading(true);
      const results = extractFromProduct(product);
      setProposed(results);
      const initial: Record<string, string> = {};
      for (const r of results) {
        if (r.value) initial[`spec_${r.key}`] = r.value;
      }
      setEdited(initial);
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    try {
      setSaving(true);
      const existing = (product.metadata ?? {}) as Record<string, any>;
      const merged = { ...existing, ...edited };
      // remove null/undefined if any
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(merged)) {
        if (v === null || v === undefined || v === "") continue;
        cleaned[k] = v;
      }
      await sdk.admin.product.update(product.id, { metadata: cleaned });
      toast.success("Spécifications enregistrées dans les métadonnées");
      setProposed([]);
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Générer automatiquement les spécifications</Heading>
        <Button variant="secondary" size="small" onClick={generate} isLoading={loading}>
          Générer les spécifications
        </Button>
      </div>
      {proposed.length > 0 && (
        <div className="px-6 py-4 flex flex-col gap-3">
          <Text size="small" className="text-ui-fg-subtle">
            Vérifiez et modifiez avant d'enregistrer. Les champs existants valides ne seront pas écrasés.
          </Text>
          <div className="flex flex-col gap-2">
            {proposed.map((p) => {
              const key = `spec_${p.key}`;
              return (
                <div key={p.key} className="grid grid-cols-[200px_1fr_auto] gap-2 items-center">
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">{key}</Text>
                    {p.confidence === "unverified" && (
                      <Badge color="orange" size="small">À vérifier</Badge>
                    )}
                    {p.confidence === "low" && (
                      <Badge color="grey" size="small">Faible confiance</Badge>
                    )}
                  </div>
                  <Input
                    value={edited[key] ?? p.value ?? ""}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={p.reason || ""}
                  />
                  <Text size="small" className="text-ui-fg-subtle">{p.confidence}</Text>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setProposed([])}>Annuler</Button>
            <Button onClick={apply} isLoading={saving}>Enregistrer dans les métadonnées</Button>
          </div>
        </div>
      )}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: ["product.details.after", "product.details.before"],
});

export default ProductSpecsAutoWidget;
