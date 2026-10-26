# Pinpoint Airports

A geography game: a three-letter IATA airport code flips onto a split-flap departures board, and you drop a pin where you think that airport is on a blank world map. The closer you land, the more points you score.

- Pick a game length: **5 rounds**, **10 rounds**, or **unlimited** (play until you hit *End game*)
- Up to **1,000 points** per round. Within 20 km scores full marks; beyond that, points decay exponentially (about 375 points at 1,000 km)
- Pick a difficulty: Easy (world-famous hubs), Normal (major international airports), or Hard (regional, remote, and oddball airports)
- Airports never repeat within a game until the whole difficulty pool has been used
- Zoom and pan the map, toggle country borders on if you want an easier game, and switch between miles and kilometres
- After each guess the map draws the great-circle route from your pin to the airport and shades the country it's in

## Running locally

It's a static site with no build step. Serve the `public/` folder with any static server:

```bash
python -m http.server 5173 --directory public
```

Then open http://localhost:5173.

## Project layout

```
public/
  index.html        page shell
  css/style.css     styles (light and dark themes)
  js/airports.js    airport pool: code, name, city, country, lat/lon, difficulty tier
  js/game.js        game logic, map, scoring
render.yaml         Render Blueprint (static site publishing ./public)
```

The map uses [d3](https://d3js.org) with the Natural Earth projection and 1:50m country shapes from [world-atlas](https://github.com/topojson/world-atlas), all loaded from public CDNs.

## Adding airports

Add a row to `public/js/airports.js`:

```js
['XYZ', 'Airport name', 'City', 'CC', latitude, longitude, tier],
```

Tier 1 = famous hubs (Easy), 2 = major international (Normal), 3 = regional and oddball (Hard). Make sure the country code is in `COUNTRY_NAMES` at the bottom of the same file.

## Deploying

The repo includes a `render.yaml` Blueprint. On Render, create a **Static Site** from this repo with:

- Build command: *(empty)*
- Publish directory: `public`
