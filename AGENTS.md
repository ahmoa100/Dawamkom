# Dawamkom release preferences

- The user uses “push” / “بوش” to mean commit and push to GitHub and deploy the same changes to AWS, preserving the existing persistent storage and service environment. Verify the public site after deployment.
- Defer Apple/iOS builds and App Store Connect submissions unless the user explicitly requests an iOS update. The current TestFlight baseline is 1.0.0 build 7.
- During ongoing work, if two or three days have passed and substantial changes have accumulated since the last iOS build, remind the user and ask whether they want an Apple update. This is a conversational reminder, not a background scheduled task. Check the actual build/release state before claiming an update is needed.
- Keep track of subsequent changes in Git history. The mobile app uses a WebView of the live website, so web changes deployed to AWS can appear in the installed app without a new binary; native configuration, icon, permission and wrapper changes need a new build.
- Do not include the untracked iphone-preview directory in commits unless specifically requested.
