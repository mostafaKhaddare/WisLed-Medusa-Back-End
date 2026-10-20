import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Textarea, Button, toast } from "@medusajs/ui";
import { useState } from "react";
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { sdk } from "../lib/sdk";

const KEY_MAP: Record<string, string> = {
  // common
  marque: "brand",
  brand: "brand",
  couleur: "color",
  color: "color",
  "couleur de lumière": "light_color",
  "light color": "light_color",
  "température de couleur": "color_temperature",
  "couleur de lumiere": "light_color",
  "color temperature": "color_temperature",
  kelvin: "color_temperature",
  puissance: "wattage",
  wattage: "wattage",
  "puissance (w/m)": "wattage_per_metre",
  "w/m": "wattage_per_metre",
  "wattage/m": "wattage_per_metre",
  "wattage per metre": "wattage_per_metre",
  tension: "voltage",
  voltage: "voltage",
  "tension d'entrée": "input_voltage",
  "input voltage": "input_voltage",
  "tension de sortie": "output_voltage",
  "output voltage": "output_voltage",
  longueur: "length",
  length: "length",
  "longueur de rouleau": "roll_length",
  roll: "roll_length",
  largeur: "width",
  width: "width",
  hauteur: "height",
  height: "height",
  ip: "ip_rating",
  "indice de protection": "ip_rating",
  "ip rating": "ip_rating",
  "type de led": "led_type",
  led: "led_type",
  "technologie led": "led_technology",
  technologie: "technology",
  "densité led": "led_density",
  "densite led": "led_density",
  "densité": "density",
  density: "density",
  "largeur de ruban": "strip_width",
  "type de profilé": "profile_type",
  profile: "profile",
  "type d'installation": "installation_type",
  installation: "installation_type",
  fixation: "mounting_type",
  matériau: "material",
  materiau: "material",
  finition: "finish",
  diffuseur: "diffuser_type",
  "type de diffuseur": "diffuser_type",
  "puissance de sortie": "output_wattage",
  "courant de sortie": "output_current",
  courant: "current",
  dimmable: "dimmable",
  gradation: "dimming",
  protocole: "control_protocol",
  "protocole de contrôle": "control_protocol",
  protocol: "protocol",
  compatibilité: "compatibility",
  compatibility: "compatibility",
  canaux: "channels",
  "nombre de canaux": "channels",
  connectivité: "connectivity",
  "télécommande": "remote_control_type",
};

function normalizeKey(raw: string): string {
  const k = raw.toLowerCase().trim();
  if (KEY_MAP[k]) return KEY_MAP[k];
  // try without accents crudely
  const cleaned = k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (KEY_MAP[cleaned]) return KEY_MAP[cleaned];
  // also try direct if it matches known
  return cleaned.replace(/\//g, "_").replace(/\s+/g, "_");
}

function parseSpecs(text: string): Record<string, string> {
  const res: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    // skip headers
    if (line.match(/^(caracteristiques|spécifications|specifications|détails|description)$/i)) continue;
    // split by : or tab or |
    let sep = ":";
    if (line.includes("\t")) sep = "\t";
    else if (line.includes("|")) sep = "|";
    const parts = line.split(sep);
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join(sep).trim().replace(/\|/g, "").trim();
      if (!key || !val) continue;
      const nk = normalizeKey(key);
      if (nk && val) {
        res[nk] = val;
      }
    } else {
      // maybe "Tension 24V" - try to extract
    }
  }
  return res;
}

const ProductSpecsPasteWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    try {
      setLoading(true);
      const parsed = parseSpecs(text);
      if (Object.keys(parsed).length === 0) {
        toast.error("Aucune spécification détectée. Utilisez 'Clé: Valeur' par ligne.");
        return;
      }
      const existing = (product.metadata ?? {}) as Record<string, any>;
      const merged = { ...existing, ...parsed };
      await sdk.admin.product.update(product.id, { metadata: merged });
      toast.success(`Spécifications ajoutées: ${Object.keys(parsed).length} champ(s)`);
      setText("");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Coller les spécifications</Heading>
      </div>
      <div className="px-6 py-4 flex flex-col gap-3">
        <Text size="small" className="text-ui-fg-subtle">
          Copiez-collez directement depuis un tableau (Excel/Google) ou texte. Ex: "Tension: 24V" ou "Tension\t24V"
        </Text>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Tension: 24V\nPuissance (W/m): 14.4 W/m\nIP: IP65\nTempérature de couleur: 4000K\nType de LED: SMD2835"}
          rows={10}
        />
        <div className="flex justify-end">
          <Button onClick={handleApply} isLoading={loading} disabled={!text.trim()}>
            Appliquer aux métadonnées
          </Button>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: ["product.details.after"],
});

export default ProductSpecsPasteWidget;
