# Working in this repo

## Branching — no exceptions

**Never push to `main`.** Every change lands through a pull request, including
one-line fixes and including "this is obviously safe" changes.

- Work on a branch, push the branch, open a PR, and let a human merge it.
- A merged PR is finished — it cannot carry follow-up work. Branch fresh off
  the latest `main` and open a *new* PR rather than reusing a closed one.
- Follow-up work pushed after a merge is not in `main`, and therefore not
  deployed. Check before reporting something as shipped.

## URLs

The site root **is the game** — `/` is the title screen, `/#levels` the level
select, `/?level=slug` a level. Everything else sits under it: `/web/` for the
three.js demo, `/admin/` for the making-of page, `/editor/` for the level
editor. `/demo/` is a redirect kept for old bookmarks; the directory itself
still holds the canvas game's code.

Paths that scripts build at run time (the key art, the sprite sheets) resolve
against the **document**, which is at the root, not against the script in
`demo/`. They are written without a `../`.

## Deploying

`main` is the live site. Pushing to it triggers `.github/workflows/pages.yml`,
which publishes the repository to GitHub Pages, so **merging a PR is a deploy**.
There is no separate release step and no staging environment.

Settings → Pages → Source is set to "GitHub Actions". That is repository
configuration, not something in the tree — a workflow change cannot restore it.

## Building assets

```
python3 build.py
```

Regenerates the model, the sprite sheets, the fabric textures and the
turnaround. Pure standard library, so there is nothing to install, and the
output is byte-for-byte deterministic.

Commit the regenerated assets. The demos and the published site load them
straight from the repository — nothing is built in CI.

## Layout

| Path | What it is |
| --- | --- |
| `tools/mc/` | The generator: geometry, rig, animation, renderer, exporters |
| `build.py` | One command that produces everything in `assets/` |
| `assets/` | Generated output — model, sprites, textures. Committed on purpose |
| `index.html` | **The game.** The site root is the title screen, level select and play view |
| `demo/` | The 2D canvas game's code — `shell.js` (screens) and `game.js` (play) |
| `web/` | The three.js integration and its demo |
| `admin/` | The making-of page: the model, the sheets, the editor, the assets |
| `editor/` | The level editor |
| `shared/controls.js` | On-screen controls for touch devices, used by both demos |
| `shared/bonus.js` | The post-reunion bonus round: rules and physics, no rendering |
| `shared/music.js` | The room tone: a generated bed per theme, on the same audio bus |
| `shared/wear.js` | What a knock costs him: marks, seams, when the level starts over, and what the kibble mends |
| `shared/distraction.js` | The wildlife: what it takes, what it drops, and how you stop it |

`docs/pipeline.md` explains how the generator fits together and where to
change the character's shape, motion or fabric.
