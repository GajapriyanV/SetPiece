# Build context: backend/. Container acceptance is a separate phase 5 gate.
FROM golang:1.27.2 AS build
WORKDIR /src
ENV GOTOOLCHAIN=local CGO_ENABLED=0 GOMAXPROCS=2 GOMEMLIMIT=512MiB
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
RUN go build -p 2 -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/server /server
USER 65532:65532
ENV APP_ENV=production HOST=0.0.0.0 PORT=3002 PROFILE_TIME_ZONE=UTC
EXPOSE 3002
ENTRYPOINT ["/server", "-env-file="]
