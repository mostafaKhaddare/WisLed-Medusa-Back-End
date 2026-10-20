const KEY_MAP: Record<string, string> = {
  // FR
  marque: "brand",
  brand: "brand",
  couleur: "color",
  color: "color",
  "couleur de lumière": "light_color",
  "couleur de lumiere": "light_color",
  "light color": "light_color",
  "température de couleur": "color_temperature",
  "temperature de couleur": "color_temperature",
  "color temperature": "color_temperature",
  kelvin: "color_temperature",
  "type de couleur": "color_type",
  "color type": "color_type",
  monocolore: "color_type",
  monochrome: "color_type",
  rgb: "color_type",
  rgbw: "color_type",
  rgbcct: "color_type",
  cct: "color_type",
  puissance: "power",
  power: "power",
  wattage: "wattage",
  "puissance (w/m)": "power",
  "w/m": "power",
  "watt/m": "power",
  "watt par metre": "power",
  tension: "voltage",
  voltage: "voltage",
  "tension d'entrée": "input_voltage",
  "input voltage": "input_voltage",
  "tension de sortie": "output_voltage",
  "output voltage": "output_voltage",
  longueur: "length",
  length: "length",
  "longueur de rouleau": "roll_length",
  "rouleau": "roll_length",
  "roll length": "roll_length",
  largeur: "width",
  width: "width",
  hauteur: "height",
  height: "height",
  ip: "ip_rating",
  "indice de protection": "ip_rating",
  "ip rating": "ip_rating",
  "type de led": "led_type",
  led: "led_type",
  "smd 2835": "led_type",
  "smd2835": "led_type",
  "smd 3528": "led_type",
  "smd 5050": "led_type",
  cob: "led_type",
  spi: "led_type",
  "technologie": "technology",
  "led technology": "led_technology",
  "technologie led": "led_technology",
  "densité led": "led_density",
  "densite led": "led_density",
  "led/m": "led_density",
  "led par m": "led_density",
  "leds/m": "led_density",
  density: "led_density",
  "largeur de ruban": "strip_width",
  "strip width": "strip_width",
  "type de profilé": "profile_type",
  profile: "profile",
  "type d'installation": "installation_type",
  installation: "installation_type",
  fixation: "mounting_type",
  "matériau": "material",
  materiau: "material",
  finition: "finish",
  diffuseur: "diffuser_type",
  "type de diffuseur": "diffuser_type",
  "puissance de sortie": "output_wattage",
  "courant de sortie": "output_current",
  courant: "current",
  dimmable: "dimmable",
  gradation: "dimming",
  "variateur": "dimming",
  protocole: "control_protocol",
  "protocole de contrôle": "control_protocol",
  protocol: "protocol",
  compatibilité: "compatibility",
  compatibility: "compatibility",
  canaux: "channels",
  "nombre de canaux": "channels",
  connectivité: "connectivity",
  "télécommande": "remote_control_type",
  "decoupable": "cuttable",
  "découpable": "cuttable",
  "cuttable": "cuttable",
  "intervalle de coupe": "cuttable",
};

const IP_VALUES = new Set(["ip20", "ip44", "ip54", "ip55", "ip65", "ip66", "ip67", "ip68"]);

export interface SpecExtraction {
  key: string;
  value: string | null;
  confidence: "high" | "medium" | "low" | "unverified";
  reason?: string;
}

function normalizeKey(raw: string): string {
  const k = raw.toLowerCase().trim();
  if (KEY_MAP[k]) return KEY_MAP[k];
  const cleaned = k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (KEY_MAP[cleaned]) return KEY_MAP[cleaned];
  return cleaned.replace(/\//g, "_").replace(/\s+/g, "_");
}

function extractWithRegex(text: string): SpecExtraction[] {
  const results: SpecExtraction[] = [];
  const t = text;

  // LED type / technology
  const ledTypeMatches = t.match(/(SMD\s?\d{4}|COB|SPI)\b/gi);
  if (ledTypeMatches?.[0]) {
    results.push({ key: "led_type", value: ledTypeMatches[0].toUpperCase().replace(/\s+/, " "), confidence: "high" });
  }

  // LED density
  const ledDensity = t.match(/(\d+)\s*(LEDs?\/m|LED\/m|leds\/m|led\/m)/i);
  if (ledDensity) {
    results.push({ key: "led_density", value: `${ledDensity[1]} LED/m`, confidence: "high" });
  }

  // Voltage
  const voltage = t.match(/\b(12V|24V|220V|230V|5V|48V)\b/i);
  if (voltage) {
    results.push({ key: "voltage", value: voltage[0].toUpperCase(), confidence: "high" });
  }

  // IP rating - flag unrecognized
  const ip = t.match(/\bIP\s?(\d{2})\b/i);
  if (ip) {
    const ipv = `IP${ip[1]}`;
    const known = IP_VALUES.has(ipv.toLowerCase());
    results.push({
      key: "ip_rating",
      value: ipv,
      confidence: known ? "high" : "unverified",
      reason: known ? undefined : "Valeur IP peu courante pour ruban LED - à vérifier",
    });
  }

  // Power W/m
  const power = t.match(/(\d+(?:[.,]\d+)?)\s*W\/m\b/i) || t.match(/(\d+(?:[.,]\d+)?)\s*W\s*\/\s*m\b/i);
  if (power) {
    const v = power[1].replace(",", ".");
    results.push({ key: "power", value: `${v} W/m`, confidence: "high" });
  }

  // Total power
  const powerTotal = t.match(/\b(\d+(?:[.,]\d+)?)\s*W\b(?!\/m)/i);
  if (powerTotal && !power) {
    const v = powerTotal[1].replace(",", ".");
    results.push({ key: "wattage", value: `${v} W`, confidence: "medium" });
  }

  // Color temperature
  const cct = t.match(/\b(\d{3,4})\s*K\b/i);
  if (cct) {
    results.push({ key: "color_temperature", value: `${cct[1]}K`, confidence: "high" });
  }

  // Roll length
  const roll = t.match(/\b(\d+(?:[.,]\d+)?)\s*m\b(?!\/)/i);
  if (roll) {
    results.push({ key: "roll_length", value: `${roll[1].replace(",", ".")} m`, confidence: "medium" });
  }

  // Width
  const width = t.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (width) {
    results.push({ key: "width", value: `${width[1].replace(",", ".")} mm`, confidence: "high" });
  }

  // Cuttable
  if (/cuttable|découpable|decoupable/i.test(t)) {
    results.push({ key: "cuttable", value: "Oui", confidence: "low" });
  }

  // Dimmable
  if (/dimmable|graduable|variateur/i.test(t)) {
    results.push({ key: "dimmable", value: "Oui", confidence: "low" });
  }

  // Color type
  if (/\brgbw\b/i.test(t)) results.push({ key: "color_type", value: "RGBW", confidence: "high" });
  else if (/\brgbcct\b/i.test(t)) results.push({ key: "color_type", value: "RGBCCT", confidence: "high" });
  else if (/\brgb\b/i.test(t)) results.push({ key: "color_type", value: "RGB", confidence: "high" });
  else if (/\bcct\b/i.test(t)) results.push({ key: "color_type", value: "CCT", confidence: "high" });
  else if (/\bmonocolore|monochrome|single\s*color/i.test(t)) {
    results.push({ key: "color_type", value: "Monocolore", confidence: "medium" });
  }

  return results;
}

export function extractSpecsFromText(text: string): SpecExtraction[] {
  if (!text) return [];
  const extractions = extractWithRegex(text);
  const seen = new Set<string>();
  return extractions.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });
}

export function mergeSpecs(
  proposed: SpecExtraction[],
  existing: Record<string, any> = {}
): Record<string, any> {
  const merged: Record<string, any> = { ...existing };
  for (const p of proposed) {
    if (merged[p.key] !== undefined && merged[p.key] !== null) continue;
    if (merged[`spec_${p.key}`] !== undefined && merged[`spec_${p.key}`] !== null) continue;
    merged[`spec_${p.key}`] = p.value;
  }
  return merged;
}

export function extractFromProduct(product: any): SpecExtraction[] {
  const sources: string[] = [];
  if (product?.title) sources.push(product.title);
  if (product?.handle) sources.push(product.handle);
  if (product?.description) sources.push(typeof product.description === "string" ? product.description : "");
  if (product?.subtitle) sources.push(product.subtitle);

  let all = "";
  for (const s of sources) all += " " + (s || "");

  const extracted = extractSpecsFromText(all);

  // Variant-aware: check variants for CCT etc - if multiple values, mark appropriately
  const variants = product?.variants || [];
  const ccts = new Set<string>();
  for (const v of variants) {
    const opts = v?.options || [];
    for (const o of opts) {
      const val = String(o?.value || "");
      const m = val.match(/\b(\d{3,4})\s*K\b/i);
      if (m) ccts.add(`${m[1]}K`);
    }
  }
  if (ccts.size > 1) {
    // remove single CCT if we extracted, replace with note? but better not force
    const filtered = extracted.filter((e) => e.key !== "color_temperature");
    filtered.push({
      key: "color_temperature",
      value: "Selon la variante",
      confidence: "high",
    });
    return filtered;
  }

  return extracted;
}
