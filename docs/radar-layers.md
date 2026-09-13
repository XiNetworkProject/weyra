# Atlas radar products

The precipitation view keeps the existing filtered Météo-France / OPERA composition. The optional products are prepared by the permanent radar worker, after the current precipitation packs. GET requests only read published files.

| View                   | Physical source                                                                           | Unit                  | Coverage                          |
| ---------------------- | ----------------------------------------------------------------------------------------- | --------------------- | --------------------------------- |
| Precipitation          | Existing filtered reflectivity mosaic                                                     | Qualitative intensity | Météo-France, with OPERA fallback |
| Reflectivity           | Raw IMFR27 reflectivity, OPERA at the identical timestamp where national data are missing | dBZ                   | France and Europe                 |
| Accumulation 1 h / 3 h | Sum of twelve / thirty-six IPRN20 five-minute ACRR amounts                                | mm                    | Mainland France                   |

Météo-France's [radar product documentation](https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/670924818) and [technical description](https://donneespubliques.meteofrance.fr/client/document/descriptiftechnique_radar_donneespubliques_v1-2_20250318_404.pdf) describe IPRN20 as the 500 m, five-minute precipitation mosaic. Its encoded hundredths of mm are converted using the file's declared ODIM gain and offset, exactly once. No dBZ-to-rain conversion is used.

The HDF5 reader validates ACRR, the observation interval, grid dimensions and projected corners, and requires usable quality values. Invalid or missing values are distinct from valid zero rainfall. Accumulations require every five-minute interval and every pixel to be valid across the whole window. Missing intervals never become zero rain or an extrapolated total. The interface reports incomplete temporal history and retains the date of the last complete product. Transparent pixels may be dry or lack a complete measurement; the interface states that limitation.

The optional renderer samples physical values with nearest-neighbour reprojection before applying the palette. National valid dry observations take precedence over European reflectivity. Palettes are shared with the interface through `radar-worker/layer-palettes.json`; their legends use the same numeric interpolation. Reflectivity includes weak echoes that may not be rain at ground level.

Cache isolation: `layers/layers-v1/<product>/<timestamp>-<provider>/`. Each tile set is atomically published with a manifest after all tiles exist. Retain twelve published scans per product, forty-eight five-minute amount grids and sixteen downloaded quarter-hour packages. A source/provider upgrade receives a distinct immutable URL. Package history is backfilled from the existing disk cache, then grows with incoming packages. A three-hour accumulation stays in preparation until a complete three-hour window exists.

Additional work has a ninety-second cooperative budget per maintenance cycle and a 180-second process timeout. GDAL uses one thread and a 32 MB cache; HDF5 decoding and accumulation use raster windows. Optional errors do not invalidate the default precipitation view. `/api/radar/layers` exposes product availability and bounded format diagnostics, never credentials or input packages.
