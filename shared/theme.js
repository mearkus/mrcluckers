/* What each level looks like.
 *
 * Every level drew the same sky and the same two green hills, indoors
 * included -- the living room had rolling countryside behind the sofa. A
 * theme is a palette plus a stack of parallax layers, and the demo knows how
 * to draw four kinds of layer rather than knowing about any particular place.
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
    park: {
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

  return { get: get, names: function () { return Object.keys(THEMES); } };
});
