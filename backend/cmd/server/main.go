package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/database"
	"github.com/GajapriyanV/SetPiece/backend/internal/forum"
	"github.com/GajapriyanV/SetPiece/backend/internal/httpapi"
	"github.com/GajapriyanV/SetPiece/backend/internal/leaderboard"
	"github.com/GajapriyanV/SetPiece/backend/internal/livekit"
	"github.com/GajapriyanV/SetPiece/backend/internal/notifications"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/GajapriyanV/SetPiece/backend/internal/realtime"
	"github.com/GajapriyanV/SetPiece/backend/internal/support"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	envFile := flag.String("env-file", ".env", "local environment file; empty disables loading")
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := config.LoadEnvFile(*envFile); err != nil {
		logger.Error(err.Error())
		os.Exit(1)
	}
	if err := run(logger); err != nil {
		logger.Error("server stopped", "reason", err.Error())
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return runConfigured(ctx, cfg, logger)
}

// Configuration is validated by Load before reaching this composition root.
func runConfigured(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	ctx, stopRuntime := context.WithCancelCause(ctx)
	defer stopRuntime(nil)
	var owner *ownership.Lease
	var db httpapi.Database
	var profiles httpapi.ProfileReader
	var accounts httpapi.AccountService
	var rankings httpapi.RankingService
	var applicationPool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		pool, err := database.Open(context.Background(), cfg.DatabaseURL, cfg.DatabaseMaxConns, cfg.QueryTimeout)
		if err != nil {
			return err
		}
		defer pool.Close()
		db = pool
		applicationPool = pool
		profiles = users.NewService(users.NewPostgresRepository(pool), cfg.ProfileLocation)
		accounts = &users.Account{Pool: pool, SupabaseURL: cfg.SupabaseURL, Location: cfg.ProfileLocation}
		rankings = &leaderboard.Repository{Pool: pool}
	}
	if cfg.ProfileDatabaseURL != "" {
		pc, e := pgxpool.ParseConfig(cfg.ProfileDatabaseURL)
		if e != nil {
			return errors.New("invalid local profile database")
		}
		pc.MaxConns = cfg.DatabaseMaxConns
		pc.ConnConfig.ConnectTimeout = 3 * time.Second
		pc.ConnConfig.RuntimeParams["statement_timeout"] = "3000"
		pc.ConnConfig.RuntimeParams["lock_timeout"] = "2000"
		pc.ConnConfig.RuntimeParams["timezone"] = "UTC"
		pool, e := pgxpool.NewWithConfig(context.Background(), pc)
		if e != nil {
			return errors.New("local profile database unavailable")
		}
		defer pool.Close()
		a := &users.Account{Pool: pool, Writable: true, SupabaseURL: cfg.SupabaseURL, Location: cfg.ProfileLocation}
		accounts = a
		profiles = a
		db = pool
		applicationPool = pool
		rankings = &leaderboard.Repository{Pool: pool}
	}
	var forumAPI httpapi.ForumService
	var notificationAPI httpapi.NotificationService
	var supportAPI httpapi.SupportService
	if applicationPool != nil {
		if cfg.CommunityDatabaseURL != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			var migrated bool
			e := applicationPool.QueryRow(ctx, "SELECT to_regclass('setpiece_runtime.forum_closures') IS NOT NULL").Scan(&migrated)
			cancel()
			if e != nil || !migrated {
				return errors.New("community writes require migration 0003 in the isolated database")
			}
		}
		store := application.Store{Pool: applicationPool, Writable: cfg.CommunityDatabaseURL != ""}
		forumAPI = &forum.Service{Store: store}
		notificationAPI = &notifications.Service{Store: store}
		supportAPI = &support.Service{Store: store, PrivateContactView: cfg.DevelopmentDatabaseURL != ""}
	}
	verifier := auth.NewVerifier(cfg.SupabaseURL, cfg.JWTAudience, cfg.JWTAlgorithms)
	var media *livekit.Service
	var mediaAPI httpapi.MediaService
	var transport *realtime.Hub
	var ws httpapi.Realtime
	var directory httpapi.RoomDirectory
	var rooms httpapi.RoomService
	var votes httpapi.VotingService
	if cfg.LifecycleDatabaseURL != "" {
		startCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		var service *lifecycleRuntime
		var cleanup func()
		var err error
		if cfg.RehearsalDatabaseURL != "" || cfg.DevelopmentDatabaseURL != "" {
			service, cleanup, err = startLifecyclePool(startCtx, applicationPool, logger)
		} else {
			service, cleanup, err = startLifecycle(startCtx, cfg.LifecycleDatabaseURL, logger)
		}
		// The worker gets its own lifecycle below; startup timeout must not stop it.
		cancel()
		if err != nil {
			return err
		}
		defer cleanup()
		owner = service.Owner
		stopWatch := context.AfterFunc(owner.Context(), func() { stopRuntime(ownership.ErrLost) })
		defer stopWatch()
		rooms = service
		directory = service.Directory
		votes = service.Voting
		var gates []realtime.Gate
		if cfg.LiveKitURL != "" {
			media = livekit.New(service.MediaStore, cfg.LiveKitURL, cfg.LiveKitKey, cfg.LiveKitSecret)
			mediaAPI = media
			mediaCtx, stopMedia := context.WithCancel(owner.Context())
			mediaDone := make(chan struct{})
			go func() {
				defer close(mediaDone)
				media.Run(mediaCtx, func(error) { logger.Warn("media reconciliation unavailable") })
			}()
			defer func() { stopMedia(); <-mediaDone }()
			gates = append(gates, media.Ensure)
		}
		transport = realtime.New(service, service.Voting, service.Snapshots, verifier, cfg.AllowedOrigins, gates...)
		ws = transport
		defer transport.Close()
	}
	server := &http.Server{
		Addr: cfg.Address,
		Handler: httpapi.New(httpapi.Dependencies{
			Forum: forumAPI, Notifications: notificationAPI, Support: supportAPI, Accounts: accounts, Rankings: rankings, Directory: directory, Media: mediaAPI, Realtime: ws, Auth: verifier, Database: db, Profiles: profiles, Rooms: rooms, Voting: votes, Logger: logger,
			AllowedOrigins: cfg.AllowedOrigins,
			QueryTimeout:   cfg.QueryTimeout, RequestTimeout: cfg.RequestTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10,
	}
	if owner != nil {
		handler := server.Handler
		server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !owner.Healthy() && r.URL.Path != "/health" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte("{\"error\":\"Runtime ownership unavailable\"}"))
				return
			}
			handler.ServeHTTP(w, r)
		})
		server.BaseContext = func(net.Listener) context.Context { return owner.Context() }
	}
	if transport != nil {
		server.RegisterOnShutdown(transport.Close)
	}
	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return errors.New("HTTP listener failed")
	}
	logger.Info("server listening", "address", listener.Addr().String(), "profile_read_enabled", profiles != nil)
	err = serve(ctx, server, listener, cfg.ShutdownTimeout)
	if errors.Is(context.Cause(ctx), ownership.ErrLost) {
		return ownership.ErrLost
	}
	return err
}

func serve(ctx context.Context, server *http.Server, listener net.Listener, shutdownTimeout time.Duration) error {
	defer listener.Close()
	errs := make(chan error, 1)
	go func() { errs <- server.Serve(listener) }()
	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP listener failed")
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return errors.New("graceful shutdown deadline exceeded")
		}
	}
	return nil
}
