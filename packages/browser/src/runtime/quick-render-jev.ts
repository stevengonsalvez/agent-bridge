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
    return process.env.VERCEL_AI_GATEWAY_KEY || process.env.TYPESAFE_API_KEY || '';
  }
  return '';
};

const DEFAULT_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model';
const DEFAULT_MODEL = 'typesafe-ai/jev';

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

// Font family keywords
const POPULAR_FONTS = new Set([
  'poppins', 'inter', 'roboto', 'helvetica', 'arial', 'system-ui', 'sans-serif',
  'serif', 'monospace', 'times new roman', 'georgia', 'open sans', 'lato',
  'montserrat', 'segoe ui', 'menlo', 'consolas'
]);

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

  // Named colors
  const words = lower.split(/[^a-z0-9_-]+/);
  for (const word of words) {
    if (CSS_COLOR_NAMES.has(word) && !colors.includes(word)) {
      colors.push(word);
    }
  }

  // 2. Dimension / length candidates
  const dimensions: string[] = [];
  const dimMatches = text.match(/\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|pt)\b/gi) || [];
  dimensions.push(...dimMatches);

  // Bare numbers followed by common dimension indicators
  const bareNumMatches = text.match(/(?:radius|size|width|height|padding|margin)\s*(?:to|of|is|:)?\s*(\d+)\b/gi);
  if (bareNumMatches) {
    for (const m of bareNumMatches) {
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
  const cssKeywords = ['bold', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize', 'hidden', 'none', 'block', 'flex', 'grid', 'inline-block'];
  for (const kw of cssKeywords) {
    if (words.includes(kw)) {
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
 * Step 3: Call Jev via Vercel AI Gateway
 */
async function callVercelAiGateway(
  prompt: string,
  element: ElementContext,
  questions: Record<string, any>,
  options: QuickRenderJevOptions
): Promise<{ answers: Record<string, any>; model: string }> {
  const apiKey = resolveGatewayKey(options.gatewayKey);
  if (!apiKey) {
    throw new Error('No Gateway API key configured');
  }
  const endpoint = options.gatewayUrl || DEFAULT_GATEWAY_URL;
  const model = options.model || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 3000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'ai-model-id': model,
        'ai-evaluation-model-specification-version': '4',
        'ai-gateway-protocol-version': '0.0.1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: {
          prompt,
          target_element: {
            selector: element.selector,
            tagName: element.tagName,
            textContent: element.textContent?.slice(0, 100),
          },
        },
        questions,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      answers: data.answers || {},
      model: data.model || model,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Step 4: Fallback heuristic slot filler when Gateway is unverified or offline
 * Ensures zero failure rate and <50ms instant injection
 */
export function heuristicResolve(
  prompt: string,
  candidates: ReturnType<typeof extractCandidates>
): Record<string, string> {
  const lower = prompt.toLowerCase();
  const declarations: Record<string, string> = {};

  // Check hide
  if (/\b(hide|remove|invisible|display\s*none)\b/.test(lower)) {
    declarations['display'] = 'none';
  }

  // Match colors to roles
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
    } else if (candidates.colors.length === 1 && !declarations['background-color']) {
      // Default single color to background for buttons/containers, text for headings
      declarations['background-color'] = color;
    }
  }

  // Match dimensions to roles
  for (const dim of candidates.dimensions) {
    const escaped = dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const radiusPattern = new RegExp(`(?:border[- ]radius|rounded|radius|corners?)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:border[- ]radius|radius|rounded)`, 'i');
    const sizePattern = new RegExp(`(?:font[- ]size|text[- ]size|size)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:font[- ]size|size)`, 'i');
    const paddingPattern = new RegExp(`(?:padding)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:padding)`, 'i');
    const marginPattern = new RegExp(`(?:margin)\\s*(?:to|of|is|:)?\\s*${escaped}|${escaped}\\s*(?:margin)`, 'i');

    if (radiusPattern.test(lower) || lower.includes('radius') || lower.includes('rounded')) {
      declarations['border-radius'] = dim;
    } else if (sizePattern.test(lower) || lower.includes('font-size')) {
      declarations['font-size'] = dim;
    } else if (paddingPattern.test(lower)) {
      declarations['padding'] = dim;
    } else if (marginPattern.test(lower)) {
      declarations['margin'] = dim;
    }
  }

  // Fonts
  for (const font of candidates.fonts) {
    if (lower.includes(font)) {
      const family = font === 'poppins' ? `'Poppins', sans-serif`
        : font === 'inter' ? `'Inter', sans-serif`
        : font === 'roboto' ? `'Roboto', sans-serif`
        : font;
      declarations['font-family'] = family;
    }
  }

  // Keywords
  if (candidates.keywords.includes('bold')) declarations['font-weight'] = 'bold';
  if (candidates.keywords.includes('italic')) declarations['font-style'] = 'italic';
  if (candidates.keywords.includes('uppercase')) declarations['text-transform'] = 'uppercase';
  if (candidates.keywords.includes('lowercase')) declarations['text-transform'] = 'lowercase';

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
    declarations = heuristicResolve(trimmed, candidates);
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
