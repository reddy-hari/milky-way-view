# Build a polished, interactive web app for exploring the Milky Way, with a Google Earth–inspired zoom-and-pan experience

## Required tech stack

- Next.js using the App Router
- TypeScript
- React Three Fiber and Three.js for the interactive 3D scene
- TanStack Query for client-side API fetching, caching, loading, and error states
- Next.js Route Handlers for server-side requests to external data sources
- Use CSS Modules, Tailwind CSS, or the styling approach already present in the repo. Prefer the existing conventions.

Do not add Redux Toolkit for the MVP. Use local React state for UI state and camera interaction. Add a small state store only if the implementation demonstrates a clear need.

## First steps

Inspect the existing repository, identify its package manager and conventions, then implement the project in that structure. If the repo is empty, scaffold it with the required stack. Build and run the app, and fix errors rather than only providing a plan.

## Product goal

Create a navigable 3D galaxy explorer with a scientifically honest distinction between:

1. **Milky Way overview:** a large-scale model, with individually selectable known exoplanet-hosting star systems where data is available.
2. **Local-star / exoplanet view:** nearby catalogued stars and known exoplanet host systems, using available catalog data.
3. **Our Solar System:** a detailed view of the Sun, planets, and Moon, with positions calculated for a selected date and time.

## Scientific accuracy and scale

- Do not imply that every dot in the galaxy view is an individually observed star, or that every star has a known planetary system.
- Render galaxy structure as an explicitly labeled illustrative/model layer unless it comes from a documented catalog.
- Give catalog-backed objects a source label and, where available, data epoch and uncertainty.
- Do not invent coordinates, distances, planets, or orbital parameters. Represent missing values as missing.
- Planet locations from JPL Horizons belong in the Solar System view. Do not place Solar System planets at galaxy scale.
- Exoplanet host-star coordinates do not constitute a fully mapped 3D planetary system. Show known host systems as star-system markers and display known planet information in a details panel.
- Include a visible note that distances, marker sizes, and the galaxy’s appearance may be stylized or adjusted for usability.
- Document coordinate transforms and assumptions. Do not silently mix coordinate frames or units.

## User experience

- Fullscreen dark space scene with a clean control panel.
- Mouse drag rotates or pans; wheel and trackpad zoom; include reset-view and “Go to Solar System” controls.
- Provide guided transitions between galaxy, nearby systems, and Solar System scales. These may be separate scene/detail modes; do not pretend a single physical scale makes planets visible at galaxy scale.
- At galaxy/local scales, support hover tooltips and click-to-select. Tooltips should show system name, distance if available, and either the known exoplanet count or “no confirmed planets in this dataset.”
- Selecting a system opens a side panel with available catalog fields, source, and data timestamp.
- Add search for known star/system names and filters such as “known exoplanet host systems.”
- At Solar System scale, show selectable Sun, Earth, Moon, and planets. Include a time/date control with “Now” and play/pause animation.
- Show the selected time and indicate that positions are calculated from ephemeris data.
- Include accessible keyboard controls and support reduced-motion preferences.
- Provide clear loading, error, and empty-data states.

## Data integration

### Exoplanets: NASA Exoplanet Archive

- Use the NASA Exoplanet Archive TAP service for confirmed planet and host-star records.
- Implement a Next.js Route Handler, such as `/api/exoplanets`, to query the external service server-side.
- Keep external request and response normalization logic out of UI components.
- Query only required fields, such as planet name, host name, right ascension, declination, and available distance/parallax fields. Check the current archive documentation for valid table and column names before relying on them.
- Return a stable, typed JSON shape from the Route Handler.
- Add sensible caching and error handling.
- Provide a local sample fixture so the app remains usable if the external service is unavailable.
- Display the source and last-fetched time.

### Milky Way stars: Gaia

- Design a data adapter for Gaia catalog records, but do not download or render the entire catalog in the browser.
- Start with documented sample data or a bounded query for a local region.
- Use a Route Handler for server-side queries if needed.
- Keep the adapter replaceable with a future server-side spatial query or preprocessed tiles.
- If Gaia integration is not practical in the initial implementation, use clearly labeled sample data and provide a well-defined adapter interface.

### Solar System ephemerides: JPL Horizons

- Implement a Route Handler, such as `/api/ephemeris`, to request vector/position data from JPL Horizons for a requested epoch and appropriate center/frame.
- The client should call the local Route Handler, not the external API directly.
- Do not expose credentials or secrets in client-side code; do not assume the service requires an API key.
- Explicitly handle units, timestamps, time scales, coordinate frame, and error responses. Document the choices in code and UI.
- If live integration is unavailable during development, use clearly labeled sample ephemeris data and make the UI state that it is sample data.
- Show the ephemeris timestamp and source. Do not claim millisecond-level live accuracy.

### API architecture

- Put external API access in server-side Route Handlers under `app/api/.../route.ts`.
- Create shared TypeScript types and data-normalization utilities.
- Validate and constrain query parameters in Route Handlers; return useful HTTP status codes and safe error messages.
- Use caching where appropriate and avoid refetching large datasets on every interaction.
- Use TanStack Query on the client for fetching the local API endpoints, caching results, and representing loading/error states.
- Do not put secrets or private configuration in `NEXT_PUBLIC_` variables.
- Make the app work with sample data when external APIs fail or are unavailable.

## Engineering and rendering

- Organize code into scene/rendering, data services, coordinate transforms, UI, types, and server API routes.
- Mark components that use React Three Fiber, browser APIs, or interactive state as client components. Keep server components and Route Handlers server-side where appropriate.
- Use instanced rendering or another efficient approach for many star markers; avoid one expensive React component per star.
- Add level of detail: simplify the galaxy at far zoom and reveal catalog points and labels as the user zooms in.
- Prevent label clutter; show labels on hover/selection and only a small prioritized set by default.
- Ensure the 3D scene has a useful fallback or clear error state if WebGL is unavailable.
- Keep the first version focused and runnable. Do not add authentication, a database, or deployment infrastructure unless the existing repo requires it.

## Testing and documentation

- Add unit tests for coordinate conversions, unit conversions, and data normalization.
- Add tests for Route Handler parameter validation and error handling.
- Add at least one UI or integration test for selecting a system and displaying its details.
- Write a concise README covering setup, architecture, data sources, limitations, environment configuration, and how to run tests.
- Include any required environment-variable example file without secrets.

## Delivery

- Implement the working MVP.
- Run the available lint, test, and build commands; fix failures.
- At the end, summarize what was built, how to run it, which data sources are live versus sample, and any remaining limitations.
