/**
 * TypeSafe AI / Jev Instant CSS Resolver for Agent Bridge Design Mode
 * 
 * Uses Jev (System One decision model) via Vercel AI Gateway to resolve natural
 * language design prompts into deterministic, typed CSS declarations in <300ms.
 * Code owns the workflow; Jev evaluates candidate assignments and semantic roles.
 */

export interface ElementContext {
  selector: string;
  tagName: string;
  textContent?: string;
  currentStyles?: Record<string, string>;
}

export interface QuickRenderJevOptions {
  gatewayKey?: string;
  gatewayUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface QuickRenderResult {
  css: string;
  declarations: Record<string, string>;
  source: 'jev' | 'fallback';
  model?: string;
  latencyMs: number;
  error?: string;
}

const resolveGatewayKey = (optionsKey?: string): string => {
  if (optionsKey) return optionsKey;
  if (typeof globalThis !== 'undefined') {
    const globalKey = (globalThis as any).__agentBridgeGatewayKey;
    if (globalKey) return globalKey;
    try {
      const stored = (globalThis as any).localStorage?.getItem('__agent_bridge_gateway_key__');
      if (stored) return stored;
    } catch {}
  }
  if (typeof process !== 'undefined' && process?.env) {
    return process.env.TYPESAFE_API_KEY || process.env.VERCEL_AI_GATEWAY_KEY || '';
  }
  return '';
};

const DEFAULT_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model';
const DEFAULT_TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const LOCAL_TYPESAFE_URL = '/api/typesafe/v1/systemone';
const DEFAULT_MODEL = 'typesafe-ai/jev';
const DEFAULT_TYPESAFE_MODEL = 'jev-latest';

// Standard CSS color names recognized in web design
const CSS_COLOR_NAMES = new Set([
  'black', 'silver', 'gray', 'grey', 'white', 'maroon', 'red', 'purple', 'fuchsia', 'magenta',
  'green', 'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua', 'cyan',
  'orange', 'aliceblue', 'antiquewhite', 'aquamarine', 'azure', 'beige', 'bisque',
  'blanchedalmond', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet',
  'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki',
  'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'limegreen', 'linen', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'oldlace', 'olivedrab', 'orangered',
  'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip',
  'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'rosybrown', 'royalblue',
  'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'skyblue',
  'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan',
  'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellowgreen',
  'transparent'
]);

const TAILWIND_COLORS: Record<string, string> = {
  slate: '#64748b',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
};

const MULTI_WORD_COLORS: Record<string, string> = {
  'royal blue': '#4169e1',
  'sky blue': '#87ceeb',
  'navy blue': '#000080',
  'midnight blue': '#191970',
  'dark blue': '#00008b',
  'light blue': '#add8e6',
  'deep sky blue': '#00bfff',
  'hot pink': '#ff69b4',
  'deep pink': '#ff1493',
  'light pink': '#ffb6c1',
  'forest green': '#228b22',
  'dark green': '#006400',
  'light green': '#90ee90',
  'sea green': '#2e8b57',
  'dark red': '#8b0000',
  'dark gray': '#a9a9a9',
  'dark grey': '#a9a9a9',
  'light gray': '#d3d3d3',
  'light grey': '#d3d3d3',
  'slate gray': '#708090',
  'slate grey': '#708090',
};

// Font family keywords
const POPULAR_FONTS = new Set([
  'poppins', 'inter', 'roboto', 'helvetica', 'arial', 'system-ui', 'sans-serif',
  'serif', 'monospace', 'times new roman', 'georgia', 'open sans', 'lato',
  'montserrat', 'segoe ui', 'menlo', 'consolas'
]);

function getContrastTextColor(color: string): string {
  const c = color.toLowerCase();
  if (['white', '#fff', '#ffffff', 'yellow', '#ffff00', 'lime', 'lightyellow', 'linen', 'ivory', 'snow'].includes(c)) {
    return '#0f172a';
  }
  return '#ffffff';
}

/**
 * Step 1: Code-side candidate value extraction (Recall-tuned regexes)
 */
export function extractCandidates(text: string): {
  colors: string[];
  dimensions: string[];
  fonts: string[];
  keywords: string[];
} {
  const lower = text.toLowerCase();

  // 1. Color candidates
  const colors: string[] = [];
  // Hex colors
  const hexMatches = text.match(/#(?:[0-9a-fA-F]{3,4}){1,2}\b/g) || [];
  colors.push(...hexMatches);

  // rgb/rgba/hsl/oklch
  const funcColors = text.match(/(?:rgb|rgba|hsl|hsla|oklch)\([^)]+\)/gi) || [];
  colors.push(...funcColors);

  // Multi-word colors
  for (const mw of Object.keys(MULTI_WORD_COLORS)) {
    if (lower.includes(mw) && !colors.includes(MULTI_WORD_COLORS[mw])) {
      colors.push(MULTI_WORD_COLORS[mw]);
    }
  }

  // Single word colors & Tailwind
  const words = lower.split(/[^a-z0-9_#-]+/);
  for (const word of words) {
    if (TAILWIND_COLORS[word] && !colors.includes(TAILWIND_COLORS[word])) {
      colors.push(TAILWIND_COLORS[word]);
    } else if (CSS_COLOR_NAMES.has(word) && !colors.includes(word)) {
      colors.push(word);
    }
  }

  // 2. Dimension / length candidates
  const dimensions: string[] = [];
  const dimMatches = text.match(/\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|pt)\b/gi) || [];
  dimensions.push(...dimMatches);

  // Bare numbers followed by common dimension indicators
  const bareNumMatches = text.match(/(?:radius|rounded|size|width|height|padding|margin|gap)\s*(?:to|of|is|:)?\s*(\d+)\b/gi);
  if (bareNumMatches) {
    for (const m of bareNumMatches) {
      const numOnly = m.match(/\d+/)?.[0];
      if (numOnly && !dimensions.includes(`${numOnly}px`)) {
        dimensions.push(`${numOnly}px`);
      }
    }
  }

  // Numbers preceding dimension indicators
  const numPrecedingMatches = text.match(/\b(\d+)\s*(?:radius|rounded|padding|margin|gap)\b/gi);
  if (numPrecedingMatches) {
    for (const m of numPrecedingMatches) {
      const numOnly = m.match(/\d+/)?.[0];
      if (numOnly && !dimensions.includes(`${numOnly}px`)) {
        dimensions.push(`${numOnly}px`);
      }
    }
  }

  // 3. Font family candidates
  const fonts: string[] = [];
  for (const font of POPULAR_FONTS) {
    if (lower.includes(font) && !fonts.includes(font)) {
      fonts.push(font);
    }
  }

  // 4. Special CSS keywords
  const keywords: string[] = [];
  const cssKeywords = [
    'bold', 'bolder', 'semibold', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize',
    'hidden', 'none', 'block', 'flex', 'grid', 'inline-block',
    'pointer', 'shadow', 'glow', 'rounded', 'round', 'pill', 'circle', 'sharp',
    'primary', 'secondary', 'danger', 'warning', 'success', 'accent',
    'dark', 'light', 'ghost', 'outline', 'glass', 'gradient', 'center', 'transparent',
    'bigger', 'larger', 'huge', 'smaller', 'compact', 'tiny'
  ];
  for (const kw of cssKeywords) {
    if (lower.includes(kw) && !keywords.includes(kw)) {
      keywords.push(kw);
    }
  }

  return { colors, dimensions, fonts, keywords };
}

/**
 * Step 2: Build TypeSafe Jev System One questions for candidate slots
 */
export function buildJevQuestions(
  _prompt: string,
  candidates: ReturnType<typeof extractCandidates>
): Record<string, any> {
  const questions: Record<string, any> = {};

  if (candidates.colors.length > 0) {
    const colorOptions: Record<string, string> = {};
    for (const c of candidates.colors) {
      colorOptions[c] = `Color candidate "${c}"`;
    }
    colorOptions['none'] = 'No color specified for this property';

    // Choice for background-color
    questions['background_color'] = {
      type: 'choice',
      instructions: 'Which candidate color should be used as the background color (or none)?',
      criteria: colorOptions,
    };

    // Choice for text color
    questions['text_color'] = {
      type: 'choice',
      instructions: 'Which candidate color should be used as the text/font color (or none)?',
      criteria: colorOptions,
    };

    // Choice for border color
    questions['border_color'] = {
      type: 'choice',
      instructions: 'Which candidate color should be used as the border color (or none)?',
      criteria: colorOptions,
    };
  }

  if (candidates.dimensions.length > 0) {
    const dimOptions: Record<string, string> = {};
    for (const d of candidates.dimensions) {
      dimOptions[d] = `Dimension candidate "${d}"`;
    }
    dimOptions['none'] = 'No dimension specified for this property';

    // Choice for border-radius
    questions['border_radius'] = {
      type: 'choice',
      instructions: 'Which candidate dimension is the requested border radius / corner roundness (or none)?',
      criteria: dimOptions,
    };

    // Choice for font-size
    questions['font_size'] = {
      type: 'choice',
      instructions: 'Which candidate dimension is the requested font size / text size (or none)?',
      criteria: dimOptions,
    };

    // Choice for padding
    questions['padding'] = {
      type: 'choice',
      instructions: 'Which candidate dimension is the requested internal padding (or none)?',
      criteria: dimOptions,
    };

    // Choice for margin
    questions['margin'] = {
      type: 'choice',
      instructions: 'Which candidate dimension is the requested external margin (or none)?',
      criteria: dimOptions,
    };
  }

  if (candidates.fonts.length > 0) {
    const fontOptions: Record<string, string> = {};
    for (const f of candidates.fonts) {
      fontOptions[f] = `Font family "${f}"`;
    }
    fontOptions['none'] = 'No font family change requested';

    questions['font_family'] = {
      type: 'choice',
      instructions: 'Which font family did the user request to apply (or none)?',
      criteria: fontOptions,
    };
  }

  // General presence checks (Nouls)
  questions['hide_element'] = {
    type: 'noul',
    instructions: 'Does the user request to hide, remove, or make invisible this element?',
  };

  return questions;
}

/**
 * Step 3: Call Jev via direct TypeSafe API or Vercel AI Gateway
 */
async function callJevApi(
  prompt: string,
  element: ElementContext,
  questions: Record<string, any>,
  options: QuickRenderJevOptions
): Promise<{ answers: Record<string, any>; model: string }> {
  const apiKey = resolveGatewayKey(options.gatewayKey);
  if (!apiKey) {
    throw new Error('No Gateway API key configured');
  }

  const isTypeSafeDirect =
    apiKey.startsWith('apikey_') ||
    options.gatewayUrl?.includes('typesafe.ai') ||
    (!apiKey.startsWith('vck_') && !options.gatewayUrl?.includes('vercel'));

  const model = options.model || (isTypeSafeDirect ? DEFAULT_TYPESAFE_MODEL : DEFAULT_MODEL);
  const endpoints = options.gatewayUrl
    ? [options.gatewayUrl]
    : isTypeSafeDirect
    ? (typeof window !== 'undefined' ? [LOCAL_TYPESAFE_URL, DEFAULT_TYPESAFE_URL] : [DEFAULT_TYPESAFE_URL])
    : [DEFAULT_GATEWAY_URL];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 3000);

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let bodyJson: string;
    if (isTypeSafeDirect) {
      bodyJson = JSON.stringify({
        model,
        state: {
          prompt,
          target_element: {
            selector: element.selector,
            tagName: element.tagName,
            textContent: element.textContent?.slice(0, 100),
          },
        },
        questions,
      });
    } else {
      headers['ai-model-id'] = model;
      headers['ai-evaluation-model-specification-version'] = '4';
      headers['ai-gateway-protocol-version'] = '0.0.1';
      bodyJson = JSON.stringify({
        state: {
          prompt,
          target_element: {
            selector: element.selector,
            tagName: element.tagName,
            textContent: element.textContent?.slice(0, 100),
          },
        },
        questions,
      });
    }

    let lastError: Error | null = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: bodyJson,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Jev API (${isTypeSafeDirect ? 'TypeSafe' : 'Vercel'}) returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        clearTimeout(timeoutId);
        return {
          answers: data.answers || {},
          model: data.model || model,
        };
      } catch (err: any) {
        lastError = err;
      }
    }

    clearTimeout(timeoutId);
    throw lastError || new Error('All Jev API endpoints failed');
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

const callVercelAiGateway = callJevApi;

/**
 * Step 4: Fallback heuristic slot filler when Gateway is unverified or offline
 * Ensures zero failure rate and <50ms instant injection
 */
export function heuristicResolve(
  prompt: string,
  candidates: ReturnType<typeof extractCandidates>,
  element?: ElementContext
): Record<string, string> {
  const lower = prompt.toLowerCase();
  const declarations: Record<string, string> = {};

  // 1. Direct CSS properties if formatted as "prop: value"
  const rawDeclMatches = prompt.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);?/g);
  for (const match of rawDeclMatches) {
    const prop = match[1].toLowerCase().trim();
    const val = match[2].trim();
    const validProps = [
      'background', 'background-color', 'color', 'border', 'border-radius', 'border-color',
      'border-width', 'border-style', 'padding', 'margin', 'font-size', 'font-family',
      'font-weight', 'font-style', 'line-height', 'letter-spacing', 'box-shadow', 'display',
      'opacity', 'cursor', 'width', 'height', 'text-align', 'text-transform', 'text-decoration',
      'gap', 'flex', 'grid'
    ];
    if (validProps.includes(prop)) {
      declarations[prop] = val;
    }
  }

  // 2. Hide / Remove
  if (/\b(hide|remove|invisible|display\s*none)\b/.test(lower)) {
    declarations['display'] = 'none';
  }

  // 3. Gradients
  if (/\bgradient\b/.test(lower)) {
    if (/\b(purple|pink|violet)\b/.test(lower)) {
      declarations['background'] = 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)';
    } else if (/\b(blue|cyan)\b/.test(lower)) {
      declarations['background'] = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
    } else if (/\b(green|emerald)\b/.test(lower)) {
      declarations['background'] = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else if (/\b(orange|sunset|red)\b/.test(lower)) {
      declarations['background'] = 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)';
    } else {
      declarations['background'] = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
    }
    declarations['color'] = '#ffffff';
    declarations['border'] = 'none';
  }

  // 4. Semantic Presets
  if (/\bprimary\b/.test(lower)) {
    declarations['background-color'] = '#2563eb';
    declarations['color'] = '#ffffff';
    declarations['border'] = 'none';
  } else if (/\bsecondary\b/.test(lower)) {
    declarations['background-color'] = '#475569';
    declarations['color'] = '#ffffff';
  } else if (/\b(danger|destructive|delete)\b/.test(lower)) {
    declarations['background-color'] = '#dc2626';
    declarations['color'] = '#ffffff';
    declarations['border'] = 'none';
  } else if (/\bwarning\b/.test(lower)) {
    declarations['background-color'] = '#d97706';
    declarations['color'] = '#ffffff';
  } else if (/\bsuccess\b/.test(lower)) {
    declarations['background-color'] = '#16a34a';
    declarations['color'] = '#ffffff';
  } else if (/\b(dark|dark mode)\b/.test(lower)) {
    declarations['background-color'] = '#0f172a';
    declarations['color'] = '#f8fafc';
    declarations['border-color'] = '#334155';
  } else if (/\b(light|light mode)\b/.test(lower)) {
    declarations['background-color'] = '#ffffff';
    declarations['color'] = '#0f172a';
    declarations['border-color'] = '#e2e8f0';
  } else if (/\bghost\b/.test(lower)) {
    declarations['background-color'] = 'transparent';
    declarations['color'] = '#4b5563';
    declarations['border'] = '1px solid transparent';
  } else if (/\b(outline|bordered)\b/.test(lower)) {
    declarations['background-color'] = 'transparent';
    declarations['border'] = '2px solid currentColor';
  } else if (/\b(glass|glassmorphism)\b/.test(lower)) {
    declarations['background'] = 'rgba(255, 255, 255, 0.25)';
    declarations['backdrop-filter'] = 'blur(12px)';
    declarations['-webkit-backdrop-filter'] = 'blur(12px)';
    declarations['border'] = '1px solid rgba(255, 255, 255, 0.3)';
  }

  // 5. Two-tone color phrases (e.g. "white on blue", "white text on blue background")
  const twoToneMatch = lower.match(/(?:([a-z]+)\s*(?:text|font)?\s*on\s*([a-z]+)|([a-z]+)\s*(?:background|bg)\s*(?:with|and)\s*([a-z]+)\s*(?:text|font))/);
  if (twoToneMatch) {
    const textColor = twoToneMatch[1] || twoToneMatch[4];
    const bgColor = twoToneMatch[2] || twoToneMatch[3];
    if (textColor && (CSS_COLOR_NAMES.has(textColor) || TAILWIND_COLORS[textColor])) {
      declarations['color'] = TAILWIND_COLORS[textColor] || textColor;
    }
    if (bgColor && (CSS_COLOR_NAMES.has(bgColor) || TAILWIND_COLORS[bgColor])) {
      declarations['background-color'] = TAILWIND_COLORS[bgColor] || bgColor;
    }
  }

  // 6. Match candidate colors to roles
  for (const color of candidates.colors) {
    const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bgPattern = new RegExp(`(?:background|bg|button)\\s*(?:color)?\\s*(?:to|is|:)?\\s*${escaped}|${escaped}\\s*(?:background|bg)`, 'i');
    const textPattern = new RegExp(`(?:text|font|foreground|label)\\s*(?:color)?\\s*(?:to|is|:)?\\s*${escaped}|${escaped}\\s*(?:text|font)`, 'i');
    const borderPattern = new RegExp(`(?:border)\\s*(?:color)?\\s*(?:to|is|:)?\\s*${escaped}|${escaped}\\s*(?:border)`, 'i');

    if (bgPattern.test(lower)) {
      declarations['background-color'] = color;
    } else if (textPattern.test(lower)) {
      declarations['color'] = color;
    } else if (borderPattern.test(lower)) {
      declarations['border-color'] = color;
    } else if (lower.includes('background') || lower.includes('bg')) {
      declarations['background-color'] = color;
    } else if (lower.includes('text') || lower.includes('font')) {
      declarations['color'] = color;
    } else if (candidates.colors.length === 1 && !declarations['background-color'] && !declarations['color']) {
      const isTextElem = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].includes(element?.tagName?.toLowerCase() || '');
      if (isTextElem) {
        declarations['color'] = color;
      } else {
        declarations['background-color'] = color;
        if (!declarations['color']) {
          declarations['color'] = getContrastTextColor(color);
        }
      }
    }
  }

  // 7. Corner Roundness
  let radiusSet = false;
  for (const dim of candidates.dimensions) {
    const escaped = dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const radiusPattern = new RegExp(`(?:border[- ]radius|rounded|radius|corners?)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:border[- ]radius|radius|rounded)`, 'i');
    if (radiusPattern.test(lower) || lower.includes('radius') || lower.includes('rounded')) {
      declarations['border-radius'] = dim;
      radiusSet = true;
      break;
    }
  }
  if (!radiusSet) {
    if (/\b(pill|circle|circular)\b/.test(lower)) {
      declarations['border-radius'] = '9999px';
    } else if (/\b(extra rounded|large radius|very rounded)\b/.test(lower)) {
      declarations['border-radius'] = '24px';
    } else if (/\b(slightly rounded|subtle round)\b/.test(lower)) {
      declarations['border-radius'] = '6px';
    } else if (/\b(rounded|round|smooth corners?)\b/.test(lower)) {
      declarations['border-radius'] = '12px';
    } else if (/\b(sharp|square|no radius|flat)\b/.test(lower)) {
      declarations['border-radius'] = '0px';
    }
  }

  // 8. Shadows & Elevation
  if (/\b(glow|neon)\b/.test(lower)) {
    declarations['box-shadow'] = '0 0 15px rgba(99, 102, 241, 0.6)';
  } else if (/\b(soft shadow|subtle shadow)\b/.test(lower)) {
    declarations['box-shadow'] = '0 2px 8px rgba(0, 0, 0, 0.08)';
  } else if (/\b(heavy shadow|deep shadow|large shadow)\b/.test(lower)) {
    declarations['box-shadow'] = '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
  } else if (/\b(no shadow|remove shadow)\b/.test(lower)) {
    declarations['box-shadow'] = 'none';
  } else if (/\b(shadow|drop shadow|box shadow|elevat(?:e|ion)|floating)\b/.test(lower)) {
    declarations['box-shadow'] = '0 4px 14px rgba(0, 0, 0, 0.15)';
  }

  // 9. Match dimensions to padding/margin/font-size
  for (const dim of candidates.dimensions) {
    const escaped = dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sizePattern = new RegExp(`(?:font[- ]size|text[- ]size|size)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:font[- ]size|size)`, 'i');
    const paddingPattern = new RegExp(`(?:padding)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:padding)`, 'i');
    const marginPattern = new RegExp(`(?:margin)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:margin)`, 'i');

    if (sizePattern.test(lower) || lower.includes('font-size')) {
      declarations['font-size'] = dim;
    } else if (paddingPattern.test(lower)) {
      declarations['padding'] = dim;
    } else if (marginPattern.test(lower)) {
      declarations['margin'] = dim;
    }
  }

  // Relative sizing
  const isButtonOrInput = ['button', 'input', 'a'].includes(element?.tagName?.toLowerCase() || '') ||
    element?.selector?.includes('btn') || element?.selector?.includes('button');
  if (/\b(huge|giant|extra large)\b/.test(lower)) {
    if (isButtonOrInput) {
      declarations['padding'] = '18px 36px';
      declarations['font-size'] = '1.25rem';
    } else {
      declarations['font-size'] = '1.5rem';
    }
  } else if (/\b(bigger|larger|expand)\b/.test(lower)) {
    if (isButtonOrInput) {
      declarations['padding'] = '14px 28px';
      declarations['font-size'] = '1.125rem';
    } else {
      declarations['font-size'] = '1.25rem';
    }
  } else if (/\b(smaller|compact|tiny)\b/.test(lower)) {
    if (isButtonOrInput) {
      declarations['padding'] = '6px 12px';
      declarations['font-size'] = '0.875rem';
    } else {
      declarations['font-size'] = '0.875rem';
    }
  } else if (/\b(more padding|more space|spacious)\b/.test(lower)) {
    declarations['padding'] = '16px 28px';
  } else if (/\b(less padding)\b/.test(lower)) {
    declarations['padding'] = '6px 12px';
  }

  // 10. Borders
  if (/\b(no border|remove border|border none)\b/.test(lower)) {
    declarations['border'] = 'none';
  } else if (/\bthick border\b/.test(lower)) {
    declarations['border'] = '3px solid currentColor';
  } else if (/\bdashed border\b/.test(lower)) {
    declarations['border'] = '2px dashed currentColor';
  } else if (/\b(add border|bordered)\b|(?<!-)\bborder\b(?![-a-z])/.test(lower) && !declarations['border'] && !declarations['border-color']) {
    declarations['border'] = '1.5px solid #cbd5e1';
  }

  // 11. Typography
  if (/\bbold(?:er)?\b/.test(lower)) declarations['font-weight'] = '700';
  if (/\bsemi-?bold\b/.test(lower)) declarations['font-weight'] = '600';
  if (/\bitalic\b/.test(lower)) declarations['font-style'] = 'italic';
  if (/\bno underline\b/.test(lower)) declarations['text-decoration'] = 'none';
  else if (/\bunderline\b/.test(lower)) declarations['text-decoration'] = 'underline';
  if (/\buppercase\b|\ball caps\b/.test(lower)) declarations['text-transform'] = 'uppercase';
  if (/\blowercase\b/.test(lower)) declarations['text-transform'] = 'lowercase';
  if (/\bcapitalize\b/.test(lower)) declarations['text-transform'] = 'capitalize';
  if (/\bcenter(?:ed)?\b/.test(lower)) declarations['text-align'] = 'center';
  if (/\balign left\b/.test(lower)) declarations['text-align'] = 'left';
  if (/\balign right\b/.test(lower)) declarations['text-align'] = 'right';
  if (/\bletter spacing|tracking\b/.test(lower)) declarations['letter-spacing'] = '0.05em';

  // 12. Fonts
  for (const font of candidates.fonts) {
    if (lower.includes(font)) {
      const family = font === 'poppins' ? `'Poppins', sans-serif`
        : font === 'inter' ? `'Inter', sans-serif`
        : font === 'roboto' ? `'Roboto', sans-serif`
        : font;
      declarations['font-family'] = family;
    }
  }

  // 13. Interactivity & Transitions
  if (/\b(cursor|pointer)\b/.test(lower)) declarations['cursor'] = 'pointer';
  if (/\b(transition|smooth)\b/.test(lower)) declarations['transition'] = 'all 0.2s ease-in-out';
  if (/\btransparent\b/.test(lower)) declarations['background-color'] = 'transparent';

  // 14. Contextual Element Redesign / Generic intent
  // Only apply when no specific style declarations were resolved yet
  if (Object.keys(declarations).length === 0) {
    const tag = (element?.tagName || '').toLowerCase();
    const isButton = isButtonOrInput || tag === 'button' || tag === 'a';
    if (isButton) {
      if (!declarations['background'] && !declarations['background-color']) {
        declarations['background'] = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
      }
      if (!declarations['color']) declarations['color'] = '#ffffff';
      if (!declarations['border-radius']) declarations['border-radius'] = '8px';
      if (!declarations['box-shadow']) declarations['box-shadow'] = '0 4px 14px rgba(79, 70, 229, 0.4)';
      if (!declarations['border']) declarations['border'] = 'none';
      if (!declarations['font-weight']) declarations['font-weight'] = '600';
      if (!declarations['cursor']) declarations['cursor'] = 'pointer';
    } else if (tag === 'input') {
      if (!declarations['border']) declarations['border'] = '2px solid #6366f1';
      if (!declarations['border-radius']) declarations['border-radius'] = '8px';
      if (!declarations['box-shadow']) declarations['box-shadow'] = '0 0 0 3px rgba(99, 102, 241, 0.2)';
    } else if (['div', 'section', 'article', 'card', 'main'].includes(tag)) {
      if (!declarations['background'] && !declarations['background-color']) declarations['background'] = '#ffffff';
      if (!declarations['border-radius']) declarations['border-radius'] = '12px';
      if (!declarations['box-shadow']) declarations['box-shadow'] = '0 10px 25px -5px rgba(0, 0, 0, 0.1)';
      if (!declarations['padding']) declarations['padding'] = '24px';
      if (!declarations['border']) declarations['border'] = '1px solid #e2e8f0';
    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'].includes(tag)) {
      if (!declarations['color']) declarations['color'] = '#4f46e5';
      if (!declarations['font-weight']) declarations['font-weight'] = '700';
      if (!declarations['letter-spacing']) declarations['letter-spacing'] = '-0.025em';
    } else {
      if (!declarations['background-color'] && !declarations['background']) declarations['background-color'] = '#6366f1';
      if (!declarations['color']) declarations['color'] = '#ffffff';
      if (!declarations['border-radius']) declarations['border-radius'] = '8px';
      if (!declarations['box-shadow']) declarations['box-shadow'] = '0 4px 12px rgba(99, 102, 241, 0.35)';
    }
  }

  return declarations;
}

/**
 * Main TypeSafe Jev Quick Render execution function
 */
export async function resolvePromptToCss(
  prompt: string,
  element: ElementContext,
  options: QuickRenderJevOptions = {}
): Promise<QuickRenderResult> {
  const startTime = Date.now();
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      css: '',
      declarations: {},
      source: 'fallback',
      latencyMs: 0,
    };
  }

  // 1. Extract candidates
  const candidates = extractCandidates(trimmed);
  const questions = buildJevQuestions(trimmed, candidates);

  let declarations: Record<string, string> = {};
  let source: 'jev' | 'fallback' = 'fallback';
  let modelName = options.model || DEFAULT_MODEL;
  let errorMessage: string | undefined;

  // 2. Try Jev via Vercel AI Gateway if questions exist
  if (Object.keys(questions).length > 0) {
    try {
      const result = await callVercelAiGateway(trimmed, element, questions, options);
      const answers = result.answers;
      modelName = result.model;

      // Translate answers into CSS declarations
      if (answers.background_color?.choice && answers.background_color.choice !== 'none') {
        declarations['background-color'] = answers.background_color.choice;
      }
      if (answers.text_color?.choice && answers.text_color.choice !== 'none') {
        declarations['color'] = answers.text_color.choice;
      }
      if (answers.border_color?.choice && answers.border_color.choice !== 'none') {
        declarations['border-color'] = answers.border_color.choice;
      }
      if (answers.border_radius?.choice && answers.border_radius.choice !== 'none') {
        declarations['border-radius'] = answers.border_radius.choice;
      }
      if (answers.font_size?.choice && answers.font_size.choice !== 'none') {
        declarations['font-size'] = answers.font_size.choice;
      }
      if (answers.padding?.choice && answers.padding.choice !== 'none') {
        declarations['padding'] = answers.padding.choice;
      }
      if (answers.margin?.choice && answers.margin.choice !== 'none') {
        declarations['margin'] = answers.margin.choice;
      }
      if (answers.font_family?.choice && answers.font_family.choice !== 'none') {
        const f = answers.font_family.choice;
        declarations['font-family'] = f === 'poppins' ? `'Poppins', sans-serif` : f;
      }
      if (answers.hide_element?.noul > 0.7) {
        declarations['display'] = 'none';
      }

      if (Object.keys(declarations).length > 0) {
        source = 'jev';
      }
    } catch (err: any) {
      errorMessage = err.message;
      // Fallback seamlessly to deterministic slot filler
    }
  }

  // 3. If Jev returned no declarations or failed (e.g. customer verification required), use heuristic resolve
  if (Object.keys(declarations).length === 0) {
    declarations = heuristicResolve(trimmed, candidates, element);
    source = 'fallback';
  }

  // 4. Format CSS rule
  const declarationStrings = Object.entries(declarations).map(([prop, val]) => `  ${prop}: ${val} !important;`);
  const css = declarationStrings.length > 0
    ? `${element.selector} {\n${declarationStrings.join('\n')}\n}`
    : '';

  const latencyMs = Date.now() - startTime;

  return {
    css,
    declarations,
    source,
    model: modelName,
    latencyMs,
    error: errorMessage,
  };
}
