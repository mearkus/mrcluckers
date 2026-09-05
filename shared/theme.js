/* What each level looks like, and where it is.
 *
 * Every level drew the same sky and the same two green hills, indoors
 * included -- the living room had rolling countryside behind the sofa. A
 * theme is a palette plus a stack of parallax layers, and the demo knows how
 * to draw four kinds of layer rather than knowing about any particular place.
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
  var THEMES = {
    indoors: {
      where: 'Indoors',
      sky: ['#e8d9c3', '#d9c6ab'],          // a warm wall, not a sky
      layers: [
        { kind: 'panes', color: '#cfe3ef', frame: '#b39a79', step: 620,
          w: 150, h: 190, y: -300, speed: 0.25 },
        { kind: 'band', color: '#c2ab8d', y: -30, h: 34, speed: 0.55 },
        { kind: 'posts', color: '#b39a79', step: 96, w: 12, h: 76,
          y: -76, speed: 0.55 },
        { kind: 'band', color: '#8d7355', y: 0, h: 10, speed: 1 }
      ],
      ground: { dirt: '#7a5a3c', edge: '#8f6d4a', cap: '#a97f52', lip: '#c19a68' },
      hazard: { body: 'rgba(120, 150, 190, .45)', top: 'rgba(190, 215, 240, .8)' },
      dust: 'rgba(196, 176, 148, 0.75)'
    },
    garden: {
      where: 'Outdoors',
      sky: ['#8ec5e8', '#dfeff7'],
      layers: [
        { kind: 'blobs', color: '#b7d7a8', step: 340, rx: 150, ry: 80,
          y: 26, speed: 0.3 },
        { kind: 'posts', color: '#caa87a', step: 54, w: 9, h: 60,
          y: -60, speed: 0.5 },
        { kind: 'band', color: '#a9895f', y: -46, h: 7, speed: 0.5 },
        { kind: 'blobs', color: '#8fbd80', step: 210, rx: 105, ry: 62,
          y: 52, speed: 0.62 }
      ],
      ground: { dirt: '#6b4a33', edge: '#7d5940', cap: '#5c9e46', lip: '#7cc55e' },
      hazard: { body: 'rgba(70, 140, 190, .55)', top: 'rgba(150, 205, 235, .75)' },
      dust: 'rgba(150, 130, 100, 0.7)'
    },
    kitchen: {
      where: 'Indoors',
      sky: ['#dfe8ea', '#c8d5d8'],          // cool tiled wall
      layers: [
        // Tiles: a grid made of one band per row and uprights for the grout.
        { kind: 'band', color: '#cddadd', y: -230, h: 200, speed: 0.2 },
        { kind: 'posts', color: '#bccacd', step: 130, w: 5, h: 200,
          y: -230, speed: 0.2 },
        { kind: 'band', color: '#b3c2c6', y: -132, h: 5, speed: 0.2 },
        // Cupboard doors under a worktop.
        { kind: 'panes', color: '#8fa2a8', frame: '#7b8d93', step: 260,
          w: 96, h: 78, y: -96, speed: 0.5 },
        { kind: 'band', color: '#9aa9ad', y: -108, h: 12, speed: 0.5 },
        { kind: 'band', color: '#6f7d82', y: 0, h: 9, speed: 1 }
      ],
      // Darker than the wall on purpose: a pale floor against pale tiles
      // reads as one surface, and you cannot see what you may stand on.
      ground: { dirt: '#454f54', edge: '#576165', cap: '#75858b', lip: '#9fb0b5' },
      hazard: { body: 'rgba(150, 190, 215, .5)', top: 'rgba(210, 232, 245, .85)' },
      dust: 'rgba(200, 210, 214, 0.75)'
    },
    lane: {
      where: 'Outdoors',
      sky: ['#f0a06a', '#f6d9b0'],          // late afternoon, going home
      layers: [
        { kind: 'blobs', color: '#c98a67', step: 380, rx: 170, ry: 78,
          y: -34, speed: 0.16 },
        { kind: 'blobs', color: '#8c6350', step: 250, rx: 120, ry: 70,
          y: -10, speed: 0.26 },
        { kind: 'posts', color: '#6d4f3c', step: 84, w: 8, h: 54,
          y: -54, speed: 0.52 },
        { kind: 'band', color: '#5d4333', y: -42, h: 6, speed: 0.52 },
        { kind: 'blobs', color: '#5f7048', step: 200, rx: 100, ry: 54,
          y: 44, speed: 0.64 }
      ],
      ground: { dirt: '#5a4230', edge: '#6d5140', cap: '#6f8a4a', lip: '#8fac60' },
      hazard: { body: 'rgba(80, 120, 160, .55)', top: 'rgba(200, 190, 175, .7)' },
      dust: 'rgba(180, 150, 118, 0.75)'
    },
    park: {
      where: 'Outdoors',
      sky: ['#7fb9e4', '#e6f2f8'],
      layers: [
        { kind: 'blobs', color: '#ffffff', step: 430, rx: 90, ry: 34,
          y: -300, speed: 0.12, alpha: 0.75 },
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
          y: 48, speed: 0.6 }
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

  /** The section heading for a theme, for grouping on the level select. */
  function where(name) { return get(name).where || 'Elsewhere'; }

  return {
    get: get,
    where: where,
    names: function () { return Object.keys(THEMES); }
  };
});
