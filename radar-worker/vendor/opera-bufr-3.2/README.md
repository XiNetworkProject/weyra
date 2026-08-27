# EUMETNET OPERA BUFR 3.2

This directory contains the source files required to build Weyra's Météo-France
BUFR decoder. The upstream library was published by EUMETNET OPERA and is
licensed under LGPL-2.1; see `LICENSE-LGPL-2.1.txt`.

Upstream source:
`https://www.eumetnet.eu/wp-content/uploads/2025/05/bufr_3.2.zip`

Météo-France descriptor tables:
`https://static.data.gouv.fr/resources/documentation-radar/20250515-134259/radar-tables-decodage-20250515.zip`

Local change: `MAXDESC` is raised from 2000 to 12000. Current Météo-France
master and local descriptor tables exceed the historic limit used by OPERA 3.2.
