# Development and hosted acceptance

## Hosted cutover (2026-10-30)

- [x] Railway Go health/readiness, public SQL-backed routes, CORS/preflight and anonymous transport/admin authorization checks.
- [x] Vercel Go-enabled production build and public homepage/forum/statistics/leaderboard routes.
- [x] User confirms signed-in room creation opens successfully on https://set-piece.vercel.app.
- [ ] Multi-user browser audio, speaker transitions, voting/results and cross-account notifications.
- [ ] Remaining sign-out/refresh/OAuth/reset/onboarding acceptance on the hosted build.

See [PRODUCTION.md](PRODUCTION.md) for deployment IDs and free-plan availability limits. The local checks below are earlier evidence and do not establish hosted media parity.

## Local preview context

Use http://localhost:3000 with the existing development Supabase project. The Go API uses its restricted role. LiveKit runs only on this computer's loopback interfaces. Keep existing records; synthetic database tests must remain in their disposable databases.

## Verified browser checks

- [x] User confirms signed-in Profile and Forum loading and page refresh (2026-10-17).
- [x] User confirms display-name saving and refresh work (2026-10-17). Username changes remain subject to the approved 14-day cooldown.
- [x] User confirms avatar upload, saving and refresh work (2026-10-17).
- [ ] Sign out and back in; verify no previous user's profile or notifications remain visible. OAuth/reset/onboarding and token-expiry refresh require their own checks.

## Notifications

Use two different signed-in accounts. With the first account's page open, have the second reply to a development thread owned by the first. Verify the notification arrives without refreshing, links to the correct reply, and marking it read persists after refresh. Check the second account cannot see the first account's notifications. Retain existing records; any new acceptance content is ordinary development data.

- [ ] Live delivery without page refresh.
- [ ] Mark-one/mark-all read and refresh.
- [ ] Recipient isolation across sign-out/account switching.

Read-only inspection confirmed public.notifications is in supabase_realtime and its browser SELECT policy restricts rows to the recipient. This configuration check does not establish live delivery. Regression tests reproduce and fix an initial notification API failure hiding the bell: the bell now remains available with an error and an explicit refresh action; stale responses/errors cannot cross account switches.

## One-account checks available now

The user currently has one account available. Create a regular room, send a chat message, refresh and verify rejoining with the message preserved. Check side selection, unpick and explicit leave. If the audio connection needs retry, record the displayed error. Publishing is not expected in a one-person lobby. These checks do not establish cross-account delivery, speaker transitions or voting.

- [ ] Room creation, lobby chat and refresh/rejoin.
- [ ] Side selection/unpick and explicit leave.

## Rooms and audio

Use three separate signed-in accounts in separate browser profiles/sessions: two speakers and one spectator. Three tabs using the same account do not represent three participants. Use headphones to assess audio without feedback. Keep the normal timers; a regular round including voting/results takes about ten minutes. Do not edit database deadlines to accelerate browser acceptance.

1. Create a regular room and confirm its URL uses /rooms/g2-.... All three users join; choose opposing sides for the speakers and ready both.
2. Confirm the spectator hears each speaker and cannot enable publishing. During all six speaking phases, only the current speaker can enable the microphone; switching phases revokes the previous speaker.
3. Send chat, refresh/reconnect one participant within the 15-second speaker grace period, and verify current room/phase/chat state and audio permissions recover.
4. During voting, the spectator votes once. Refresh and verify the choice remains locked. Confirm final votes/result, a single rating/counter update and matching Profile/Rankings output, then return to the lobby.
5. Separately verify speaker cancellation and reconnect after the grace deadline do not award Elo for an unfinished debate.
6. In a featured room, verify topic skipping, cancellation and eventual five-debate closure; audio must be cleaned up on reset/closure. Repeat microphone/autoplay checks on supported devices when a non-loopback hosted environment is available.

- [ ] Regular three-user browser/audio round, vote/results/rankings and lobby return.
- [ ] Refresh, reconnect, room switching and audio cleanup.
- [ ] Featured skip/cancellation/five-debate closure.
- [ ] Actual microphone permission, autoplay unlock and active-speaker indication.
- [ ] Hosted/mobile provider behavior (outside this loopback preview).

The automated media suite uses actual local LiveKit and Opus RTP with synthetic identities, plus real HTTP/WebSockets and disposable PostgreSQL. It is useful evidence for service integration, but cannot certify browser microphone/autoplay behavior or Supabase browser sessions.

## Repeat automated media checks

Start LiveKit with backend/livekit.local.yaml, whose public dev credentials are for loopback only. From backend/ with Go and PostgreSQL tools available:

~~~text
node scripts/media-rehearse.cjs --race
~~~

GO_BIN and PG_BIN may point to local tool installations; the race detector also needs a supported C compiler. The runner ignores application database configuration, creates a fresh temporary loopback cluster, runs three-participant media and combined room lifecycle tests, and stops its database in a finally block. It does not load .env or write fixture data to Supabase. The preview's private local LiveKit configuration additionally accepts its existing runtime key; it retains the same loopback binding restrictions.

## Current execution record

On 2026-10-17, no browser surfaces were available to the assistant, and opening an in-app browser was unavailable. Browser checks therefore require the user's session. The stopped Go preview was restarted after checking that no active rooms/debates existed; its ownership-loss shutdown was fail-closed. The exact cause of the lost connection was not established.

The local media launcher was corrected to use the repository's loopback configuration: TCP 7880 and UDP 7882 were observed on 127.0.0.1 only; media TCP fallback is disabled. Go readiness and the frontend returned 200 after recovery. Forty frontend regressions, TypeScript checking, targeted lint and the Next.js production build passed. The new notification recovery assertion failed before the fix and passed afterward. The real LiveKit three-participant test passed under the race detector in 4.99 seconds; the combined PostgreSQL/HTTP/WebSocket/media lifecycle passed in 6.25 seconds, including actual RTP, phase permissions, voting/results and media cleanup. Compilation time is excluded from those test durations. The disposable PostgreSQL cluster was stopped; local preview services remain running.

The assistant made no application-data/schema/grant changes to Supabase in this continuation. Provider inspection was read-only. The user subsequently confirmed display-name and avatar saving/refresh both work, but has only one account available. Full three-account browser audio/voting and cross-account notification delivery remain pending. Automated coverage is not treated as completion of those browser checks.

Later on 2026-10-17, the local Go and frontend processes were found stopped. Go had recorded ownership loss and exited as designed; the connection-loss cause remains undetermined. A read-only check found zero open rooms and zero live/voting debates before restarting the stopped preview processes. Both Go readiness and the frontend returned 200 afterward; existing LiveKit TCP 7880/UDP 7882 bindings remained loopback-only. This is an availability recovery, not additional signed-in acceptance evidence.
