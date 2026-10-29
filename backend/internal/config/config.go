package config

import (
	"crypto/x509"
	"errors"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
)

// Config contains server-only settings. Never log it: DatabaseURL is a credential.
type Config struct {
	ProductionDatabaseURL                 string
	ProductionProjectRef                  string
	DatabaseRootCAs                       *x509.CertPool
	DevelopmentDatabaseURL                string
	DevelopmentProjectRef                 string
	RehearsalDatabaseURL                  string
	LiveKitURL, LiveKitKey, LiveKitSecret string
	LifecycleDatabaseURL                  string
	ProfileDatabaseURL                    string
	CommunityDatabaseURL                  string
	ProfileLocation                       *time.Location
	Environment                           string
	Address                               string
	DatabaseURL                           string
	DatabaseMaxConns                      int32
	QueryTimeout                          time.Duration
	RequestTimeout                        time.Duration
	ShutdownTimeout                       time.Duration
	SupabaseURL                           string
	JWTAudience                           string
	JWTAlgorithms                         []string
	AllowedOrigins                        []string
}

func Load(getenv func(string) string) (Config, error) {
	c := Config{
		Environment:     value(getenv, "APP_ENV", "development"),
		DatabaseURL:     strings.TrimSpace(getenv("DATABASE_URL")),
		SupabaseURL:     strings.TrimRight(strings.TrimSpace(getenv("SUPABASE_URL")), "/"),
		JWTAudience:     value(getenv, "SUPABASE_JWT_AUDIENCE", "authenticated"),
		QueryTimeout:    3 * time.Second,
		RequestTimeout:  10 * time.Second,
		ShutdownTimeout: 10 * time.Second,
	}
	if c.Environment != "development" && c.Environment != "production" {
		return Config{}, errors.New("APP_ENV must be development or production")
	}
	port, err := strconv.Atoi(value(getenv, "PORT", "3002"))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, errors.New("PORT must be between 1 and 65535")
	}
	c.Address = net.JoinHostPort(value(getenv, "HOST", "127.0.0.1"), strconv.Itoa(port))
	maxConns, err := strconv.Atoi(value(getenv, "DATABASE_MAX_CONNS", "5"))
	if err != nil || maxConns < 1 || maxConns > 50 {
		return Config{}, errors.New("DATABASE_MAX_CONNS must be between 1 and 50")
	}
	c.DatabaseMaxConns = int32(maxConns)
	issuerURL, err := url.Parse(c.SupabaseURL)
	if err != nil || !validBaseURL(issuerURL, c.Environment == "production") {
		return Config{}, errors.New("SUPABASE_URL must be an HTTPS origin (HTTP loopback allowed in development)")
	}
	for _, alg := range strings.Split(value(getenv, "SUPABASE_JWT_ALGORITHMS", "ES256,RS256"), ",") {
		alg = strings.TrimSpace(alg)
		if alg != "ES256" && alg != "RS256" {
			return Config{}, errors.New("SUPABASE_JWT_ALGORITHMS supports ES256 and RS256 only")
		}
		c.JWTAlgorithms = append(c.JWTAlgorithms, alg)
	}
	origins := value(getenv, "ALLOWED_ORIGINS", "http://localhost:3000")
	if c.Environment == "production" && strings.TrimSpace(getenv("ALLOWED_ORIGINS")) == "" {
		return Config{}, errors.New("ALLOWED_ORIGINS is required in production")
	}
	for _, origin := range strings.Split(origins, ",") {
		origin = strings.TrimSpace(origin)
		u, err := url.Parse(origin)
		if err != nil || !validBaseURL(u, c.Environment == "production") || u.Path != "" {
			return Config{}, errors.New("ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths")
		}
		c.AllowedOrigins = append(c.AllowedOrigins, origin)
	}
	if c.DatabaseURL != "" {
		dbURL, err := url.Parse(c.DatabaseURL)
		if err != nil || (dbURL.Scheme != "postgres" && dbURL.Scheme != "postgresql") || dbURL.Hostname() == "" || dbURL.Fragment != "" {
			return Config{}, errors.New("DATABASE_URL must be a PostgreSQL connection URI")
		}
		if c.Environment == "production" && !verifiedDatabaseOptions(dbURL) {
			return Config{}, errors.New("production DATABASE_URL requires exactly one sslmode=verify-full and only an optional sslrootcert")
		}
	}
	// A missing database allows the foundation's liveness/authentication to run,
	// but readiness stays unavailable. It must never imply a completed migration.
	if c.Environment == "production" && c.DatabaseURL == "" && strings.TrimSpace(getenv("PRODUCTION_DATABASE_URL")) == "" {
		return Config{}, errors.New("DATABASE_URL is required in production")
	}
	c.CommunityDatabaseURL = strings.TrimSpace(getenv("COMMUNITY_DATABASE_URL"))
	c.ProfileDatabaseURL = strings.TrimSpace(getenv("PROFILE_DATABASE_URL"))
	if c.CommunityDatabaseURL != "" {
		if c.ProfileDatabaseURL != "" && c.ProfileDatabaseURL != c.CommunityDatabaseURL {
			return Config{}, errors.New("profile and community services must share the same isolated application database")
		}
		c.ProfileDatabaseURL = c.CommunityDatabaseURL
	}
	if c.ProfileDatabaseURL != "" {
		if c.Environment != "development" || !fixtureDatabaseURI(c.ProfileDatabaseURL, "setpiece_m4_") {
			return Config{}, errors.New("PROFILE_DATABASE_URL requires a development-only loopback setpiece_m4_* database with sslmode=disable")
		}
	}
	c.LifecycleDatabaseURL = strings.TrimSpace(getenv("LIFECYCLE_DATABASE_URL"))
	if c.LifecycleDatabaseURL != "" {
		// Until room/media cutover, lifecycle writes are confined to disposable local DBs.
		if c.Environment != "development" || !fixtureDatabaseURI(c.LifecycleDatabaseURL, "setpiece_m2_") {
			return Config{}, errors.New("LIFECYCLE_DATABASE_URL requires a development-only loopback setpiece_m2_* database with sslmode=disable")
		}
	}
	c.RehearsalDatabaseURL = strings.TrimSpace(getenv("REHEARSAL_DATABASE_URL"))
	if c.RehearsalDatabaseURL != "" {
		if c.Environment != "development" || c.DatabaseURL != "" || c.ProfileDatabaseURL != "" || c.CommunityDatabaseURL != "" || c.LifecycleDatabaseURL != "" {
			return Config{}, errors.New("REHEARSAL_DATABASE_URL requires development with all other database URLs unset")
		}
		if err := ValidateRehearsalDatabaseURI(c.RehearsalDatabaseURL); err != nil {
			return Config{}, err
		}
		if c.DatabaseMaxConns < 2 {
			return Config{}, errors.New("rehearsal pool needs at least two connections including the lifecycle lease")
		}
		c.ProfileDatabaseURL = c.RehearsalDatabaseURL
		c.CommunityDatabaseURL = c.RehearsalDatabaseURL
		c.LifecycleDatabaseURL = c.RehearsalDatabaseURL
	}
	c.DevelopmentDatabaseURL = strings.TrimSpace(getenv("DEVELOPMENT_DATABASE_URL"))
	c.DevelopmentProjectRef = strings.TrimSpace(getenv("DEVELOPMENT_PROJECT_REF"))
	if c.DevelopmentDatabaseURL != "" || c.DevelopmentProjectRef != "" {
		host := value(getenv, "HOST", "127.0.0.1")
		if c.Environment != "development" || (host != "127.0.0.1" && host != "localhost" && host != "::1") || c.DatabaseURL != "" || c.ProfileDatabaseURL != "" || c.CommunityDatabaseURL != "" || c.LifecycleDatabaseURL != "" || c.RehearsalDatabaseURL != "" || c.DatabaseMaxConns < 2 {
			return Config{}, errors.New("existing development project requires a loopback server, a shared pool of at least two, and all other database URLs unset")
		}
		if e := ValidateDevelopmentDatabaseURI(c.DevelopmentDatabaseURL, c.SupabaseURL, c.DevelopmentProjectRef, "setpiece_app"); e != nil {
			return Config{}, e
		}
		c.ProfileDatabaseURL = c.DevelopmentDatabaseURL
		c.CommunityDatabaseURL = c.DevelopmentDatabaseURL
		c.LifecycleDatabaseURL = c.DevelopmentDatabaseURL
	}
	c.LiveKitURL = strings.TrimRight(strings.TrimSpace(getenv("LOCAL_LIVEKIT_URL")), "/")
	c.LiveKitKey = getenv("LOCAL_LIVEKIT_API_KEY")
	c.LiveKitSecret = getenv("LOCAL_LIVEKIT_API_SECRET")
	if c.LiveKitURL != "" || c.LiveKitKey != "" || c.LiveKitSecret != "" {
		u, e := url.Parse(c.LiveKitURL)
		if e != nil || c.Environment != "development" || c.LifecycleDatabaseURL == "" || u.Scheme != "ws" || u.Hostname() != "127.0.0.1" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || c.LiveKitKey == "" || c.LiveKitSecret == "" {
			return Config{}, errors.New("LOCAL_LIVEKIT_* requires an isolated lifecycle database and a ws://127.0.0.1 local server")
		}
	}
	if err := c.loadProduction(getenv); err != nil {
		return Config{}, err
	}
	c.ProfileLocation = time.Local
	if zone := strings.TrimSpace(getenv("PROFILE_TIME_ZONE")); zone != "" {
		c.ProfileLocation, err = time.LoadLocation(zone)
		if err != nil {
			return Config{}, errors.New("PROFILE_TIME_ZONE must be a valid IANA timezone")
		}
	}
	return c, nil
}

func value(getenv func(string) string, key, fallback string) string {
	if v := strings.TrimSpace(getenv(key)); v != "" {
		return v
	}
	return fallback
}

func validBaseURL(u *url.URL, production bool) bool {
	if u == nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	return !production && u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()).IsLoopback())
}

func ValidateRehearsalDatabaseURI(uri string) error {
	if !fixtureDatabaseURI(uri, "setpiece_m5_") {
		return errors.New("rehearsal requires a disposable loopback setpiece_m5_* database with exactly sslmode=disable")
	}
	return nil
}
