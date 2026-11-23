// The shown theme's colors, typed as what an element takes.

import type { Color } from "gpui-kit";
import { theme } from "herdr";

/** The theme's colors by name ("accent", "border", "ansi6", ...). */
export type Theme = Record<string, Color>;

// herdr declares the colors as plain strings; every one is a "#rrggbb" or "#rrggbbaa".
export const colors = (): Theme => theme() as Theme;
