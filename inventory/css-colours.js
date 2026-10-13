// VISUAL-DESIGN-2D.md, "Yarn colour words": the CSS named colours, as words. Aliases (aqua, fuchsia, gray) and the dark/medium/light/pale/deep shades are dropped, so a name is one plain colour.
export const CSS_COLOURS = Object.freeze([
  ['alice blue', '#f0f8ff'], ['antique white', '#faebd7'], ['aquamarine', '#7fffd4'], ['azure', '#f0ffff'],
  ['beige', '#f5f5dc'], ['bisque', '#ffe4c4'], ['black', '#000000'], ['blanched almond', '#ffebcd'],
  ['blue', '#0000ff'], ['blue violet', '#8a2be2'], ['brown', '#a52a2a'], ['burlywood', '#deb887'],
  ['cadet blue', '#5f9ea0'], ['chartreuse', '#7fff00'], ['chocolate', '#d2691e'], ['coral', '#ff7f50'],
  ['cornflower blue', '#6495ed'], ['cornsilk', '#fff8dc'], ['crimson', '#dc143c'], ['cyan', '#00ffff'],
  ['dim grey', '#696969'], ['dodger blue', '#1e90ff'], ['firebrick', '#b22222'], ['floral white', '#fffaf0'],
  ['forest green', '#228b22'], ['gainsboro', '#dcdcdc'], ['ghost white', '#f8f8ff'], ['gold', '#ffd700'],
  ['goldenrod', '#daa520'], ['grey', '#808080'], ['green', '#008000'], ['green yellow', '#adff2f'],
  ['honeydew', '#f0fff0'], ['hot pink', '#ff69b4'], ['indian red', '#cd5c5c'], ['indigo', '#4b0082'],
  ['ivory', '#fffff0'], ['khaki', '#f0e68c'], ['lavender', '#e6e6fa'], ['lavender blush', '#fff0f5'],
  ['lawn green', '#7cfc00'], ['lemon chiffon', '#fffacd'],
  ['lime', '#00ff00'], ['lime green', '#32cd32'], ['linen', '#faf0e6'],
  ['magenta', '#ff00ff'], ['maroon', '#800000'],
  ['midnight blue', '#191970'], ['mint cream', '#f5fffa'], ['misty rose', '#ffe4e1'],
  ['moccasin', '#ffe4b5'], ['navajo white', '#ffdead'], ['navy', '#000080'], ['old lace', '#fdf5e6'],
  ['olive', '#808000'], ['olive drab', '#6b8e23'], ['orange', '#ffa500'], ['orange red', '#ff4500'],
  ['orchid', '#da70d6'],
  ['papaya whip', '#ffefd5'], ['peach puff', '#ffdab9'], ['peru', '#cd853f'],
  ['pink', '#ffc0cb'], ['plum', '#dda0dd'], ['powder blue', '#b0e0e6'], ['purple', '#800080'],
  ['rebecca purple', '#663399'], ['red', '#ff0000'], ['rosy brown', '#bc8f8f'], ['royal blue', '#4169e1'],
  ['saddle brown', '#8b4513'], ['salmon', '#fa8072'], ['sandy brown', '#f4a460'], ['sea green', '#2e8b57'],
  ['seashell', '#fff5ee'], ['sienna', '#a0522d'], ['silver', '#c0c0c0'], ['sky blue', '#87ceeb'],
  ['slate blue', '#6a5acd'], ['slate grey', '#708090'], ['snow', '#fffafa'], ['spring green', '#00ff7f'],
  ['steel blue', '#4682b4'], ['tan', '#d2b48c'], ['teal', '#008080'], ['thistle', '#d8bfd8'], ['tomato', '#ff6347'],
  ['turquoise', '#40e0d0'], ['violet', '#ee82ee'], ['wheat', '#f5deb3'], ['white', '#ffffff'],
  ['white smoke', '#f5f5f5'], ['yellow', '#ffff00'], ['yellow green', '#9acd32'],
]);

// A pack is one word per palette colour, so every colourway's name is its own; none names a colour itself.
// Seasonal packs (TODO(spec) in ROADMAP.md) add their own, e.g. a Halloween pack's "spooky spider".
export const COLOURWAY_PACKS = Object.freeze({ everyday: Object.freeze([
  'dewy', 'blushing', 'meadow', 'moonlit', 'wistful', 'dappled', 'cottage', 'dreamy',
  'garden', 'sunlit', 'cozy', 'misty', 'orchard', 'gentle', 'brambly', 'hopeful',
  'hedgerow', 'drizzly', 'cheerful', 'woodland', 'twilight', 'picnic', 'shy', 'tidepool',
  'sprig', 'giggly', 'harvest', 'lullaby', 'pebble', 'daydream', 'merry', 'frosty',
  'wildflower', 'sleepy', 'puddle', 'cherished', 'homespun', 'breezy', 'bashful', 'tender',
  'cuddly', 'starry', 'whimsy', 'lucky', 'brave', 'willow', 'sunday', 'wandering',
]) });
