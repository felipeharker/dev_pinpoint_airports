# Pinpoint Airports

A geography game: a three-letter IATA airport code flips onto a split-flap departures board, and you drop a pin where you think that airport is on a blank world map. The closer you land, the more points you score.

- **5 rounds**, up to **1,000 points** each (5,000 max)
- Within 20 km scores full marks; beyond that, points decay exponentially (about 375 points at 1,000 km)
- **Daily flight**: the same five airports for everyone each day, ramping from famous hubs to a deep cut
- **Random flight**: Easy (world-famous hubs), Normal (major international airports), or Hard (regional, remote, and oddball airports)
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
