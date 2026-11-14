# Dawamkom | دوامكم

Dawamkom manages employee attendance, schedules, leave requests, and partner companies.

## Run locally

With Node.js 24 installed, run `node server.mjs`, then open [the app](http://127.0.0.1:4173) or [Super Admin → Partners](http://127.0.0.1:4173/super-admin#partners).

## Latest changes

- The partners table shows active companies in light green. The access switch suspends or restores company access, while the delete action asks for confirmation.
- The workplace map sends the site origin to OpenStreetMap when loading map tiles.

## AWS test deployment

The existing Lightsail container service is `dawamak-test` in `us-east-1`. Build from the Dockerfile, push a new image to that service, and use the existing deployment's environment and public endpoint settings with the new image. Check `/health` after the deployment becomes active.

Set Google sign-in values through the deployment environment using `DAWAMAK_GOOGLE_CLIENT_ID`, `DAWAMAK_GOOGLE_CLIENT_SECRET`, and `DAWAMAK_PUBLIC_ORIGIN`. Local company and demo data are stored in JSON files excluded from Git. This test service stores those files inside the running container, so replacing it can reset test data.
