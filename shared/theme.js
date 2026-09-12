/* What each level looks like, and where it is.
 *
 * Every level drew the same sky and the same two green hills, indoors
 * included -- the living room had rolling countryside behind the sofa. A
 * theme is a palette plus a stack of parallax layers, and the demo knows how
 * to draw four kinds of layer rather than knowing about any particular place.
 *
 * `parts` is the palette for platform kinds -- a `soft` platform is a sofa
 * indoors, a hedge in the lane, a bush in the park. The level says what
 * shape a thing is; the theme says what it is made of there. That is what
 * lets one level format describe five different places.
 *
 * A layer with `front: true` is drawn over the player rather than behind
 * him: grass he wades through, a table edge he passes behind. Depth is what
 * a single flat backdrop cannot give you.
 *
 * `where` is the section a level files under on the level-select screen.
 * It lives here rather than in a list the shell keeps, so adding a level is
 * still a one-file job: name a theme and it lands in the right section.
 *
 * Layers are described in world pixels and drawn in screen space, so `speed`
 * is how much of the camera's motion they take: 0 is painted on the far wall,
 * 1 moves with the floor.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Theme = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // blobs  -- repeating ellipses: hills, bushes, canopies
  // posts  -- repeating uprights: fence rails, trunks, wainscot
  // band   -- a flat stripe at a fixed height: skirting, a path, a hedge top
  // panes  -- repeating rectangles with a warm centre: windows, pictures
  //
  // Two fields exist because a level can be tall. A layer is one row at a
  // fixed height above the floor, which is all a level three heights tall
  // ever needed -- go up a tall one and every row is below you and the screen
  // is the flat sky colour.
  //
  // `tile: n`  repeats the row upward every n world pixels, as far as the
  //            view reaches: a plank wall that keeps going, sky that keeps
  //            having clouds in it. Costs nothing on a level that stays down.
  // `float: true`  marks a blobs layer that hangs in the air rather than
  //            standing on the ground. Hills are filled from their skyline
  //            down; clouds must not be, or they paint a wall over
  //            everything beneath them.
  var THEMES = {
    indoors: {
      where: 'Indoors',
      parts: {
        slab:  { top: '#a9835a', body: '#7a5a3c', leg: '#664a30' },   // table, sideboard
        soft:  { top: '#9a7f92', body: '#7c6274', tuft: '#b199a9' },  // sofa, cushion
        crate: { top: '#b08a5c', body: '#8a6a45', line: '#6a5033' },  // toy box
        pipe:  { top: '#c2ab8d', body: '#96805f' }                    // radiator, rail
      },
      sky: ['#e8d9c3', '#d9c6ab'],          // a warm wall, not a sky
      layers: [
        { kind: 'panes', color: '#cbb08a', frame: '#9a7f5e', step: 430,
          w: 62, h: 74, y: -196, speed: 0.34 },
        { kind: 'panes', color: '#cfe3ef', frame: '#b39a79', step: 620,
          w: 150, h: 190, y: -300, speed: 0.25 },
        // The dado, repeated as a picture rail up the wall: a tall room reads
        // as tall, instead of as one flat colour above the pictures.
        { kind: 'band', color: '#c2ab8d', y: -30, h: 34, speed: 0.55,
          tile: 300 },
        { kind: 'posts', color: '#b39a79', step: 96, w: 12, h: 76,
          y: -76, speed: 0.55 },
        { kind: 'band', color: '#8d7355', y: 0, h: 10, speed: 1 },
        { kind: 'band', color: '#5f4830', y: 46, h: 40, speed: 1.35,
          front: true, alpha: 0.55 },
      ],
      ground: { dirt: '#7a5a3c', edge: '#8f6d4a', cap: '#a97f52', lip: '#c19a68' },
      hazard: { body: 'rgba(120, 150, 190, .45)', top: 'rgba(190, 215, 240, .8)' },
      dust: 'rgba(196, 176, 148, 0.75)'
    },
    /* The shed he falls into on the way out of the kitchen. Dim, warm and
       close: the parallax is shallow because you are inside a small wooden
       box, and the one bright thing is the window he is climbing towards. */
    shed: {
      where: 'Indoors',
      parts: {
        slab:  { top: '#a8845c', body: '#7b5f42', leg: '#5f4a34' },   // workbench
        soft:  { top: '#9c8f6e', body: '#7e7256', tuft: '#b3a785' },  // sacking
        crate: { top: '#b08a5c', body: '#8a6a45', line: '#6a5033' },  // seed crate
        pipe:  { top: '#b9a689', body: '#8d7a5c' }                    // a rail
      },
      sky: ['#6b5541', '#4b3a2c'],          // the far wall, in shadow
      layers: [
        /* Two rows of glass, because one cannot do both jobs: from the floor
           you only ever see up to about three heights, and from the loft you
           only ever see down to about three. A window that greets you at the
           bottom is invisible at the top and vice versa. */
        { kind: 'panes', color: '#f6e6bb', frame: '#8a6f4e', step: 520,
          w: 120, h: 96, y: -470, speed: 0.18 },        // the gable light
        { kind: 'panes', color: '#e8d3a2', frame: '#8a6f4e', step: 340,
          w: 78, h: 92, y: -215, speed: 0.30 },         // over the bench
        // The wall carries on above the gable light rather than stopping at
        // it: the long way down starts four heights up and the shed has to
        // still be a shed there.
        { kind: 'posts', color: '#7a614a', step: 88, w: 14, h: 300,
          y: -300, speed: 0.38, tile: 300 },                          // studs
        // A joist every storey, so height reads as height and not as a
        // texture sliding past.
        { kind: 'band', color: '#8a6c4c', y: -232, h: 16, speed: 0.5,
          tile: 300 },
        { kind: 'band', color: '#6f573d', y: -118, h: 14, speed: 0.5 },
        { kind: 'panes', color: '#5d4833', frame: '#79603f', step: 210,
          w: 44, h: 52, y: -96, speed: 0.62 },                        // pegboard
        { kind: 'band', color: '#3f3125', y: 0, h: 12, speed: 1 },
        { kind: 'band', color: '#2b2119', y: 44, h: 42, speed: 1.35,
          front: true, alpha: 0.5 },
      ],
      ground: { dirt: '#3b2e24', edge: '#4d3c2e', cap: '#7d6247', lip: '#9a7a58' },
      hazard: { body: 'rgba(120, 150, 190, .45)', top: 'rgba(190, 215, 240, .8)' },
      dust: 'rgba(214, 190, 150, 0.8)'
    },

    garden: {
      where: 'Outdoors',
      parts: {
        slab:  { top: '#9c8a6e', body: '#7b6b52', leg: '#5f5240' },   // bench, table
        soft:  { top: '#6f9c55', body: '#54793f', tuft: '#8dbb6e' },  // shrub, compost
        crate: { top: '#a98356', body: '#84643f', line: '#63492c' },  // seed tray
        pipe:  { top: '#8a6c48', body: '#6b5236' }                    // log, hose reel
      },
      sky: ['#8ec5e8', '#dfeff7'],
      layers: [
        // Something to climb past. Without it a tall level outdoors is one
        // flat field of colour above the hedges.
        { kind: 'blobs', color: '#ffffff', step: 470, rx: 84, ry: 30,
          y: -300, speed: 0.12, alpha: 0.7, float: true, tile: 330 },
        { kind: 'blobs', color: '#9ec98f', step: 520, rx: 190, ry: 96,
          y: -34, speed: 0.2, alpha: 0.7 },
        { kind: 'blobs', color: '#b7d7a8', step: 340, rx: 150, ry: 80,
          y: 26, speed: 0.3 },
        { kind: 'posts', color: '#caa87a', step: 54, w: 9, h: 60,
          y: -60, speed: 0.5 },
        { kind: 'band', color: '#a9895f', y: -46, h: 7, speed: 0.5 },
        { kind: 'blobs', color: '#8fbd80', step: 210, rx: 105, ry: 62,
          y: 52, speed: 0.62 },
        { kind: 'posts', color: '#3f6b30', step: 46, w: 7, h: 13,
          y: -11, speed: 1.3, front: true, alpha: 0.9 },
      ],
      ground: { dirt: '#6b4a33', edge: '#7d5940', cap: '#5c9e46', lip: '#7cc55e' },
      hazard: { body: 'rgba(70, 140, 190, .55)', top: 'rgba(150, 205, 235, .75)' },
      dust: 'rgba(150, 130, 100, 0.7)'
    },
    kitchen: {
      where: 'Indoors',
      parts: {
        slab:  { top: '#c9a06a', body: '#a07a4e', leg: '#7c5c3a' },   // worktop
        soft:  { top: '#9aa9ad', body: '#7b8a8f', tuft: '#b6c3c6' },  // laundry pile
        crate: { top: '#b7a483', body: '#93805f', line: '#6f5f45' },  // crate of veg
        pipe:  { top: '#dfe7ea', body: '#8e9ca1' }                    // rail, pipe
      },
      sky: ['#dfe8ea', '#c8d5d8'],          // cool tiled wall
      layers: [
        { kind: 'panes', color: '#e6eef0', frame: '#a9b7bb', step: 780,
          w: 96, h: 120, y: -206, speed: 0.16 },
        // Tiles: a grid made of one band per row and uprights for the grout.
        // Wall tile and its grout: both carry on upward, so a kitchen is
        // still a kitchen above worktop height.
        { kind: 'band', color: '#cddadd', y: -230, h: 200, speed: 0.2,
          tile: 200 },
        { kind: 'posts', color: '#bccacd', step: 130, w: 5, h: 200,
          y: -230, speed: 0.2, tile: 200 },
        { kind: 'band', color: '#b3c2c6', y: -132, h: 5, speed: 0.2 },
        // Cupboard doors under a worktop.
        { kind: 'panes', color: '#8fa2a8', frame: '#7b8d93', step: 260,
          w: 96, h: 78, y: -96, speed: 0.5 },
        { kind: 'band', color: '#9aa9ad', y: -108, h: 12, speed: 0.5 },
        { kind: 'band', color: '#6f7d82', y: 0, h: 9, speed: 1 },
        { kind: 'band', color: '#6d7a80', y: -5, h: 9, speed: 1.4,
          front: true, alpha: 0.8 },
      ],
      // Darker than the wall on purpose: a pale floor against pale tiles
      // reads as one surface, and you cannot see what you may stand on.
      ground: { dirt: '#454f54', edge: '#576165', cap: '#75858b', lip: '#9fb0b5' },
      hazard: { body: 'rgba(150, 190, 215, .5)', top: 'rgba(210, 232, 245, .85)' },
      dust: 'rgba(200, 210, 214, 0.75)'
    },
    lane: {
      where: 'Outdoors',
      parts: {
        slab:  { top: '#9d8f7a', body: '#7a6e5c', leg: '#5c5344' },   // wall cap, step
        soft:  { top: '#7f9457', body: '#617442', tuft: '#9cb072' },  // hedge
        crate: { top: '#a5824f', body: '#7f6339', line: '#5e4828' },  // pallet
        pipe:  { top: '#8d8375', body: '#6d6558' }                    // kerb, drainpipe
      },
      sky: ['#f0a06a', '#f6d9b0'],          // late afternoon, going home
      layers: [
        // Evening cloud, lit from underneath -- the same job the park's does,
        // in the lane's light.
        { kind: 'blobs', color: '#f3c9a4', step: 500, rx: 96, ry: 28,
          y: -310, speed: 0.12, alpha: 0.8, float: true, tile: 340 },
        { kind: 'blobs', color: '#d8a77a', step: 640, rx: 210, ry: 104,
          y: -28, speed: 0.18, alpha: 0.6 },
        { kind: 'blobs', color: '#c98a67', step: 380, rx: 170, ry: 78,
          y: -34, speed: 0.16 },
        { kind: 'blobs', color: '#8c6350', step: 250, rx: 120, ry: 70,
          y: -10, speed: 0.26 },
        { kind: 'posts', color: '#6d4f3c', step: 84, w: 8, h: 54,
          y: -54, speed: 0.52 },
        { kind: 'band', color: '#5d4333', y: -42, h: 6, speed: 0.52 },
        { kind: 'blobs', color: '#5f7048', step: 200, rx: 100, ry: 54,
          y: 44, speed: 0.64 },
        { kind: 'posts', color: '#33402a', step: 62, w: 9, h: 14,
          y: -12, speed: 1.32, front: true, alpha: 0.9 },
      ],
      ground: { dirt: '#5a4230', edge: '#6d5140', cap: '#6f8a4a', lip: '#8fac60' },
      hazard: { body: 'rgba(80, 120, 160, .55)', top: 'rgba(200, 190, 175, .7)' },
      dust: 'rgba(180, 150, 118, 0.75)'
    },
    park: {
      where: 'Outdoors',
      parts: {
        slab:  { top: '#a08b63', body: '#7d6b4a', leg: '#5e5138' },   // park bench
        soft:  { top: '#68a04e', body: '#4e7c3a', tuft: '#87c069' },  // bush
        crate: { top: '#a3814f', body: '#7e633b', line: '#5d4927' },  // crate
        pipe:  { top: '#8b7150', body: '#6a563c' }                    // fallen log
      },
      sky: ['#7fb9e4', '#e6f2f8'],
      layers: [
        { kind: 'blobs', color: '#a8cf99', step: 700, rx: 250, ry: 120,
          y: -50, speed: 0.18, alpha: 0.65 },
        // Hanging in the air, so it is a band of cloud and not a white
        // curtain over everything below it -- and repeated, so climbing does
        // not run out of sky.
        { kind: 'blobs', color: '#ffffff', step: 430, rx: 90, ry: 34,
          y: -300, speed: 0.12, alpha: 0.75, float: true, tile: 330 },
        // Trunk first, then the canopy over it -- the other way round puts
        // bark on top of leaves.
        // A treeline rather than individual trees: at this scale a lone
        // canopy with a thin trunk reads as a green cloud, and the trunk is
        // usually off the side of the frame anyway. Overlapping blobs just
        // above the horizon are unmistakably a row of trees.
        { kind: 'blobs', color: '#7ea77f', step: 250, rx: 104, ry: 74,
          y: -58, speed: 0.24 },
        { kind: 'blobs', color: '#8fb98c', step: 250, rx: 92, ry: 60,
          y: -40, speed: 0.26 },
        { kind: 'blobs', color: '#7fb277', step: 190, rx: 100, ry: 58,
          y: 48, speed: 0.6 },
        { kind: 'blobs', color: '#37692d', step: 120, rx: 26, ry: 12,
          y: -4, speed: 1.34, front: true, alpha: 0.88 },
      ],
      ground: { dirt: '#63432c', edge: '#77563b', cap: '#549444', lip: '#77bd5a' },
      hazard: { body: 'rgba(64, 132, 180, .55)', top: 'rgba(150, 205, 235, .75)' },
      dust: 'rgba(150, 130, 100, 0.7)'
    }
  };

  // Levels written before themes existed say "outdoors".
  var ALIAS = { outdoors: 'garden' };

  function get(name) {
    var key = ALIAS[name] || name;
    return THEMES[key] || THEMES.garden;
  }

  var FALLBACK_PARTS = {
    slab:  { top: '#a08b63', body: '#7d6b4a', leg: '#5e5138' },
    soft:  { top: '#68a04e', body: '#4e7c3a', tuft: '#87c069' },
    crate: { top: '#a3814f', body: '#7e633b', line: '#5d4927' },
    pipe:  { top: '#8b7150', body: '#6a563c' }
  };

  /** The palette for one platform kind in this theme. */
  function part(themeName, kind) {
    var t = get(themeName);
    return (t.parts && t.parts[kind]) || FALLBACK_PARTS[kind] || null;
  }

  /** The section heading for a theme, for grouping on the level select. */
  function where(name) { return get(name).where || 'Elsewhere'; }

  return {
    get: get,
    part: part,
    where: where,
    names: function () { return Object.keys(THEMES); }
  };
});
