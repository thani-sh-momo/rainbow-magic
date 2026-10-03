# Art prompts for Rainbow Magic

Twenty-four images, one prompt each. Every prompt below is self-contained: copy
one, paste it, generate, done.

## The rules baked into every prompt, and why

**A flat pure-white background (#FFFFFF).** Item icons need transparency and
JPEG cannot carry it. I key it out afterwards by flood-filling from the four
corners, which only removes *connected* background — so white highlights inside
the sprite survive, as long as the background itself is one perfectly uniform
colour and the sprite does not glow or cast a shadow into it. That is why every
prompt bans shadows, glows, gradients and vignettes: a soft shadow is what makes
a keyed sprite come back with a dirty halo.

**No fine detail.** These end up 16×16 in the pack. Anything thinner than about
5% of the frame turns to mud on the way down.

**Chunky shapes, few colours.** Same reason: at 16×16 an icon is roughly 200
usable pixels.

**No text anywhere.** Models love an unsolicited caption or watermark.

Three practical notes:

- **JPEG ringing is the enemy of a clean key.** Ask for the highest quality /
  least compression the interface offers, and re-run any sprite that comes back
  with a visible halo around it.
- **If your Gemini surface can return PNG, ask for it.** That makes the sixteen
  item icons exact instead of keyed, and you can drop the white background.
- **These assets are generative, so two runs differ.** To keep the set looking
  like one set, generate the rainbow ingot first, then attach that result as a
  style reference when generating the rest.

## What Gemini cannot do here

- **The three UV sheets** (unicorn, armour layers). These are not pictures, they
  are texture maps sampled by a model's UV coordinates. A generated image cannot
  place a unicorn's *eye* at the right pixel of a horse's UV layout. So for these
  the prompts ask for a flat seamless *swatch*, and I map it — and I stamp the
  eyes and horn onto the unicorn sheet at the known coordinates afterwards.
- **Crisp 16×16 pixel art.** Downscaled generative art reads as soft next to
  vanilla's hand-placed pixels. If you want the whole pack to look vanilla-crisp,
  the existing procedural generator is the better tool and I already have it — say
  the word and I regenerate all 24 that way instead.
- **The block tiles are the weakest fit of all.** They need to tile seamlessly at
  16×16, which is exactly the thing a large generative image is worst at. The
  prompts below do their best; the procedural generator does it properly.

---

# Sheet prompts: all 24 assets in five generations, pixel art, exact sizes

This is the route to take by default. It trades five generations for one per
asset, keeps a single style across the whole set, and — the reason it is laid out
the way it is — **every image reduces to its final size by a whole number**, so
nothing is ever interpolated. Blur comes from arbitrary resampling factors; a
clean 1/32 decimation cannot invent detail.

| sheet | canvas | grid | cell | becomes | reduction |
| --- | --- | --- | --- | --- | --- |
| icons | 2048×2048 | 4×4 | 512×512 | 16×16 each | 1/32 |
| blocks | 2048×2048 | 2×2 | 1024×1024 | 16×16 each | 1/64 |
| armour | 2048×1024 | whole frame | 2048×1024 | two 64×32 | 1/32 |
| fur | 2048×2048 | whole frame | 2048×2048 | 64×64 | 1/32 |
| pack icons | 2048×1024 | 2×1 | 1024×1024 | 128×128 each | 1/8 |

Every one of those is still exact if the interface hands back 1024-pixel
canvases instead — the factors just halve. That is deliberate: the layout does
not depend on getting the canvas size you asked for.

**Three honest caveats before you spend generations:**

- **No `resize` step is avoidable entirely**; a model that returns a 2048-pixel
  JPEG cannot return a 16×16 file. What this design removes is *interpolation*.
  The sheet is still cut into cells and decimated — by an exact factor, so the
  result is the model's own pixels and nothing else.
- **The model will not draw on our pixel grid.** It will imitate pixel art at its
  own block size, probably unaligned to the cell, and JPEG will ring around the
  hard edges. So after decimating, expect one quantise pass — snap to a small
  palette and hard alpha — to put the crisp edges back. That pass is not a
  resize, but it is a pass, and the output will be cleaner than not doing it.
- **Models are mediocre at true pixel art.** Expect to re-run a sheet and pick
  the better one. If exact 16×16 pixel art is the priority rather than the look,
  `tools/make-textures.py` already draws it procedurally and exactly, for free.

---

## Sheet 1 — the sixteen item icons → `textures/items/*.png`, 16×16 each

```
Minecraft pixel art sheet: a 4x4 grid of 16 separate item icons on one square
image, in this exact reading order, left to right then top to bottom.

1  rainbow dust      - a small heap of iridescent rainbow crystal grains
2  rainbow ingot     - a chunky casting bar of rainbow metal
3  rainbow blade     - a straight sword, rainbow blade, grey grip
4  rainbow pickaxe   - rainbow metal head on a brown wooden handle
5  rainbow axe       - rainbow metal head on a brown wooden handle
6  rainbow shovel    - rainbow metal spade on a brown wooden handle
7  rainbow hoe       - rainbow metal blade angled forward on a brown handle
8  rainbow shears    - two crossed rainbow blades with grey handles
9  rainbow helmet    - a closed knight's helmet of rainbow metal, no face
10 rainbow chestplate- a rainbow metal breastplate with pauldrons, hollow
11 rainbow leggings  - rainbow metal leg guards joined by a waist band, hollow
12 rainbow boots     - a pair of rainbow metal boots
13 snare trap        - a round disc of coiled glowing rainbow thread, green thorns
14 inferno trap      - a round black disc, glowing orange molten core, flames
15 levity trap       - a round pale sky-blue disc, cyan swirl, white cloud puffs
16 rainbow spawn egg - a speckled egg in iridescent pastel rainbow

STYLE: true 16x16 pixel art. Hard-edged square pixels, a small limited palette,
flat colours, no anti-aliasing, no smooth gradients, no soft or blended shading,
no glow. Rainbow surfaces are FLAT BANDS of colour -- red, orange, yellow, green,
cyan, blue, violet -- each band a couple of pixels wide, never a smooth blend.

LAYOUT: every cell is exactly the same size and the grid is perfectly even. Each
icon is a 16x16 pixel-art sprite, centred in its cell, filling most of the cell
but not touching its edges, with clear white space around it.

The background across the whole sheet is one flat pure white (#FFFFFF), including
the gaps between icons. No grid lines, no cell borders, no frames, no numbers, no
labels, no text, no watermark, no drop shadows, no glow.

Square 1:1 image, 2048x2048.
```

## Sheet 2 — the three block tiles → `textures/blocks/*.png`, 16×16 each

```
Minecraft pixel art sheet: a 2x2 grid of four equal square cells on one image.

top left     - rainbow ore: grey stone with small square rainbow crystal specks
               scattered through it
top right    - deepslate rainbow ore: dark charcoal stone, same rainbow specks
bottom left  - rainbow block: solid rainbow metal in flat banded rainbow stripes,
               light along the top and left edge, darker along the bottom and right
bottom right - leave completely empty

STYLE: true pixel art. Hard-edged square pixels, small limited palette, flat
colours, no anti-aliasing, no smooth gradients, no vignette, no soft shading.

LAYOUT: each texture fills its whole cell edge to edge with no margin and no
frame, and is designed to tile seamlessly -- the colours on the left edge must
continue at the right edge, and the top at the bottom.

The bottom-right cell is plain flat white and contains nothing at all.
No grid lines, no cell borders, no numbers, no labels, no text, no watermark.

Square 1:1 image, 2048x2048.
```

## Sheet 3 — the armour gradient → `textures/models/armor/rainbow_1.png` and `rainbow_2.png`, 64×32 each

```
A single seamless Minecraft armour texture strip, filling the entire frame edge
to edge. No object, no background, no border.

A rainbow spectrum running left to right: red, orange, yellow, green, cyan, blue,
violet, evenly spaced, with fine white glitter pixels scattered evenly across it.
Flat bands of colour with hard pixel edges, in the flat style of a Minecraft
texture -- not a smooth photographic gradient.

Perfectly flat and even: no lighting direction, no shadows, no vignette, no
perspective, no metal shading, no border, no frame.

No text, no numbers, no watermark, no logos.
Aspect ratio 2:1, image 2048x1024.
```

## Sheet 4 — the unicorn fur → `textures/entity/rainbow_magic/glitter_unicorn.png`, 64×64

```
A single seamless fur texture, filling the entire frame edge to edge. No object,
no background, no border, no face, no eyes, no horn.

Iridescent white unicorn fur: pale pearlescent white with soft patches of pink,
mint, sky blue and lilac, and small white glitter pixels scattered evenly across
the whole frame. Flat hard-edged patches of colour in the flat style of a
Minecraft texture, not a smooth blur.

Evenly lit from every direction: no lighting direction, no shadows, no vignette,
no single bright area.

No text, no numbers, no watermark, no logos.
Square 1:1 image, 2048x2048.
```

## Sheet 5 — the two pack icons → `behavior/pack_icon.png` and `resource-pack/pack_icon.png`, 128×128 each

```
Minecraft pixel art sheet: one wide image split into two equal square halves,
side by side, each half one add-on pack icon.

left half  - a large faceted rainbow crystal with white sparkle pixels around it,
             a rainbow pickaxe and a rainbow sword crossed behind it, on a dark
             indigo background
right half - a white unicorn head in profile facing left, a glowing rainbow spiral
             horn, a pastel rainbow mane, on a dark indigo background with small
             white star pixels

STYLE: true pixel art. Hard-edged square pixels, small limited palette, flat
colours, no anti-aliasing, no smooth gradients, no glow, no blur.

LAYOUT: each icon fills its half edge to edge and is centred, bold and simple so
it still reads when small. The two halves are exactly the same size.

No border, no frame, no divider line, no text, no numbers, no labels, no
watermark.
Aspect ratio 2:1, image 2048x1024.
```

## What the sheets actually produced

`tools/import-art.py --sheets DIR` imports the five-sheet layout. Results, so the
next pass starts from facts rather than the plan:

**The reduction was exact everywhere, which was the point.** sheet 1 at 2048²
gave 512-pixel cells at 1/32; sheet 2 gave 1024-pixel cells at 1/64; sheet 4 at
2048² gave 1/32. Sheets 3 and 5 did **not** come back at the 2:1 they were asked
for — the interface returned 2912×1440 — so each was centre-cropped to the
largest whole multiple of its target (2880×1440 for the armour at 1/45;
1408×1408 per half for the pack icons at 1/11) and then reduced. Nothing was ever
interpolated; the only cost is a couple of percent off the outside.

**The model drew a text label under every sprite**, which sheet 1 explicitly
forbade. Each label sits in a 44–55px band below its sprite. Cropping it away
would break the exact reduction, so the importer drops the *rows* instead: the
sprite is the tallest run of ink rows in its cell, the label is a short run, and
keeping only the tallest run erases the label while leaving the sprite exactly
where it was drawn.

**The first cut was worse than what was already shipping**, and both causes were
mine, not the model's:

- the sheet route never applied the dark outline the per-asset route used, so the
  pale sprites (the levity trap is nearly white) lost their silhouette;
- it decimated the whole cell, so sprites kept the model's small relative sizing
  and came out thin and muddy.

Fixed by cropping each sprite to a box that is a whole multiple of the reduction
factor — the sprite then fills its icon the way a fitted one does, and the
reduction stays exact, which a plain bbox resize cannot do at the same time.

**Verified against the previous art, 8 icons side by side.** Better: the snare,
the inferno trap, the blade, the shears and the pickaxe — cleaner silhouettes,
better colour separation at 16×16. **Worse:** the levity trap came out as a
square panel rather than a round disc, the dust as a solid blob rather than a
loose heap, and the helmet as an oval egg rather than a domed helmet with a face
opening. That is the model's choice of silhouette at grid scale; nothing in the
keying caused it.

**Blocks: the two ores tile cleanly, `rainbow_block` does not.** Opposite-edge
colour agreement is 32/32 for both ores but **0/32** for the rainbow block: its
spectrum runs left to right and does not wrap, so violet meets red at every block
boundary and a wall shows a seam per block. Either ask for a band that wraps
(red → violet → red within the tile) or let the procedural generator draw that
one, which tiles by construction.

### If you re-run sheet 1

The three silhouettes above are the whole reason to. Add one line per item to the
numbering, in the same style as the rest:

```
1  rainbow dust   - a LOOSE HEAP of separate grains, not one solid blob, with
                    a few grains scattered loose above the pile
9  rainbow helmet - a DOMED helmet with a clear dark face opening visible from
                    the front-left, not a smooth oval egg
15 levity trap    - a ROUND DISC seen face on, a circle not a square panel
```

---

# 1. Item icons — sixteen

Each ends at `resource-pack/textures/items/<name>.png`, 16×16, transparent.

## Rainbow Dust → `rainbow_dust.png`

```
A small scattered pile of iridescent rainbow crystal dust: coarse glittering
grains in red, orange, yellow, green, cyan, blue and violet, heaped slightly
higher in the middle, with three or four tiny bright sparkles above the pile.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Ingot → `rainbow_ingot.png`

```
A single casting ingot of rainbow metal: a chunky rectangular bar with slightly
beveled corners, its surface a polished sweeping rainbow gradient running from
red at one end through orange, yellow, green, cyan and blue to violet at the
other, with a bright white sheen along the top edge and a darker underside.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Blade → `rainbow_blade.png`

```
A long straight sword held diagonally, its tip at the upper right and its handle
at the lower left. The blade is glowing rainbow metal, a smooth gradient from
red at the base through orange, yellow, green, cyan and blue to violet at the
tip, with a bright white edge highlight along the top. A short dark grey grip
and a small rainbow crossguard.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Pickaxe → `rainbow_pickaxe.png`

```
A pickaxe held diagonally: a curved rainbow-metal head sweeping from the lower
left up to the upper right, and a warm wooden-brown handle running from the head
down to the lower left corner. The head is polished rainbow metal, a gradient
from red through orange, yellow, green, cyan and blue to violet, with a bright
white highlight along its top curve.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Axe → `rainbow_axe.png`

```
An axe held diagonally: a broad fan-shaped rainbow-metal blade on the right, and
a warm wooden-brown handle running down to the lower left corner. The blade is
polished rainbow metal, a gradient from red through orange, yellow, green, cyan
and blue to violet, with a bright white highlight along its cutting edge.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Shovel → `rainbow_shovel.png`

```
A shovel held diagonally: a broad rounded spade head of rainbow metal at the
upper right, and a warm wooden-brown handle running down to the lower left
corner. The spade is polished rainbow metal, a gradient from red through orange,
yellow, green, cyan and blue to violet, with a bright white highlight along its
upper edge.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Hoe → `rainbow_hoe.png`

```
A hoe held diagonally: a flat rectangular rainbow-metal blade at the top right
angled forward and downward, and a warm wooden-brown handle running down to the
lower left corner. The blade is polished rainbow metal, a gradient from red
through orange, yellow, green, cyan and blue to violet, with a bright white
highlight on its upper edge.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Shears → `rainbow_shears.png`

```
A pair of open shears: two crossed rainbow-metal blades pointing up and outward,
and two rounded dark grey handles pointing down and outward, joined by a small
pivot bolt in the middle. The blades are polished rainbow metal, a gradient from
red through orange, yellow, green, cyan and blue to violet.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Helmet → `rainbow_helmet.png`

```
A closed knight's helmet of rainbow metal seen from the front-left three-quarter
view, with a small nose guard and a narrow horizontal eye slit, and nothing
visible inside. The metal is polished, a gradient sweeping from red through
orange, yellow, green, cyan and blue to violet, with a bright white highlight on
the upper left of the dome.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Chestplate → `rainbow_chestplate.png`

```
A chestplate of rainbow metal seen from the front: a broad rounded breastplate
with two shoulder pauldrons and a short raised neck rim, hollow and empty inside
with nothing visible through it. The metal is polished, a gradient sweeping from
red through orange, yellow, green, cyan and blue to violet, with a bright white
highlight on the upper left of the chest.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Leggings → `rainbow_leggings.png`

```
A pair of leggings of rainbow metal seen from the front: two tapered leg guards
joined at the top by a waist band, hollow and empty inside with nothing visible
through them. The metal is polished, a gradient sweeping from red through
orange, yellow, green, cyan and blue to violet, with a bright white highlight on
the upper left of the waist band.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Rainbow Boots → `rainbow_boots.png`

```
A pair of boots of rainbow metal seen from the front-left three-quarter view:
chunky rounded toe caps and short ankle cuffs, hollow and empty inside with
nothing visible through them. The metal is polished, a gradient sweeping from
red through orange, yellow, green, cyan and blue to violet, with a bright white
highlight along the top of each boot.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Snare Trap → `trap_snare.png`

```
A flat round magical trap disc seen face on: a hoop of glowing rainbow thread
coiled into a tight spiral inside a thin ring, with five short leaf-green thorn
needles poking out around its edge and a small white sparkle in the middle.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Inferno Trap → `trap_inferno.png`

```
A flat round magical trap disc seen face on: a thin obsidian-black plate with a
glowing molten orange core at its centre and five short orange-red flames licking
up around its rim, cracks of glowing magma running out from the centre.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Levity Trap → `trap_levity.png`

```
A flat round magical trap disc seen face on: a thin pale sky-blue plate with a
glowing cyan swirl spiralling at its centre and five small white feather-light
cloud puffs around its rim, with faint white upward wisps rising from it.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

## Unicorn Spawn Egg → `glitter_unicorn_spawn_egg.png`

```
A smooth egg in the classic blocky game spawn-egg shape, covered in iridescent
pastel rainbow mottling: soft shifts of pink, mint, sky blue and lilac with fine
glitter speckles across it, a broad soft white sheen on its upper left and a
darker base on its lower right.

Style: chunky, bold, high-contrast game item, designed to stay readable when
scaled down to a 16x16 icon, so use only a few large simple shapes and no fine
detail.
Centred on a flat pure white background (#FFFFFF), the object floating with
clear white space all around it and not touching any edge.
Flat even lighting from the upper left, simple cel shading, 2-3 tones per
colour, soft round highlights.
The background must be one single uniform colour, with no shadow, no glow, no
reflection, no gradient, no vignette, no horizon, no floor and no texture of any
kind.
No text, no numbers, no letters, no watermark, no signature, no logo, no border,
no frame, no multiple objects, no hands, no person.
Square 1:1 image, 1024x1024.
```

---

# 2. Block tiles — three

Different rules: these get no background, they fill the frame edge to edge and
they have to tile. Opaque, so JPEG is fine here — no keying needed.

## Rainbow Ore → `rainbow_ore.png`

```
A seamless tileable block texture for a video game, filling the entire frame
edge to edge. Grey stone with chunky embedded crystals of rainbow colour -- red,
orange, yellow, green, cyan, blue and violet -- scattered across it: seven small
angular crystal facets, each with a bright white highlight on its upper left.

Flat even lighting with no shadows cast across the tile. The pattern must tile
seamlessly on all four edges so that the colours at the left edge continue at the
right edge and the colours at the top continue at the bottom. There must be no
border, no frame and no vignette, and no single centred object.
Chunky simple shapes only, so it still reads when scaled down to 16x16 pixels.
No text, no numbers, no letters, no watermark, no logo, no drop shadow.
Square 1:1 image, 1024x1024.
```

## Deepslate Rainbow Ore → `deepslate_rainbow_ore.png`

```
A seamless tileable block texture for a video game, filling the entire frame
edge to edge. Dark charcoal-grey, almost black stone with faint diagonal streaks
through it, and chunky embedded crystals of rainbow colour -- red, orange,
yellow, green, cyan, blue and violet -- scattered across it: seven small angular
crystal facets, each with a bright white highlight on its upper left.

Flat even lighting with no shadows cast across the tile. The pattern must tile
seamlessly on all four edges so that the colours at the left edge continue at the
right edge and the colours at the top continue at the bottom. There must be no
border, no frame and no vignette, and no single centred object.
Chunky simple shapes only, so it still reads when scaled down to 16x16 pixels.
No text, no numbers, no letters, no watermark, no logo, no drop shadow.
Square 1:1 image, 1024x1024.
```

## Rainbow Block → `rainbow_block.png`

```
A seamless tileable block texture for a video game, filling the entire frame
edge to edge: solid polished rainbow metal. A smooth spectrum sweeps across the
tile from red on the left through orange, yellow, green, cyan and blue to violet
on the right, with a bright highlight running along the upper left and darker
shading toward the lower right so it reads as a solid metal block.

Flat even lighting. The pattern must tile seamlessly on all four edges so that
the colours at the left edge continue at the right edge and the colours at the
top continue at the bottom. There must be no border, no frame, no vignette and
no single centred object.
Chunky simple shapes only, so it still reads when scaled down to 16x16 pixels.
No text, no numbers, no letters, no watermark, no logo, no drop shadow.
Square 1:1 image, 1024x1024.
```

---

# 3. UV sheets — three

Not pictures: texture maps sampled by a model's UV coordinates. These prompts ask
for a flat seamless swatch, which is the only thing a generator can usefully
contribute here. I map it onto the model and stamp the details.

## Armour Layer 1 (helmet, chestplate, boots) → `rainbow_1.png`

```
A flat seamless texture swatch filling the entire frame edge to edge. No object,
no background, no border.

A smooth rainbow spectrum sweeping from red at the left edge through orange,
yellow, green, cyan and blue to violet at the right edge, with fine white
glitter speckles dusted evenly across the whole frame. The colour must be
completely flat and even with no lighting direction, no shadows, no vignette, no
perspective and no metal shading of any kind -- it is a flat colour map, not a
picture of an object.

No text, no numbers, no letters, no watermark, no logo, no border, no frame.
Aspect ratio 2:1, image 1024x512.
```

## Armour Layer 2 (leggings) → `rainbow_2.png`

```
A flat seamless texture swatch filling the entire frame edge to edge. No object,
no background, no border.

A smooth rainbow spectrum sweeping from red at the left edge through orange,
yellow, green, cyan and blue to violet at the right edge, running slightly
cooler and deeper than a plain spectrum, with dense fine white glitter speckles
dusted evenly across the whole frame. The colour must be completely flat and
even with no lighting direction, no shadows, no vignette, no perspective and no
metal shading of any kind -- it is a flat colour map, not a picture of an object.

No text, no numbers, no letters, no watermark, no logo, no border, no frame.
Aspect ratio 2:1, image 1024x512.
```

## Unicorn Fur → `glitter_unicorn.png`

```
A flat seamless fur texture swatch filling the entire frame edge to edge. No
object, no background, no border, no face, no eyes, no horn.

Iridescent white unicorn fur: soft pearlescent white with a gentle rainbow sheen
shifting through pale pink, mint, sky blue and lilac, and dense fine glitter
speckles catching the light evenly across the whole frame. It must look like
evenly lit fur from every direction, with no lighting direction, no shadows, no
vignette and no single bright area -- it is a flat colour map, not a picture of
an animal.

No text, no numbers, no letters, no watermark, no logo, no border, no frame.
Square 1:1 image, 1024x1024.
```

---

# 4. Pack icons — two

These show side by side in the world's pack list, so they are deliberately
different. Opaque, so JPEG is fine.

## Behaviour pack icon → `behavior/pack_icon.png`

```
A square video game add-on pack icon, with a dark indigo-to-violet gradient
filling the whole frame.

Centred: a large faceted rainbow crystal glowing from within with the full
spectrum, a rainbow-metal pickaxe and a rainbow-metal sword crossed behind it,
and a few small white sparkles around it. Bold and simple so it still reads as a
small 128x128 thumbnail.

Flat even lighting, simple cel shading. No outer border, no frame, no vignette.
No text, no numbers, no letters, no watermark, no logo, no person.
Square 1:1 image, 1024x1024.
```

## Resource pack icon → `resource-pack/pack_icon.png`

```
A square video game add-on pack icon, with a dark indigo-to-violet gradient
filling the whole frame.

Centred: the head and neck of a graceful unicorn, white pearlescent fur with a
gentle rainbow sheen, a glowing rainbow spiral horn on its forehead and a soft
pastel mane, facing the viewer at a slight angle, with a few small white
sparkles around it. Bold and simple so it still reads as a small 128x128
thumbnail.

Flat even lighting, simple cel shading. No outer border, no frame, no vignette.
No text, no numbers, no letters, no watermark, no logo, no person, no body.
Square 1:1 image, 1024x1024.
```

---

# After generating

Drop the files anywhere and I will do the rest: key the white out of the sixteen
item icons, downscale everything to its pack size (item icons 16×16, block tiles
16×16, armour layers 64×32, unicorn 64×64, pack icons 128×128), map the three UV
sheets and stamp the unicorn's eyes and horn at the right coordinates.

## What actually happened, once this art was generated

`tools/import-art.py` does the keying and resizing, and is re-runnable when new
art arrives. Three things worth recording for next time:

- **The keying held up.** The vision check found plain white backgrounds, no drop
  shadows and no cut-offs on all sixteen icons, so the flood fill produced no
  leftover white and no clipping. One pixel of dark outline is added to each
  silhouette in the same colour the hand-drawn sprites use — not for looks: the
  levity trap came back nearly white and would otherwise vanish against the
  inventory's own light background.
- **`rainbow_block` needed mending.** It came back with a beveled frame around the
  face, which reads as a grid line on every block once it tiles. The importer crops
  the outer 9% of each edge before resizing, and the 6×6 tiled test is clean.
- **The unicorn's eyes and horn were not stamped.** The unicorn reuses the vanilla
  horse model, so its texture is a UV map and the generator cannot place features
  on it — and the model has no horn geometry at all. The fur sheet is mapped as a
  wash, which is exactly what the previous texture was, so nothing regressed: the
  pet is still eyeless. Giving it eyes and a horn means a model pass, not an art
  pass, and that has not been done.

Two things worth saying before you spend generations on it:

- **The block tiles and the UV sheets are the parts that will need my hand
  anyway** — tiling and UV mapping are geometric problems, not illustration
  problems. If those three or four come back unusable, that is expected, and the
  procedural generator already handles them.
- **Consider regenerating the eight existing icons too** so the set is one style
  rather than two. The prompts for all sixteen are above for exactly that reason.
